"use client"

/**
 * Egress Flow Map — Path-Flow-Map visual for outbound traffic.
 *
 * Reuses ConnectionLinesSVG + ServiceNodeBox from traffic-flow-map.tsx
 * so the visual is identical to the Attack Paths "Path Flow Map":
 * dark slate canvas, column-based swimlanes, animated curved SVG
 * arrows with cyan traffic dots, node cards with bytes/hits chips.
 *
 * Layout columns (mirrors path-flow):
 *   COMPUTE → SECURITY GROUPS → ROUTE (NAT/IGW/VPCE) → DESTINATION
 *
 * Data shape: we adapt the egress endpoint response into the
 * SystemArchitecture interface that ConnectionLinesSVG expects:
 *   - computeServices   ← workloads in the system with outbound flows
 *   - securityGroups    ← union of (a) destinations' via_sg_id (per-
 *                          flow attribution from behavioral_sync) and
 *                          (b) workloads' attached_security_groups[]
 *                          (SECURED_BY edges, used as fallback when
 *                          a flow has no per-flow attribution).
 *   - iamRoles slot     ← reused as the ROUTE column (NAT/IGW/VPCE
 *                          nodes), one card per gateway node referenced
 *                          by any destination's via_route_node_*
 *   - resources         ← destination IP/service chips
 *   - flows             ← (workload → SG → route_node → destination)
 *                          traffic edges with bytes, ports, protocols.
 *                          sgId resolution order per flow:
 *                            1. d.via_sg_id (per-flow attribution from
 *                               behavioral_sync's
 *                               (workload, port, proto) -> SG edges)
 *                            2. workload's attached_security_groups[0]
 *                               (workload-level fallback for unattributed
 *                               flows)
 *                            3. undefined (Lambdas without VPC config,
 *                               etc. — flow skips the SG hop, honest).
 *
 * Route nodes occupy the iamRoles slot because the existing
 * ConnectionLinesSVG draws compute → SG → role → resource paths;
 * by aliasing routes into the role column we get the same animated
 * traffic line story without rewriting the line-drawing primitives.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cloud,
  Globe,
  Lock,
  Network,
  RefreshCw,
  Server,
  ShieldOff,
  Sparkles,
  Zap,
} from "lucide-react"
import {
  ConnectionLinesSVG,
  ServiceNodeBox,
  type ServiceNode,
  type SecurityCheckpoint,
  type SubnetNode,
  type SystemArchitecture,
  type TrafficFlow,
  type NodeType,
} from "./traffic-flow-map"

// ---- Backend response shape (api/egress_visibility.py) -----------------

interface EgressDestination {
  ip: string
  kind: "aws" | "external" | "internal" | "unknown"
  aws_service: string | null
  aws_region: string | null
  org: string | null
  asn: string | null
  country: string | null
  hostname: string | null
  ports: string[]
  protocols: string[]
  bytes: number
  hits: number
  last_seen: string | null
  first_seen: string | null
  signals: string[]
  via_route_node_id: string | null
  via_route_node_kind: string | null
  via_route_node_name: string | null
  via_route_cidr: string | null
  // Per-flow SG attribution from the behavioral_sync collector's
  // (workload, port, proto) -> SecurityGroup edges. When set, the
  // operator sees which SG ACTUALLY carried this flow. When null,
  // the adapter falls back to the workload's attached_security_groups[0]
  // (workload-level attribution) so the connection line still draws.
  via_sg_id: string | null
  via_sg_name: string | null
}

// Workload-level SG attribution (NOT per-flow). Backend emits one entry
// per (workload)-[:SECURED_BY]->(SecurityGroup) edge (legacy aliases
// HAS_SECURITY_GROUP / USES_SECURITY_GROUP / IN_SECURITY_GROUP also
// accepted on read — see CLAUDE.md). Per-rule attribution (which egress
// rule allowed each specific destination/port/proto) is a follow-up —
// requires CIDR matching against egress rule sets.
interface EgressAttachedSecurityGroup {
  id: string
  name: string
  description: string | null
  vpc_id: string | null
  egress_rule_count: number
  ingress_rule_count: number
  has_public_egress: boolean
  has_public_ingress: boolean
  unused_rules_count: number
  has_rule_hash: boolean
}

interface EgressWorkload {
  workload: {
    id: string
    name: string
    labels: string[]
    node_type: string | null
    region: string | null
    // Subnet identity + posture so the compute card can render a
    // PUBLIC/PRIVATE/UNKNOWN badge inline. `subnet_is_public` follows
    // the AWS canonical definition (subnet has a route to an IGW).
    // null = subnet collector hasn't classified the subnet (rare) or
    // the workload has no IN_SUBNET edge (Lambda without VPC config).
    subnet_id: string | null
    subnet_name: string | null
    subnet_is_public: boolean | null
  }
  totals: {
    destinations: number
    aws_destinations: number
    external_destinations: number
    internal_destinations: number
    total_bytes: number
    total_hits: number
    signaled_destinations: number
    signals_breakdown: Record<string, number>
  }
  top_destinations: EgressDestination[]
  // Workload-level SG attachments via SECURED_BY (+ legacy aliases).
  // Empty for workloads with no SG (Lambdas without VPC config,
  // terminated ENIs) — that's HONEST, not a missing-data bug.
  attached_security_groups?: EgressAttachedSecurityGroup[]
}

interface EgressResponse {
  system_name: string
  lookback_days: number
  workload_count: number
  total_destinations: number
  total_signaled_destinations: number
  workloads: EgressWorkload[]
}

// ---- Signal label/tone (UI vocabulary; never "Suspicious") ------------

const SIGNAL_META: Record<string, { label: string; tone: "warning" | "info" | "alert"; tooltip: string }> = {
  cross_region_aws: { label: "Cross-region AWS", tone: "info", tooltip: "Destination AWS region differs from workload region." },
  cross_cloud: { label: "Cross-cloud", tone: "info", tooltip: "Workload on AWS talking to a different cloud provider." },
  non_aws_public_from_private_subnet: { label: "Private→public IP", tone: "warning", tooltip: "Private-subnet workload reached a non-AWS public IP (likely via NAT)." },
  new_destination: { label: "New destination", tone: "alert", tooltip: "Destination first appeared <7 days ago." },
  plaintext: { label: "Plaintext channel", tone: "alert", tooltip: "Unencrypted port (HTTP/80, FTP/21, Telnet/23, IMAP/143, etc.). Credentials/data move in cleartext." },
  residential_isp: { label: "Residential ISP", tone: "alert", tooltip: "Destination ASN is on the residential consumer-ISP heuristic list." },
  rare_asn: { label: "Rare ASN", tone: "alert", tooltip: "Destination ASN reached by only one destination across this system's 30-day window." },
}

function signalToneClasses(tone: "warning" | "info" | "alert"): string {
  switch (tone) {
    case "alert": return "bg-rose-500/10 text-rose-300 border-rose-500/40"
    case "warning": return "bg-amber-500/10 text-amber-300 border-amber-500/40"
    default: return "bg-sky-500/10 text-sky-300 border-sky-500/40"
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function countryFlag(country: string | null): string {
  if (!country || country.length !== 2) return ""
  const code = country.toUpperCase()
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

// ---- Adapter: egress response → SystemArchitecture ---------------------
// We model the route gateway (NAT/IGW/VPCE) as an "iamRole"-shaped node so
// ConnectionLinesSVG draws compute→route→destination flows the same way
// it draws compute→iamRole→resource paths in the Path Flow Map.
function buildArchitecture(data: EgressResponse | null): SystemArchitecture {
  if (!data) {
    return {
      computeServices: [],
      resources: [],
      subnets: [],
      securityGroups: [],
      nacls: [],
      iamRoles: [],
      flows: [],
      totalBytes: 0,
      totalConnections: 0,
      totalGaps: 0,
    }
  }

  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const routeNodes = new Map<string, SecurityCheckpoint>()
  // Union of all attached SGs across workloads. Keyed by sg.id so we
  // don't double-render a SG that's shared between multiple workloads
  // (very common — one app-tier SG attached to N EC2s).
  const sgNodes = new Map<string, SecurityCheckpoint>()
  // workload_id → array of attached SG ids. Used inside the destination
  // loop so each flow can pin its sgId to the right SG (or skip the SG
  // hop for workloads with no SECURED_BY).
  const wsgIds = new Map<string, string[]>()
  // Per-workload subnet posture, surfaced as a chip on the compute card.
  // Keyed by workload id so the render loop can pick the right one.
  const wSubnet = new Map<string, { id: string | null; name: string | null; isPublic: boolean | null }>()
  const flows: TrafficFlow[] = []

  // Active-senders filter — drop workloads with zero observed
  // destinations from the COMPUTE column. The Egress Flow Map's value
  // is "which workloads ARE actually talking and to whom" — listing
  // 41 silent Lambdas alongside 3 active EC2s buried the signal.
  // The hidden count is surfaced in the header so the data stays
  // honest (per feedback_no_mock_numbers_in_ui.md).
  const allWorkloads = data.workloads || []
  const activeWorkloads = allWorkloads.filter(w => (w.top_destinations || []).length > 0)

  for (const w of activeWorkloads) {
    const wid = w.workload.id
    const nodeType: NodeType = (w.workload.node_type || "").toLowerCase().includes("lambda")
      ? "lambda"
      : "compute"
    // Stash subnet metadata + true totals on the ServiceNode via
    // structural extension. The flow-byte sum from `architecture.flows`
    // is CAPPED at top_n=20 destinations per workload, so it's
    // inaccurate as a workload-level total — the backend's
    // `totals.total_bytes`/`destinations` are the real numbers.
    // PathCard reads these so the displayed bytes/dests match reality.
    computeServices.push({
      id: wid,
      name: w.workload.name || wid,
      shortName: (w.workload.name || wid).slice(0, 22),
      type: nodeType,
      subnetId: w.workload.subnet_id,
      subnetName: w.workload.subnet_name,
      subnetIsPublic: w.workload.subnet_is_public,
      workloadTotalBytes: w.totals?.total_bytes || 0,
      workloadTotalHits: w.totals?.total_hits || 0,
      workloadDestinationCount: w.totals?.destinations || 0,
      workloadSignalsBreakdown: w.totals?.signals_breakdown || {},
    } as ServiceNode & {
      subnetId: string | null
      subnetName: string | null
      subnetIsPublic: boolean | null
      workloadTotalBytes: number
      workloadTotalHits: number
      workloadDestinationCount: number
      workloadSignalsBreakdown: Record<string, number>
    })
    wSubnet.set(wid, {
      id: w.workload.subnet_id,
      name: w.workload.subnet_name,
      isPublic: w.workload.subnet_is_public,
    })

    // Capture attached SGs and seed the column map. We record connectedSources
    // (workload ids that point at this SG) so the SecurityCheckpoint card
    // can show its in-degree. connectedTargets is the union of route ids
    // the SG's workloads talked to — filled in during the destination loop.
    const attachedSgs = w.attached_security_groups || []
    const sgIdsForWorkload: string[] = []
    for (const sg of attachedSgs) {
      sgIdsForWorkload.push(sg.id)
      const existing = sgNodes.get(sg.id)
      if (existing) {
        if (!existing.connectedSources.includes(wid)) {
          existing.connectedSources.push(wid)
        }
        continue
      }
      // Build the badge text: "Nrules · public?" so the operator
      // immediately sees egress posture without clicking through.
      const ruleBadge = `${sg.egress_rule_count}eg / ${sg.ingress_rule_count}in`
      sgNodes.set(sg.id, {
        id: sg.id,
        name: sg.name || sg.id,
        shortName: (sg.name || sg.id).slice(0, 22),
        type: "security_group",
        // usedCount/totalCount/gapCount come from the LP analyzer for
        // ingress-side views; for the egress card we just surface the
        // egress rule count as totalCount and 0 for the other two so
        // the existing SecurityCheckpoint renderer doesn't break.
        usedCount: 0,
        totalCount: sg.egress_rule_count,
        gapCount: sg.unused_rules_count,
        connectedSources: [wid],
        connectedTargets: [],
        vpcId: sg.vpc_id || undefined,
        // Extra metadata for the chip layer. Map.set() doesn't enforce
        // excess-property checks the way object literals do, so these
        // ride along on the SecurityCheckpoint without @ts-expect-error.
        sgDescription: sg.description || "",
        sgHasPublicEgress: sg.has_public_egress,
        sgRuleBadge: ruleBadge,
      } as SecurityCheckpoint & {
        sgDescription: string
        sgHasPublicEgress: boolean
        sgRuleBadge: string
      })
    }
    wsgIds.set(wid, sgIdsForWorkload)

    for (const d of w.top_destinations || []) {
      // Skip internal/RFC1918 — those are intra-VPC peers, not exits.
      if (d.kind === "internal") continue

      const routeId = d.via_route_node_id || (d.kind === "aws" ? "aws-direct" : "no-route")
      const routeKind = d.via_route_node_kind || (d.kind === "aws" ? "AWSService" : "Unknown")
      const routeName = d.via_route_node_name || (d.kind === "aws" ? "AWS service endpoint" : "Unrouted")
      if (!routeNodes.has(routeId)) {
        routeNodes.set(routeId, {
          id: routeId,
          name: routeName,
          shortName: routeName.slice(0, 22),
          // SecurityCheckpoint expects these — type narrows visual
          // but ConnectionLinesSVG just uses the position. We pick
          // "iam_role" so the icon lookup works.
          type: "iam_role",
          usedCount: 0,
          totalCount: 0,
          gapCount: 0,
          connectedSources: [],
          connectedTargets: [],
          // @ts-expect-error — extra metadata for our chip layer
          routeKind,
        })
      }

      const destId = d.ip
      const destType: NodeType = d.kind === "aws"
        ? (d.aws_service?.toLowerCase().includes("s3") ? "storage" : d.aws_service?.toLowerCase().includes("dynamo") ? "database" : "api_gateway")
        : "internet"
      resources.push({
        id: destId,
        name: d.hostname || d.aws_service || d.org || d.ip,
        shortName: (d.hostname || d.aws_service || d.org || d.ip).slice(0, 28),
        type: destType,
      })

      // Per-flow SG attribution preferred — d.via_sg_id is the SG that
      // ACTUALLY carried this flow per the behavioral_sync collector.
      // Fall back to the workload's first attached SG when per-flow
      // attribution is missing (workload onboarded after the last
      // behavioral_sync run, edge dropped during drift, etc.). Flows
      // from workloads with no SECURED_BY edge AND no per-flow data
      // (Lambdas without VPC config) get undefined sgId and the
      // connection line skips the SG hop — honest.
      let sgIdForFlow: string | undefined = d.via_sg_id || undefined
      if (!sgIdForFlow) {
        sgIdForFlow = sgIdsForWorkload[0]
      } else if (!sgNodes.has(sgIdForFlow)) {
        // Per-flow attribution surfaced an SG we didn't see in the
        // workload's attached_security_groups[] (very rare — graph
        // drift between SECURED_BY and ACTUAL_TRAFFIC edges). Emit a
        // minimal card so the connection line still draws to something
        // real, even though we don't have rule-count/posture metadata.
        sgNodes.set(sgIdForFlow, {
          id: sgIdForFlow,
          name: d.via_sg_name || sgIdForFlow,
          shortName: (d.via_sg_name || sgIdForFlow).slice(0, 22),
          type: "security_group",
          usedCount: 0,
          totalCount: 0,
          gapCount: 0,
          connectedSources: [wid],
          connectedTargets: [],
        })
      }
      if (sgIdForFlow) {
        // Mark workload→SG and SG→route so both card chips reflect
        // their fan-in / fan-out. Skip duplicates (the same SG can be
        // hit by many destinations from the same workload).
        const sgNode = sgNodes.get(sgIdForFlow)
        if (sgNode) {
          if (!sgNode.connectedSources.includes(wid)) {
            sgNode.connectedSources.push(wid)
          }
          if (!sgNode.connectedTargets.includes(routeId)) {
            sgNode.connectedTargets.push(routeId)
          }
        }
      }

      flows.push({
        sourceId: wid,
        targetId: destId,
        sgId: sgIdForFlow,
        roleId: routeId, // ConnectionLinesSVG routes compute→sg→role→resource via this
        ports: d.ports || [],
        protocol: (d.protocols || [])[0] || "tcp",
        bytes: d.bytes,
        connections: d.hits,
        isActive: d.bytes > 0,
      })
    }
  }

  // Total + hidden workload counts ride on the architecture object so
  // the header can render "N silent workloads hidden" honestly. The
  // SystemArchitecture interface doesn't declare these so the render
  // layer reads via cast.
  return {
    computeServices,
    resources,
    subnets: [],
    securityGroups: Array.from(sgNodes.values()),
    nacls: [],
    iamRoles: Array.from(routeNodes.values()),
    flows,
    totalBytes: data.workloads.reduce((sum, w) => sum + (w.totals?.total_bytes || 0), 0),
    totalConnections: data.workloads.reduce((sum, w) => sum + (w.totals?.total_hits || 0), 0),
    totalGaps: 0,
    totalWorkloadCount: allWorkloads.length,
    hiddenSilentWorkloadCount: allWorkloads.length - activeWorkloads.length,
  } as SystemArchitecture & {
    totalWorkloadCount: number
    hiddenSilentWorkloadCount: number
  }
}

// ---- Route icon for the gateway card ----------------------------------

function routeKindIcon(kind: string | null) {
  switch (kind) {
    case "InternetGateway": return <Globe className="w-4 h-4 text-amber-400" />
    case "NATGateway": return <Network className="w-4 h-4 text-blue-400" />
    case "VPCEndpoint": return <Lock className="w-4 h-4 text-emerald-400" />
    case "TransitGateway": return <Activity className="w-4 h-4 text-violet-400" />
    case "EgressOnlyInternetGateway": return <Globe className="w-4 h-4 text-orange-400" />
    case "AWSService": return <Cloud className="w-4 h-4 text-emerald-400" />
    default: return <ShieldOff className="w-4 h-4 text-slate-500" />
  }
}

// ---- Per-workload egress path (one card in the path list) -------------
//
// One PathRow per active workload. Mirrors the Identity Attack Paths
// card shape: numeric headline (bytes), severity tag, hop count, an
// "OBSERVED" badge, an inline chain (workload › subnet › sg › gateway
// › destinations), and metric rows along the bottom (ON WORKLOAD,
// NETWORK, SIGNALS, REDUCE). Computed pure-functionally from the
// adapter output so the render is dumb.

interface PathRow {
  workloadId: string
  workloadName: string
  workloadType: NodeType
  subnetId: string | null
  subnetName: string | null
  subnetIsPublic: boolean | null
  // SGs that carried THIS workload's observed flows (per-flow attribution
  // preferred via behavioral_sync; falls back to attached_security_groups[0]).
  sgs: { id: string; name: string; hasPublicEgress: boolean }[]
  // Egress gateways resolved per-destination. Most paths land on 1
  // gateway (IGW); some workloads with both internet + VPCE traffic
  // would show 2.
  gateways: { id: string; name: string; kind: string; bucket: "public" | "private" | "other" }[]
  // Destination summary — count + top-by-bytes for the card preview.
  destinationCount: number
  topDestinations: { ip: string; name: string; bytes: number; kind: string; isInternet: boolean }[]
  // Full destination list with all enrichment fields (port, proto,
  // signals, country, org). Surfaced when the operator expands the
  // path card. This is the top_n=20 the backend returned — for the
  // full 547+ list, drill into the inventory endpoint.
  fullDestinations: EgressDestination[]
  // Subset of fullDestinations that ACTUALLY egress through this
  // path's gateways — kind ∈ {aws, external, unknown}. East-west
  // (kind="internal", RFC1918) peers stay inside the VPC by local
  // route and never traverse an IGW/NAT/VPCE, so they must NOT be
  // drawn as routed through `gateways[0]` in the flow map. The bug
  // we're fixing: PathFlowMap previously iterated fullDestinations
  // and visually pinned every 10.x.x.x peer through whatever the
  // first gateway was (usually IGW), which is impossible per AWS
  // routing — local routes always win over IGW routes.
  egressDestinations: EgressDestination[]
  // Internal/east-west peers — surfaced separately so the operator
  // sees them but doesn't get the misleading "internal traffic goes
  // through the IGW" picture.
  eastWestDestinations: EgressDestination[]
  // Egress-only destination count for the path chain text. The
  // backend's workload.destination_count counts ALL destinations
  // (including internal), so we re-derive from the egress subset
  // when surfacing the path chain so "12 destinations" reflects
  // what actually leaves the VPC.
  egressDestinationCount: number
  eastWestDestinationCount: number
  totalBytes: number
  totalHits: number
  // Aggregated signals across this workload's flows
  signals: Record<string, number>
  // Hops in the path chain (compute + subnet + N sgs + N gateways + 1 destinations-group)
  hopCount: number
  // 0-100 egress severity score (mirrors Identity Attack Paths shape).
  severityScore: number
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  scoreLabel: string
  // The "OBSERVED" / "INFERRED" badge — always OBSERVED for now since
  // every flow comes from real VPC Flow Logs. Reserve INFERRED for a
  // future expansion (e.g., reachable-but-not-yet-observed paths).
  evidence: "OBSERVED"
}

// Egress severity score 0-100. Mirrors the Identity Attack Paths
// `severity.overall_score` shape so the rendering can use the same
// thresholds (>=75 CRITICAL, >=55 HIGH, >=35 MEDIUM, else LOW) and
// the same color palette. Egress-specific signals:
//   +40  public-subnet AND public-egress gateway (perimeter wide open)
//   +20  has plaintext-channel signal (HTTP/FTP/Telnet/etc. in cleartext)
//   +15  > 100 unique destinations  (broad reach)
//   +10  > 100 MB observed bytes    (real volume)
//   +10  > 1000 hits                (high connection count)
//   +5   multiple gateways          (uses both IGW + NAT, etc.)
function deriveEgressScore(opts: {
  subnetIsPublic: boolean | null
  totalBytes: number
  totalHits: number
  destinationCount: number
  hasPlaintextSignal: boolean
  hasPublicEgressGateway: boolean
  gatewayCount: number
}): number {
  let score = 0
  const publicPath = opts.subnetIsPublic === true && opts.hasPublicEgressGateway
  if (publicPath) score += 40
  if (opts.hasPlaintextSignal) score += 20
  if (opts.destinationCount > 100) score += 15
  if (opts.totalBytes > 100 * 1024 * 1024) score += 10
  if (opts.totalHits > 1000) score += 10
  if (opts.gatewayCount > 1) score += 5
  return Math.min(100, score)
}

function deriveSeverity(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 75) return "CRITICAL"
  if (score >= 55) return "HIGH"
  if (score >= 35) return "MEDIUM"
  return "LOW"
}

// Severity → hex color. Matches identity-attack-paths/path-list-panel.tsx
// so the eye reads the same severity in both views.
function severityColor(score: number): string {
  if (score >= 75) return "#dc2626" // red-600
  if (score >= 55) return "#ea580c" // orange-600
  if (score >= 35) return "#d97706" // amber-600
  return "#16a34a" // green-600
}

function buildPathRows(
  architecture: SystemArchitecture,
  data: EgressResponse | null,
): PathRow[] {
  const rows: PathRow[] = []
  // Build a lookup from workload_id → full top_destinations so the
  // drill-in panel can show enrichment fields (port, proto, signals,
  // country, org) that we strip out when building flow tuples.
  const destsByWorkload = new Map<string, EgressDestination[]>()
  for (const w of data?.workloads || []) {
    destsByWorkload.set(w.workload.id, w.top_destinations || [])
  }
  // Per-workload aggregation. Walk flows, group by sourceId.
  for (const compute of architecture.computeServices) {
    const wid = compute.id
    const meta = compute as ServiceNode & {
      subnetId?: string | null
      subnetName?: string | null
      subnetIsPublic?: boolean | null
      workloadTotalBytes?: number
      workloadTotalHits?: number
      workloadDestinationCount?: number
      workloadSignalsBreakdown?: Record<string, number>
    }
    const flows = architecture.flows.filter(f => f.sourceId === wid)
    if (flows.length === 0) continue

    // Resolve SGs that carried this workload's flows
    const sgIds = Array.from(new Set(flows.map(f => f.sgId).filter((x): x is string => !!x)))
    const sgs = sgIds.map(sgid => {
      const sgNode = architecture.securityGroups.find(s => s.id === sgid)
      const sgMeta = sgNode as (typeof sgNode & { sgHasPublicEgress?: boolean }) | undefined
      return {
        id: sgid,
        name: sgNode?.name || sgid,
        hasPublicEgress: !!sgMeta?.sgHasPublicEgress,
      }
    })

    // Resolve gateways used (one card per unique gateway this workload talked through)
    const gwIds = Array.from(new Set(flows.map(f => f.roleId).filter((x): x is string => !!x)))
    const gateways = gwIds.map(gwid => {
      const gwNode = architecture.iamRoles.find(r => r.id === gwid) as
        (typeof architecture.iamRoles[number] & { routeKind?: string }) | undefined
      const kind = gwNode?.routeKind || "Unknown"
      const bucket: "public" | "private" | "other" =
        ["InternetGateway", "NATGateway", "EgressOnlyInternetGateway"].includes(kind) ? "public"
        : ["VPCEndpoint", "TransitGateway"].includes(kind) ? "private"
        : "other"
      return { id: gwid, name: gwNode?.name || gwid, kind, bucket }
    })

    // Top-destinations preview: aggregate from the flows we have
    // (these are the top_n=20 the backend returned per workload).
    const destMap = new Map<string, { ip: string; name: string; bytes: number; kind: string; isInternet: boolean }>()
    for (const f of flows) {
      const destNode = architecture.resources.find(r => r.id === f.targetId)
      if (!destNode) continue
      const isInternet = destNode.type === "internet"
      const slot = destMap.get(destNode.id) || {
        ip: destNode.id,
        name: destNode.name,
        bytes: 0,
        kind: destNode.type,
        isInternet,
      }
      slot.bytes += f.bytes || 0
      destMap.set(destNode.id, slot)
    }
    const topDestinations = Array.from(destMap.values())
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
    // True totals come from the backend's workload.totals — NOT from
    // summing the (capped) top_destinations flows. Frontend-1 has
    // 547 dests / 570 MB total but the response only carries the top
    // 20 of those; summing flows would show ~7 MB.
    const totalBytes = meta.workloadTotalBytes ?? 0
    const totalHits = meta.workloadTotalHits ?? 0
    const destinationCount = meta.workloadDestinationCount ?? destMap.size

    // Signals aggregation — backend's totals.signals_breakdown gives
    // us the per-workload count per signal code. Already aggregated
    // server-side, no per-flow walk needed.
    const signals: Record<string, number> = meta.workloadSignalsBreakdown ?? {}

    // Path chain hop count = compute + subnet(if present) + sgs.length + gateways.length + dests-group
    const hopCount = 1
      + (meta.subnetId ? 1 : 0)
      + sgs.length
      + gateways.length
      + (destinationCount > 0 ? 1 : 0)

    // Split destinations into egress vs east-west. Egress = anything
    // that legitimately leaves the VPC and so can be drawn as routed
    // through gateways[0]. East-west = RFC1918 peers handled by the
    // VPC's local route and never traverse the IGW/NAT/VPCE — those
    // must be surfaced separately to avoid the "internal flow through
    // IGW" lie the visual was previously telling.
    const rawDests = destsByWorkload.get(wid) || []
    const egressDestinations = rawDests.filter(d => d.kind !== "internal")
    const eastWestDestinations = rawDests.filter(d => d.kind === "internal")
    // For the path-chain "N destinations" text + severity, count
    // egress only. The backend's workloadDestinationCount counts
    // ALL dests (including internal) so we override here with the
    // truthful egress-only count. When the backend's top_n cap means
    // egressDestinations is a sample of a larger set, we can't know
    // the true egress count — fall back to total minus internal seen
    // (still a lower bound, but more honest than the original total).
    const totalDestinationCount = destinationCount
    const eastWestCount = eastWestDestinations.length
    const egressDestinationCount = Math.max(0, totalDestinationCount - eastWestCount)

    const hasPublicEgressGateway = gateways.some(g => g.bucket === "public")
    // Severity uses egress-only count. A workload in a public subnet
    // talking only east-west is not exposed; the original calc was
    // scoring it as CRITICAL purely because the subnet had an IGW
    // route available, not used.
    const severityScore = deriveEgressScore({
      subnetIsPublic: meta.subnetIsPublic ?? null,
      totalBytes,
      totalHits,
      destinationCount: egressDestinationCount,
      hasPlaintextSignal: (signals["plaintext"] || 0) > 0,
      hasPublicEgressGateway: hasPublicEgressGateway && egressDestinationCount > 0,
      gatewayCount: gateways.length,
    })
    const severity = deriveSeverity(severityScore)
    const scoreLabel = String(severityScore)

    rows.push({
      workloadId: wid,
      workloadName: compute.name,
      workloadType: compute.type,
      subnetId: meta.subnetId ?? null,
      subnetName: meta.subnetName ?? null,
      subnetIsPublic: meta.subnetIsPublic ?? null,
      sgs,
      gateways,
      destinationCount: totalDestinationCount,
      topDestinations,
      fullDestinations: rawDests,
      egressDestinations,
      eastWestDestinations,
      egressDestinationCount,
      eastWestDestinationCount: eastWestCount,
      totalBytes,
      totalHits,
      signals,
      hopCount,
      severity,
      severityScore,
      scoreLabel,
      evidence: "OBSERVED",
    })
  }
  // Sort by score desc — operators see the highest-impact path first,
  // matching the Identity Attack Paths card-list order.
  rows.sort((a, b) => b.severityScore - a.severityScore)
  return rows
}

// ---- PathCardList / PathCard ------------------------------------------

function PathCardList({ rows, hiddenWorkloadCount }: { rows: PathRow[]; hiddenWorkloadCount: number }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ borderColor: "rgba(148,163,184,0.15)", background: "rgba(30,41,59,0.4)" }}
      >
        <Globe className="w-10 h-10 mx-auto mb-2" style={{ color: "#475569" }} />
        <p className="text-sm font-medium mb-1" style={{ color: "#cbd5e1" }}>No observed egress paths</p>
        <p className="text-xs" style={{ color: "#94a3b8" }}>
          No workload in this system has observed outbound traffic in the 30-day VPC Flow Logs window.
          {hiddenWorkloadCount > 0 && (
            <> {hiddenWorkloadCount} workload(s) exist but have no observed flows.</>
          )}
        </p>
      </div>
    )
  }

  // Severity tally (matches identity-attack-paths/path-list-panel.tsx)
  const sevCounts = rows.reduce(
    (acc, r) => {
      const s = r.severityScore
      if (s >= 75) acc.critical++
      else if (s >= 55) acc.high++
      else if (s >= 35) acc.medium++
      else acc.low++
      return acc
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Editorial header — sentence-style summary, no candy color */}
      <div
        className="flex items-baseline justify-between gap-4 pb-3 border-b"
        style={{ borderColor: "rgba(148,163,184,0.15)" }}
      >
        <div className="flex flex-col min-w-0">
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            Egress paths
          </span>
          <span
            className="text-base font-semibold truncate mt-0.5"
            style={{ color: "#f1f5f9" }}
          >
            Outbound traffic leaving this system
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: "#f1f5f9" }}
          >
            {rows.length}
          </span>
          <span
            className="text-[11px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            {rows.length === 1 ? "egress path" : "egress paths"}
          </span>
        </div>
      </div>

      {/* Severity tally row */}
      {sevCounts.critical + sevCounts.high + sevCounts.medium + sevCounts.low > 0 && (
        <div
          className="flex items-baseline gap-5 text-[11px] uppercase tracking-[0.1em] font-semibold"
          style={{ color: "#94a3b8" }}
        >
          {sevCounts.critical > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#dc2626" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.critical}</span>
              <span>critical</span>
            </span>
          )}
          {sevCounts.high > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ea580c" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.high}</span>
              <span>high</span>
            </span>
          )}
          {sevCounts.medium > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#d97706" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.medium}</span>
              <span>medium</span>
            </span>
          )}
          {sevCounts.low > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#16a34a" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.low}</span>
              <span>low</span>
            </span>
          )}
          {hiddenWorkloadCount > 0 && (
            <span className="normal-case tracking-normal font-normal text-[10px]" style={{ color: "#64748b" }}>
              · {hiddenWorkloadCount} silent workload{hiddenWorkloadCount === 1 ? "" : "s"} hidden
            </span>
          )}
          <span className="ml-auto text-[10px] tracking-[0.1em] normal-case font-normal" style={{ color: "#94a3b8" }}>
            sorted by severity · click a row to drill in
          </span>
        </div>
      )}

      {/* Path rows */}
      <div className="flex flex-col gap-2 mt-1">
        {rows.map((row, i) => (
          <PathCard key={row.workloadId} row={row} index={i + 1} />
        ))}
      </div>
    </div>
  )
}

