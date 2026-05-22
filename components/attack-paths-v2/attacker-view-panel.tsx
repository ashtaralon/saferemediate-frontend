"use client"

// Attacker View — Slice 9 v1.1.
//
// Renders the path + lateral pivots as a dynamic flow map using the
// same TrafficFlowMap renderer the Per-Path view uses. Visual
// consistency with the other lens (animated lanes, click-to-detail,
// SG/IAM cards) — but the underlying architecture comes from the
// /api/attack-chain/graph-view endpoint, which surfaces the actual
// Neo4j graph: every lateral role the attacker could assume, every
// other resource on the role, every other workload sharing the role.
//
// 2026-05-22: rewrote from the v1.0 tree-list rendering (developer-
// grade JSON dump). The TrafficFlowMap reuse means operators see the
// attack surface in the same visual language as Per-Path, just with
// the lateral fan-out lanes populated by the graph-view endpoint.

import { useEffect, useMemo, useState } from "react"
import { Crown, AlertTriangle, Eye } from "lucide-react"
import dynamic from "next/dynamic"
import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  TrafficFlow,
  EgressGatewayNode,
} from "@/components/dependency-map/traffic-flow-map"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

// Heavy renderer — lazy-load so the v2 page doesn't pull the full
// dep-map bundle until the operator switches to attacker view.
const TrafficFlowMap = dynamic(() => import("@/components/dependency-map/traffic-flow-map"), {
  ssr: false,
})

interface AttackerViewPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
}

interface GraphViewResponse {
  system_name: string
  node_count: number
  nodes: GraphViewNode[]
  laterals_by_node: Record<string, GraphViewEdge[]>
  generated_at: string
}

interface GraphViewNode {
  id: string
  name: string | null
  labels: string[]
  type: string
  key_properties: Record<string, any>
}

interface GraphViewEdge {
  direction: "in" | "out"
  type: string
  neighbor_id: string
  neighbor_arn: string | null
  neighbor_name: string | null
  neighbor_labels: string[]
  neighbor_type: string
  observed: boolean | null
  bytes: number | null
  hit_count: number | null
  port: number | null
  protocol: string | null
  first_seen: string | null
  last_seen: string | null
  on_path: boolean
  significance:
    | "escalation"
    | "data"
    | "identity"
    | "network"
    | "forensic"
    | "control"
    | "misc"
}

export function AttackerViewPanel({ path, jewel, systemName }: AttackerViewPanelProps) {
  const [data, setData] = useState<GraphViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const nodeIds = (path.nodes ?? []).map((n) => n.id)
    const pathEdges = (path.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
    }))
    fetch("/api/proxy/attack-chain/graph-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_name: systemName,
        node_ids: nodeIds,
        path_edges: pathEdges,
        lateral_cap_per_node: 30,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: GraphViewResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path.id, systemName])

  // Synthesize a SystemArchitecture from the graph-view response.
  // Path nodes get added to their canonical lanes; lateral nodes also
  // get added to lanes (so the operator sees the fan-out); flows are
  // synthesized from both the path's chain edges AND any lateral
  // edges with real observed bytes or hits so the TrafficFlowMap
  // animates the actual data flow rather than implying connections
  // that don't have evidence.
  const architecture = useMemo<SystemArchitecture | null>(() => {
    if (!data) return null
    return buildAttackerArchitecture(data, path)
  }, [data, path])

  // Header summary — path-only build (Slice 9.4) so lateral counts are
  // no longer the headline. We count the OBSERVED flows the canvas is
  // about to draw (path edges + lateral edges that connect two path
  // nodes with observed bytes/hits). That's the operator-meaningful
  // signal — "you'll see N animated flows on the chain."
  const flowSummary = useMemo(() => {
    if (!data) return { observedFlows: 0, totalBytes: 0, totalHits: 0 }
    let observedFlows = 0
    let totalBytes = 0
    let totalHits = 0
    const pathIds = new Set(data.nodes.map((n) => n.id))
    for (const edges of Object.values(data.laterals_by_node)) {
      for (const e of edges) {
        if (e.on_path) continue
        if (!pathIds.has(e.neighbor_id)) continue
        const hits = e.hit_count ?? 0
        const bytes = e.bytes ?? 0
        if (hits === 0 && bytes === 0 && !e.observed) continue
        observedFlows++
        totalBytes += bytes
        totalHits += hits
      }
    }
    // Also count path.edges observed flows
    for (const e of path.edges ?? []) {
      if (e.is_observed && (e.traffic_bytes ?? 0) > 0) {
        observedFlows++
        totalBytes += e.traffic_bytes ?? 0
        totalHits += e.hit_count ?? 0
      }
    }
    return { observedFlows, totalBytes, totalHits }
  }, [data, path])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Loading the live attack surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Querying Neo4j for the path's neighborhood…
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Could not load attacker view" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Graph view failed</span>
            </div>
            <div className="text-xs text-red-200/80">{error}</div>
          </div>
        </div>
      </div>
    )
  }
  if (!data || !architecture) return null

  // Path-only header — reflects what's actually on the canvas after
  // Slice 9.4. Operator sees the chain length + observed-flow count +
  // total observed bytes. No lateral-pivot count in the header
  // anymore (move to Exposure view for the full fan-out).
  const subtitle =
    flowSummary.observedFlows === 0
      ? `${data.node_count} hop${data.node_count === 1 ? "" : "s"} · no observed traffic on this path`
      : `${data.node_count} hop${data.node_count === 1 ? "" : "s"} · ${
          flowSummary.observedFlows
        } observed flow${flowSummary.observedFlows === 1 ? "" : "s"} · ${formatBytesShort(
          flowSummary.totalBytes,
        )} on the wire`

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride="Attack Surface"
          innerSubtitleOverride="Path chain + lateral pivots, sourced from Neo4j as-is"
          pathBadgeOverride={`Path → ${jewel?.name ?? path.id}`}
          // VPC is genuinely on the attack chain (network container
          // between SG and Subnet), not a layered overlay — show its
          // boundary by default so the path doesn't visually skip the
          // hop. Operator can still toggle it off via the header.
          defaultShowVPCBoundaries={true}
        />
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

