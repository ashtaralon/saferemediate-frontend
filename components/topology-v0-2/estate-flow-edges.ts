/**
 * Estate map flow overlay — Lane 3.
 *
 * All access: dependency-map/full observed access edges (same graph the
 * dep-map tab uses). Attack paths only: edges from materialized :AttackPath
 * nodes in identity-attack-paths — NOT a re-filter of dep-map edges.
 */
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { EdgeVpce, TopologyNode, TrafficEdge, TrafficEdgeClass } from "./types"

/**
 * Estate Map flow overlay modes.
 * Architecture-first (Platform / SRE / IT): default is `off`.
 * Observed traffic → Traffic Map; attack paths → Risk → Attack Paths.
 */
export type EstateFlowMode = "off" | "system_path" | "all_access" | "attack_paths"

export interface DepMapEdgeLike {
  source?: string | null
  target?: string | null
  type?: string | null
  edge_type?: string | null
  port?: string | number | null
  protocol?: string | null
  last_seen?: string | null
}

export interface DepMapNodeLike {
  id: string
  name?: string | null
  type?: string | null
  properties?: Record<string, unknown> | null
}

const PHANTOM_ID_RE = /^\d+:[a-z0-9-]+:\d+$/i

const REGIONAL_NODE_TYPES = new Set([
  "S3", "S3Bucket", "KMSKey", "DynamoDB", "DynamoDBTable", "Secret", "SecretsManagerSecret", "RDS",
])

/** Observed access / traffic — excludes pure IAM plumbing in all-access mode. */
const ALL_ACCESS_EDGE_TYPES = new Set([
  "ACTUAL_TRAFFIC",
  "ACTUAL_S3_ACCESS",
  "ACTUAL_API_CALL",
  "ACCESSES_RESOURCE",
  "READS_FROM",
  "WRITES_TO",
  "RUNTIME_CALLS",
  "OBSERVED_TRAFFIC",
  "API_CALL",
  "S3_OPERATION",
  "CALLS",
  "ROUTES_TO",
])

/** IAM control-plane hops — on attack paths but not drawable as estate flows. */
const IAM_PLUMBING_EDGE_TYPES = new Set([
  "HAS_INSTANCE_PROFILE",
  "USES_ROLE",
  "ASSUMES_ROLE",
  "ASSUMES_ROLE_ACTUAL",
  "USED_IDENTITY",
  "HAS_POLICY",
])

function edgeTypeName(edge: DepMapEdgeLike): string {
  return String(edge.type ?? edge.edge_type ?? "").toUpperCase()
}

function isPhantomId(id: string | null | undefined): boolean {
  return typeof id === "string" && PHANTOM_ID_RE.test(id)
}

function normalizePort(port: string | number | null | undefined): number | null {
  if (port == null || port === "") return null
  if (typeof port === "number" && Number.isFinite(port)) return port
  const n = Number.parseInt(String(port), 10)
  return Number.isFinite(n) ? n : null
}

export function buildTopologyNodeIdIndex(
  topologyNodes: TopologyNode[],
  depMapNodes: DepMapNodeLike[] = [],
): Map<string, string> {
  const index = new Map<string, string>()
  for (const n of topologyNodes) {
    index.set(n.id, n.id)
    if (n.name) index.set(n.name, n.id)
  }
  for (const n of depMapNodes) {
    const existing = index.get(n.id)
    const canon = existing ?? n.id
    index.set(n.id, canon)
    if (n.name) index.set(n.name, canon)
    const props = n.properties ?? {}
    for (const key of ["arn", "resource_arn", "function_arn", "instance_id"] as const) {
      const v = props[key]
      if (typeof v === "string" && v) index.set(v, canon)
    }
  }
  return index
}

export function buildVisibleCanvasIds(
  scopedNodes: TopologyNode[],
  unscopedNodes: TopologyNode[],
  vpces: EdgeVpce[] = [],
): Set<string> {
  const visible = new Set<string>()
  for (const n of scopedNodes) visible.add(n.id)
  for (const n of unscopedNodes) visible.add(n.id)
  for (const v of vpces) visible.add(v.id)
  visible.add("__igw__")
  return visible
}

function resolveCanvasId(
  raw: string | null | undefined,
  index: Map<string, string>,
  visible: Set<string>,
): string | null {
  if (!raw || isPhantomId(raw)) return null
  const resolved = index.get(raw) ?? raw
  if (visible.has(resolved)) return resolved
  return null
}

function classifyEdgeClass(
  edgeType: string,
  targetId: string,
  nodeTypeById: Map<string, string | null>,
): TrafficEdgeClass {
  if (targetId === "__igw__") return "egress"
  const targetType = nodeTypeById.get(targetId)
  if (targetType && REGIONAL_NODE_TYPES.has(targetType)) return "edge_service"
  const T = edgeType.toUpperCase()
  if (
    T.includes("S3") ||
    T === "READS_FROM" ||
    T === "WRITES_TO" ||
    T === "ACCESSES_RESOURCE" ||
    T === "ACTUAL_API_CALL"
  ) {
    return "edge_service"
  }
  if (targetType === "RDS") return "database"
  return "internal"
}

function vpceForRegionalTarget(
  targetId: string,
  nodeTypeById: Map<string, string | null>,
  vpces: EdgeVpce[],
): { id: string; service_name: string | null } | null {
  const t = nodeTypeById.get(targetId)
  if (!t) return null
  const want =
    t === "S3" || t === "S3Bucket"
      ? ".s3"
      : t === "DynamoDB" || t === "DynamoDBTable"
        ? ".dynamodb"
        : null
  if (!want) return null
  for (const v of vpces) {
    const svc = v.service_name ?? ""
    if (svc.endsWith(want) && v.endpoint_type?.toLowerCase() === "gateway") {
      return { id: v.id, service_name: v.service_name }
    }
  }
  return null
}

