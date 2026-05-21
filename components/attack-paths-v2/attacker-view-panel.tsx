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

  // Lateral counts for the header narrative — "X paths + Y pivot
  // moves" reads more honest than "N nodes."
  const lateralSummary = useMemo(() => {
    if (!data) return { lateralCount: 0, byClass: {} as Record<string, number> }
    let count = 0
    const byClass: Record<string, number> = {}
    for (const edges of Object.values(data.laterals_by_node)) {
      for (const e of edges) {
        if (e.on_path) continue
        count++
        byClass[e.significance] = (byClass[e.significance] ?? 0) + 1
      }
    }
    return { lateralCount: count, byClass }
  }, [data])

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

  // Build a one-line subtitle summarizing the lateral classes that
  // matter most for the attacker narrative.
  const classOrder: Array<keyof typeof CLASS_LABELS> = [
    "escalation",
    "data",
    "identity",
    "forensic",
    "network",
    "control",
    "misc",
  ]
  const classBits = classOrder
    .filter((c) => (lateralSummary.byClass[c] ?? 0) > 0)
    .map((c) => `${lateralSummary.byClass[c]} ${CLASS_LABELS[c]}`)

  return (
    <div className="flex flex-col h-full">
      <Header
        jewel={jewel}
        subtitle={
          lateralSummary.lateralCount === 0
            ? `${data.node_count} hop${data.node_count === 1 ? "" : "s"} · no lateral pivots found`
            : `${data.node_count} hop${data.node_count === 1 ? "" : "s"} · ${lateralSummary.lateralCount} lateral pivot${
                lateralSummary.lateralCount === 1 ? "" : "s"
              } (${classBits.join(" · ")})`
        }
      />
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride="Attack Surface"
          innerSubtitleOverride="Path chain + lateral pivots, sourced from Neo4j as-is"
          pathBadgeOverride={`Path → ${jewel?.name ?? path.id}`}
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
//   compute   → COMPUTE
//   resource  → RESOURCES (S3, RDS, DynamoDB, KMS, Secret)
//   sg        → SECURITY GROUPS
//   nacl      → NACLS
//   iam_role  → IAM ROLES (also catches InstanceProfile + IAMPolicy as
//               attached identity-plane context)
//   subnet    → SUBNETS lane (rendered as decoration column)
function bucketForGraphType(
  type: string,
): "compute" | "resource" | "sg" | "nacl" | "iam_role" | "subnet" | "principal" | "ignore" {
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
  // IAMRole, InstanceProfile go to the IAM lane.
  // IAMPolicy is a different shape (a permission grant document, not an
  // identity) — we explicitly OMIT it from the iam_role lane to keep
  // the lane focused on the identities themselves. Policy details
  // surface on the role card (existing iam-permission-analysis modal)
  // when the operator clicks through. Re-introduce as a dedicated
  // POLICIES lane in a later slice if needed.
  if (t === "iamrole" || t === "instanceprofile" || t === "role") return "iam_role"
  if (t === "iampolicy") return "ignore"
  if (t === "subnet") return "subnet"
  if (t === "cloudtrailprincipal" || t === "iamuser" || t === "humanidentity" || t === "awsprincipal" || t.includes("principal"))
    return "principal"
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
  const iamRoles: SecurityCheckpoint[] = []
  const flows: TrafficFlow[] = []

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
  const addAsRole = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    // Roles and InstanceProfiles can share names — preserve the
    // distinction in canonical dedup. dual-label Resource/Service
    // duplicates of the SAME role collapse.
    const subLane = (type || "").toLowerCase().includes("instanceprofile") ? "iam_ip" : "iam_role"
    const canon = canonicalKey(name, id, subLane)
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
  const addAsSG = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "sg")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    securityGroups.push({
      id,
      type: "security_group",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  const addAsNACL = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "nacl")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    nacls.push({
      id,
      type: "nacl",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  const addAsSubnet = (id: string, name: string | null, vpcId: string | null, isPublic: boolean | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "subnet")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    subnets.push({
      id,
      name: display,
      vpcId: vpcId || "unknown-vpc",
      vpcName: vpcId || "unknown-vpc",
      isPublic: !!isPublic,
      connectedComputeIds: [],
    })
  }

  // First pass — add every path node to its canonical lane.
  for (const node of graph.nodes) {
    const bucket = bucketForGraphType(node.type)
    if (bucket === "compute") addAsCompute(node.id, node.type, node.name)
    else if (bucket === "resource") addAsResource(node.id, node.type, node.name)
    else if (bucket === "iam_role") addAsRole(node.id, node.type, node.name)
    else if (bucket === "sg") addAsSG(node.id, node.name)
    else if (bucket === "nacl") addAsNACL(node.id, node.name)
    else if (bucket === "subnet") {
      const vpcId = (node.key_properties as any)?.vpc_id ?? null
      const isPub = (node.key_properties as any)?.subnet_is_public ?? null
      addAsSubnet(node.id, node.name, vpcId, isPub)
    }
    // 'principal' / 'ignore' — skip (CloudTrailPrincipal doesn't get its
    // own lane in the existing TFM; the role/EC2 it acted as carries it)
  }

  // Second pass — laterals. Add each lateral neighbor to the right
  // lane, and synthesize flows for data-relevant edges with observed
  // bytes or hits.
  //
  // Filtering rules to keep the canvas operator-readable:
  //   * Skip MISC significance — these are pure system-level wrappers
  //     (BELONGS_TO_SYSTEM, etc.) that add nodes without informing
  //     the attack story.
  //   * Cap PER-CLASS PER-PATH-NODE laterals at 6. The lanes show the
  //     top 6 by significance order (escalation > data > identity > …);
  //     remaining laterals are still in the underlying data but don't
  //     spawn new cards. Operator overload protection.
  const LATERAL_CAP_PER_CLASS = 6
  const classCounters = new Map<string, number>() // key: `${pathNodeId}|${significance}`
  for (const [pathNodeId, edges] of Object.entries(graph.laterals_by_node)) {
    // Sort by significance order first so the cap surfaces the most
    // attacker-relevant pivots.
    const sortedEdges = [...edges].sort((a, b) => {
      const sigOrder: Record<string, number> = {
        escalation: 0, data: 1, control: 2, identity: 3, forensic: 4, network: 5, misc: 6,
      }
      return (sigOrder[a.significance] ?? 99) - (sigOrder[b.significance] ?? 99)
    })
    for (const e of sortedEdges) {
      if (e.on_path) continue
      if (e.significance === "misc") continue
      const counterKey = `${pathNodeId}|${e.significance}`
      const used = classCounters.get(counterKey) ?? 0
      if (used >= LATERAL_CAP_PER_CLASS) continue
      classCounters.set(counterKey, used + 1)
      const neighborBucket = bucketForGraphType(e.neighbor_type)
      const neighborId = e.neighbor_id
      if (!neighborId) continue
      if (neighborBucket === "ignore") continue

      if (neighborBucket === "compute") addAsCompute(neighborId, e.neighbor_type, e.neighbor_name)
      else if (neighborBucket === "resource") addAsResource(neighborId, e.neighbor_type, e.neighbor_name)
      else if (neighborBucket === "iam_role") addAsRole(neighborId, e.neighbor_type, e.neighbor_name)
      else if (neighborBucket === "sg") addAsSG(neighborId, e.neighbor_name)
      else if (neighborBucket === "nacl") addAsNACL(neighborId, e.neighbor_name)
      else if (neighborBucket === "subnet") {
        addAsSubnet(neighborId, e.neighbor_name, null, null)
      }

      // Flow synthesis — render lines for edges where the attacker
      // narrative depends on visual flow:
      //   data        — compute/role → resource (with bytes when present)
      //   forensic    — RUNTIME_CALLS between computes; ACCESSES_RESOURCE
      //                 from a non-path role to the crown jewel
      //   escalation  — role → role (ASSUMES_ROLE) becomes role→role flow
      // We deliberately skip edge types that are pure relationship
      // (USES_ROLE, IN_VPC, IN_SUBNET, BELONGS_TO_SYSTEM) since they're
      // already implied by lane membership and adding them as flows
      // creates visual noise.
      if (e.significance === "data" || e.significance === "forensic") {
        const hits = e.hit_count ?? 0
        const bytes = e.bytes ?? 0
        if (hits > 0 || bytes > 0) {
          const sourceId = e.direction === "out" ? pathNodeId : neighborId
          const targetId = e.direction === "out" ? neighborId : pathNodeId
          flows.push({
            sourceId,
            targetId,
            sgId: undefined,
            naclId: undefined,
            roleId: undefined,
            ports: e.port ? [String(e.port)] : [],
            protocol: e.protocol || (e.type.includes("S3") ? "s3" : "tcp"),
            bytes,
            connections: hits || 1,
            isActive: !!e.observed,
          })
        }
      }
    }
  }

  // Path edges — add as the primary flows (these are the chain).
  // Source/target must already be in seen for the TFM to render the
  // line between them. Most path edges are config-only (USES_ROLE,
  // SECURED_BY, IN_SUBNET) so they don't create new flow lines;
  // only the observed data-bearing edges do.
  for (const edge of path.edges ?? []) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue
    const observed = edge.is_observed ?? false
    const bytes = edge.traffic_bytes ?? 0
    if (!observed && bytes === 0) continue
    const t = (edge.type || "").toUpperCase()
    if (t === "USES_ROLE" || t === "SECURED_BY" || t === "IN_SUBNET" || t === "IN_VPC" || t === "HAS_INSTANCE_PROFILE")
      continue
    flows.push({
      sourceId: edge.source,
      targetId: edge.target,
      sgId: undefined,
      naclId: undefined,
      roleId: undefined,
      ports: edge.port ? [String(edge.port)] : [],
      protocol: edge.protocol || (t.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: edge.hit_count ?? 1,
      isActive: observed,
    })
  }

  return {
    computeServices,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    vpcEndpoints: [],
    egressGateways: [],
    flows,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: 0,
    vpcGroups: [],
  }
}
