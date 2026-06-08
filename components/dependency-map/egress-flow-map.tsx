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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cloud,
  Database,
  Globe,
  Lock,
  Maximize2,
  Minimize2,
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
import {
  RemovableInfrastructureCallout,
  RemoveRouteActionPanel,
  deriveRemoveRouteCandidates,
} from "./RemovableInfrastructureCallout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  FlowMapDetailPanel,
  type FlowMapDetailSelection,
} from "./flow-map-detail-panel"
import { DnsVisibilityBanner } from "./dns-visibility-banner"

// ---- Backend response shape (api/egress_visibility.py) -----------------

export interface EgressDestination {
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
  // S3-only: candidate buckets this AWS-S3 IP could have served. S3
  // service IPs are pooled across every bucket in the region, so the
  // IP alone can't identify the bucket — backend joins via the
  // workload's ACTUAL_S3_ACCESS / READS_FROM / WRITES_TO role-chain
  // edges. Frontend renders as small chips under the IP card so the
  // CISO sees "→ cyntro-demo-prod-data" instead of just "AWS · S3".
  bucket_candidates?: Array<{
    name: string
    id: string
    hits: number
    bytes: number
    operations: string[]
    is_public: boolean
    classification: string | null
    // "workload": this workload's role chain has observed READS_FROM /
    //   WRITES_TO / ACTUAL_S3_ACCESS to the bucket — direct evidence.
    // "system":   workload itself has no observed bucket access, but
    //   another workload in the same SystemName does, so this is the
    //   best-guess attribution. Renders with a different visual + an
    //   "observed elsewhere in system" tooltip — honest about the
    //   inference vs the direct observation.
    attribution?: "workload" | "system"
  }>
  // AWS-non-S3: resolved owning instance via :NetworkInterface.public_ip
  // lookup. When present, the AWS chip drops the "(instance or API)"
  // disclaimer and shows "→ alon-demo-app-2" so the CISO sees the
  // actual EC2/Lambda/RDS/etc name instead of just the service kind.
  // Null when the IP isn't matched to any ENI in our graph.
  aws_resource_type?: string | null
  aws_resource_id?: string | null
  aws_resource_name?: string | null
  // PTR-classified endpoint kind for AWS IPs that didn't match a
  // customer ENI. Lets the chip render "AWS API control plane" /
  // "VPC Endpoint" / "EC2 instance (other account)" instead of
  // the generic "(instance or API)" disclaimer.
  //   "instance"          — matched our ENI; aws_resource_name = our instance
  //   "instance_unowned"  — IP-encoded PTR but not our ENI → other account
  //   "api"               — AWS service endpoint (ec2./sts./kms./etc)
  //   "vpc_endpoint"      — VPCE-fronted endpoint
  //   "elb"               — ELB / ALB / NLB
  //   "rds" / "lambda"    — RDS / Lambda endpoint
  aws_endpoint_kind?: "instance" | "instance_unowned" | "api" | "vpc_endpoint" | "elb" | "rds" | "lambda" | null
}

