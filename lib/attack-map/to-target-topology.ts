/**
 * Adapter: real AttackMapPayload + TopologySnapshot  →  the clean
 * subnet-row × AZ-column shape the target map renderer expects.
 *
 * Real data only — every node/edge traces to a movement hop, a resource,
 * or a crown jewel in the live payload. No mock topology.
 */
import {
  deriveMovementEdges,
  type AttackMapPayload,
  type MovementHop,
  type TopologySnapshot,
  type Verdict,
} from "./slot-mapper"

export type TargetNodeType =
  | "threat"
  | "compute"
  | "lambda"
  | "database"
  | "s3"
  | "kms"
  | "iam"
  | "sg"
  | "nat"
  | "alb"
  | "igw"
  | "vpce"
  | "bastion"
  | "storage"

export type TargetTier = "public" | "private-app" | "private-data" | "external"
export type TargetLens = "reachability" | "lateral" | "exfiltration"

export interface TargetNode {
  id: string
  label: string
  subLabel: string
  type: TargetNodeType
  subnet: TargetTier
  az: string
  isCrownJewel?: boolean
  jewelTier?: string
  onPath: boolean
  verdict?: Verdict
  /** Sibling workload that shares the on-path IAM role (blast.shared_workloads). */
  sharedRoleHub?: boolean
}

export interface TargetEdge {
  id: string
  source: string
  target: string
  lens: TargetLens
  status: "allowed" | "drifted"
  evidence: "observed" | "allowed"
  label: string
}

export interface TargetConstraint {
  edgeId: string
  label: string
  type: string
}

export interface TargetTopology {
  nodes: TargetNode[]
  edges: TargetEdge[]
  constraints: TargetConstraint[]
  gaps: { label: string; status: string }[]
  system: string
  score: number
  jewelsReachable: number
  /** Role-hub fan-out count — prefer role_reachable_jewels when backend provides it. */
  roleJewelCount: number
  /** Lateral-movement blast surface — other workloads that share the on-path role. */
  sharedWorkloads: string[]
}

const EXTERNAL_TYPES = new Set([
  "S3Bucket",
  "KMSKey",
  "DynamoDBTable",
  "IAMRole",
  "InstanceProfile",
  "Internet",
  "ExternalPrincipal",
  "Secret",
])
const DB_TYPES = new Set(["RDS", "RDSInstance", "DynamoDBTable", "Aurora"])

function nodeType(t: string): TargetNodeType {
  switch (t) {
    case "EC2Instance":
    case "ECSTask":
      return "compute"
    case "Lambda":
    case "LambdaFunction":
      return "lambda"
    case "RDS":
    case "RDSInstance":
    case "Aurora":
      return "database"
    case "DynamoDBTable":
      return "database"
    case "S3Bucket":
      return "s3"
    case "KMSKey":
      return "kms"
    case "IAMRole":
    case "InstanceProfile":
      return "iam"
    case "SecurityGroup":
      return "sg"
    case "NAT":
    case "NATGateway":
      return "nat"
    case "ALB":
    case "LoadBalancer":
      return "alb"
    case "InternetGateway":
    case "IGW":
      return "igw"
    case "VPCE":
    case "VPCEndpoint":
      return "vpce"
    case "Internet":
    case "ExternalPrincipal":
      return "threat"
    default:
      return "compute"
  }
}

/** Friendly display name — never the raw AROA…/arn principal id. */
function friendly(nodeId: string, type: string, name?: string | null): string {
  if (name && name.length > 0 && !/^AROA[A-Z0-9]+$/.test(name)) return name
  if (type === "Internet") return "Internet"
  if (nodeId.startsWith("arn:")) {
    const tail = nodeId.split(":").pop() ?? nodeId
    const seg = tail.split("/").pop() ?? tail
    if (/^AROA[A-Z0-9]+$/.test(seg)) return "IAM Role"
    return seg
  }
  const seg = nodeId.split("/").pop() ?? nodeId
  if (/^AROA[A-Z0-9]+$/.test(seg)) return "IAM Role"
  return seg
}

function shortId(nodeId: string): string {
  if (nodeId.startsWith("arn:")) {
    const tail = nodeId.split(":").pop() ?? nodeId
    return tail.split("/").pop() ?? tail
  }
  return nodeId.length > 20 ? `${nodeId.slice(0, 12)}…${nodeId.slice(-5)}` : nodeId
}

function jewelTier(score: number): string {
  if (score >= 70) return "CRITICAL"
  if (score >= 55) return "HIGH"
  if (score >= 40) return "MEDIUM"
  return "LOW"
}