function edgeKey(source: string, target: string, port: number | null, protocol: string | null): string {
  return `${source}::${target}::${port ?? ""}::${protocol ?? ""}`
}

function filterVisibleTrafficEdges(
  edges: TrafficEdge[],
  visible: Set<string>,
): TrafficEdge[] {
  return edges.filter(
    e => visible.has(e.source_id) && (visible.has(e.target_id) || e.target_id === "__igw__"),
  )
}

export function mergeTrafficEdges(
  primary: TrafficEdge[],
  secondary: TrafficEdge[],
): TrafficEdge[] {
  const seen = new Set<string>()
  const out: TrafficEdge[] = []
  for (const e of [...primary, ...secondary]) {
    const key = edgeKey(e.source_id, e.target_id, e.port, e.protocol)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

export function depMapEdgesToTrafficEdges(
  edges: DepMapEdgeLike[],
  visible: Set<string>,
  index: Map<string, string>,
  nodeTypeById: Map<string, string | null>,
  _vpces: EdgeVpce[] = [],
): TrafficEdge[] {
  const out: TrafficEdge[] = []
  const seen = new Set<string>()
  for (const e of edges) {
    const typeName = edgeTypeName(e)
    if (!ALL_ACCESS_EDGE_TYPES.has(typeName)) continue
    const src = resolveCanvasId(e.source, index, visible)
    const dst = resolveCanvasId(e.target, index, visible)
    if (!src || !dst) continue
    const edgeClass = classifyEdgeClass(typeName, dst, nodeTypeById)
    const port = normalizePort(e.port)
    const protocol = e.protocol != null ? String(e.protocol) : typeName
    const key = edgeKey(src, dst, port, protocol)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      source_id: src,
      target_id: dst,
      port,
      protocol,
      last_seen: e.last_seen ?? null,
      edge_class: edgeClass,
      external_destinations: null,
      via_vpce_id: null,
      via_vpce_service_name: null,
    })
  }
  return out
}

/** Union attack-path edges from IAP — same PathEdgeDetail rows the analyzer renders. */
export function attackPathEdgesToTrafficEdges(
  paths: IdentityAttackPath[],
  visible: Set<string>,
  index: Map<string, string>,
  nodeTypeById: Map<string, string | null>,
  vpces: EdgeVpce[] = [],
  materializationAvailable = false,
): TrafficEdge[] {
  const sourcePaths = materializationAvailable
    ? paths.filter(p => p.attack_path_id && p.materialized !== false)
    : paths.filter(p => p.materialized !== false)

  const out: TrafficEdge[] = []
  const seen = new Set<string>()
  for (const path of sourcePaths) {
    for (const e of path.edges ?? []) {
      const typeName = String(e.type ?? "").toUpperCase()
      if (IAM_PLUMBING_EDGE_TYPES.has(typeName)) continue
      const src = resolveCanvasId(e.source, index, visible)
      const dst = resolveCanvasId(e.target, index, visible)
      if (!src || !dst) continue
      const port = normalizePort(e.port)
      const protocol = e.protocol ?? e.type ?? null
      const key = edgeKey(src, dst, port, protocol)
      if (seen.has(key)) continue
      seen.add(key)
      const edgeClass = classifyEdgeClass(typeName, dst, nodeTypeById)
      const vpce =
        edgeClass === "edge_service" ? vpceForRegionalTarget(dst, nodeTypeById, vpces) : null
      out.push({
        source_id: src,
        target_id: dst,
        port,
        protocol,
        last_seen: null,
        edge_class: edgeClass,
        external_destinations: null,
        via_vpce_id: vpce?.id ?? null,
        via_vpce_service_name: vpce?.service_name ?? null,
        flow_highlight: "attack_path",
      })
    }
  }
  return out
}

export function selectEstateFlowEdges(opts: {
  mode: EstateFlowMode
  topologyTrafficEdges?: TrafficEdge[]
  depMapEdges?: DepMapEdgeLike[] | null
  attackPaths?: IdentityAttackPath[]
  materializationAvailable?: boolean
  /** Structural edges for `system_path` (from buildSystemArchitecturePath). */
  systemPathEdges?: TrafficEdge[]
  visible: Set<string>
  index: Map<string, string>
  nodeTypeById: Map<string, string | null>
  vpces?: EdgeVpce[]
}): TrafficEdge[] {
  const {
    mode,
    topologyTrafficEdges = [],
    depMapEdges,
    attackPaths = [],
    materializationAvailable = false,
    systemPathEdges = [],
    visible,
    index,
    nodeTypeById,
    vpces = [],
  } = opts

  if (mode === "off") return []

  if (mode === "system_path") {
    return systemPathEdges.filter(
      e =>
        (e.source_id === "__igw__" || visible.has(e.source_id))
        && (e.target_id === "__igw__" || visible.has(e.target_id)),
    )
  }

  if (mode === "attack_paths") {
    const attack = attackPathEdgesToTrafficEdges(
      attackPaths,
      visible,
      index,
      nodeTypeById,
      vpces,
      materializationAvailable,
    )
    if (attack.length > 0) return attack
    return filterVisibleTrafficEdges(topologyTrafficEdges, visible)
  }

  const visibleTopo = filterVisibleTrafficEdges(topologyTrafficEdges, visible)
  const depMapped = depMapEdges?.length
    ? depMapEdgesToTrafficEdges(depMapEdges, visible, index, nodeTypeById, vpces)
    : []

  return mergeTrafficEdges(visibleTopo, depMapped)
}