// Workload-level SG attribution (NOT per-flow). Backend emits one entry
// per (workload)-[:SECURED_BY]->(SecurityGroup) edge (legacy aliases
// HAS_SECURITY_GROUP / USES_SECURITY_GROUP / IN_SECURITY_GROUP also
// accepted on read — see CLAUDE.md). Per-rule attribution (which egress
// rule allowed each specific destination/port/proto) is a follow-up —
// requires CIDR matching against egress rule sets.
export interface EgressAttachedSecurityGroup {
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

// One entry from a subnet's route table. Mirrors the AWS route shape
// (DestinationCidrBlock + classified target). target_kind ∈
// {InternetGateway, NATGateway, VPCEndpoint, TransitGateway,
// EgressOnlyInternetGateway, VPCPeering, NetworkInterface, AWSService, ...}.
// target_name is the AWS Name tag when present, otherwise the id.
interface EgressRoute {
  cidr: string | null
  target_kind: string | null
  target_id: string | null
  target_name: string | null
}

// Per-RT remediation candidate. Two types — discriminated union by
// `type`. Mutually exclusive per RT (REMOVE_ROUTE needs zero internet
// egress, ADD_VPC_ENDPOINT needs non-zero AWS-service egress via
// public route — can't both fire). Carries the specific candidate
// identifier (route for REMOVE, service for ADD) plus a confidence
// signal. Chip language is "REMOVABLE" / "ADD VPCE", never "SAFE"
// per feedback_remediation_safety_signals.md.
interface EgressRouteTableRecommendationRemove {
  type: "REMOVE_ROUTE"
  // Content-addressable id from api.posture_remediations._proposal_id.
  // Same payload (rt_id + cidr/target_kind/target_id) always returns the
  // same id, so the operator can re-fire without duplicating audit rows.
  // Optional because older backend builds did not emit it.
  proposal_id?: string | null
  // Optional fields mirrored from the SG/VPCE recommendation shape so the
  // /proposals/execute POST can be assembled directly from this object.
  auto_eligible?: boolean
  resource_type?: "RouteTable"
  resource_id?: string
  parameters?: {
    cidr?: string | null
    target_kind?: string | null
    target_id?: string | null
  }
  confidence_signal: string
  scope_workload_count: number
  candidate_route_cidr: string | null
  candidate_route_target_kind: string | null
  candidate_route_target_id: string | null
  candidate_route_target_name: string | null
}

interface EgressRouteTableRecommendationAddVpce {
  type: "ADD_VPC_ENDPOINT"
  confidence_signal: string
  scope_workload_count: number
  candidate_aws_service: string
  candidate_aws_services: string[]
  candidate_is_gateway_vpce: boolean
  candidate_observed_request_count: number
}

type EgressRouteTableRecommendation =
  | EgressRouteTableRecommendationRemove
  | EgressRouteTableRecommendationAddVpce

// Route table attached (explicitly or via VPC main RT) to the workload's
// subnet. `id` is the AWS RouteTableId (rtb-*). `routes` is the full
// active route set — operators click the card to see every entry. null
// at the workload level means the workload has no resolvable subnet
// (Lambda outside a VPC, terminated ENI).
export interface EgressRouteTable {
  id: string
  routes: EgressRoute[]
  // null when no remediation candidate applies (the common case — most
  // RTs with public egress are also actually using it). Populated when
  // backend's _compute_rt_recommendations finds a candidate.
  recommendation?: EgressRouteTableRecommendation | null
}

// Upstream crown jewel the workload READS from. Backend ships these per
// workload via _load_workload_upstream_crown_jewels_batch — see the
// matching shape in api/egress_visibility.py. Drives the Egress Flow
// Map's CROWN JEWEL column (left of COMPUTE) so the operator sees the
// full exfil chain at a glance: CJ → workload → SG → RT → gateway → internet.
export interface UpstreamCrownJewel {
  id: string
  name: string
  type: string
  classification: string | null
  is_internet_exposed: boolean
  hits: number
  bytes_transferred: number
  last_seen: string | null
}

// S3 bucket the workload accessed BY NAME (not by IP). Backend ships
// these per workload via _load_workload_bucket_accesses_batch — see
// matching shape in api/egress_visibility.py. Solves the "S3 IPs are
// shared across all buckets — Flow Logs alone can't tell which bucket"
// problem by correlating with ACTUAL_S3_ACCESS edges from S3 access
// logs / CloudTrail. Frontend renders these as named cards in the
// Destinations column so operators see "cyntro-demo-prod-data (47
// reads)" instead of "S3 · 52.218.101.40".
export interface WorkloadBucketAccess {
  id: string
  name: string
  is_public: boolean
  is_internet_exposed: boolean
  classification: string | null
  hits: number
  bytes_transferred: number
  last_seen: string | null
  operations: string[]  // ["GetObject", "PutObject", "ListObjects", ...]
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
  // Route table the workload's subnet is associated with. Backend emits
  // null when the workload has no resolvable subnet — the Egress Flow
  // Map renders a "NO ROUTE TABLE (not in VPC)" placeholder card in
  // that case rather than fabricating one (per feedback_no_mock_numbers_in_ui).
  route_table?: EgressRouteTable | null
  // Crown jewels this workload READS from in the lookback window.
  // Empty list = no observed CJ reads — frontend renders a three-state
  // "no observed CJ reads" placeholder in the CROWN JEWEL column
  // rather than hiding the column entirely (per
  // feedback_no_mock_numbers_in_ui).
  upstream_crown_jewels?: UpstreamCrownJewel[]
  // S3 buckets this workload accessed (correlated via ACTUAL_S3_ACCESS
  // edges). Solves the "S3 IPs are shared" problem — bucket NAMES, not
  // service IPs. Empty when the S3 access-logs collector hasn't run
  // for those buckets.
  bucket_accesses?: WorkloadBucketAccess[]
  // Rule-based AWS-best-practice insight cards (see EgressInsightCard
  // type below). Backend computes via api/egress_insights.py — empty
  // when no rule fires.
  insights?: EgressInsightCard[]
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

export const SIGNAL_META: Record<string, { label: string; tone: "warning" | "info" | "alert"; tooltip: string }> = {
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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// Compact "time ago" for CJ-card recency. Mirrors the shape used in
// risky-ports-dashboard so the operator sees the same vocabulary across
// surfaces (minutes/hours/days/months ago). Returns null when the
// timestamp is missing — caller should hide the line in that case.
export function formatTimeAgoShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  const diffMs = Date.now() - t
  if (diffMs < 0) return "just now"
  const m = Math.floor(diffMs / 60000)
  if (m < 60) return m <= 1 ? "just now" : `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

// Friendly type label for crown-jewel cards. Backend ships raw graph
// types ("S3Bucket", "DynamoDBTable", "SecretsManagerSecret") — we
// massage to a short, two-word display so the badge stays readable in
// the narrow CJ column.
const _CJ_TYPE_LABELS: Record<string, string> = {
  S3Bucket: "S3 Bucket",
  S3: "S3 Bucket",
  DynamoDBTable: "DynamoDB",
  DynamoDB: "DynamoDB",
  RDSInstance: "RDS",
  RDSCluster: "RDS Cluster",
  Secret: "Secret",
  SecretsManagerSecret: "Secret",
  KMSKey: "KMS Key",
  Elasticache: "Elasticache",
  ElasticacheCluster: "Elasticache",
  Redshift: "Redshift",
  RedshiftCluster: "Redshift",
  Lambda: "Lambda",
  LambdaFunction: "Lambda",
}

function cjTypeLabel(type: string | null | undefined): string {
  if (!type) return "Resource"
  return _CJ_TYPE_LABELS[type] || type
}

// Short, uppercase classification chip. Backend stores arbitrary
// strings ("pii", "PII", "financial", "confidential"); we normalize
// to a 3-7 char uppercase token that fits the chip width.
function cjClassificationChip(c: string | null | undefined): string | null {
  if (!c) return null
  const norm = c.trim().toLowerCase()
  if (!norm) return null
  const aliases: Record<string, string> = {
    pii: "PII",
    "personally-identifiable-information": "PII",
    phi: "PHI",
    financial: "FIN",
    confidential: "CONF",
    "highly-confidential": "CONF+",
    sensitive: "SENS",
    public: "PUB",
    internal: "INT",
  }
  return aliases[norm] || norm.slice(0, 6).toUpperCase()
}

export function countryFlag(country: string | null): string {
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
      vpcEndpoints: [],
      egressGateways: [],
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
      // Route table the workload's subnet is associated with. Stashed
      // on the compute node so buildPathRows can hydrate the PathRow
      // without re-traversing the workload payload. null when backend
      // couldn't resolve a subnet (Lambda outside VPC).
      routeTable: w.route_table ?? null,
    } as ServiceNode & {
      subnetId: string | null
      subnetName: string | null
      subnetIsPublic: boolean | null
      workloadTotalBytes: number
      workloadTotalHits: number
      workloadDestinationCount: number
      workloadSignalsBreakdown: Record<string, number>
      routeTable: EgressRouteTable | null
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
    vpcEndpoints: [],
    egressGateways: [],
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

export interface PathRow {
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
  // Route table the workload's subnet is associated with — full route
  // list so the operator can click the RT card and see every entry
  // (the AWS console equivalent of "Routes" tab). null when the
  // workload has no resolvable subnet (Lambda outside VPC), in which
  // case the UI renders a "NOT IN VPC" placeholder card.
  routeTable: EgressRouteTable | null
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
  // Path evidence type:
  //   "OBSERVED" — at least one ACTUAL_TRAFFIC edge in the lookback window.
  //   "LATENT"   — workload has internet capability (SG public egress AND
  //                subnet routes to IGW/NAT/EIGW) but made zero observed
  //                requests in the 30-day window. The path is reachable
  //                but unused — the killer-slide framing from
  //                project_internet_dependency_framing.md.
  evidence: "OBSERVED" | "LATENT"
  // Coarse bucketing for the path row. Mirrors backend egress_posture
  // buckets but only the two states the Flow Map currently distinguishes
  // are surfaced here (ACTIVE renders the existing dense card; LATENT
  // renders the muted "can egress · 0 observed" variant). ISOLATED and
  // REDIRECTABLE remain Trust Boundary Map's concern — they have their
  // own dedicated grid there.
  bucket: "active" | "latent"
  // Crown jewels this workload reads from (drives the CROWN JEWEL
  // column left of COMPUTE in PathFlowMap). Empty array = no observed
  // CJ reads in the lookback window — the column renders a three-
  // state "no observed CJ reads" placeholder rather than hiding.
  upstreamCrownJewels: UpstreamCrownJewel[]
  // S3 buckets this workload accessed BY NAME (via ACTUAL_S3_ACCESS
  // edges from CloudTrail / S3 access logs — not from Flow Logs).
  // Solves the "all S3 IPs look identical in Flow Logs" problem by
  // surfacing actual bucket identities in the Destinations column.
  // Empty = no observed bucket accesses (or the S3 access-logs
  // collector hasn't run for those buckets yet).
  bucketAccesses: WorkloadBucketAccess[]
  // Rule-based AWS-best-practice insight cards. Source: backend's
  // api/egress_insights.py rule engine, which maps observed-egress
  // facts onto authoritative AWS guidance (Well-Architected,
  // Gateway VPC Endpoints, Centralized Egress whitepaper) and emits
  // structured cards with severity + evidence + recommendation +
  // source URL. Empty array = no rule fired (honest "no insights",
  // not "all clear").
  insights: EgressInsightCard[]
}

// Insight card shape — mirror of api/egress_insights.py InsightCard.
// Drives the EgressInsightsPanel rendered next to the flow map in
// the per-path fullscreen dialog.
interface EgressInsightCard {
  id: string
  severity: "critical" | "high" | "medium" | "low"
  category: string  // "Security" | "Cost" | "Architecture" | "Posture" | combinations
  title: string
  evidence: string
  guidance: string
  source: string
  source_url: string
  recommendation: string
  affected_count: number
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
  // Same lookup for upstream crown jewels — workload reads-from data
  // that drives the CROWN JEWEL column. Sourced from the backend's
  // _load_workload_upstream_crown_jewels_batch (one Cypher round-trip
  // for the whole system).
  const cjByWorkload = new Map<string, UpstreamCrownJewel[]>()
  // S3 bucket accesses — workload-to-bucket reads via ACTUAL_S3_ACCESS.
  // Powers the named bucket cards in the Destinations column.
  const bucketsByWorkload = new Map<string, WorkloadBucketAccess[]>()
  // Insights — backend rule engine output. Keyed by workload id.
  const insightsByWorkload = new Map<string, EgressInsightCard[]>()
  for (const w of data?.workloads || []) {
    destsByWorkload.set(w.workload.id, w.top_destinations || [])
    cjByWorkload.set(w.workload.id, w.upstream_crown_jewels || [])
    bucketsByWorkload.set(w.workload.id, w.bucket_accesses || [])
    insightsByWorkload.set(w.workload.id, w.insights || [])
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
      routeTable?: EgressRouteTable | null
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
      routeTable: meta.routeTable ?? null,
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
      bucket: "active",
      upstreamCrownJewels: cjByWorkload.get(wid) || [],
      bucketAccesses: bucketsByWorkload.get(wid) || [],
      insights: insightsByWorkload.get(wid) || [],
    })
  }
  // Sort by score desc — operators see the highest-impact path first,
  // matching the Identity Attack Paths card-list order.
  rows.sort((a, b) => b.severityScore - a.severityScore)
  return rows
}

// ---- Latent path rows (workloads that CAN egress but never did) -------
//
// Mirrors backend egress_posture._has_internet_capability — a workload
// has internet capability iff (a) any of its attached SGs has a 0.0.0.0/0
// egress rule AND (b) its subnet's route table has a 0.0.0.0/0 route to a
// public-egress kind (IGW / NAT / EIGW). Either plane alone is a dead end.
//
// We render these as their own path-row variant: same five-column layout
// (subnet, SG, RT, gateway are populated from the workload's static AWS
// state) but the Destinations column shows the "0 observed" placeholder.
// Severity is intentionally not computed — there's no observed exposure
// to score; the LATENT pill replaces the numeric score in the header.
const PUBLIC_EGRESS_ROUTE_KINDS = new Set([
  "InternetGateway",
  "NATGateway",
  "EgressOnlyInternetGateway",
])

function hasInternetCapability(w: EgressWorkload): {
  hasCap: boolean
  hasPublicSg: boolean
  hasIgwRoute: boolean
  hasSgs: boolean
  sgFlagTrusted: boolean
} {
  const sgs = w.attached_security_groups || []
  const hasPublicSg = sgs.some((sg) => !!sg.has_public_egress)
  const hasSgs = sgs.length > 0
  const routes = w.route_table?.routes || []
  const hasIgwRoute = routes.some(
    (r) =>
      r.cidr === "0.0.0.0/0" &&
      !!r.target_kind &&
      PUBLIC_EGRESS_ROUTE_KINDS.has(r.target_kind),
  )
  // Capability detection. We'd prefer to require both planes (SG public
  // egress AND subnet IGW route) per egress_posture._has_internet_capability,
  // but the `has_public_egress` flag the egress_visibility collector emits
  // is currently stale system-wide on alon-prod — it reports false even when
  // the SG actually has a 0.0.0.0/0 egress rule. The backend egress_posture
  // endpoint corrects this via Cypher round-trip on outbound_rules JSON,
  // but the visibility endpoint doesn't. Until that's fixed at source, we
  // use the network plane (IGW route present + SG attached) and surface the
  // capability as "inferred" via tooltip so operators can verify per workload.
  const sgFlagTrusted = hasPublicSg
  const hasCap = hasIgwRoute && (hasPublicSg || hasSgs)
  return { hasCap, hasPublicSg, hasIgwRoute, hasSgs, sgFlagTrusted }
}

function buildLatentPathRows(data: EgressResponse | null): PathRow[] {
  if (!data) return []
  const rows: PathRow[] = []
  for (const w of data.workloads || []) {
    // Latent = zero observed top_destinations + has both capability planes.
    // (Workloads with observed traffic land in buildPathRows. Workloads
    // missing one or both planes are ISOLATED — Trust Boundary Map's
    // concern, not Flow Map's.)
    if ((w.top_destinations || []).length > 0) continue
    const cap = hasInternetCapability(w)
    if (!cap.hasCap) continue

    const sgs = (w.attached_security_groups || []).map((sg) => ({
      id: sg.id,
      name: sg.name || sg.id,
      hasPublicEgress: !!sg.has_public_egress,
    }))
    // Resolve gateways from the RT's public-egress routes. Each unique
    // (target_kind, target_id) gets a card — usually one (the IGW), but
    // mixed routing (IGW for default + EIGW for v6) can produce two.
    const gwSeen = new Set<string>()
    const gateways: PathRow["gateways"] = []
    for (const r of w.route_table?.routes || []) {
      if (r.cidr !== "0.0.0.0/0") continue
      if (!r.target_kind || !PUBLIC_EGRESS_ROUTE_KINDS.has(r.target_kind)) continue
      const id = r.target_id || r.target_name || r.target_kind
      if (gwSeen.has(id)) continue
      gwSeen.add(id)
      gateways.push({
        id,
        name: r.target_name || r.target_id || r.target_kind,
        kind: r.target_kind,
        bucket: "public",
      })
    }

    const wl = w.workload
    const workloadType: NodeType =
      (wl.node_type || "").toLowerCase().includes("lambda") ? "lambda" : "compute"

    rows.push({
      workloadId: wl.id,
      workloadName: wl.name || wl.id,
      workloadType,
      subnetId: wl.subnet_id ?? null,
      subnetName: wl.subnet_name ?? null,
      subnetIsPublic: wl.subnet_is_public ?? null,
      sgs,
      gateways,
      routeTable: w.route_table ?? null,
      destinationCount: 0,
      topDestinations: [],
      fullDestinations: [],
      egressDestinations: [],
      eastWestDestinations: [],
      egressDestinationCount: 0,
      eastWestDestinationCount: 0,
      totalBytes: 0,
      totalHits: 0,
      signals: {},
      // hops: compute + subnet(if present) + sgs + gateways. No destinations
      // group since none were observed — keep the count truthful.
      hopCount: 1 + (wl.subnet_id ? 1 : 0) + sgs.length + gateways.length,
      severity: "LOW",
      severityScore: 0,
      scoreLabel: "LATENT",
      evidence: "LATENT",
      bucket: "latent",
      upstreamCrownJewels: w.upstream_crown_jewels || [],
      bucketAccesses: w.bucket_accesses || [],
      insights: w.insights || [],
    })
  }
  // Sort by workload name — there's no severity ordering for latent rows
  // (no observed traffic to score). Alphabetical lets the operator scan
  // for a specific service quickly.
  rows.sort((a, b) => a.workloadName.localeCompare(b.workloadName))
  return rows
}

// ---- Silent-candidate row (Option 1: surface silent workloads on
// REMOVE_ROUTE candidate RTs) ----------------------------------------
//
// A workload that has zero observed egress is hidden from the main
// path list by activeWorkloads filter — there's no path chain to
// draw. But when that workload SHARES a route table with a
// REMOVE_ROUTE candidate, it is exactly the workload whose silence
// is the safety guarantee for the removal. Surfacing it here ties
// the executive-level callout (top of EgressFlowMap) to the per-
// workload evidence ("look — this specific workload has been
// silent for 30 days, that's why the route is removable").
//
// Informational only — no per-row execute button. The single
// execution surface is the callout above; multiple buttons for the
// same RT proposal would create UX ambiguity about which one
// "wins" idempotency.
interface SilentCandidateRow {
  workloadId: string
  workloadName: string
  subnetId: string | null
  subnetName: string | null
  subnetIsPublic: boolean | null
  rtId: string
  candidateCidr: string | null
  candidateTargetKind: string | null
  // Fields below mirror RemoveRouteCandidate so a grouped section can
  // mount RemoveRouteActionPanel inline. Single proposal_id per RT
  // (content-addressed by the backend) means N workloads sharing an
  // RT collapse to ONE executor — matching the design contract of
  // RemoveRouteActionPanel ("one execute per proposal_id").
  proposalId: string | null
  candidateTargetId: string | null
  candidateTargetName: string | null
  scopeWorkloadCount: number
  confidenceSignal: string
}

function buildSilentCandidateRows(data: EgressResponse | null): SilentCandidateRow[] {
  if (!data) return []
  const out: SilentCandidateRow[] = []
  for (const w of data.workloads || []) {
    // Silent = zero observed top_destinations. Matches the
    // activeWorkloads filter in buildArchitecture so we surface
    // exactly the workloads that the existing filter hides.
    if ((w.top_destinations || []).length > 0) continue
    const rt = w.route_table
    if (!rt || !rt.recommendation) continue
    if (rt.recommendation.type !== "REMOVE_ROUTE") continue
    out.push({
      workloadId: w.workload.id,
      workloadName: w.workload.name || w.workload.id,
      subnetId: w.workload.subnet_id,
      subnetName: w.workload.subnet_name,
      subnetIsPublic: w.workload.subnet_is_public,
      rtId: rt.id,
      candidateCidr: rt.recommendation.candidate_route_cidr,
      candidateTargetKind: rt.recommendation.candidate_route_target_kind,
      proposalId: rt.recommendation.proposal_id ?? null,
      candidateTargetId: rt.recommendation.candidate_route_target_id,
      candidateTargetName: rt.recommendation.candidate_route_target_name,
      scopeWorkloadCount: rt.recommendation.scope_workload_count,
      confidenceSignal: rt.recommendation.confidence_signal,
    })
  }
  // Sort by RT id then workload name so workloads sharing an RT
  // cluster together — the operator reads the silent set as a
  // single decision, not a series of unrelated workloads.
  out.sort((a, b) => {
    if (a.rtId !== b.rtId) return a.rtId.localeCompare(b.rtId)
    return a.workloadName.localeCompare(b.workloadName)
  })
  return out
}

// Group silent-candidate rows by rt_id so we render ONE execute
// panel per RT (not N panels for the N workloads sharing it).
// Prevents the "N buttons for the same proposal_id" UX trap.
function groupSilentRowsByRT(rows: SilentCandidateRow[]) {
  const map = new Map<string, { rt: SilentCandidateRow; workloads: SilentCandidateRow[] }>()
  for (const r of rows) {
    const existing = map.get(r.rtId)
    if (existing) {
      existing.workloads.push(r)
    } else {
      map.set(r.rtId, { rt: r, workloads: [r] })
    }
  }
  return Array.from(map.values())
}


// ---- PathCardList / PathCard ------------------------------------------

function PathCardList({
  rows,
  latentRows,
  hiddenWorkloadCount,
  silentCandidates,
}: {
  rows: PathRow[]
  latentRows: PathRow[]
  hiddenWorkloadCount: number
  silentCandidates: SilentCandidateRow[]
}) {
  // Filter chip — defaults to "active" so the existing OBSERVED-only
  // narrative isn't disturbed for users who don't toggle. "latent"
  // exposes the workloads that CAN egress but never did (LATENT_EXPOSURE
  // bucket — the killer-slide framing). "all" interleaves both.
  const [view, setView] = useState<"active" | "latent" | "all">("active")
  // Pivot toggle — "workload" is the existing flat list of paths sorted
  // by severity. "crown-jewel" groups the same paths by upstream CJ they
  // read, so the operator sees the full "jewel → reader → gateway →
  // destinations" exfil chain inline. Only rendered when at least one
  // row carries upstream_crown_jewels (silent absence when no CJs in
  // play — matches feedback_no_mock_numbers_in_ui).
  const [pivot, setPivot] = useState<"workload" | "crown-jewel">("workload")
  if (rows.length === 0 && latentRows.length === 0 && silentCandidates.length === 0) {
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
  const visibleActive = view === "latent" ? [] : rows
  const visibleLatent = view === "active" ? [] : latentRows
  const totalVisible = visibleActive.length + visibleLatent.length
  // Aggregate visible rows for the CJ-pivoted view. Skip latent-only
  // toggle vs active-only — pivot operates on whatever's visible per
  // the filter chip. The CJ pivot itself is a SEPARATE control: same
  // row set, just reorganized into jewel groups.
  const allVisibleRows = [...visibleActive, ...visibleLatent]
  // CJ pivot is only useful when there's at least one CJ on any row.
  const hasAnyCj = allVisibleRows.some((r) => r.upstreamCrownJewels.length > 0)
  // Group: { jewelId → { jewel, readers: PathRow[] } }. A row may appear
  // in multiple groups if it reads multiple jewels — that's the truth of
  // the data, not a bug. Rows with zero CJ go into a "No upstream jewel"
  // bucket at the end.
  type CjGroup = { jewel: UpstreamCrownJewel; readers: PathRow[]; exposedReadersCount: number }
  const cjGroups: CjGroup[] = []
  const cjMap = new Map<string, CjGroup>()
  const noCjReaders: PathRow[] = []
  if (pivot === "crown-jewel") {
    for (const row of allVisibleRows) {
      if (row.upstreamCrownJewels.length === 0) {
        noCjReaders.push(row)
        continue
      }
      for (const cj of row.upstreamCrownJewels) {
        let group = cjMap.get(cj.id)
        if (!group) {
          group = { jewel: cj, readers: [], exposedReadersCount: 0 }
          cjMap.set(cj.id, group)
          cjGroups.push(group)
        }
        group.readers.push(row)
        if (row.gateways.some((g) => g.bucket === "public")) {
          group.exposedReadersCount += 1
        }
      }
    }
    // Sort jewels by severity: internet-exposed jewels first, then by
    // exfil-capable-reader count, then by total reader count. Mirrors
    // the prioritization in crown-jewel-exfil-paths.tsx.
    cjGroups.sort((a, b) => {
      const ax = a.jewel.is_internet_exposed ? 1 : 0
      const bx = b.jewel.is_internet_exposed ? 1 : 0
      if (ax !== bx) return bx - ax
      if (a.exposedReadersCount !== b.exposedReadersCount) {
        return b.exposedReadersCount - a.exposedReadersCount
      }
      return b.readers.length - a.readers.length
    })
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
            {totalVisible}
          </span>
          <span
            className="text-[11px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            {totalVisible === 1 ? "egress path" : "egress paths"}
          </span>
        </div>
      </div>

      {/* Active / Latent / All filter — only renders when there are
          latent workloads to show. When zero, the existing
          "OBSERVED-only" header stays untouched. */}
      {latentRows.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] -mt-2 flex-wrap">
          <span
            className="uppercase tracking-[0.1em] font-semibold mr-1"
            style={{ color: "#64748b" }}
          >
            Show
          </span>
          {(["active", "latent", "all"] as const).map((opt) => {
            const labels: Record<typeof opt, string> = {
              active: `Active · ${rows.length}`,
              latent: `Latent · ${latentRows.length}`,
              all: `All · ${rows.length + latentRows.length}`,
            }
            const tooltips: Record<typeof opt, string> = {
              active:
                "Workloads with at least one observed outbound flow in the 30-day window.",
              latent:
                "Workloads that CAN egress to the internet (SG public-egress rule + subnet route to IGW/NAT/EIGW) but made zero observed requests in the 30-day window. Reachable but unused.",
              all: "Active + latent paths interleaved. Active are sorted by severity; latent are appended alphabetically.",
            }
            const isOn = view === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setView(opt)}
                aria-pressed={isOn}
                title={tooltips[opt]}
                className={`rounded border px-2 py-1 font-semibold uppercase tracking-[0.08em] transition-colors ${
                  isOn
                    ? "bg-slate-200 text-slate-900 border-slate-200"
                    : "bg-slate-900/60 text-slate-300 border-slate-700 hover:bg-slate-800"
                }`}
              >
                {labels[opt]}
              </button>
            )
          })}
          {/* Pivot toggle — only renders when at least one visible row has
              a CJ. Workload (default) = flat list. Crown Jewel = group
              paths by jewel they read so the operator sees the exfil
              chain inline. */}
          {hasAnyCj && (
            <>
              <span
                className="uppercase tracking-[0.1em] font-semibold ml-3 mr-1"
                style={{ color: "#64748b" }}
              >
                Pivot
              </span>
              {(["workload", "crown-jewel"] as const).map((opt) => {
                const labels: Record<typeof opt, string> = {
                  workload: "Workload",
                  "crown-jewel": "Crown Jewel",
                }
                const tooltips: Record<typeof opt, string> = {
                  workload:
                    "Default: one row per workload, sorted by severity. Existing flow-map layout.",
                  "crown-jewel":
                    "Group paths by the upstream crown jewel they READ from. Each jewel section lists its reader workloads with the full Compute → SG → RT → Gateway → Destinations chain — the 1-hop exfil view.",
                }
                const isOn = pivot === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPivot(opt)}
                    aria-pressed={isOn}
                    title={tooltips[opt]}
                    className={`rounded border px-2 py-1 font-semibold uppercase tracking-[0.08em] transition-colors ${
                      isOn
                        ? "bg-fuchsia-500/30 text-fuchsia-100 border-fuchsia-400/60"
                        : "bg-slate-900/60 text-slate-300 border-slate-700 hover:bg-slate-800"
                    }`}
                  >
                    {labels[opt]}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}

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
          {(() => {
            // Workloads with REMOVE_ROUTE candidates are now surfaced
            // in the silent-candidates section below — don't double-
            // count them in the "N silent workloads hidden" notice.
            const remaining = Math.max(0, hiddenWorkloadCount - silentCandidates.length)
            return remaining > 0 ? (
              <span className="normal-case tracking-normal font-normal text-[10px]" style={{ color: "#64748b" }}>
                · {remaining} silent workload{remaining === 1 ? "" : "s"} hidden
              </span>
            ) : null
          })()}
          <span className="ml-auto text-[10px] tracking-[0.1em] normal-case font-normal" style={{ color: "#94a3b8" }}>
            sorted by severity · click a row to drill in
          </span>
        </div>
      )}

      {/* Silent-candidates section (Option 1). Workloads with zero
          observed egress that sit in a route table with a REMOVE_ROUTE
          candidate. Surfaces them as evidence for the removal — these
          ARE the workloads whose silence is the safety guarantee for
          the route delete. Informational only; the actual execute
          surface is the Removable Infrastructure callout above. */}
      {silentCandidates.length > 0 && (() => {
        const groups = groupSilentRowsByRT(silentCandidates)
        return (
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "rgba(245,158,11,0.25)", background: "rgba(15,23,42,0.5)" }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(245,158,11,0.18)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-300/80">
                  Zero observed egress · route removable
                </span>
                <span className="text-[11px] tabular-nums text-amber-100/90">
                  {groups.length} route table{groups.length === 1 ? "" : "s"}
                  {" · "}
                  {silentCandidates.length} workload{silentCandidates.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-amber-200/60 leading-relaxed">
                Workloads with no outbound traffic in the 30-day window, grouped by the
                route table whose public-egress route is removable. Their silence is the
                safety basis for the removal. Simulate / Apply per RT below — one execute
                covers every workload in scope.
              </p>
            </div>
            <ul className="divide-y" style={{ borderColor: "rgba(245,158,11,0.12)" }}>
              {groups.map(({ rt, workloads }) => (
                <li key={rt.rtId} className="px-3 py-2.5">
                  {/* Group header: RT id + route + chip + scope count */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldOff className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="font-mono text-[11px] text-indigo-200 truncate" title={rt.rtId}>
                      {rt.rtId}
                    </span>
                    <span className="text-slate-500 text-[10px]">›</span>
                    <span className="font-mono text-[10px] text-amber-100/90">{rt.candidateCidr || "?"}</span>
                    <span className="text-amber-300/60 text-[10px]">→</span>
                    <span className="text-[10px] text-amber-100/90">
                      {rt.candidateTargetKind || "?"}{" "}
                      <span className="font-mono">{rt.candidateTargetId || ""}</span>
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">
                        {workloads.length} workload{workloads.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                  {/* Workload list inside the group — compact */}
                  <div className="pl-5 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                    {workloads.map((w) => (
                      <span key={w.workloadId} className="inline-flex items-center gap-1.5 text-slate-300">
                        <span className="font-semibold text-slate-100">{w.workloadName}</span>
                        {w.subnetIsPublic === true && (
                          <span className="px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-200">
                            Public
                          </span>
                        )}
                        {w.subnetIsPublic === false && (
                          <span className="px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wider border border-slate-600 bg-slate-800/40 text-slate-300">
                            Private
                          </span>
                        )}
                        <span className="text-slate-500 font-mono">{w.subnetName || w.subnetId}</span>
                      </span>
                    ))}
                  </div>
                  {/* Per-RT executor — one panel, covers all workloads
                      in this RT's scope. Same proposal_id as the
                      top-level summary's expand list and (in the
                      future) the per-path RT banner — re-firing from
                      any surface dedupes by content-addressed id. */}
                  <RemoveRouteActionPanel
                    candidate={{
                      rtId: rt.rtId,
                      proposalId: rt.proposalId,
                      cidr: rt.candidateCidr,
                      targetKind: rt.candidateTargetKind,
                      targetId: rt.candidateTargetId,
                      targetName: rt.candidateTargetName,
                      scopeWorkloadCount: rt.scopeWorkloadCount,
                      confidenceSignal: rt.confidenceSignal,
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      {/* Path rows — render layout depends on pivot:
            workload    → flat list (active first, latent appended)
            crown-jewel → sections grouped by upstream CJ */}
      {pivot === "workload" ? (
      <div className="flex flex-col gap-2 mt-1">
        {visibleActive.map((row, i) => (
          <PathCard key={row.workloadId} row={row} index={i + 1} />
        ))}
        {visibleLatent.length > 0 && visibleActive.length > 0 && (
          <div
            className="mt-3 pt-2 border-t flex items-baseline gap-2 text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ borderColor: "rgba(148,163,184,0.15)", color: "#64748b" }}
          >
            <ShieldOff className="w-3 h-3 text-amber-400/70" />
            <span className="text-amber-300/90">Latent · can egress · 0 observed</span>
            <span style={{ color: "#475569" }}>· {visibleLatent.length} workload{visibleLatent.length === 1 ? "" : "s"}</span>
          </div>
        )}
        {visibleLatent.map((row, i) => (
          <PathCard
            key={`latent-${row.workloadId}`}
            row={row}
            index={visibleActive.length + i + 1}
          />
        ))}
      </div>
      ) : (
      <CjPivotedRows
        cjGroups={cjGroups}
        noCjReaders={noCjReaders}
      />
      )}
    </div>
  )
}

// CJ-pivoted view of the path list. Each visible jewel gets a section
// header (jewel identity + posture chips) and the reader path cards are
// stacked under it. A reader that reads N jewels appears in N sections —
// that's a truthful representation of the data, not duplication. The
// "No upstream crown jewel" trailing section holds rows with empty
// upstreamCrownJewels so nothing visible disappears when pivot is on.
function CjPivotedRows({
  cjGroups,
  noCjReaders,
}: {
  cjGroups: Array<{
    jewel: UpstreamCrownJewel
    readers: PathRow[]
    exposedReadersCount: number
  }>
  noCjReaders: PathRow[]
}) {
  if (cjGroups.length === 0 && noCjReaders.length === 0) {
    return (
      <div
        className="rounded-lg border p-6 mt-2 text-center text-[12px] italic"
        style={{ borderColor: "rgba(148,163,184,0.15)", color: "#94a3b8" }}
      >
        No paths to display under the current filter.
      </div>
    )
  }
  let runningIndex = 0
  return (
    <div className="flex flex-col gap-5 mt-1">
      {cjGroups.map((group) => {
        const cj = group.jewel
        const exposed = !!cj.is_internet_exposed
        const exfil = group.exposedReadersCount > 0
        return (
          <section key={cj.id} className="flex flex-col gap-2">
            {/* Jewel section header — visually distinct from workload-pivot
                so the operator sees "this is a CJ section" at a glance.
                Mirrors crown-jewel-exfil-paths.tsx tone (fuchsia for CJ,
                rose-escalated when internet-exposed). */}
            <div
              className={`rounded-lg border-2 px-4 py-3 ${
                exposed
                  ? "border-rose-500/50 bg-rose-500/10"
                  : "border-fuchsia-500/30 bg-fuchsia-500/10"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Database
                  className={`w-4 h-4 shrink-0 ${exposed ? "text-rose-300" : "text-fuchsia-300"}`}
                />
                <span
                  className={`text-[14px] font-bold truncate ${exposed ? "text-rose-50" : "text-fuchsia-50"}`}
                  title={cj.name}
                >
                  {cj.name}
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-slate-300"
                  title="Crown jewel type"
                >
                  {cjTypeLabel(cj.type)}
                </span>
                {cj.classification && (
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-500/15 text-amber-200">
                    {cjClassificationChip(cj.classification)}
                  </span>
                )}
                {exposed && (
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded border border-rose-400/70 bg-rose-500/20 text-rose-100">
                    Public jewel
                  </span>
                )}
                <span
                  className="ml-auto text-[10px] uppercase tracking-[0.12em] font-semibold"
                  style={{ color: "#94a3b8" }}
                >
                  {group.readers.length} reader{group.readers.length === 1 ? "" : "s"}
                  {exfil && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-400/70 bg-rose-500/20 text-rose-100"
                      title="Reader workload has internet egress capability — 1-hop exfil chain"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {group.exposedReadersCount} can exfil
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                {exfil
                  ? `${group.exposedReadersCount} of ${group.readers.length} reader${group.readers.length === 1 ? "" : "s"} below has a public-egress gateway — if any are compromised, this jewel's data can exit to the internet in one hop.`
                  : `Every reader below routes only to private (VPCE / NAT-protected / east-west) destinations — no observed exfil path from this jewel.`}
              </div>
            </div>
            {/* Reader path cards, indented by border to read as "under this jewel". */}
            <div className="flex flex-col gap-2 pl-4 border-l-2 border-fuchsia-500/20 ml-1">
              {group.readers.map((row) => {
                runningIndex += 1
                return (
                  <PathCard
                    key={`cj-${cj.id}-${row.workloadId}`}
                    row={row}
                    index={runningIndex}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
      {noCjReaders.length > 0 && (
        <section className="flex flex-col gap-2">
          <div
            className="rounded-lg border px-4 py-2 text-[11px]"
            style={{
              borderColor: "rgba(148,163,184,0.2)",
              background: "rgba(15,23,42,0.6)",
              color: "#94a3b8",
            }}
          >
            <span className="uppercase tracking-[0.12em] font-semibold">
              No upstream crown jewel
            </span>
            <span className="ml-2 normal-case font-normal" style={{ color: "#64748b" }}>
              · {noCjReaders.length} workload{noCjReaders.length === 1 ? "" : "s"} egress without reading a tracked jewel in the 30-day window
            </span>
          </div>
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-slate-700/40 ml-1">
            {noCjReaders.map((row) => {
              runningIndex += 1
              return (
                <PathCard
                  key={`nocj-${row.workloadId}`}
                  row={row}
                  index={runningIndex}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// PathFlowMap — per-path column-grid visual map that mirrors the
// Attack Paths "System Architecture" view (TrafficFlowMap pattern).
// Renders 5 columns: COMPUTE | SECURITY GROUPS | ROUTE TABLE | EGRESS
// GATEWAY | DESTINATIONS, with animated traffic lines drawn between
// cards via the shared ConnectionLinesSVG primitive.
//
// The ROUTE TABLE column sits visually between SG and GATEWAY because
// in AWS the route table is the routing decision that *picks* which
// gateway the packet takes — it's not a "device" the packet stops at.
// ConnectionLinesSVG still draws compute→sg→gateway→destination
// (skipping the RT) because RTs aren't packet-handling nodes; the RT
// card just sits in the line's visual path so the operator reads the
// flow as "SG allows → RT routes → gateway forwards."
//
// Click the Route Table card to expand the panel below the grid and
// see every route entry (CIDR → target kind/name). Maps 1:1 to the
// AWS console "Routes" tab.
//
// Builds a per-path SystemArchitecture (compute=this workload, sgs=
// this path's SGs, iamRoles=this path's gateways, resources=this
// path's destinations, flows=per-destination tuples) and passes it
// to ConnectionLinesSVG. Same visual story as Attack Paths but
// scoped to ONE egress workload's path.
// ---- EgressInsightsPanel — rule-based AWS-best-practice cards ---------
//
// Replaces the dense destination + east-west rows that used to fill the
// bottom of the per-path fullscreen dialog. Each card answers three
// questions an operator actually needs:
//   1. WHAT specifically is observed (evidence with numbers)
//   2. WHY it's sub-optimal vs the AWS-documented pattern (guidance + citation)
//   3. HOW to remediate (one-sentence recommendation)
//
// Data comes from the backend's api/egress_insights.py rule engine;
// this panel is dumb render only. Empty insights array = honest
// "no rule fired" (per feedback_no_mock_numbers_in_ui three-state).

// Dark-theme palette — user requested revert on 2026-05-18. The
// "Cyntro Closure Recommendations" reframing (vs "AWS best-practice
// insights") is preserved; only the colors are dark-theme variants.
const _SEV_TONE: Record<
  EgressInsightCard["severity"],
  {
    border: string
    bg: string
    chipBg: string
    chipText: string
    headlineText: string
    label: string
    accentBorder: string
  }
> = {
  critical: {
    border: "border-rose-500/50",
    bg: "bg-rose-500/10",
    chipBg: "bg-rose-500/20",
    chipText: "text-rose-200",
    headlineText: "text-rose-300",
    label: "CRITICAL",
    accentBorder: "border-rose-500/30",
  },
  high: {
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    chipBg: "bg-amber-500/20",
    chipText: "text-amber-200",
    headlineText: "text-amber-300",
    label: "HIGH",
    accentBorder: "border-amber-500/30",
  },
  medium: {
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    chipBg: "bg-sky-500/20",
    chipText: "text-sky-200",
    headlineText: "text-sky-300",
    label: "MEDIUM",
    accentBorder: "border-sky-500/30",
  },
  low: {
    border: "border-slate-500/40",
    bg: "bg-slate-500/10",
    chipBg: "bg-slate-500/20",
    chipText: "text-slate-300",
    headlineText: "text-slate-300",
    label: "LOW",
    accentBorder: "border-slate-500/30",
  },
}

// Vendor-neutral label per feedback_demo_safe_source_labels — the
// previous "AWS best-practice insights" header leaked the integration
// list in demo recordings AND framed the recommendation as if AWS
// owned it (when Cyntro is the authority, observation is the source,
// AWS docs are merely a reference citation). Reframed throughout as
// Cyntro Closure Recommendations — operator sees what we recommend
// based on what we observed, with the upstream reference as a small
// citation chip at the bottom.
function EgressInsightsPanel({ insights }: { insights: EgressInsightCard[] }) {
  if (!insights || insights.length === 0) {
    // Honest empty state — backend rule engine ran and nothing fired.
    // NOT a "loading" state and NOT an "all clear" — see
    // feedback_no_mock_numbers_in_ui (three-state pattern).
    return (
      <div>
        <div className="flex items-baseline gap-2 mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-400">
            Cyntro Closure Recommendations
          </h3>
          <span className="text-[10px] text-slate-500">
            no recommendation fired in this path's observation window
          </span>
        </div>
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-6 text-[11px] text-slate-500 leading-relaxed">
          No closure recommendations matched this path's observed egress.
          The destinations + gateways + signals seen here don't map to a
          known closure pattern our recommendation engine recognizes.
          Operator review still recommended for any path with a non-zero
          severity score.
        </div>
      </div>
    )
  }
  const critCount = insights.filter((i) => i.severity === "critical").length
  const highCount = insights.filter((i) => i.severity === "high").length
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-400">
          Cyntro Closure Recommendations ({insights.length})
        </h3>
        {(critCount > 0 || highCount > 0) && (
          <span className="text-[10px] text-slate-500">
            {critCount > 0 && (
              <span className="text-rose-400 font-semibold">{critCount} critical</span>
            )}
            {critCount > 0 && highCount > 0 && " · "}
            {highCount > 0 && (
              <span className="text-amber-400 font-semibold">{highCount} high</span>
            )}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {insights.map((card) => {
          const tone = _SEV_TONE[card.severity] || _SEV_TONE.low
          return (
            <div
              key={card.id}
              className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}
            >
              {/* Header: severity chip + category */}
              <div className="flex items-start gap-2 mb-2">
                <span
                  className={`inline-flex items-center rounded ${tone.chipBg} ${tone.chipText} px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0`}
                >
                  {tone.label}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold shrink-0 pt-0.5">
                  {card.category}
                </span>
              </div>

              <div className={`text-[13px] font-semibold leading-snug ${tone.headlineText} mb-1.5`}>
                {card.title}
              </div>

              <div className="text-[11px] text-slate-300 leading-relaxed mb-2">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mr-1">What we observed:</span>
                {card.evidence}
              </div>

              <div className={`text-[11px] text-slate-400 leading-relaxed mb-2 border-l ${tone.accentBorder} pl-3`}>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Why this matters:</span>
                {card.guidance}
              </div>

              <div className={`text-[11px] font-medium ${tone.headlineText} leading-relaxed`}>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Recommended action:</span>
                {card.recommendation}
              </div>

              {card.source && card.source_url && (
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <a
                    href={card.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 underline decoration-dotted underline-offset-2"
                    title={`Upstream reference: ${card.source_url}`}
                  >
                    📖 Reference: {card.source}
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function PathFlowMap({ row, sevColor }: { row: PathRow; sevColor: string }) {
  // Container that ConnectionLinesSVG positions absolutely over.
  const containerRef = useRef<HTMLDivElement>(null)
  // Route-table panel toggle. Closed by default — most operators want
  // the visual flow first, route entries only when they're diagnosing
  // a specific destination. Click the RT card to flip it.
  const [routeTableOpen, setRouteTableOpen] = useState(false)
  // Per-card detail side panel. Compute/SG/Gateway/Destination/Bucket
  // open a Sheet from the right with rich details (subnet posture, role,
  // SG rules, gateway routing, IP enrichment, bucket policy etc.). RT is
  // intentionally NOT routed through this panel — it keeps its existing
  // expand-below-grid behavior per user direction.
  const [detailSelection, setDetailSelection] = useState<FlowMapDetailSelection | null>(null)

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
      vpcEndpoints: [],
      egressGateways: [],
      flows,
      totalBytes: row.totalBytes,
      totalConnections: row.totalHits,
      totalGaps: 0,
    }
  }, [row])

  const subnetIsPublic = row.subnetIsPublic
  // Dark-theme tones — user requested revert on 2026-05-18 ("retern to dark mode").
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
      {/* Subtle dot grid background */}
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

      {/* Column grid — CONDITIONALLY 5 vs 6 columns based on Crown Jewel
          presence. Per Q2 feedback (2026-05-17): "no observed CJ reads"
          placeholder was visual debt on most paths (90% of workloads
          don't read jewels). The column only appears now when the
          backend surfaced actual upstream-jewel-read edges. Card sizes
          bumped 25-40% across the board for readability on the light-
          theme system page.
          Full layout when CJ present (6 cols):
            CJ | COMPUTE | SG | ROUTE TABLE | GATEWAY | DESTINATIONS
          Collapsed layout when no CJ reads (5 cols):
                 COMPUTE | SG | ROUTE TABLE | GATEWAY | DESTINATIONS
          ConnectionLinesSVG draws compute→sg→gateway→dest regardless. */}
      <div
        className={`relative grid gap-6 items-start ${
          row.upstreamCrownJewels.length > 0
            ? "grid-cols-[0.85fr_1fr_160px_200px_200px_1.3fr]"
            : "grid-cols-[1fr_180px_220px_220px_1.4fr]"
        }`}
        style={{ zIndex: 2 }}
      >
        {/* CROWN JEWEL column — surfaces upstream data the workload READS
            from. Only rendered when the backend found observed jewel-read
            edges; absent column is honest signal that this path has no
            jewel relevance (workload is just egressing, not reading
            sensitive data). */}
        {row.upstreamCrownJewels.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Database className="w-3.5 h-3.5 text-fuchsia-500" />
            Crown Jewel ({row.upstreamCrownJewels.length})
          </div>
          {row.upstreamCrownJewels.map((cj) => {
              // Visual tone escalates when the jewel ITSELF is internet-
              // exposed — that's the worst-case exfil pattern (workload
              // reads from a publicly-reachable data store, then exfils
              // out via IGW). Operator should see this at a glance.
              const exposed = !!cj.is_internet_exposed
              const classChip = cjClassificationChip(cj.classification)
              const ago = formatTimeAgoShort(cj.last_seen)
              const cardTone = exposed
                ? "border-rose-500/50 bg-rose-500/10"
                : "border-fuchsia-500/30 bg-fuchsia-500/5"
              const titleParts = [
                cjTypeLabel(cj.type),
                `${cj.hits.toLocaleString()} reads`,
                formatBytes(cj.bytes_transferred),
                ago ? `last seen ${ago}` : null,
                exposed ? "jewel is internet-exposed" : null,
                cj.classification ? `classification: ${cj.classification}` : null,
              ].filter(Boolean)
              return (
                <div
                  key={cj.id}
                  data-cj-id={cj.id}
                  className={`rounded-lg border ${cardTone} px-3 py-2`}
                  title={titleParts.join(" · ")}
                >
                  <div className="flex items-center gap-1.5">
                    <Database
                      className={`w-3 h-3 shrink-0 ${exposed ? "text-rose-300" : "text-fuchsia-300"}`}
                    />
                    <div
                      className={`text-[11px] font-semibold truncate ${exposed ? "text-rose-50" : "text-fuchsia-50"}`}
                    >
                      {cj.name}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    <span
                      className={`text-[9px] uppercase tracking-wider font-semibold ${exposed ? "text-rose-300/90" : "text-fuchsia-300/80"}`}
                    >
                      {cjTypeLabel(cj.type)}
                    </span>
                    {classChip && (
                      <span
                        className="inline-flex items-center rounded border border-amber-400/50 bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-200"
                        title={`Data classification: ${cj.classification}`}
                      >
                        {classChip}
                      </span>
                    )}
                    {exposed && (
                      <span
                        className="inline-flex items-center rounded border border-rose-400/70 bg-rose-500/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-rose-100"
                        title="This crown jewel is internet-exposed — exfil-out path is the worst-case posture"
                      >
                        Public
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-300 tabular-nums">
                    {/* Hide bytes when 0 — ACCESSES_RESOURCE / ACTUAL_API_CALL
                        don't carry a byte count on the edge (CloudTrail
                        records the call, not the payload size). Showing
                        "0 B" reads as missing data; hiding is honest. */}
                    {cj.hits.toLocaleString()} reads
                    {cj.bytes_transferred > 0 && (
                      <> · {formatBytes(cj.bytes_transferred)}</>
                    )}
                  </div>
                  {ago && (
                    <div className="mt-0.5 text-[9px] text-slate-500">
                      last seen {ago}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
        )}

        {/* COMPUTE column — dark-theme custom card (avoids the bulky
            shared ServiceNodeBox while staying readable on the dark
            canvas). */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            Compute (1)
          </div>
          <div data-compute-id={row.workloadId}>
            <button
              type="button"
              onClick={() => setDetailSelection({ kind: "compute", row })}
              aria-expanded={detailSelection?.kind === "compute"}
              aria-label={`Open details for workload ${row.workloadName}`}
              className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors hover:bg-blue-500/20 hover:border-blue-400/70 ${
                detailSelection?.kind === "compute"
                  ? "border-blue-400/70 bg-blue-500/20 ring-1 ring-blue-400/30"
                  : "border-blue-500/40 bg-blue-500/10"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Server className="w-4 h-4 text-blue-300 shrink-0" />
                <div className="text-[13px] font-semibold text-blue-50 truncate flex-1" title={row.workloadName}>
                  {row.workloadName.length > 26
                    ? row.workloadName.slice(0, 26) + "…"
                    : row.workloadName}
                </div>
                <ChevronRight className="w-3 h-3 text-blue-300/70 shrink-0" />
              </div>
              <div className="text-[10px] text-blue-300 mt-0.5 font-semibold uppercase tracking-wider">
                {row.workloadType === "lambda" ? "Lambda" : "EC2"}
              </div>
            </button>
            {row.subnetId && (
              <div
                className={`mt-1.5 inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${subnetTone}`}
              >
                {subnetLabel}
                <span className="font-mono normal-case font-normal opacity-80">
                  · {row.subnetName || row.subnetId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Security Group column — dark theme. Header renamed "SG" →
            "Security Group" per user feedback (2026-05-18: "i want to
            see InternetGateway" / "change SG to Security Group"). */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-orange-400" />
            Security Group ({architecture.securityGroups.length})
          </div>
          {architecture.securityGroups.map((sg) => {
            const sgRow = row.sgs.find((s) => s.id === sg.id)
            const isSelected =
              detailSelection?.kind === "sg" && detailSelection.sgId === sg.id
            const tone = isSelected
              ? sgRow?.hasPublicEgress
                ? "border-amber-400/80 bg-amber-500/20 ring-1 ring-amber-400/40"
                : "border-orange-400/70 bg-orange-500/15 ring-1 ring-orange-400/30"
              : sgRow?.hasPublicEgress
                ? "border-amber-500/60 bg-amber-500/10"
                : "border-orange-500/30 bg-orange-500/5"
            return (
              <button
                key={sg.id}
                type="button"
                data-sg-id={sg.id}
                onClick={() => setDetailSelection({ kind: "sg", row, sgId: sg.id })}
                aria-expanded={isSelected}
                aria-label={`Open details for security group ${sg.name || sg.id}`}
                className={`w-full text-left rounded-lg border ${tone} px-3.5 py-2.5 transition-colors hover:brightness-110`}
              >
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-orange-300 shrink-0" />
                  <div className="text-[13px] font-semibold text-orange-50 truncate flex-1" title={sg.name}>
                    {(sg.name || sg.id).length > 28
                      ? (sg.name || sg.id).slice(0, 28) + "…"
                      : sg.name || sg.id}
                  </div>
                  <ChevronRight className="w-3 h-3 text-orange-300/70 shrink-0" />
                </div>
                {sgRow?.hasPublicEgress && (
                  <div className="mt-1.5 text-[10px] text-amber-200 uppercase tracking-wider font-bold">
                    Public egress
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* ROUTE TABLE column — dark theme. */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Route Table ({row.routeTable ? 1 : 0})
          </div>
          {row.routeTable ? (
            <button
              type="button"
              onClick={() => setRouteTableOpen((v) => !v)}
              aria-expanded={routeTableOpen}
              className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors hover:bg-indigo-500/15 hover:border-indigo-500/60 ${
                routeTableOpen
                  ? "border-indigo-500/60 bg-indigo-500/15"
                  : row.routeTable.recommendation?.type === "REMOVE_ROUTE"
                    ? "border-amber-500/50 bg-amber-500/10"
                    : row.routeTable.recommendation?.type === "ADD_VPC_ENDPOINT"
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-indigo-500/40 bg-indigo-500/10"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                <div className="text-[12px] font-semibold text-indigo-50 truncate font-mono">
                  {row.routeTable.id}
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-indigo-300 ml-auto shrink-0 transition-transform ${
                    routeTableOpen ? "rotate-90" : ""
                  }`}
                />
              </div>
              <div className="mt-1 text-[10px] text-indigo-300 uppercase tracking-wider font-semibold">
                {row.routeTable.routes.length} route{row.routeTable.routes.length === 1 ? "" : "s"}
                <span className="ml-1 text-indigo-400/70 normal-case font-normal">· click to view</span>
              </div>
              {/* Recommendation chip — variant by type. REMOVE_ROUTE = amber
                  ("this is dead weight"); ADD_VPC_ENDPOINT = emerald ("this
                  is an improvement"). Language is "REMOVABLE" / "ADD VPCE",
                  never "SAFE" — chip honesty per feedback_remediation_safety_signals.
                  Tooltip on the chip shows the full confidence signal. */}
              {row.routeTable.recommendation?.type === "REMOVE_ROUTE" && (
                <div
                  className="mt-1.5 inline-flex items-center gap-1 rounded border border-amber-500/60 bg-amber-500/20 px-1.5 py-0.5"
                  title={row.routeTable.recommendation.confidence_signal}
                >
                  <ShieldOff className="w-2.5 h-2.5 text-amber-300" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    Removable · {row.routeTable.recommendation.candidate_route_cidr}
                  </span>
                </div>
              )}
              {row.routeTable.recommendation?.type === "ADD_VPC_ENDPOINT" && (
                <div
                  className="mt-1.5 inline-flex items-center gap-1 rounded border border-emerald-500/60 bg-emerald-500/20 px-1.5 py-0.5"
                  title={row.routeTable.recommendation.confidence_signal}
                >
                  <Lock className="w-2.5 h-2.5 text-emerald-300" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                    Add VPCE · {row.routeTable.recommendation.candidate_aws_service}
                    {row.routeTable.recommendation.candidate_is_gateway_vpce ? " · free" : ""}
                  </span>
                </div>
              )}
            </button>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div className="text-[12px] font-semibold text-slate-300 truncate">No route table</div>
              </div>
              <div className="mt-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Not in VPC
              </div>
            </div>
          )}
        </div>

        {/* GATEWAY column — dark theme. Header shows the SPECIFIC gateway
            kind (e.g. "Internet Gateway", "NAT Gateway", "VPC Endpoint")
            instead of generic "Gateway" per user feedback. When multiple
            kinds present, falls back to "Gateways (N)". */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-violet-400" />
            {(() => {
              const kinds = Array.from(new Set(row.gateways.map((g) => g.kind)))
              const labelize = (k: string) =>
                k === "InternetGateway"
                  ? "Internet Gateway"
                  : k === "NATGateway"
                    ? "NAT Gateway"
                    : k === "VPCEndpoint"
                      ? "VPC Endpoint"
                      : k === "TransitGateway"
                        ? "Transit Gateway"
                        : k === "EgressOnlyInternetGateway"
                          ? "Egress-Only IGW"
                          : k || "Gateway"
              if (kinds.length === 1) {
                return `${labelize(kinds[0])} (${architecture.iamRoles.length})`
              }
              return `Gateways (${architecture.iamRoles.length})`
            })()}
          </div>
          {architecture.iamRoles.map((g) => {
            const gw = row.gateways.find((gg) => gg.id === g.id)
            const isSelected =
              detailSelection?.kind === "gateway" && detailSelection.gatewayId === g.id
            const baseTone =
              gw?.bucket === "public"
                ? "border-amber-500/60 bg-amber-500/10"
                : gw?.bucket === "private"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-slate-700 bg-slate-900/40"
            const tone = isSelected
              ? `${baseTone} ring-1 ring-violet-400/40 border-violet-400/70`
              : baseTone
            const isPublicEgress = gw?.bucket === "public"
            return (
              <button
                key={g.id}
                type="button"
                data-role-id={g.id}
                onClick={() => setDetailSelection({ kind: "gateway", row, gatewayId: g.id })}
                aria-expanded={isSelected}
                aria-label={`Open details for gateway ${g.name || g.id}`}
                className={`w-full text-left rounded-lg border ${tone} px-3.5 py-2.5 transition-colors hover:brightness-110`}
              >
                <div className="flex items-center gap-1.5">
                  {routeKindIcon(gw?.kind || "")}
                  <span className="text-[13px] font-semibold text-slate-100 truncate flex-1" title={g.name}>
                    {(g.name || g.id).length > 26
                      ? (g.name || g.id).slice(0, 26) + "…"
                      : g.name || g.id}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400/70 shrink-0" />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">{gw?.kind}</div>
                {isPublicEgress && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5">
                    <ShieldOff className="w-2.5 h-2.5 text-slate-400" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
                      No L7 Filter
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* DESTINATIONS column — dark theme.
            Renders BUCKET cards FIRST (named, from ACTUAL_S3_ACCESS edges)
            because they carry the operator-relevant identity (which S3
            bucket was accessed, not which shared S3 service IP). Then
            the IP-keyed destinations below. */}
        <div className="flex flex-col gap-2">
          {(() => {
            // Compute hidden-IP count for the header. Same dedup rule
            // as below: S3 IPs whose bucket_candidates are fully covered
            // by the named bucket cards are hidden.
            const renderedBucketNames = new Set(
              (row.bucketAccesses || []).map((b) => b.name),
            )
            const visibleCount = architecture.resources.filter((dest) => {
              const fd = row.fullDestinations.find((d) => d.ip === dest.id)
              const isS3 =
                fd?.kind === "aws" &&
                (fd?.aws_service ?? "").toUpperCase() === "S3"
              if (!isS3) return true
              const cands = fd?.bucket_candidates || []
              if (cands.length === 0) return true
              return !cands.every((c) => renderedBucketNames.has(c.name))
            }).length
            const hiddenIpCount = architecture.resources.length - visibleCount
            return (
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                Destinations ({visibleCount}
                {row.bucketAccesses.length > 0
                  ? ` · ${row.bucketAccesses.length} bucket${row.bucketAccesses.length === 1 ? "" : "s"}`
                  : ""}
                {hiddenIpCount > 0 && (
                  <span
                    className="ml-1 font-normal normal-case tracking-normal text-slate-500 lowercase"
                    title={`${hiddenIpCount} pooled S3 IP${hiddenIpCount === 1 ? "" : "s"} hidden — same bucket(s) already shown above`}
                  >
                    · {hiddenIpCount} pooled IP{hiddenIpCount === 1 ? "" : "s"} merged
                  </span>
                )}
              </div>
            )
          })()}

          {/* Named S3 buckets — surfaced from ACTUAL_S3_ACCESS so the
              operator sees the actual bucket identity instead of just
              "S3 · 52.218.x.x". Top by hits. */}
          {row.bucketAccesses.slice(0, 8).map((b) => {
            const ops = (b.operations || []).slice(0, 3)
            const isAlert = b.is_public || b.is_internet_exposed
            const isSelected =
              detailSelection?.kind === "bucket" && detailSelection.bucketName === b.name
            const baseTone = isAlert
              ? "border-rose-500/50 bg-rose-500/10"
              : "border-fuchsia-500/40 bg-fuchsia-500/10"
            const cardTone = isSelected
              ? `${baseTone} ring-1 ring-fuchsia-400/50 brightness-110`
              : baseTone
            return (
              <button
                key={`bucket-${b.id}`}
                type="button"
                data-bucket-id={b.id}
                onClick={() => setDetailSelection({ kind: "bucket", row, bucketName: b.name })}
                aria-expanded={isSelected}
                aria-label={`Open details for S3 bucket ${b.name}`}
                className={`w-full text-left rounded-lg border ${cardTone} px-3 py-2 transition-all hover:brightness-110`}
                title={`S3 bucket · ${b.hits.toLocaleString()} reads${b.bytes_transferred > 0 ? ` · ${formatBytes(b.bytes_transferred)}` : ""}${b.classification ? ` · classification: ${b.classification}` : ""}${b.is_public ? " · ⚠ PUBLIC BUCKET" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Database className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                    <span
                      className="text-[12px] font-semibold text-fuchsia-50 truncate"
                      title={b.name}
                    >
                      {b.name.length > 32 ? b.name.slice(0, 32) + "…" : b.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-fuchsia-300 shrink-0">
                    {b.hits.toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-fuchsia-300/80">
                  <span className="font-semibold">
                    S3 BUCKET{b.is_public ? " · ⚠ PUBLIC" : ""}
                  </span>
                  {b.last_seen && (
                    <span className="text-fuchsia-400/60" title={`Last access: ${b.last_seen}`}>
                      last {formatTimeAgoShort(b.last_seen)}
                    </span>
                  )}
                </div>
                {ops.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ops.map((op) => (
                      <span
                        key={op}
                        className="inline-flex items-center rounded border border-fuchsia-500/40 bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-mono text-fuchsia-200"
                      >
                        {op}
                      </span>
                    ))}
                    {(b.operations || []).length > 3 && (
                      <span className="text-[9px] text-fuchsia-300/60 italic self-center">
                        +{(b.operations || []).length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
          {row.bucketAccesses.length > 8 && (
            <div className="text-[10px] text-fuchsia-300/60 italic pl-2">
              + {row.bucketAccesses.length - 8} more buckets
            </div>
          )}
          {/* Compute max byte volume for relative bar widths — gives the
              operator a "this destination dwarfs the rest" visual scan
              without staring at numbers. */}
          {(() => {
            // Dedup: hide S3 IP rows whose bucket_candidates are fully
            // covered by the named bucket cards rendered above. An IP
            // like 3.5.74.46 mapping to {cyntro-demo-prod-data,
            // cyntro-demo-analytics} is REDUNDANT if both buckets are
            // already in bucketAccesses — the operator sees the same
            // buckets seven times otherwise (one per pooled S3 IP).
            // Keep IPs whose candidates include ANY bucket NOT in
            // bucketAccesses (could be system-attribution chips that
            // aren't directly accessed by this workload's role).
            const renderedBucketNames = new Set(
              (row.bucketAccesses || []).map((b) => b.name),
            )
            const filteredResources = architecture.resources.filter((dest) => {
              const fd = row.fullDestinations.find((d) => d.ip === dest.id)
              const isS3 =
                fd?.kind === "aws" &&
                (fd?.aws_service ?? "").toUpperCase() === "S3"
              if (!isS3) return true
              const cands = fd?.bucket_candidates || []
              if (cands.length === 0) return true
              // All candidates already shown as bucket cards → drop the IP row.
              return !cands.every((c) => renderedBucketNames.has(c.name))
            })
            const maxBytes = Math.max(
              1,
              ...filteredResources
                .map((d) => row.fullDestinations.find((fd) => fd.ip === d.id)?.bytes || 0),
            )
            return filteredResources.slice(0, 12).map((dest) => {
            const fullDest = row.fullDestinations.find((d) => d.ip === dest.id)
            const signalList = (fullDest?.signals || []).filter((s) =>
              ["plaintext", "residential_isp", "rare_asn", "new_destination", "cross_region_aws", "cross_cloud"].includes(s),
            )
            const isAlert = signalList.some((s) =>
              ["plaintext", "residential_isp", "rare_asn"].includes(s),
            )
            const isEc2Service = fullDest?.kind === "aws" && fullDest?.aws_service === "EC2"
            const showExternalMeta =
              fullDest?.kind === "external" && (fullDest?.org || fullDest?.asn)
            const primaryName =
              fullDest?.hostname ||
              (fullDest?.kind === "aws" ? fullDest.aws_service : fullDest?.org) ||
              fullDest?.ip ||
              dest.name
            const primaryIsIp = primaryName === fullDest?.ip
            const bytePct = fullDest ? Math.round((fullDest.bytes / maxBytes) * 100) : 0
            // Card tone — alert > AWS > internet bare (dark theme).
            const isSelected =
              detailSelection?.kind === "destination" && detailSelection.ip === dest.id
            const baseTone = isAlert
              ? "border-rose-500/50 bg-rose-500/10"
              : dest.type === "internet"
                ? "border-slate-700 bg-slate-900/60"
                : "border-emerald-500/30 bg-emerald-500/5"
            const cardTone = isSelected
              ? `${baseTone} ring-1 ring-cyan-400/40 brightness-110`
              : baseTone
            return (
              <button
                key={dest.id}
                type="button"
                data-resource-id={dest.id}
                onClick={() => setDetailSelection({ kind: "destination", row, ip: dest.id })}
                aria-expanded={isSelected}
                aria-label={`Open details for destination ${primaryName || dest.name}`}
                className={`w-full text-left rounded-lg border ${cardTone} px-3 py-2 transition-all hover:brightness-110`}
              >
                {/* Primary line: country flag + org/hostname/svc + bytes */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {fullDest?.country ? (
                      <span
                        className="text-base leading-none shrink-0"
                        title={fullDest.country}
                      >
                        {countryFlag(fullDest.country)}
                      </span>
                    ) : null}
                    <span
                      className="text-[12px] font-semibold text-slate-100 truncate"
                      title={primaryName || dest.name}
                    >
                      {(primaryName || dest.name).length > 32
                        ? (primaryName || dest.name).slice(0, 32) + "…"
                        : primaryName || dest.name}
                    </span>
                  </div>
                  {fullDest ? (
                    <span className="text-[11px] font-mono font-bold text-cyan-300 shrink-0">
                      {formatBytes(fullDest.bytes)}
                    </span>
                  ) : null}
                </div>

                {/* Secondary line: IP + last-seen */}
                {fullDest && (
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    {!primaryIsIp ? (
                      <span className="font-mono truncate" title={fullDest.ip}>
                        {fullDest.ip}
                      </span>
                    ) : (
                      <span />
                    )}
                    {fullDest.last_seen && (
                      <span
                        className="shrink-0 text-slate-500"
                        title={`Last connection: ${fullDest.last_seen}`}
                      >
                        last {formatTimeAgoShort(fullDest.last_seen)}
                      </span>
                    )}
                  </div>
                )}

                {/* Relative volume bar */}
                {fullDest && bytePct > 0 && (
                  <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${
                        isAlert
                          ? "bg-rose-400"
                          : dest.type === "internet"
                            ? "bg-slate-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${bytePct}%` }}
                    />
                  </div>
                )}

                {/* AWS service chip. When backend resolved the IP we
                    show a secondary chip with the resolved name;
                    different visual treatment per endpoint kind:
                      instance  (cyan)  — our own EC2/Lambda/RDS
                      api       (slate) — AWS API control plane
                      vpc_endpoint (cyan) — VPCE
                      elb / rds / lambda (cyan) — AWS service endpoint
                      instance_unowned (amber) — EC2 in another account
                      (no aws_endpoint_kind) → keep "(instance or API)" */}
                {fullDest?.kind === "aws" && (() => {
                  const awsResName = (fullDest as any).aws_resource_name as string | null | undefined
                  const awsResType = (fullDest as any).aws_resource_type as string | null | undefined
                  const awsEndpointKind = (fullDest as any).aws_endpoint_kind as string | null | undefined
                  const resolved = !!awsResName
                  const isUnowned = awsEndpointKind === "instance_unowned"
                  const isApi = awsEndpointKind === "api"
                  let secondaryTone = "bg-cyan-500/15 text-cyan-200 border-cyan-500/40"
                  let secondaryPrefix = "→ "
                  if (isUnowned) {
                    secondaryTone = "bg-amber-500/15 text-amber-200 border-amber-500/40"
                    secondaryPrefix = "→ other account · "
                  } else if (isApi) {
                    secondaryTone = "bg-slate-500/15 text-slate-300 border-slate-500/40"
                    secondaryPrefix = "→ "
                  }
                  let tooltip = ""
                  if (awsEndpointKind === "instance") {
                    tooltip = `Resolved to ${awsResType || "AWS resource"} '${awsResName}' via :NetworkInterface.public_ip lookup.`
                  } else if (isUnowned) {
                    tooltip = `EC2 instance in another AWS account (PTR ${fullDest.hostname || "ec2-X-X-X-X.region.compute.amazonaws.com"}). This workload is talking to a third-party EC2 instance over the public internet — verify intent.`
                  } else if (isApi) {
                    tooltip = `AWS service endpoint (PTR ${fullDest.hostname || "*.amazonaws.com"}). This is the API control plane, not a customer instance.`
                  } else if (awsEndpointKind) {
                    tooltip = `AWS-managed ${awsEndpointKind} endpoint (PTR ${fullDest.hostname || "*.amazonaws.com"}).`
                  } else if (isEc2Service) {
                    tooltip = "AWS EC2 service IP range covers both customer instance public IPs and EC2 API control-plane endpoints. IP alone does not distinguish."
                  } else {
                    tooltip = `AWS ${fullDest.aws_service ?? "service"} published IP range`
                  }
                  return (
                    <div className="mt-1.5 text-[10px] flex flex-wrap items-center gap-1" title={tooltip}>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/50 font-semibold">
                        AWS · {fullDest.aws_service ?? "?"}
                        {isEc2Service && !resolved && !awsEndpointKind && (
                          <span className="ml-1 font-normal text-emerald-300/80">
                            (instance or API)
                          </span>
                        )}
                      </span>
                      {resolved && (
                        <span className={`px-1.5 py-0.5 rounded font-medium border ${secondaryTone}`}>
                          {secondaryPrefix}{awsResName}
                        </span>
                      )}
                    </div>
                  )
                })()}
                {/* S3 bucket candidates — pooled S3 IPs can't identify
                    the bucket from the network layer alone, so we
                    surface candidate buckets (via the role's
                    ACTUAL_S3_ACCESS edges, or system-wide if this
                    workload has no observed bucket access). Lets the
                    CISO read "→ cyntro-demo-prod-data" rather than
                    guess what S3 IP 52.218.117.194 means. */}
                {fullDest?.kind === "aws" &&
                  (fullDest.aws_service ?? "").toUpperCase() === "S3" &&
                  (fullDest.bucket_candidates?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {fullDest.bucket_candidates!.slice(0, 3).map((b) => {
                        const isSystem = b.attribution === "system"
                        const chipClass = isSystem
                          ? "inline-flex items-center rounded border border-dashed border-fuchsia-500/35 bg-fuchsia-500/5 px-1.5 py-0.5 text-[9px] font-medium text-fuchsia-300/80"
                          : "inline-flex items-center rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-medium text-fuchsia-200"
                        const tooltip = isSystem
                          ? `s3://${b.name} is accessed by other workloads in this system (${b.hits.toLocaleString()} reads/writes${b.operations?.length ? " · " + b.operations.slice(0, 3).join(", ") : ""}). This workload's role has no observed bucket access of its own — the link is inferred, not directly observed.`
                          : `Workload's role accessed s3://${b.name} (${b.hits.toLocaleString()} reads/writes${b.operations?.length ? " · " + b.operations.slice(0, 3).join(", ") : ""}). S3 IPs are pooled across all buckets in the region — this is one of the candidate buckets, not a definitive match.`
                        return (
                          <span
                            key={b.id || b.name}
                            className={chipClass}
                            title={tooltip}
                          >
                            → {b.name}
                            {isSystem && (
                              <span className="ml-1 text-[8px] uppercase tracking-wider opacity-70">
                                sys
                              </span>
                            )}
                          </span>
                        )
                      })}
                      {(fullDest.bucket_candidates?.length ?? 0) > 3 && (
                        <span className="text-[9px] text-fuchsia-300/60 italic self-center">
                          +{fullDest.bucket_candidates!.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                {showExternalMeta && (
                  <div
                    className="mt-1 text-[10px] text-slate-400 truncate"
                    title={`${fullDest?.org || ""}${fullDest?.asn ? " · " + fullDest.asn : ""}`}
                  >
                    {fullDest?.org && <span className="font-medium">{fullDest.org}</span>}
                    {fullDest?.org && fullDest?.asn && (
                      <span className="text-slate-600"> · </span>
                    )}
                    {fullDest?.asn && (
                      <span className="font-mono text-slate-500">{fullDest.asn}</span>
                    )}
                  </div>
                )}

                {/* Signal chips */}
                {signalList.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {signalList.map((sig) => {
                      const meta = SIGNAL_META[sig]
                      if (!meta) return null
                      const chipTone =
                        meta.tone === "alert"
                          ? "bg-rose-500/15 text-rose-200 border-rose-500/50"
                          : meta.tone === "warning"
                            ? "bg-amber-500/15 text-amber-200 border-amber-500/50"
                            : "bg-sky-500/15 text-sky-200 border-sky-500/50"
                      return (
                        <span
                          key={sig}
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${chipTone}`}
                          title={meta.tooltip}
                        >
                          {meta.label}
                        </span>
                      )
                    })}
                  </div>
                )}
              </button>
            )
            })
          })()}
          {architecture.resources.length > 12 && (
            <div className="text-[11px] text-slate-500 pl-2 italic">
              + {architecture.resources.length - 12} more — see Destinations table below
            </div>
          )}
        </div>
      </div>

      {/* Route Table expanded panel — every route entry, AWS-console-style.
          Mirrors the "Routes" tab in the AWS RouteTables console: one row
          per active route, classified by target kind (IGW / NAT / VPCE /
          TGW / local / etc.). Highlights public-egress targets in amber
          so the operator immediately sees the "open door" routes.
          When a REMOVE_ROUTE recommendation is present, the candidate
          row gets a "PROPOSE: REMOVE" chip + amber pulse. */}
      {routeTableOpen && row.routeTable && (
        <div
          className="relative mt-4 rounded-lg border border-indigo-500/30 bg-indigo-950/40 p-3"
          style={{ zIndex: 2 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <div className="text-[11px] font-semibold text-indigo-100 uppercase tracking-wider">
              Routes
            </div>
            <span className="text-[10px] font-mono text-indigo-300">
              {row.routeTable.id}
            </span>
            <button
              type="button"
              onClick={() => setRouteTableOpen(false)}
              className="ml-auto text-[10px] text-indigo-300 hover:text-indigo-100 uppercase tracking-wider"
            >
              Close
            </button>
          </div>

          {/* Recommendation banner — variant by type. Surfaces the
              confidence signal (operator-facing reason) + scope count
              so the proposal is auditable. Action button is advisory
              here — actual execution is queued for the posture
              recommendations engine. */}
          {row.routeTable.recommendation?.type === "REMOVE_ROUTE" && (
            <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <ShieldOff className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-100">
                  Proposed: Remove unused route
                </span>
                <span className="ml-auto text-[9px] font-mono text-amber-300">
                  {row.routeTable.recommendation.candidate_route_cidr}
                  {" → "}
                  {row.routeTable.recommendation.candidate_route_target_kind}
                </span>
              </div>
              <div className="text-[11px] text-amber-50/90 leading-relaxed">
                {row.routeTable.recommendation.confidence_signal}
              </div>
              <div className="mt-1.5 text-[10px] text-amber-200/70">
                Scope: {row.routeTable.recommendation.scope_workload_count} workload
                {row.routeTable.recommendation.scope_workload_count === 1 ? "" : "s"} share
                this route table. Removing the route affects all of them. Rare-use workloads
                outside the observed window are the operator's call — this is "no observed
                dependency," not "safe to remove."
              </div>
              {/* Execute surface — moved here from the top-level callout
                  per user feedback ("put it in the relevant path
                  section, not above the entire issues"). Same proposal_id-
                  keyed state machine (idle → Simulate → simulated →
                  Apply → applied → Rollback) — re-fire across N path
                  cards sharing this RT all hit the SAME proposal_id
                  (content-addressed by rt_id + cidr + target). */}
              <div className="mt-2 pt-2 border-t border-amber-500/20">
                <RemoveRouteActionPanel
                  candidate={{
                    rtId: row.routeTable.id,
                    proposalId: row.routeTable.recommendation.proposal_id ?? null,
                    cidr: row.routeTable.recommendation.candidate_route_cidr,
                    targetKind: row.routeTable.recommendation.candidate_route_target_kind,
                    targetId: row.routeTable.recommendation.candidate_route_target_id,
                    targetName: row.routeTable.recommendation.candidate_route_target_name,
                    scopeWorkloadCount: row.routeTable.recommendation.scope_workload_count,
                    confidenceSignal: row.routeTable.recommendation.confidence_signal,
                  }}
                />
              </div>
            </div>
          )}
          {row.routeTable.recommendation?.type === "ADD_VPC_ENDPOINT" && (
            <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">
                  Proposed: Add VPC Endpoint for{" "}
                  {row.routeTable.recommendation.candidate_aws_service}
                </span>
                {row.routeTable.recommendation.candidate_is_gateway_vpce && (
                  <span className="ml-auto rounded border border-emerald-400/60 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-100">
                    Gateway · Free
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-50/90 leading-relaxed">
                {row.routeTable.recommendation.confidence_signal}
              </div>
              <div className="mt-1.5 text-[10px] text-emerald-200/70">
                Scope: {row.routeTable.recommendation.scope_workload_count} workload
                {row.routeTable.recommendation.scope_workload_count === 1 ? "" : "s"} share
                this route table. Adding the VPCE keeps observed AWS-service traffic on the
                AWS backbone instead of routing through the internet gateway — no cost for
                S3/DynamoDB Gateway endpoints, paid Interface endpoints for other services.
                Once added, you can narrow the SG egress rule to the VPCE's prefix list.
              </div>
            </div>
          )}

          {row.routeTable.routes.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic">
              No active routes on this table — workload effectively cannot egress.
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_140px_1.4fr] gap-2 text-[11px]">
              <div className="text-[9px] font-semibold text-indigo-300 uppercase tracking-wider px-2">
                Destination
              </div>
              <div className="text-[9px] font-semibold text-indigo-300 uppercase tracking-wider px-2">
                Target kind
              </div>
              <div className="text-[9px] font-semibold text-indigo-300 uppercase tracking-wider px-2">
                Target
              </div>
              {row.routeTable.routes.map((rt, idx) => {
                const kind = rt.target_kind || "Unknown"
                const isPublicEgress = ["InternetGateway", "NATGateway", "EgressOnlyInternetGateway"].includes(kind)
                const isPrivate = ["VPCEndpoint", "TransitGateway"].includes(kind)
                // Is this row the REMOVE_ROUTE candidate? Match by
                // (cidr + target_id) which uniquely identifies the
                // specific route in the table. Visual: amber border
                // pulses + "PROPOSE: REMOVE" chip. Only applies to
                // REMOVE_ROUTE — ADD_VPC_ENDPOINT proposes a new
                // route, not the removal of an existing one.
                const rec = row.routeTable!.recommendation
                const isCandidate = !!(
                  rec &&
                  rec.type === "REMOVE_ROUTE" &&
                  rec.candidate_route_cidr === rt.cidr &&
                  rec.candidate_route_target_id === rt.target_id
                )
                const rowTone = isCandidate
                  ? "border-amber-400/80 bg-amber-500/15 ring-1 ring-amber-400/40"
                  : isPublicEgress
                    ? "border-amber-500/40 bg-amber-500/5"
                    : isPrivate
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-slate-700/60 bg-slate-900/40"
                return (
                  <React.Fragment key={`${rt.cidr}-${rt.target_id}-${idx}`}>
                    <div className={`rounded border ${rowTone} px-2 py-1.5 font-mono text-slate-100`}>
                      {rt.cidr || <span className="text-slate-500 italic">(no cidr)</span>}
                    </div>
                    <div className={`rounded border ${rowTone} px-2 py-1.5 flex items-center gap-1.5`}>
                      {routeKindIcon(kind)}
                      <span className="text-slate-200">{kind}</span>
                    </div>
                    <div className={`rounded border ${rowTone} px-2 py-1.5 truncate flex items-center gap-1.5`}>
                      <span className="text-slate-100 truncate">{rt.target_name || rt.target_id || "—"}</span>
                      {rt.target_name && rt.target_id && rt.target_name !== rt.target_id && (
                        <span className="ml-1 text-slate-500 font-mono text-[10px] truncate">
                          {rt.target_id}
                        </span>
                      )}
                      {isCandidate && (
                        <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 rounded border border-amber-400/70 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-100">
                          Propose: Remove
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          )}
          <div className="mt-2 text-[10px] text-indigo-400/70">
            Routes with a public-egress target (IGW / NAT / EIGW) are highlighted in amber. Local-VPC and prefix-list routes resolve to private targets (VPCE / TGW).
          </div>
        </div>
      )}

      {/* Per-card detail side panel. Renders nothing while detailSelection
          is null. Portal-based Sheet so it overlays cleanly whether this
          PathFlowMap is rendered inline (PathCard) or inside the per-path
          fullscreen Dialog. */}
      <FlowMapDetailPanel
        selection={detailSelection}
        onClose={() => setDetailSelection(null)}
      />
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
  // Skip the built-in header when the caller passes empty title +
  // subtitle — used by the per-path fullscreen dialog where a
  // <details>/<summary> disclosure already shows the title + count
  // and we don't want a duplicate header below it.
  const hideHeader = !title && !subtitle
  return (
    <div>
      {!hideHeader && (
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
      )}
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
  // Per-path fullscreen modal — separate from `expanded` (which is the
  // in-place collapse/expand). Operators with 5+ paths use the inline
  // expand to scan; for ONE path at a time they want the full canvas
  // (per user feedback: "extend each path to entire screen to see each
  // path bigger"). The Dialog renders the PathFlowMap at viewport
  // size with the path header chrome above it. The inline card stays
  // unchanged — fullscreen is additive.
  const [fullscreen, setFullscreen] = useState(false)
  const isLatent = row.bucket === "latent"
  // For LATENT rows: there's no observed exposure to score — render a
  // muted amber accent instead of the severity-derived color. Score
  // ribbon stays so the row layout stays consistent.
  const sevColor = isLatent ? "#f59e0b" : severityColor(row.severityScore)
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
  // Right-side status chip — dark-theme palette (user requested revert).
  // LATENT rows always carry a "Can egress · unused" chip — that's the
  // entire reason the row exists; doesn't get drowned by status logic.
  const statusChip = isLatent
    ? {
        label: "Can egress · unused",
        color: "#fcd34d",
        borderColor: "rgba(245,158,11,0.4)",
        bg: "rgba(245,158,11,0.06)",
        title: "Workload has the network capability to send data to the internet (SG public-egress rule + subnet route to IGW/NAT/EIGW), but made zero observed outbound requests in the 30-day window. Either narrow the egress rule or document the dependency.",
      }
    : subnetNameMismatch
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
          {isLatent ? (
            <span
              className="text-[10px] uppercase tracking-[0.12em] font-bold leading-none px-2 py-1 rounded border"
              style={{
                color: "#fcd34d",
                borderColor: "rgba(245,158,11,0.5)",
                background: "rgba(245,158,11,0.08)",
              }}
              title="No observed exposure to score — this path is reachable but unused."
            >
              LATENT
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div
          className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold"
          style={{ color: "#94a3b8" }}
        >
          <span style={{ color: "#f1f5f9" }}>Path #{index}</span>
          <span>·</span>
          <span>{row.hopCount} hops</span>
          <span>·</span>
          <span style={{ color: isLatent ? "#fcd34d" : "#22c55e" }}>{row.evidence}</span>
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
        {/* Per-card fullscreen — opens this path's flow map at viewport size.
            stopPropagation so it doesn't toggle the inline collapse/expand. */}
        <span
          role="button"
          tabIndex={0}
          aria-label="Expand path to fullscreen"
          title="Expand to fullscreen"
          onClick={(e) => {
            e.stopPropagation()
            setFullscreen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              setFullscreen(true)
            }
          }}
          className="shrink-0 p-1 rounded hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
        </span>
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
          LATENT rows render a single "capability" line instead of the
          observed-traffic counters (which would all be 0 and read as
          "missing data" instead of "reachable but unused"). */}
      <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap pl-5 pr-4 pb-3 mt-0.5">
        {isLatent ? (
          <div className="flex items-baseline gap-2">
            <span
              className="text-[10px] uppercase tracking-[0.12em] font-semibold"
              style={{ color: "#94a3b8" }}
            >
              Capability
            </span>
            <span className="text-xs" style={{ color: "#fcd34d" }}>
              SG allows <span className="font-mono">0.0.0.0/0</span> + subnet routes to{" "}
              {row.gateways.map((g) => g.kind).join(" / ") || "public gateway"}
              <span style={{ color: "#94a3b8" }}> · </span>
              <span style={{ color: "#f1f5f9" }}>0 observed requests (30d)</span>
            </span>
          </div>
        ) : (
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
        )}

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

      {/* Per-path fullscreen overlay — opens this single path's flow map at
          viewport size. Renders the same PathFlowMap the inline-expanded
          view shows, plus the full destinations list, but at ~95vw × 95vh.
          The inline card under the dialog stays untouched. shadcn's
          DialogContent defaults to sm:max-w-lg; we override to nearly
          full-viewport so the operator actually gets more canvas. */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="!max-w-[95vw] w-[95vw] h-[95vh] p-0 gap-0 flex flex-col bg-slate-950 border-slate-800 overflow-hidden"
          showCloseButton={true}
        >
          <DialogTitle className="sr-only">
            Path #{index} · {row.workloadName}
          </DialogTitle>
          <div
            className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center gap-4 shrink-0"
          >
            <div className="flex items-baseline gap-2 shrink-0">
              <span
                className="text-3xl font-semibold tabular-nums leading-none"
                style={{ color: sevColor }}
              >
                {row.severityScore}
              </span>
              <span
                className="text-[11px] uppercase tracking-[0.12em] font-semibold"
                style={{ color: sevColor }}
              >
                {row.severity}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400">
                Path #{index} · {row.hopCount} hops · {row.evidence}
              </span>
              <span className="text-base font-semibold text-slate-100 truncate mt-0.5">
                {row.workloadName}
              </span>
            </div>
            {statusChip && (
              <span
                className="ml-auto inline-flex items-center px-2 py-1 rounded text-[10px] uppercase tracking-[0.12em] font-bold border"
                style={{ color: statusChip.color, borderColor: statusChip.borderColor, background: statusChip.bg }}
                title={statusChip.title}
              >
                {statusChip.label}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col bg-slate-950">
            <div className="basis-1/2 min-h-0 overflow-y-auto p-5 border-b border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Flow map
              </div>
              <PathFlowMap row={row} sevColor={sevColor} />
            </div>
            <div className="basis-1/2 min-h-0 overflow-y-auto p-5 space-y-4">
              <EgressInsightsPanel insights={row.insights} />
              {(row.egressDestinations.length > 0 || row.eastWestDestinations.length > 0) && (
                <div className="space-y-2">
                  {row.egressDestinations.length > 0 && (
                    <details className="rounded-lg border border-slate-800 bg-slate-900/40 group">
                      <summary className="cursor-pointer select-none px-4 py-2 flex items-center gap-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-900/70">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 transition-transform group-open:rotate-90" />
                        <span className="uppercase tracking-wider text-slate-400">Egress destinations</span>
                        <span className="text-slate-500 normal-case font-normal">
                          {row.egressDestinationCount} via gateway (IGW / NAT / VPCE)
                        </span>
                      </summary>
                      <div className="px-4 pb-3 pt-1">
                        <DestinationGroup
                          title=""
                          subtitle=""
                          destinations={row.egressDestinations}
                          totalCount={row.egressDestinationCount}
                          emptyText="No outbound flows leave this workload through a gateway in the observed window."
                        />
                      </div>
                    </details>
                  )}
                  {row.eastWestDestinations.length > 0 && (
                    <details className="rounded-lg border border-slate-800 bg-slate-900/40 group">
                      <summary className="cursor-pointer select-none px-4 py-2 flex items-center gap-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-900/70">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 transition-transform group-open:rotate-90" />
                        <span className="uppercase tracking-wider text-slate-400">East-west peers</span>
                        <span className="text-slate-500 normal-case font-normal">
                          {row.eastWestDestinationCount} local VPC routes — never traverse the gateway
                        </span>
                      </summary>
                      <div className="px-4 pb-3 pt-1">
                        <DestinationGroup
                          title=""
                          subtitle=""
                          destinations={row.eastWestDestinations}
                          totalCount={row.eastWestDestinationCount}
                          emptyText=""
                        />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  // containerRef wraps the WHOLE map (header + stats + callout + path list)
  // so requestFullscreen() promotes the entire view, not just the body.
  // mapContainerRef is the scrollable body, used elsewhere for ref-based
  // measurements. Same split as traffic-flow-map.tsx.
  const containerRef = useRef<HTMLDivElement>(null)
  const [signalFilter, setSignalFilter] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fullscreen toggle — uses the native Element.requestFullscreen() API
  // so the entire viewport is reclaimed (vs a CSS-positioned overlay,
  // which keeps the browser chrome). Listens for the matching
  // fullscreenchange event so the icon flips back if the user exits
  // via Esc rather than the button. Mirrors traffic-flow-map.tsx.
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => console.error("[EgressFlowMap] requestFullscreen failed:", err))
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => console.error("[EgressFlowMap] exitFullscreen failed:", err))
    }
  }, [])

  // Esc-exit (user hits Escape, not the button) needs to flip the icon back.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

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
    <div
      ref={containerRef}
      className={`bg-slate-950 rounded-xl border border-slate-800 overflow-hidden ${
        isFullscreen ? "h-screen w-screen overflow-y-auto rounded-none" : ""
      }`}
    >
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
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Expand to fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1"
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
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

      {/* Top-level REMOVE_ROUTE callout — surfaces RT-scoped removal
          candidates ABOVE the path list so they don't get buried as
          silent-workload rows. Mutually-exclusive with ADD_VPC_ENDPOINT
          per the backend detector; renders nothing when no candidates
          exist (silent absence, not an empty card). The component owns
          its own per-row Simulate → Apply → Rollback state. */}
      {/* Body — containerRef moved to the outer wrapper above so
          requestFullscreen() promotes the whole map (header + body),
          not just this scroll region. */}
      <div className="px-5 pt-4">
        {/* DNS visibility banner — surfaces Route 53 Resolver Query Logs
            coverage. Three states (enabled / partial / not enabled) with
            a one-click "Enable on N VPCs" button that creates the log
            configs. Empty when /api/dns/status hasn't responded yet so
            page doesn't flicker. */}
        <DnsVisibilityBanner />
        <RemovableInfrastructureCallout
          candidates={deriveRemoveRouteCandidates(data.workloads || [])}
        />

        {/* Path-card list — one card per active workload's egress path.
            Layout matches the Identity Attack Paths card shape: severity
            score on the left, severity badge + hop count + OBSERVED tag
            across the top, the path chain inline (workload › subnet › sg
            › gateway › destinations), and metric rows on the bottom.
            Per feedback: "each resource has its own paths" — three EC2s
            = three independent cards, not shared columns. */}
        <PathCardList
          rows={buildPathRows(architecture, data)}
          latentRows={buildLatentPathRows(data)}
          hiddenWorkloadCount={
            ((architecture as SystemArchitecture & {
              hiddenSilentWorkloadCount?: number
            }).hiddenSilentWorkloadCount) || 0
          }
          silentCandidates={buildSilentCandidateRows(data)}
        />
      </div>

    </div>
  )
}

export default EgressFlowMap