export function toTargetTopology(
  payload: AttackMapPayload,
  topology: TopologySnapshot,
): TargetTopology {
  // distinct AZs → AZ 1/2/3 columns (stable, sorted)
  const azSet = new Set<string>()
  for (const r of topology.resources) if (r.az) azSet.add(r.az)
  for (const h of payload.movement_chain) if (h.az) azSet.add(h.az)
  const azList = [...azSet].sort()
  const azLabel = (az?: string): string => {
    if (!az) return "External"
    const i = azList.indexOf(az)
    return i >= 0 ? `AZ ${i + 1}` : "External"
  }

  const tierFor = (nodeType_: string, subnetId?: string): TargetTier => {
    if (EXTERNAL_TYPES.has(nodeType_)) return "external"
    const sub = subnetId ? topology.subnets[subnetId] : undefined
    if (!sub) return DB_TYPES.has(nodeType_) ? "private-data" : "public"
    if (sub.kind === "public") return "public"
    return DB_TYPES.has(nodeType_) ? "private-data" : "private-app"
  }

  const chainIds = new Set(payload.movement_chain.map((h) => h.node_id))
  // resolve friendly names for chain hops (hops carry no name) from resources/jewels
  const nameById = new Map<string, string | null>(topology.resources.map((r) => [r.node_id, r.name]))
  for (const j of topology.crown_jewels) if (!nameById.has(j.node_id)) nameById.set(j.node_id, j.name)
  const nodeMap = new Map<string, TargetNode>()

  const addNode = (
    nodeId: string,
    type: string,
    name: string | null | undefined,
    az: string | undefined,
    subnetId: string | undefined,
    onPath: boolean,
    isJewel: boolean,
    verdict?: Verdict,
    sharedRoleHub = false,
  ) => {
    if (nodeMap.has(nodeId)) {
      const existing = nodeMap.get(nodeId)!
      if (onPath) existing.onPath = true
      if (sharedRoleHub) existing.sharedRoleHub = true
      return
    }
    nodeMap.set(nodeId, {
      id: nodeId,
      label: friendly(nodeId, type, name),
      subLabel: shortId(nodeId),
      type: nodeType(type),
      subnet: tierFor(type, subnetId),
      az: isJewel || EXTERNAL_TYPES.has(type) ? "External" : azLabel(az),
      isCrownJewel: isJewel,
      jewelTier: isJewel ? jewelTier(payload.score) : undefined,
      onPath,
      verdict,
      sharedRoleHub: sharedRoleHub || undefined,
    })
  }

  // 1. on-path hops (the spine)
  for (const h of payload.movement_chain as MovementHop[]) {
    addNode(h.node_id, h.node_type, nameById.get(h.node_id), h.az, h.subnet_id, true, Boolean(h.is_crown_jewel), h.verdict)
  }
  // 2. crown jewels ON THIS PATH only — adding all 14 floods the regional column.
  for (const j of topology.crown_jewels) {
    if (!chainIds.has(j.node_id)) continue
    addNode(j.node_id, j.node_type, j.name, undefined, undefined, true, true)
  }
  // 3. sibling workloads for context (compute/db only, capped)
  let ctx = 0
  for (const r of topology.resources) {
    if (nodeMap.has(r.node_id)) continue
    const tnt = nodeType(r.node_type)
    if (tnt !== "compute" && tnt !== "lambda" && tnt !== "database") continue
    if (ctx >= 2) break
    addNode(r.node_id, r.node_type, r.name, r.az, r.subnet_id, false, false, "NOT_OBSERVED")
    ctx += 1
  }
  // 4. blast.shared_workloads — explicit siblings on the same IAM role hub
  const sharedNames = payload.blast?.shared_workloads ?? []
  for (const wName of sharedNames) {
    const match = topology.resources.find(
      (r) => r.name === wName || (r.name && wName.includes(r.name)) || r.node_id.includes(wName),
    )
    if (match) {
      addNode(match.node_id, match.node_type, match.name, match.az, match.subnet_id, false, false, "ALLOWED", true)
    }
  }

  // edges from consecutive hops
  const movement = deriveMovementEdges(payload.movement_chain)
  const edges: TargetEdge[] = movement.map((e) => {
    const srcType = payload.movement_chain[e.src_index]?.node_type ?? ""
    const dstHop = payload.movement_chain[e.dst_index]
    const lens: TargetLens = dstHop?.is_crown_jewel
      ? "reachability"
      : srcType === "IAMRole" || srcType === "InstanceProfile"
        ? "lateral"
        : EXTERNAL_TYPES.has(srcType) && srcType !== "IAMRole"
          ? "exfiltration"
          : "reachability"
    const ev = dstHop?.verdict === "SEEN" || dstHop?.verdict === "ENTRY" ? "observed" : "allowed"
    return {
      id: `${e.src}__${e.dst}`,
      source: e.src,
      target: e.dst,
      lens,
      status: ev === "allowed" ? "drifted" : "allowed",
      evidence: ev,
      label: "movement",
    }
  })

  const constraints: TargetConstraint[] = payload.constraint_edges.map((c) => ({
    edgeId: c.gates_movement_edge.replace("→", "__"),
    label: c.constraint_node_type,
    type: c.constraint_node_type.toLowerCase(),
  }))

  const gaps = (payload.collection_gaps ?? []).map((g) => ({ label: g, status: "MEDIUM" }))

  const roleJewels = payload.blast?.role_reachable_jewels ?? []
  const roleJewelCount = roleJewels.length > 0 ? roleJewels.length : (payload.blast?.crown_jewels_reachable ?? 0)

  return {
    nodes: [...nodeMap.values()],
    edges,
    constraints,
    gaps,
    system: payload.system ?? topology.system,
    score: payload.score,
    jewelsReachable: payload.blast?.crown_jewels_reachable ?? 0,
    roleJewelCount,
    sharedWorkloads: sharedNames,
  }
}