function Header({ jewel, subtitle }: { jewel: CrownJewelSummary | null; subtitle: string }) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-red-300" />
          ATTACKER VIEW · live attack surface
        </div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      {jewel && (
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">target</span>
          </div>
          <div
            className="text-xs font-mono text-amber-200/90 truncate max-w-[260px]"
            title={jewel.name}
          >
            {jewel.name}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Architecture synthesis ──────────────────────────────────────────

const CLASS_LABELS = {
  escalation: "escalation",
  data: "data-access",
  identity: "identity",
  forensic: "observed",
  network: "network",
  control: "control",
  misc: "misc",
} as const

// Strip ARN noise from a name when present — "arn:aws:iam::1234:role/foo"
// → "foo". Keep the original when the input doesn't look like an ARN.
function friendlyName(rawName: string | null, id: string): string {
  const candidate = rawName || id
  if (!candidate) return id
  if (candidate.includes(":::")) {
    return candidate.split(":::")[1] || candidate
  }
  if (candidate.startsWith("arn:")) {
    const tail = candidate.split("/").pop()
    if (tail) return tail
  }
  return candidate
}

// Compact byte formatter used in the header subtitle.
function formatBytesShort(n: number): string {
  if (n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  // Middle-truncate so prefix AND suffix stay visible — "SafeRemediate-Test-Frontend-1"
  // becomes "SafeRem…Frontend-1" instead of "SafeRemediate-Tes…" which makes
  // every SafeRemediate-* instance look identical.
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// Map graph-view node type → TrafficFlowMap lane bucket. The TFM has
// 5 lanes the attacker view will populate:
//   compute            → COMPUTE
//   resource           → RESOURCES (S3, RDS, DynamoDB, KMS, Secret)
//   sg                 → SECURITY GROUPS
//   nacl               → NACLS
//   iam_role           → IAM ROLES (true IAMRoles only)
//   instance_profile   → INSTANCE PROFILES (separate from roles —
//                        AWS's binding object between EC2 and Role.
//                        Previously merged into iam_role which caused
//                        the "IAM ROLES (3)" miscount on Attacker view.
//                        Split 2026-05-22 per audit.)
//   iam_policy         → IAM POLICIES (the actual grant document; IS
//                        the finding for over-permissive paths)
//   subnet             → SUBNETS lane (rendered as decoration column)
function bucketForGraphType(
  type: string,
):
  | "compute"
  | "resource"
  | "sg"
  | "nacl"
  | "iam_role"
  | "instance_profile"
  | "iam_policy"
  | "subnet"
  | "vpc"
  | "principal"
  | "egress_gateway"
  | "network_interface"
  | "ignore" {
  const t = (type || "").toLowerCase()
  if (t.includes("ec2") || t.includes("lambda") || t.includes("ecs") || t.includes("fargate"))
    return "compute"
  if (
    t === "s3bucket" ||
    t === "dynamodbtable" ||
    t === "rdsinstance" ||
    t === "rds" ||
    t === "kmskey" ||
    t === "secret"
  )
    return "resource"
  if (t === "securitygroup") return "sg"
  if (t === "networkacl" || t === "nacl") return "nacl"
  // IAMRole / InstanceProfile / IAMPolicy are THREE different node
  // types with different semantics. Exact-match checks only — the
  // earlier `t.includes("instanceprofile")` was too eager and silently
  // stripped IAMRole nodes from the path on the legacy Attacker View
  // (any node whose serialized type contained that substring fell out
  // of every lane). Per 2026-05-22 hotfix: keep exact-match dispatch
  // and accept the InstanceProfile-count edge case for multi-label
  // nodes (InstanceProfile-bucket lookups can resolve to 0 when the
  // backend surfaces "IAMRole" instead of "InstanceProfile" as
  // node.type — preferable to dropping the entire role from the view).
  if (t === "iamrole" || t === "role") return "iam_role"
  if (t === "instanceprofile") return "instance_profile"
  if (t === "iampolicy") return "iam_policy"
  if (t === "subnet") return "subnet"
  if (t === "vpc") return "vpc"
  if (t === "cloudtrailprincipal" || t === "iamuser" || t === "humanidentity" || t === "awsprincipal" || t.includes("principal"))
    return "principal"
  // Egress gateways — IGW, NAT, EgressOnlyIGW, TransitGateway. TFM
  // already has an egressGateways lane (chip item 10); populating
  // it from the attacker view's lateral neighbors surfaces the
  // missing egress story the audit flagged ("data leaves the cloud").
  if (
    t === "internetgateway" ||
    t === "natgateway" ||
    t === "egressonlyinternetgateway" ||
    t === "transitgateway"
  )
    return "egress_gateway"
  // NetworkInterface — the ENI carries the SG attachment and IP. Right
  // now we route it to the compute lane (it acts as a workload-side
  // attachment). Visual distinction TBD; getting it on the canvas
  // matters more than which lane today.
  if (t === "networkinterface" || t === "eni") return "network_interface"
  return "ignore"
}

function buildAttackerArchitecture(
  graph: GraphViewResponse,
  path: IdentityAttackPath,
): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const subnets: SubnetNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const nacls: SecurityCheckpoint[] = []
  // Identity types are split (2026-05-22 fix). Previously all three
  // were mashed into iamRoles[] which made "IAM ROLES (3)" lie on
  // single-role paths and hid the EC2→InstanceProfile→Role chain.
  const iamRoles: SecurityCheckpoint[] = []
  const instanceProfiles: SecurityCheckpoint[] = []
  const iamPolicies: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const flows: TrafficFlow[] = []
  // VPC tracker — collected during the first pass so we can build the
  // TFM `vpcGroups` payload that drives the existing VPCBoundaries
  // renderer (toggled by the "VPC" checkbox in the header). VPCs were
  // previously dropped via the "ignore" bucket; for a path that goes
  // EC2 → SG → VPC → Subnet → Role the container hop just vanished
  // from the canvas without any indication. Now we surface them.
  const vpcsById = new Map<string, { vpcId: string; vpcName: string }>()

  // Crown jewel ids from the path so we can tag resource cards.
  const crownJewelIds = new Set(
    (path.nodes ?? []).filter((n) => n.tier === "crown_jewel").map((n) => n.id),
  )

  // Dedup key combines (lowercased friendly name, lane bucket) so that
  // a Role and an InstanceProfile sharing a name stay distinct, but
  // dual-label-graph duplicates of the same logical node collapse.
  // The Neo4j graph has each node under multiple ids (full ARN, short
  // id, dual-label Resource/Service) — without canonical dedup the
  // lanes end up with 2-3 cards for the same workload.
  const seen = new Set<string>() // raw ids already added
  const seenByCanonical = new Set<string>() // canonical "name|lane" keys

  const canonicalKey = (name: string | null, id: string, lane: string): string => {
    const fname = friendlyName(name, id).toLowerCase()
    return `${fname}|${lane}`
  }

  const computeSubtype = (type: string): "compute" | "lambda" => {
    return type.toLowerCase().includes("lambda") ? "lambda" : "compute"
  }
  const resourceSubtype = (type: string): "storage" | "database" | "dynamodb" => {
    const t = type.toLowerCase()
    if (t.includes("dynamo")) return "dynamodb"
    if (t.includes("rds") || t.includes("database")) return "database"
    return "storage"
  }

  const addAsCompute = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "compute")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    computeServices.push({
      id,
      name: display,
      shortName: shortName(display),
      type: computeSubtype(type),
      instanceId: id.startsWith("i-") ? id : id.slice(-12),
    })
  }
  // Principal (CloudTrailPrincipal / AWSPrincipal / IAMUser / HumanIdentity)
  // — the actor making the API call. Previously skipped, which collapsed
  // any Principal → Resource path to a single-node canvas (only the
  // target rendered). For API-only paths where the chain is
  // <principal> → <S3 bucket> with no EC2/Lambda hop, the principal IS
  // the source side of the flow — dropping it left the operator looking
  // at a target with no caller, no observed connection, and no E2E
  // service flow visible.
  //
  // Render in the compute lane with type:'principal' so the existing
  // ServiceNodeBox renderer picks up the cyan Target icon from
  // NODE_CONFIG. Lane co-location with compute matches semantics —
  // both are "the actor" in attack-narrative terms — without needing
  // a new lane in TrafficFlowMap.
  const addAsPrincipal = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "principal")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    computeServices.push({
      id,
      name: display,
      shortName: shortName(display),
      type: "principal",
      instanceId: id.slice(-12),
    })
  }
  const addAsResource = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "resource")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const sub = resourceSubtype(type)
    const node: ServiceNode = {
      id,
      name: display,
      shortName: shortName(display),
      type: sub,
    }
    if (crownJewelIds.has(id)) {
      ;(node as any).isCrownJewel = true
    }
    resources.push(node)
  }
  // True IAMRole only (InstanceProfile is handled by addAsInstanceProfile
  // and IAMPolicy by addAsPolicy — each owns its own array). usedCount /
  // totalCount remain 0 here because the per-role gap data isn't on
  // GraphViewResponse.nodes[].key_properties yet; the IAM Roles lane
  // renders the chip with role.totalCount and falls back to "—" when 0.
  // Future: pipe allowed_actions_count / used_actions_count through the
  // graph-view payload so the lane shows real gap numbers.
  const addAsRole = (id: string, _type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_role")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    iamRoles.push({
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // InstanceProfile — AWS's binding object that wires an EC2 instance
  // to an IAM role. Semantically distinct from a role; previously
  // collapsed into iamRoles which produced the wrong "IAM ROLES (3)"
  // count for a single-role path. The InstanceProfile typically shares
  // its name with the role it points at (alon-prod convention), so the
  // canonical key includes the "instance_profile" lane discriminator
  // to keep them as separate cards.
  const addAsInstanceProfile = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "instance_profile")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    instanceProfiles.push({
      // Keep `type: "iam_role"` on the checkpoint so existing
      // SecurityCheckpoint consumers (status color, drilldown) still
      // work — the distinction is encoded by which array the node
      // lands in, not by the type discriminator. We can introduce a
      // dedicated 'instance_profile' type on SecurityCheckpoint in a
      // follow-up if the rendering needs to diverge further.
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // SG populates totalCount from the graph node's rule counters. Per
  // 2026-05-22 audit the panel was initializing all SGs with
  // totalCount=0 which made TFM render "0 rules" even on the
  // saferemediate-test-app-sg (real rules in Neo4j). Now we pipe:
  //   - total_rules  (preferred — single canonical scalar set by the
  //                   security_group_collector)
  //   - inbound_rule_count + outbound_rule_count (fallback for older
  //                   collector versions that hadn't materialized
  //                   total_rules yet)
  //   - inbound_rules.length + outbound_rules.length (last-resort
  //                   fallback from the raw rule arrays)
  // gapCount uses unused_rules_count when present (rules with no
  // observed traffic match) — that's the "configured-but-unused"
  // signal the operator can act on.
  const addAsSG = (id: string, name: string | null, props?: Record<string, any> | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "sg")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    const inboundArr = Array.isArray(p.inbound_rules) ? p.inbound_rules.length : 0
    const outboundArr = Array.isArray(p.outbound_rules) ? p.outbound_rules.length : 0
    // Fallback chain — prefer scalar total_rules, fall back to summed
    // count fields, then to array-length fallback. Don't use ??-chains
    // here: the intermediate sums are always numbers (never nullish),
    // so the chain collapses to the first non-null and skips the
    // fallbacks. Plain `||` on zero gives the right effect.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const gapCount = Number(p.unused_rules_count ?? 0) || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    securityGroups.push({
      id,
      type: "security_group",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // NACL populates totalCount from rule counters on the graph node.
  // Per 2026-05-22 audit the panel rendered "NACLs (1) · 0 affected"
  // even when the subnet was associated and the NACL had rules. The
  // "0 affected" label comes from totalCount=0 (TFM checks blastRadius
  // from these scalars). Source fields on :NACL nodes:
  //   - total_rules (preferred)
  //   - inbound_rule_count + outbound_rule_count (fallback)
  //   - inbound_rules.length + outbound_rules.length (last-resort)
  // gapCount uses inbound_deny_count + outbound_deny_count when
  // present — explicit denies are the high-signal rules an operator
  // should know about.
  const addAsNACL = (id: string, name: string | null, props?: Record<string, any> | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "nacl")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    const inboundArr = Array.isArray(p.inbound_rules) ? p.inbound_rules.length : 0
    const outboundArr = Array.isArray(p.outbound_rules) ? p.outbound_rules.length : 0
    // Same fallback chain pattern as addAsSG — see comment there.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const denyCount = Number(p.inbound_deny_count ?? 0) + Number(p.outbound_deny_count ?? 0)
    const gapCount = denyCount || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    nacls.push({
      id,
      type: "nacl",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // IAMPolicy — the actual permission grant document, IS the finding
  // for over-permissive paths (e.g. S3OverPermissiveAccess on
  // alon-prod). Promoted from "🤝 emoji-prefixed card in iamRoles lane"
  // to its own iamPolicies array per 2026-05-22 fix. No name prefix
  // needed now that they have their own lane and aren't competing for
  // visual space with role cards.
  //
  // totalCount = permission_count (the number of distinct actions the
  // policy grants) when present on the graph node. gapCount = unused
  // permissions when we can compute them (currently we can't from the
  // graph-view payload alone — would need to join against the role's
  // observed actions). usedCount falls out the same way.
  const addAsPolicy = (id: string, name: string | null, props?: Record<string, any> | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_policy")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const totalCount = Number(p.permission_count ?? 0) || 0
    iamPolicies.push({
      id,
      type: "iam_role", // keep existing checkpoint discriminator —
                       // SecurityCheckpoint.type doesn't yet have an
                       // 'iam_policy' variant; the distinction is
                       // encoded by being in iamPolicies[]
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }

  // Egress gateway (IGW / NAT / EgressOnlyIGW / TransitGateway) →
  // egressGateways lane. The TFM already renders this lane (chip
  // item 10 from the topology work); we just need to populate it.
  const addAsEgressGateway = (id: string, name: string | null, gatewayType: string, vpcId: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "egress_gateway")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // Map graph node-type → EgressGatewayNode.kind. The TFM expects
    // one of: InternetGateway | NATGateway | EgressOnlyInternetGateway
    // | TransitGateway. Default to InternetGateway when the graph
    // gives us an unexpected string (safer fallback — most laterals
    // we'd surface here are IGWs anyway).
    const t = (gatewayType || "").toLowerCase()
    const kind: EgressGatewayNode["kind"] =
      t === "natgateway"
        ? "NATGateway"
        : t === "egressonlyinternetgateway"
          ? "EgressOnlyInternetGateway"
          : t === "transitgateway"
            ? "TransitGateway"
            : "InternetGateway"
    const kindLabel: Record<EgressGatewayNode["kind"], string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
    }
    egressGateways.push({
      id,
      name: display,
      shortName: shortName(display),
      vpcId,
      kind,
      kindLabel: kindLabel[kind],
    })
  }

  // NetworkInterface (ENI) → compute lane for now, marked with an
  // "ENI" prefix so operators see it's not an EC2/Lambda. The ENI
  // carries the SG attachment, so visually grouping with compute
  // makes the SG-ENI-EC2 relationship readable. Move to a dedicated
  // lane in a later slice if needed.
  const addAsNetworkInterface = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "network_interface")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    computeServices.push({
      id,
      name: `ENI ${display}`,
      shortName: shortName(`ENI ${display}`),
      type: "compute", // generic compute icon; the ENI prefix in the name disambiguates
      instanceId: id,
    })
  }

  // VPC — render via TFM's VPCBoundaries by populating vpcGroups (built
  // at the end). Path nodes that match the VPC bucket land here; they
  // also seed seen/seenByCanonical so flow synthesis treats them as
  // legit endpoints (USES_VPC / IN_VPC config edges are filtered out
  // separately so they don't draw an extra line, but the visual
  // container box is what the operator actually wants here).
  const addAsVPC = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "vpc")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    vpcsById.set(id, { vpcId: id, vpcName: display })
  }
  const addAsSubnet = (id: string, name: string | null, vpcId: string | null, isPublic: boolean | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "subnet")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // shortName is what the TFM SubnetNode card renders as the
    // identifier — without it, the card shows ONLY the
    // Public/Private/Unknown posture chip and no name. v1.2 omitted
    // this field, which is why every subnet read as just "Private"
    // in the previous screenshot.
    subnets.push({
      id,
      name: display,
      shortName: shortName(display),
      // Preserve null three-state (Public / Private / Unknown). Coercing
      // to boolean lost the "Unknown" state when subnet_is_public is
      // unclassified — per the earlier credibility audit.
      isPublic,
      vpcId: vpcId || undefined,
      connectedComputeIds: [],
    })
  }

  // First pass — add every path node to its canonical lane.
  // SG / NACL / IAMPolicy helpers now receive key_properties so
  // totalCount / gapCount / rule arrays come from real graph data
  // (fix for the "0 rules" / "0 affected" / "permission_count missing"
  // class of credibility bugs).
  for (const node of graph.nodes) {
    const bucket = bucketForGraphType(node.type)
    const props = (node.key_properties as Record<string, any> | undefined) ?? null
    if (bucket === "compute") addAsCompute(node.id, node.type, node.name)
    else if (bucket === "resource") addAsResource(node.id, node.type, node.name)
    else if (bucket === "iam_role") addAsRole(node.id, node.type, node.name)
    else if (bucket === "instance_profile") addAsInstanceProfile(node.id, node.name)
    else if (bucket === "iam_policy") addAsPolicy(node.id, node.name, props)
    else if (bucket === "sg") addAsSG(node.id, node.name, props)
    else if (bucket === "nacl") addAsNACL(node.id, node.name, props)
    else if (bucket === "principal") addAsPrincipal(node.id, node.name)
    else if (bucket === "vpc") addAsVPC(node.id, node.name)
    else if (bucket === "egress_gateway") {
      const vpcId = props?.vpc_id ?? null
      addAsEgressGateway(node.id, node.name, node.type, vpcId)
    } else if (bucket === "network_interface") {
      addAsNetworkInterface(node.id, node.name)
    } else if (bucket === "subnet") {
      const vpcId = props?.vpc_id ?? null
      const isPub = props?.subnet_is_public ?? null
      addAsSubnet(node.id, node.name, vpcId, isPub)
    }
    // 'ignore' — bucket didn't match a node type we render in any lane.
  }

  // Slice 9.5 — distinguish PATH INFRASTRUCTURE from LATERAL PIVOTS.
  //
  // 9.4 stripped EVERY lateral. That was over-correction: it also
  // removed NACL / IGW / ENI / Policy, which aren't "what else this
  // role could do" — they're the actual network/identity controls
  // ATTACHED to path nodes, modeled as decoration edges in Neo4j
  // rather than as BFS hops.
  //
  // The honest rule:
  //   Path infrastructure (attached to a path node) → INCLUDE
  //     - NACL associated with the path's subnet
  //     - IGW/NAT the path's subnet routes through
  //     - ENI on the path's EC2
  //     - IAMPolicy attached to the path's role
  //   Lateral pivots (siblings/alternatives reachable from a path
  //   node but unrelated to THIS attack) → SKIP
  //     - Other roles the path role can ASSUME_ROLE into
  //     - Other resources the path role can ACCESSES_RESOURCE
  //     - Other workloads sharing the path role via USES_ROLE
  //     - Other accessors of the crown jewel
  // Operators who want the full pivot fan-out switch to Exposure view.
  // Path-infrastructure rule — RESTRICTED to attachments of the
  // CORRECT path-node type. The 2026-05-22 over-include bug: we were
  // adding every ENI lateral of every path node, including the SG's
  // reverse-associations (5 ENIs from sibling workloads sharing the
  // SG). Result: 6 ENI cards in Compute lane for what should be 1.
  //
  // Rule per neighbor type — only add when the SOURCE path node is
  // the natural carrier:
  //   ENI         → only when path node is a workload (EC2 / Lambda)
  //   NACL        → only when path node is a Subnet
  //   IGW/NAT     → only when path node is a Subnet or VPC
  //   IAMPolicy   → only when path node is an IAMRole
  //
  // Skip every other ENI / NACL / IGW reference (those are siblings
  // discovered via SG fan-out etc).
  const pathNodeTypeByKey = new Map<string, string>()
  for (const node of graph.nodes) {
    pathNodeTypeByKey.set(node.id, bucketForGraphType(node.type))
  }

  // Dedupe flow synthesis — same edge can appear from both this
  // loop's on_path branch AND the path.edges loop below. Without a
  // key set we doubled the role→jewel flow's hit count (the
  // 1,579,582 connections bug).
  const flowKeys = new Set<string>()

  // ─── Path-level checkpoint identifiers ───────────────────────────
  //
  // TFM's ConnectionLinesSVG routes each flow line THROUGH whichever
  // checkpoints the flow carries: sgId → naclId → roleId → vpceId.
  // Without setting these, the role→S3 flow draws as a straight
  // diagonal from IAM ROLES lane to RESOURCES lane, skipping the SG
  // and NACL visually — even though the operator KNOWS the path
  // traverses them.
  //
  // For the Attacker view, wire every synthesized flow with the
  // path's specific gates so the line zigzags through SG → NACL →
  // IAMRole on its way to the crown jewel. That's the visual the
  // user wants: every service in the chain connected by an actual
  // routed line.
  //
  // We pick the FIRST item per lane (paths typically have one of
  // each). Future enhancement: multi-checkpoint routing when paths
  // genuinely fan out (rare).
  const pathCheckpoints = {
    sgId: securityGroups[0]?.id,
    naclId: nacls[0]?.id,
    // iamRoles[] is now policy-free (policies live in iamPolicies[] post
    // 2026-05-22 split), so no need for the 📜-prefix filter.
    roleId: iamRoles[0]?.id,
    // egressGatewayId / eniId / instanceProfileId / policyId aren't TFM
    // flow fields today; lane cards render but no connecting line. Fix
    // for these orphan-card edges lands with the materialized-hop
    // renderer (v0.2 §3) which iterates AttackPath.hops instead of
    // inferring checkpoints from a flat node list.
  }

  for (const [pathNodeId, edges] of Object.entries(graph.laterals_by_node)) {
    const pathNodeBucket = pathNodeTypeByKey.get(pathNodeId)
    for (const e of edges) {
      const neighborId = e.neighbor_id
      if (!neighborId) continue

      // Branch A — edge between two path nodes (on_path=true). The
      // inter-hop observed-traffic edges that animate the chain.
      if (e.on_path) {
        const hits = e.hit_count ?? 0
        const bytes = e.bytes ?? 0
        if (hits === 0 && bytes === 0 && !e.observed) continue
        if (!seen.has(neighborId)) continue
        const sourceId = e.direction === "out" ? pathNodeId : neighborId
        const targetId = e.direction === "out" ? neighborId : pathNodeId
        const key = `${sourceId}->${targetId}`
        if (flowKeys.has(key)) continue
        flowKeys.add(key)
        flows.push({
          sourceId,
          targetId,
          // Route THROUGH path checkpoints so the line zigzags
          // visually instead of going straight from source to target.
          sgId: pathCheckpoints.sgId,
          naclId: pathCheckpoints.naclId,
          roleId: pathCheckpoints.roleId,
          ports: e.port ? [String(e.port)] : [],
          protocol: e.protocol || (e.type.includes("S3") ? "s3" : "tcp"),
          bytes,
          connections: hits || 1,
          isActive: !!e.observed || hits > 0 || bytes > 0,
        })
        continue
      }

      // Branch B — true lateral. Only add when this neighbor is the
      // natural infrastructure attachment of the path node type.
      const neighborBucket = bucketForGraphType(e.neighbor_type)
      if (neighborBucket === "network_interface") {
        if (pathNodeBucket === "compute") {
          addAsNetworkInterface(neighborId, e.neighbor_name)
        }
        // ENI lateral on a non-workload path node (SG / Subnet / VPC)
        // — those are sibling-workload ENIs, skip.
        continue
      }
      if (neighborBucket === "nacl") {
        if (pathNodeBucket === "subnet") {
          addAsNACL(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "egress_gateway") {
        if (pathNodeBucket === "subnet" || pathNodeBucket === "ignore") {
          // VPC nodes bucket as 'ignore' currently (no VPC lane in
          // TFM). Subnet ROUTES_VIA → IGW is the canonical edge.
          addAsEgressGateway(neighborId, e.neighbor_name, e.neighbor_type, null)
        }
        continue
      }
      if (neighborBucket === "iam_policy") {
        if (pathNodeBucket === "iam_role" || pathNodeBucket === "principal") {
          // Principal → IAMPolicy is the natural attachment too (an
          // IAMUser carries inline/attached policies directly, no role
          // hop). Surfacing it tells the operator WHICH grant document
          // authorized the observed API call.
          addAsPolicy(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "iam_role") {
        if (pathNodeBucket === "principal") {
          // Principal → IAMRole is path infrastructure for assumed-role
          // sessions: the CloudTrailPrincipal is a session, the role is
          // what gave it permissions. Without the role card the operator
          // sees only "<session> accessed <bucket>" with no answer to
          // "which role's permissions made this possible?" — exactly the
          // E2E context the user complained was missing. Sibling roles
          // (assume-role chains the path didn't take) still skip via the
          // default branch at the bottom.
          addAsRole(neighborId, e.neighbor_type, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "instance_profile") {
        if (pathNodeBucket === "compute") {
          // EC2 → InstanceProfile is the binding object that wires the
          // workload to the role it runs as. Already surfaced as a
          // path node when the path includes the chain, but lateral
          // surfacing covers the case where the path skipped the IP
          // hop (older IAP builders).
          addAsInstanceProfile(neighborId, e.neighbor_name)
        }
        continue
      }
      // Otherwise: lateral pivot (sibling role / other bucket / etc).
      // Skip — Exposure view handles the full fan-out.
    }
  }

  // Path edges — add as the primary flows (these are the chain).
  // Source/target must already be in seen for the TFM to render the
  // line between them. Most path edges are config-only (USES_ROLE,
  // SECURED_BY, IN_SUBNET) so they don't create new flow lines;
  // only the observed data-bearing edges do.
  //
  // 2026-05-22 fix: also keep edges with hit_count > 0. The IAP
  // backend's role→S3 ACCESSES_RESOURCE edge often carries
  // hit_count (CloudTrail action count) without populating
  // traffic_bytes — pre-fix we lost these flows entirely.
  for (const edge of path.edges ?? []) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue
    const observed = edge.is_observed ?? false
    const bytes = edge.traffic_bytes ?? 0
    const hits = edge.hit_count ?? 0
    if (!observed && bytes === 0 && hits === 0) continue
    const t = (edge.type || "").toUpperCase()
    if (
      t === "USES_ROLE" ||
      t === "SECURED_BY" ||
      t === "USES_SECURITY_GROUP" ||
      t === "IN_SUBNET" ||
      t === "IN_VPC" ||
      t === "RUNS_IN_VPC" ||
      t === "HAS_INSTANCE_PROFILE" ||
      t === "HAS_POLICY" ||
      t === "ASSUMES_ROLE"
    )
      continue
    // Dedupe — same flow may also be in the lateral loop's on_path
    // branch. Without this guard the role→jewel observed flow showed
    // up twice (1,579,582 connections bug from the 2026-05-22 audit).
    const flowKey = `${edge.source}->${edge.target}`
    if (flowKeys.has(flowKey)) continue
    flowKeys.add(flowKey)
    flows.push({
      sourceId: edge.source,
      targetId: edge.target,
      // Route through path checkpoints (same as Branch A above).
      sgId: pathCheckpoints.sgId,
      naclId: pathCheckpoints.naclId,
      roleId: pathCheckpoints.roleId,
      ports: edge.port ? [String(edge.port)] : [],
      protocol: edge.protocol || (t.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: edge.hit_count ?? 1,
      isActive: observed,
    })
  }

  // ─── Chain-completion flows ──────────────────────────────────────
  //
  // If we have a compute workload AND a crown-jewel resource on the
  // path but NO synthesized observed flow between them yet (because
  // the BFS only emitted role→S3 with traffic, not compute→S3), add
  // a chain-completing flow so the line draws compute → SG → NACL →
  // role → resource visually. Marked isActive=false (dimmed gray)
  // since it's a CONFIGURED relationship, not observed traffic. This
  // gives the operator the full visual chain without lying about
  // traffic evidence.
  const pathComputes = computeServices.filter((c) => !c.name.startsWith("ENI "))
  const pathResources = resources
  for (const compute of pathComputes) {
    for (const resource of pathResources) {
      const key = `${compute.id}->${resource.id}`
      if (flowKeys.has(key)) continue
      flowKeys.add(key)
      flows.push({
        sourceId: compute.id,
        targetId: resource.id,
        sgId: pathCheckpoints.sgId,
        naclId: pathCheckpoints.naclId,
        roleId: pathCheckpoints.roleId,
        ports: [],
        protocol: "configured",
        bytes: 0,
        connections: 0,
        // false = gray static line, no animation. Honest about
        // "this is the configured chain, not observed traffic."
        isActive: false,
      })
    }
  }

  // ─── vpcGroups assembly ──────────────────────────────────────────
  //
  // TFM's VPCBoundaries draws bounding boxes from this payload (gated
  // by the "VPC" toggle in the header). For each VPC node on the path
  // we group: its subnets (matched via subnet.vpcId) and the compute
  // nodes attached to each subnet. Computes whose vpcId isn't known
  // (principals, free-floating workloads) are skipped.
  //
  // Build a subnet → compute-ids index from the architecture as it
  // stands today. Subnets carry connectedComputeIds=[]; we haven't
  // populated them in the per-path builder, so derive from path edges
  // (IN_SUBNET) as a best-effort. Falls back to "this subnet has no
  // computes" if the path didn't carry that edge.
  const subnetToComputes = new Map<string, string[]>()
  for (const edge of path.edges ?? []) {
    const t = (edge.type || "").toUpperCase()
    if (t !== "IN_SUBNET") continue
    // Direction: compute -> subnet
    const subnetId = edge.target
    const computeId = edge.source
    if (!subnetId || !computeId) continue
    if (!subnetToComputes.has(subnetId)) subnetToComputes.set(subnetId, [])
    subnetToComputes.get(subnetId)!.push(computeId)
  }
  // Fallback — when the path doesn't surface IN_SUBNET edges (e.g.
  // CloudTrail-only paths whose serializer drops topology edges), give
  // each subnet ALL the network-relevant ids on the path so
  // VPCBoundaries has enough anchors to compute a bounding box that
  // genuinely wraps the network region (not just the Compute column).
  // Without this the VPC box rendered only around Compute, missing
  // the SG / NACL / IAMRole cards that are also network-scoped.
  if (subnetToComputes.size === 0 && subnets.length > 0) {
    const networkScopedIds = [
      ...computeServices.map((c) => c.id),
      ...securityGroups.map((sg) => sg.id),
      ...nacls.map((n) => n.id),
      ...iamRoles.map((r) => r.id),
      ...instanceProfiles.map((p) => p.id),
      ...egressGateways.map((g) => g.id),
    ]
    for (const s of subnets) {
      subnetToComputes.set(s.id, networkScopedIds)
    }
  }

  const vpcGroups = Array.from(vpcsById.values()).map((v) => {
    const groupSubnets = subnets
      .filter((s) => s.vpcId === v.vpcId || !s.vpcId)
      .map((s) => ({
        subnetId: s.id,
        subnetName: s.shortName ?? s.name,
        // SubnetNode.isPublic is three-state (true/false/null). VPCBoundaries
        // expects boolean; coerce null → false (private fallback) for the
        // boundary-coloring decision only — the SubnetNode card itself
        // still renders the honest three-state Unknown chip.
        isPublic: s.isPublic === true,
        nodeIds: subnetToComputes.get(s.id) ?? [],
      }))
    return { vpcId: v.vpcId, vpcName: v.vpcName, subnets: groupSubnets }
  })

  return {
    computeServices,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    // 2026-05-22: identity types are split across three arrays so the
    // sidebar count is honest ("IAM ROLES (1) · INSTANCE PROFILES (1)
    // · IAM POLICIES (1)" instead of the previous wrong "IAM ROLES
    // (3)"). Both new arrays are optional on SystemArchitecture for
    // back-compat — consumers that don't know about them just ignore
    // the new lanes.
    instanceProfiles,
    iamPolicies,
    vpcEndpoints: [],
    egressGateways,
    flows,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: 0,
    vpcGroups,
  }
}