// PathFlowMap — per-path column-grid visual map that mirrors the
// Attack Paths "System Architecture" view (TrafficFlowMap pattern).
// Renders 4 columns: COMPUTE | SECURITY GROUPS | EGRESS GATEWAY |
// DESTINATIONS, with animated traffic lines drawn between cards via
// the shared ConnectionLinesSVG primitive.
//
// Builds a per-path SystemArchitecture (compute=this workload, sgs=
// this path's SGs, iamRoles=this path's gateways, resources=this
// path's destinations, flows=per-destination tuples) and passes it
// to ConnectionLinesSVG. Same visual story as Attack Paths but
// scoped to ONE egress workload's path.
function PathFlowMap({ row, sevColor }: { row: PathRow; sevColor: string }) {
  // Container that ConnectionLinesSVG positions absolutely over.
  const containerRef = useRef<HTMLDivElement>(null)

  // Per-path SystemArchitecture, derived from PathRow.
  const architecture = useMemo<SystemArchitecture>(() => {
    const computeNode: ServiceNode = {
      id: row.workloadId,
      name: row.workloadName,
      shortName: row.workloadName.slice(0, 22),
      type: row.workloadType,
    }

    const sgs: SecurityCheckpoint[] = row.sgs.map((sg) => ({
      id: sg.id,
      name: sg.name,
      shortName: sg.name.slice(0, 22),
      type: "security_group",
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [row.workloadId],
      connectedTargets: [],
    }))

    // Gateways go in the iamRoles slot — ConnectionLinesSVG draws
    // compute→sg→role→resource so we alias gateway→role.
    const gateways: SecurityCheckpoint[] = row.gateways.map((g) => ({
      id: g.id,
      name: g.name,
      shortName: g.name.slice(0, 22),
      type: "iam_role",
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: row.sgs.map((s) => s.id),
      connectedTargets: [],
      // Extra metadata for the gateway card chip — Map.set behavior
      // doesn't enforce excess-property checks, so cast at the end.
      routeKind: g.kind,
      routeBucket: g.bucket,
    } as SecurityCheckpoint & { routeKind: string; routeBucket: string }))

    // IMPORTANT: only EGRESS destinations get rendered in the flow
    // map. East-west (RFC1918) peers are handled by the VPC local
    // route and never traverse the gateway, so drawing them through
    // gateways[0] would be the "internal flow through IGW" lie. They
    // are surfaced separately in the destinations panel below.
    const resources: ServiceNode[] = row.egressDestinations.map((d) => {
      const destType: NodeType =
        d.kind === "aws"
          ? d.aws_service?.toLowerCase().includes("s3")
            ? "storage"
            : d.aws_service?.toLowerCase().includes("dynamo")
              ? "database"
              : "api_gateway"
          : "internet"
      return {
        id: d.ip,
        name: d.hostname || d.aws_service || d.org || d.ip,
        shortName: (d.hostname || d.aws_service || d.org || d.ip).slice(0, 28),
        type: destType,
      }
    })

    const sgId = row.sgs[0]?.id
    const roleId = row.gateways[0]?.id
    const flows: TrafficFlow[] = row.egressDestinations.map((d) => ({
      sourceId: row.workloadId,
      targetId: d.ip,
      sgId,
      roleId,
      ports: d.ports || [],
      protocol: (d.protocols || [])[0] || "tcp",
      bytes: d.bytes,
      connections: d.hits,
      isActive: d.bytes > 0,
    }))

    return {
      computeServices: [computeNode],
      resources,
      subnets: [],
      securityGroups: sgs,
      nacls: [],
      iamRoles: gateways,
      flows,
      totalBytes: row.totalBytes,
      totalConnections: row.totalHits,
      totalGaps: 0,
    }
  }, [row])

  const subnetIsPublic = row.subnetIsPublic
  const subnetTone =
    subnetIsPublic === true
      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
      : subnetIsPublic === false
        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
        : "bg-slate-700/40 border-slate-600 text-slate-300"
  const subnetLabel =
    subnetIsPublic === true ? "PUBLIC" : subnetIsPublic === false ? "PRIVATE" : "UNKNOWN"

  const routeKindIcon = (kind: string) => {
    switch (kind) {
      case "InternetGateway":
        return <Globe className="w-4 h-4 text-amber-400" />
      case "NATGateway":
        return <Network className="w-4 h-4 text-blue-400" />
      case "VPCEndpoint":
        return <Lock className="w-4 h-4 text-emerald-400" />
      case "TransitGateway":
        return <Activity className="w-4 h-4 text-violet-400" />
      case "EgressOnlyInternetGateway":
        return <Globe className="w-4 h-4 text-orange-400" />
      case "AWSService":
        return <Cloud className="w-4 h-4 text-emerald-400" />
      default:
        return <ShieldOff className="w-4 h-4 text-slate-500" />
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border bg-slate-950/60 p-4 min-h-[280px] overflow-x-auto"
      style={{ borderColor: "rgba(148,163,184,0.15)" }}
    >
      {/* Dot grid background — same as the original Egress Flow Map */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none rounded-lg"
        style={{
          backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Animated traffic lines — same primitive Attack Paths uses */}
      <ConnectionLinesSVG
        architecture={architecture}
        hoveredId={null}
        containerRef={containerRef as React.RefObject<HTMLDivElement>}
        animate={true}
      />

      {/* 4-column grid */}
      <div
        className="relative grid grid-cols-[1fr_140px_180px_1.5fr] gap-6 items-start"
        style={{ zIndex: 2 }}
      >
        {/* COMPUTE column */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3 h-3 text-blue-400" />
            Compute (1)
          </div>
          <div data-compute-id={row.workloadId}>
            <ServiceNodeBox
              node={architecture.computeServices[0]}
              position="left"
              isHighlighted={false}
              onHover={() => {}}
              onClick={() => {}}
            />
            {row.subnetId && (
              <div
                className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${subnetTone}`}
              >
                {subnetLabel}
                <span className="font-mono normal-case font-normal opacity-80">
                  · {row.subnetName || row.subnetId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SG column */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-orange-400" />
            SG ({architecture.securityGroups.length})
          </div>
          {architecture.securityGroups.map((sg) => {
            const sgRow = row.sgs.find((s) => s.id === sg.id)
            const tone = sgRow?.hasPublicEgress
              ? "border-amber-500/60 bg-amber-500/10"
              : "border-orange-500/30 bg-orange-500/5"
            return (
              <div
                key={sg.id}
                data-sg-id={sg.id}
                className={`rounded-lg border ${tone} px-3 py-2`}
              >
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-orange-400 shrink-0" />
                  <div className="text-[11px] font-semibold text-orange-50 truncate">
                    {sg.shortName || sg.name}
                  </div>
                </div>
                {sgRow?.hasPublicEgress && (
                  <div className="mt-1 text-[9px] text-amber-300 uppercase tracking-wider font-semibold">
                    Public egress
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* GATEWAY column */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Network className="w-3 h-3 text-violet-400" />
            Gateway ({architecture.iamRoles.length})
          </div>
          {architecture.iamRoles.map((g) => {
            const gw = row.gateways.find((gg) => gg.id === g.id)
            const tone =
              gw?.bucket === "public"
                ? "border-amber-500/60 bg-amber-500/10"
                : gw?.bucket === "private"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-slate-700 bg-slate-900/40"
            return (
              <div
                key={g.id}
                data-role-id={g.id}
                className={`rounded-lg border ${tone} px-3 py-2`}
              >
                <div className="flex items-center gap-1.5">
                  {routeKindIcon(gw?.kind || "")}
                  <span className="text-[11px] font-semibold text-slate-100 truncate flex-1">
                    {g.shortName || g.name}
                  </span>
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">{gw?.kind}</div>
              </div>
            )
          })}
        </div>

        {/* DESTINATIONS column */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-cyan-400" />
            Destinations ({architecture.resources.length})
          </div>
          {architecture.resources.slice(0, 12).map((dest) => {
            const fullDest = row.fullDestinations.find((d) => d.ip === dest.id)
            const isAlert = (fullDest?.signals || []).some((s) =>
              ["plaintext", "residential_isp", "rare_asn"].includes(s),
            )
            return (
              <div
                key={dest.id}
                data-resource-id={dest.id}
                className={`rounded-lg border px-3 py-2 ${
                  isAlert
                    ? "border-rose-500/40 bg-rose-500/5"
                    : dest.type === "internet"
                      ? "border-slate-700 bg-slate-900/60"
                      : "border-emerald-500/30 bg-emerald-500/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {fullDest?.country ? (
                      <span className="text-sm leading-none">
                        {countryFlag(fullDest.country)}
                      </span>
                    ) : null}
                    <span className="text-[11px] font-semibold text-slate-100 truncate">
                      {dest.shortName}
                    </span>
                  </div>
                  {fullDest ? (
                    <span className="text-[9px] font-mono text-cyan-400 flex-shrink-0">
                      {formatBytes(fullDest.bytes)}
                    </span>
                  ) : null}
                </div>
                {fullDest?.kind === "aws" && (
                  <div className="mt-0.5 text-[9px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      AWS · {fullDest.aws_service ?? "?"}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {architecture.resources.length > 12 && (
            <div className="text-[10px] text-slate-500 pl-2 italic">
              + {architecture.resources.length - 12} more — see Destinations table below
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// LEGACY — replaced by PathFlowMap above. Kept temporarily.
function PathMiniFlow({ row, sevColor }: { row: PathRow; sevColor: string }) {
  const subnetIsPublic = row.subnetIsPublic
  const subnetTone = subnetIsPublic === true
    ? { border: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.08)", text: "#fcd34d" }
    : subnetIsPublic === false
      ? { border: "rgba(22,163,74,0.5)", bg: "rgba(22,163,74,0.08)", text: "#86efac" }
      : { border: "rgba(148,163,184,0.4)", bg: "rgba(30,41,59,0.4)", text: "#cbd5e1" }
  const subnetLabel = subnetIsPublic === true ? "PUBLIC" : subnetIsPublic === false ? "PRIVATE" : "UNKNOWN"

  const Arrow = () => (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  )

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {/* COMPUTE */}
      <FlowCard
        icon={<Server className="w-4 h-4" style={{ color: "#60a5fa" }} />}
        label="COMPUTE"
        title={row.workloadName}
        subtitle={row.workloadType.toUpperCase()}
        border="rgba(59,130,246,0.4)"
        bg="rgba(59,130,246,0.08)"
        text="#bfdbfe"
      />

      {/* SUBNET */}
      {row.subnetId && (
        <>
          <Arrow />
          <FlowCard
            icon={<Network className="w-4 h-4" style={{ color: subnetTone.text }} />}
            label="SUBNET"
            title={row.subnetName || row.subnetId}
            subtitle={subnetLabel}
            border={subnetTone.border}
            bg={subnetTone.bg}
            text={subnetTone.text}
          />
        </>
      )}

      {/* SG(s) */}
      {row.sgs.map(sg => {
        const sgTone = sg.hasPublicEgress
          ? { border: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.08)", text: "#fcd34d" }
          : { border: "rgba(249,115,22,0.4)", bg: "rgba(249,115,22,0.06)", text: "#fdba74" }
        return (
          <span key={sg.id} className="flex items-center gap-2">
            <Arrow />
            <FlowCard
              icon={<Lock className="w-4 h-4" style={{ color: sgTone.text }} />}
              label="SECURITY GROUP"
              title={sg.name}
              subtitle={sg.hasPublicEgress ? "PUBLIC EGRESS" : "EGRESS"}
              border={sgTone.border}
              bg={sgTone.bg}
              text={sgTone.text}
            />
          </span>
        )
      })}

      {/* GATEWAY(s) */}
      {row.gateways.map(g => {
        const gwTone = g.bucket === "public"
          ? { border: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.08)", text: "#fcd34d" }
          : g.bucket === "private"
            ? { border: "rgba(22,163,74,0.5)", bg: "rgba(22,163,74,0.08)", text: "#86efac" }
            : { border: "rgba(148,163,184,0.4)", bg: "rgba(30,41,59,0.4)", text: "#cbd5e1" }
        const gwIcon = g.kind === "InternetGateway" || g.kind === "EgressOnlyInternetGateway"
          ? <Globe className="w-4 h-4" style={{ color: gwTone.text }} />
          : g.kind === "NATGateway"
            ? <Network className="w-4 h-4" style={{ color: gwTone.text }} />
            : g.kind === "VPCEndpoint"
              ? <Lock className="w-4 h-4" style={{ color: gwTone.text }} />
              : g.kind === "TransitGateway"
                ? <Activity className="w-4 h-4" style={{ color: gwTone.text }} />
                : g.kind === "AWSService"
                  ? <Cloud className="w-4 h-4" style={{ color: gwTone.text }} />
                  : <ShieldOff className="w-4 h-4" style={{ color: gwTone.text }} />
        return (
          <span key={g.id} className="flex items-center gap-2">
            <Arrow />
            <FlowCard
              icon={gwIcon}
              label="GATEWAY"
              title={g.name}
              subtitle={g.kind}
              border={gwTone.border}
              bg={gwTone.bg}
              text={gwTone.text}
            />
          </span>
        )
      })}

      {/* DESTINATIONS */}
      <Arrow />
      <FlowCard
        icon={<Globe className="w-4 h-4" style={{ color: sevColor }} />}
        label="DESTINATIONS"
        title={`${row.destinationCount} ${row.destinationCount === 1 ? "endpoint" : "endpoints"}`}
        subtitle={formatBytes(row.totalBytes)}
        border={`${sevColor}66`}
        bg={`${sevColor}15`}
        text={sevColor}
      />
    </div>
  )
}

// Inline mini-card used by PathMiniFlow.
function FlowCard({
  icon,
  label,
  title,
  subtitle,
  border,
  bg,
  text,
}: {
  icon: React.ReactNode
  label: string
  title: string
  subtitle: string
  border: string
  bg: string
  text: string
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2 min-w-[140px] max-w-[200px] shrink-0"
      style={{ borderColor: border, background: bg }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span
          className="text-[9px] uppercase tracking-[0.12em] font-semibold"
          style={{ color: "#94a3b8" }}
        >
          {label}
        </span>
      </div>
      <div className="text-[11px] font-semibold truncate" style={{ color: text }}>
        {title}
      </div>
      <div className="text-[9px] truncate mt-0.5" style={{ color: "#94a3b8" }}>
        {subtitle}
      </div>
    </div>
  )
}

// Renders one labeled section of the destinations panel — either the
// egress group (real outbound flows through a gateway) or the east-west
// group (RFC1918 peers, local route). Same per-row visual; the section
// header + empty state are the only varying bits. Extracted from the
// original inline map so both groups stay visually identical and the
// "internal-via-IGW" bug never regresses.
function DestinationGroup({
  title,
  subtitle,
  destinations,
  totalCount,
  emptyText,
}: {
  title: string
  subtitle: string
  destinations: EgressDestination[]
  totalCount: number
  emptyText: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-baseline gap-2">
        <span>{title}</span>
        <span className="font-normal normal-case tracking-normal text-slate-600">
          ({destinations.length}
          {totalCount > destinations.length && (
            <> of {totalCount} total — backend top-N cap</>
          )}
          ) · {subtitle}
        </span>
      </div>
      {destinations.length === 0 ? (
        emptyText ? (
          <div className="text-[11px] text-slate-500 italic">{emptyText}</div>
        ) : null
      ) : (
        <div className="space-y-1.5">
          {destinations.map(d => {
            const isAws = d.kind === "aws"
            const isAlert = (d.signals || []).some(s => ["plaintext", "residential_isp", "rare_asn"].includes(s))
            const isNew = (d.signals || []).includes("new_destination")
            return (
              <div
                key={d.ip}
                className={`grid grid-cols-[1.5fr_1fr_auto_auto] gap-3 items-center rounded border px-3 py-1.5 text-[11px] ${
                  isAlert
                    ? "border-rose-500/40 bg-rose-500/5"
                    : isNew
                      ? "border-amber-500/40 bg-amber-500/5"
                      : isAws
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {d.country ? <span className="text-sm leading-none">{countryFlag(d.country)}</span> : null}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">
                      {d.hostname || d.aws_service || d.org || d.ip}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono truncate">
                      {d.ip}
                      {d.asn ? <span className="ml-1">· {d.asn}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 items-center min-w-0">
                  {(d.ports || []).slice(0, 4).map(p => (
                    <span key={p} className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono">
                      :{p}
                    </span>
                  ))}
                  {(d.ports || []).length > 4 && (
                    <span className="text-[9px] text-slate-500">+{(d.ports || []).length - 4}</span>
                  )}
                  {(d.protocols || []).map(p => (
                    <span key={p} className="px-1 py-0.5 rounded bg-slate-800/60 text-slate-400 text-[9px] uppercase tracking-wider">
                      {p}
                    </span>
                  ))}
                  {(d.signals || []).map(s => {
                    const meta = SIGNAL_META[s] || { label: s, tone: "info" as const, tooltip: s }
                    return (
                      <span
                        key={s}
                        title={meta.tooltip}
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${signalToneClasses(meta.tone)}`}
                      >
                        {meta.label}
                      </span>
                    )
                  })}
                </div>
                <div className="text-right">
                  <div className="font-mono text-cyan-300">{formatBytes(d.bytes)}</div>
                  <div className="text-[9px] text-slate-500">{d.hits.toLocaleString()} hits</div>
                </div>
                <div>
                  {isAws ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap">
                      AWS · {d.aws_service || "?"}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-semibold uppercase tracking-wider">
                      {d.kind === "internal" ? "INTERNAL" : "INTERNET"}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PathCard({ row, index }: { row: PathRow; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const sevColor = severityColor(row.severityScore)
  const subnetIsPublic = row.subnetIsPublic
  const subnetText = subnetIsPublic === true
    ? "PUBLIC"
    : subnetIsPublic === false
      ? "PRIVATE"
      : "UNKNOWN"
  // Detect the "subnet named Private but actually Public" mismatch and
  // surface it as a visible flag. Real product finding from alon-prod.
  const subnetNameMismatch =
    subnetIsPublic === true &&
    /private/i.test(row.subnetName || "") &&
    !/public/i.test(row.subnetName || "")
  const hasPublicEgress = row.gateways.some(g => g.bucket === "public")
  const isPrivateOnly = row.gateways.length > 0 && row.gateways.every(g => g.bucket === "private")
  // Right-side status chip — mirrors NETWORK-BLOCKED on Identity Attack Paths
  const statusChip = subnetNameMismatch
    ? { label: "Name mismatch", color: "#fca5a5", borderColor: "rgba(220,38,38,0.4)", bg: "transparent", title: `Subnet named "${row.subnetName}" suggests private, but actually has a route to an Internet Gateway.` }
    : hasPublicEgress
      ? { label: "Public internet", color: "#fcd34d", borderColor: "rgba(245,158,11,0.4)", bg: "rgba(245,158,11,0.06)", title: "Egress exits to the public internet via an Internet Gateway." }
      : isPrivateOnly
        ? { label: "Private egress", color: "#86efac", borderColor: "rgba(22,163,74,0.4)", bg: "rgba(22,163,74,0.06)", title: "Egress stays inside AWS / private networks (NAT, VPCE, TGW)." }
        : null

  return (
    <div
      className="group relative rounded-lg border overflow-hidden"
      style={{
        borderColor: "rgba(148,163,184,0.12)",
        background: "rgba(30,41,59,0.6)",
      }}
    >
      {/* Severity ribbon */}
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: sevColor, zIndex: 1 }}
      />

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex flex-col gap-2 text-left transition-all hover:bg-white/[0.02] w-full"
      >

      {/* Top row: number · path # · meta · status · chevron */}
      <div className="flex items-center gap-4 pl-5 pr-4 pt-3">
        <div className="flex items-baseline gap-2 shrink-0 min-w-[64px]">
          <span
            className="text-2xl font-semibold tabular-nums leading-none"
            style={{ color: sevColor }}
            title={`Severity ${row.severity} (${row.severityScore}/100)`}
          >
            {row.severityScore}
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: sevColor }}
          >
            {row.severity}
          </span>
        </div>

        <div
          className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold"
          style={{ color: "#94a3b8" }}
        >
          <span style={{ color: "#f1f5f9" }}>Path #{index}</span>
          <span>·</span>
          <span>{row.hopCount} hops</span>
          <span>·</span>
          <span style={{ color: "#22c55e" }}>{row.evidence}</span>
        </div>

        {statusChip ? (
          <span
            className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[9px] uppercase tracking-[0.12em] font-bold border"
            style={{ color: statusChip.color, borderColor: statusChip.borderColor, background: statusChip.bg }}
            title={statusChip.title}
          >
            {statusChip.label}
          </span>
        ) : (
          <span className="ml-auto" />
        )}
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          style={{ color: "#94a3b8" }}
        />
      </div>

      {/* Chain — clean typography, '›' separators, plain text */}
      <div
        className="pl-5 pr-4 text-sm font-medium"
        style={{ color: "#f1f5f9" }}
      >
        <span>{row.workloadName}</span>
        {row.subnetName && (
          <>
            <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
            <span
              style={{ color: subnetIsPublic === true ? "#fcd34d" : subnetIsPublic === false ? "#86efac" : "#94a3b8" }}
              title={`Subnet posture: ${subnetText}`}
            >
              {subnetText} subnet · {row.subnetName}
            </span>
          </>
        )}
        {row.sgs.map(sg => (
          <span key={sg.id}>
            <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
            <span style={{ color: sg.hasPublicEgress ? "#fcd34d" : "#fdba74" }}>{sg.name}</span>
          </span>
        ))}
        {row.gateways.map(g => (
          <span key={g.id}>
            <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
            <span style={{ color: g.bucket === "public" ? "#fcd34d" : g.bucket === "private" ? "#86efac" : "#cbd5e1" }}>
              {g.name} ({g.kind})
            </span>
          </span>
        ))}
        <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
        <span style={{ color: sevColor }}>
          {row.egressDestinationCount}{" "}
          {row.egressDestinationCount === 1 ? "egress destination" : "egress destinations"}
        </span>
        {row.eastWestDestinationCount > 0 && (
          <span className="ml-2 text-[11px]" style={{ color: "#94a3b8" }}>
            +{row.eastWestDestinationCount} east-west (local route, not via gateway)
          </span>
        )}
      </div>

      {/* Stats row — outlined chips, low saturation, clear labels.
          Mirrors "On jewel" / "Lateral" / "Reduce" pattern. */}
      <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap pl-5 pr-4 pb-3 mt-0.5">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            On workload
          </span>
          <span className="text-xs" style={{ color: "#f1f5f9" }}>
            <span className="font-semibold tabular-nums">{formatBytes(row.totalBytes)}</span>
            <span style={{ color: "#94a3b8" }}> · </span>
            <span className="font-semibold tabular-nums">{row.totalHits.toLocaleString()}</span> hits
            <span style={{ color: "#94a3b8" }}> · </span>
            <span className="font-semibold tabular-nums">{row.destinationCount}</span> dests
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            Network
          </span>
          <span className="text-xs" style={{ color: "#cbd5e1" }}>
            <span style={{ color: subnetIsPublic === true ? "#fcd34d" : subnetIsPublic === false ? "#86efac" : "#94a3b8" }}>
              {subnetText} subnet
            </span>
            {row.gateways.length > 0 && (
              <>
                <span style={{ color: "#94a3b8" }}> · </span>
                <span>{row.gateways.map(g => g.kind).join(", ")}</span>
              </>
            )}
          </span>
        </div>

        {Object.keys(row.signals).length > 0 && (
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-[10px] uppercase tracking-[0.12em] font-semibold"
              style={{ color: "#94a3b8" }}
            >
              Signals
            </span>
            <span className="text-xs truncate" style={{ color: "#fca5a5" }}>
              {Object.entries(row.signals)
                .map(([code, count]) => {
                  const meta = SIGNAL_META[code] || { label: code, tone: "info" as const, tooltip: code }
                  return (
                    <span key={code} title={meta.tooltip}>
                      <span className="font-semibold tabular-nums">{count}</span> {meta.label}
                    </span>
                  )
                })
                .reduce<React.ReactNode[]>((acc, el, i) => {
                  if (i > 0) acc.push(<span key={`s-${i}`} style={{ color: "#94a3b8" }}> · </span>)
                  acc.push(el)
                  return acc
                }, [])}
            </span>
          </div>
        )}
      </div>
      </button>

      {/* Expanded drill-in — visual flow map at top + full destination
          list below. The flow map shows the path's cards laid out
          horizontally with arrow connectors so the operator sees the
          shape of THIS path at a glance. Destinations table provides
          the per-flow detail. */}
      {expanded && (
        <div
          className="px-4 py-3 border-t space-y-4"
          style={{ borderColor: "rgba(148,163,184,0.12)", background: "rgba(15,23,42,0.4)" }}
        >
          {/* PER-PATH FLOW MAP — column-grid layout with animated traffic
              lines, matches Attack Paths "System Architecture" view. */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Flow map
            </div>
            <PathFlowMap row={row} sevColor={sevColor} />
          </div>

          {/* Two-section destinations panel — Egress (via gateway) on
              top, East-West (local route) on bottom. The split makes
              the network-routing reality visible: a workload in a
              public subnet can talk to internal peers without those
              flows ever touching the IGW, even if a flat list would
              suggest otherwise. */}
          <DestinationGroup
            title="Egress destinations"
            subtitle="via gateway (IGW / NAT / VPCE)"
            destinations={row.egressDestinations}
            totalCount={row.egressDestinationCount}
            emptyText="No outbound flows leave this workload through a gateway in the observed window."
          />
          {row.eastWestDestinations.length > 0 && (
            <div className="mt-3">
              <DestinationGroup
                title="East-west peers"
                subtitle="local VPC route — never traverses the gateway"
                destinations={row.eastWestDestinations}
                totalCount={row.eastWestDestinationCount}
                emptyText=""
              />
            </div>
          )}
          {/* SG attribution detail line — per-flow attribution is on the
              destinations above (via_sg_*); here we summarize. */}
          {row.sgs.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500">
              <span className="uppercase tracking-wider mr-2">SG attribution</span>
              {row.sgs.map(sg => (
                <span key={sg.id} className="mr-3">
                  <span className="text-orange-200">{sg.name}</span>
                  {sg.hasPublicEgress && (
                    <span className="ml-1 text-amber-300">· public egress</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Component --------------------------------------------------------

export function EgressFlowMap({ systemName }: { systemName: string }) {
  const [data, setData] = useState<EgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animate, setAnimate] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [signalFilter, setSignalFilter] = useState<string | null>(null)

  const fetchData = (force = false) => {
    setLoading(true)
    setError(null)
    fetch(
      `/api/proxy/egress/system/${encodeURIComponent(systemName)}?days=30&top_n=20${force ? `&_=${Date.now()}` : ""}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j) => setData(j))
      .catch((e: any) => setError(e?.message ?? "Failed to load egress data"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!systemName) return
    fetchData(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName])

  const architecture = useMemo(() => buildArchitecture(data), [data])

  // Bucket destinations by their route's kind so the operator can read
  // PUBLIC (IGW/NAT/EIGW) vs PRIVATE (VPCE/TGW) at a glance.
  const routeBucket = (kind: string | null): "public" | "private" | "other" => {
    if (!kind) return "other"
    if (["InternetGateway", "NATGateway", "EgressOnlyInternetGateway"].includes(kind)) return "public"
    if (["VPCEndpoint", "TransitGateway"].includes(kind)) return "private"
    return "other"
  }

  // Filter chips strip — aggregate signal counts across all destinations.
  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (!data) return counts
    for (const w of data.workloads || []) {
      for (const d of w.top_destinations || []) {
        for (const s of d.signals || []) counts[s] = (counts[s] || 0) + 1
      }
    }
    return counts
  }, [data])

  // Destinations matching the active signal filter (used to dim the rest
  // in the destination column — same UX as the heatmap mode in the path
  // flow map).
  const filteredFlowSet = useMemo(() => {
    if (!signalFilter || !data) return null
    const set = new Set<string>()
    for (const w of data.workloads || []) {
      for (const d of w.top_destinations || []) {
        if ((d.signals || []).includes(signalFilter)) {
          set.add(`${w.workload.id}→${d.ip}`)
        }
      }
    }
    return set
  }, [data, signalFilter])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[500px] rounded-xl bg-slate-900 border border-slate-800">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Egress Flow Map…</p>
          <p className="text-slate-400 text-xs mt-1">Querying Neo4j + ipinfo.io</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-500/5 border border-rose-500/30 p-6">
        <div className="flex items-center gap-2 text-rose-300 mb-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-semibold">Failed to load egress data</span>
        </div>
        <p className="text-rose-200/80 text-sm">{error}</p>
        <button onClick={() => fetchData(true)} className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-semibold hover:bg-rose-500/30">
          Retry
        </button>
      </div>
    )
  }

  if (!data || !data.workloads || data.workloads.length === 0) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium mb-1">No outbound traffic observed</p>
        <p className="text-slate-500 text-xs">
          No workloads in <span className="font-mono">{systemName}</span> have outbound flows in the 30-day VPC Flow Log window.
        </p>
      </div>
    )
  }

  // Group destinations into PUBLIC (IGW/NAT) and PRIVATE (VPCE/TGW)
  // for the swimlane headers, but render in ONE shared column grid so
  // ConnectionLinesSVG can draw curved arrows across the whole canvas.
  const publicCount = architecture.iamRoles.filter((r: any) => routeBucket(r.routeKind) === "public").length
  const privateCount = architecture.iamRoles.filter((r: any) => routeBucket(r.routeKind) === "private").length
  const totalSignals = Object.values(signalCounts).reduce((a, b) => a + b, 0)
  const visibleSignalCount = signalFilter ? (signalCounts[signalFilter] || 0) : totalSignals

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* Controls bar — matches Path Flow Map header */}
      <div className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Egress Flow Map</h3>
            <p className="text-slate-400 text-[10px]">
              {systemName} · {data.workload_count} workloads · 30-day VPC Flow Logs
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/15 rounded-full ml-3">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnimate((a) => !a)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold ${animate ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}
          >
            {animate ? "Pause" : "Animate"}
          </button>
          <button
            onClick={() => fetchData(true)}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-amber-400 font-bold text-base">{publicCount}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Public gateways</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-emerald-400 font-bold text-base">{privateCount}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Private endpoints</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-cyan-400 font-bold text-base">{formatBytes(architecture.totalBytes)}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">30d traffic</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-rose-300 font-bold text-base">
              {signalFilter ? `${visibleSignalCount} of ${totalSignals}` : totalSignals}
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Signals</div>
          </div>
        </div>
        {/* Filter chips */}
        {Object.keys(signalCounts).length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider mr-1">Filter</span>
            {Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => {
              const meta = SIGNAL_META[code] || { label: code, tone: "info" as const, tooltip: code }
              const active = signalFilter === code
              return (
                <button
                  key={code}
                  onClick={() => setSignalFilter(active ? null : code)}
                  title={meta.tooltip}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${active ? "bg-white text-slate-900 border-white" : signalToneClasses(meta.tone)}`}
                >
                  {meta.label} · {count}
                </button>
              )
            })}
            {signalFilter && (
              <button onClick={() => setSignalFilter(null)} className="px-2 py-0.5 rounded border text-[10px] font-semibold bg-slate-800 text-slate-300 border-slate-700">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Path-card list — one card per active workload's egress path.
          Layout matches the Identity Attack Paths card shape: severity
          score on the left, severity badge + hop count + OBSERVED tag
          across the top, the path chain inline (workload › subnet › sg
          › gateway › destinations), and metric rows on the bottom.
          Per feedback: "each resource has its own paths" — three EC2s
          = three independent cards, not shared columns. */}
      <div className="px-5 py-4" ref={containerRef}>
        <PathCardList
          rows={buildPathRows(architecture, data)}
          hiddenWorkloadCount={
            ((architecture as SystemArchitecture & {
              hiddenSilentWorkloadCount?: number
            }).hiddenSilentWorkloadCount) || 0
          }
        />
      </div>

    </div>
  )
}

export default EgressFlowMap
