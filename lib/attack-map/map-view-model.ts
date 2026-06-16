/**
 * View-model adapters: compiler Position IR → reference-style map nodes/edges.
 * Does not alter slot-mapper placement — only labels, icons, and layering.
 */
import {
  compressConstraintsForEdge,
  deriveMovementEdges,
  resolveTopologySlot,
  type AttackMapPayload,
  type Context,
  type DensityRules,
  type Fallback,
  type MovementEdge,
  type Position,
  type TopologyResource,
  type TopologySnapshot,
  type Verdict,
} from "./slot-mapper"

export type VisualNodeType =
  | "threat"
  | "alb"
  | "nat"
  | "compute"
  | "database"
  | "s3"
  | "kms"
  | "bastion"
  | "storage"
  | "identity"
  | "generic"

export interface MapViewNode {
  id: string
  label: string
  subLabel: string
  visualType: VisualNodeType
  x: number
  y: number
  onChain: boolean
  hopIndex?: number
  verdict?: Verdict
  isCrownJewel: boolean
  muted: boolean
  fallback?: Fallback
}

export interface ConstraintChipView {
  id: string
  x: number
  y: number
  label: string
  severity: string
}

export interface MapBounds {
  minX: number
  minY: number
  w: number
  h: number
}

export interface MapViewModel {
  nodes: MapViewNode[]
  movementEdges: MovementEdge[]
  constraintChips: ConstraintChipView[]
  bounds: MapBounds
  chainNodeIds: Set<string>
}

const CARD_W = 130
const CARD_H = 60

export function visualTypeFromNodeType(nodeType: string): VisualNodeType {
  switch (nodeType) {
    case "Internet":
    case "ExternalPrincipal":
      return "threat"
    case "ALB":
    case "NLB":
      return "alb"
    case "NAT":
    case "NATGateway":
      return "nat"
    case "EC2Instance":
    case "Lambda":
    case "ECSTask":
    case "EKSNode":
      return "compute"
    case "RDS":
    case "RDSInstance":
    case "Aurora":
    case "DynamoDBTable":
      return "database"
    case "S3Bucket":
      return "s3"
    case "KMSKey":
    case "Secret":
      return "kms"
    case "IAMRole":
    case "InstanceProfile":
    case "SecurityGroup":
      return "identity"
    case "EFS":
    case "EBS":
      return "storage"
    default:
      return "generic"
  }
}

export function shortNodeLabel(nodeId: string, nodeType: string, name?: string | null): string {
  if (name && name.length > 0 && name.length <= 22) return name
  if (nodeType === "Internet") return "Threat Source"
  if (nodeType === "IAMRole" || nodeType === "InstanceProfile") {
    const part = nodeId.split("/").pop() ?? nodeId
    return part.length > 22 ? `${part.slice(0, 10)}…${part.slice(-8)}` : part
  }
  if (nodeId.startsWith("arn:")) {
    const tail = nodeId.split(":").pop() ?? nodeId
    const last = tail.split("/").pop() ?? tail
    return last.length > 22 ? `${last.slice(0, 10)}…${last.slice(-8)}` : last
  }
  if (nodeId.startsWith("i-") || nodeId.startsWith("sg-")) {
    return nodeId.length > 20 ? `${nodeId.slice(0, 10)}…${nodeId.slice(-6)}` : nodeId
  }
  return nodeId.length > 22 ? `${nodeId.slice(0, 12)}…${nodeId.slice(-6)}` : nodeId
}

function shortSubLabel(nodeId: string, nodeType: string, name?: string | null): string {
  if (nodeType === "Internet") return "External ingress"
  if (nodeType === "EC2Instance" && nodeId.startsWith("i-")) return nodeId
  if (name && name !== shortNodeLabel(nodeId, nodeType, name)) {
    return name.length > 28 ? `${name.slice(0, 14)}…${name.slice(-10)}` : name
  }
  if (nodeId.startsWith("arn:")) {
    const svc = nodeId.split(":")[2] ?? "aws"
    return `${svc} resource`
  }
  return nodeType.replace(/([A-Z])/g, " $1").trim()
}

function posToCard(pos: Position): { x: number; y: number } {
  return { x: pos.x - CARD_W / 2, y: pos.y - CARD_H / 2 }
}

function backdropNodes(
  topology: TopologySnapshot,
  payload: AttackMapPayload,
  density: DensityRules,
  chainIds: Set<string>,
  constraintIds: Set<string>,
  placed: Set<string>,
): MapViewNode[] {
  const nodes: MapViewNode[] = []
  const ctx: Context = {
    topology,
    chain: payload.movement_chain,
    hop_index: -1,
    movement_edges: [],
    constraint_edges: [],
    density,
  }

  const addResource = (r: TopologyResource) => {
    if (chainIds.has(r.node_id) || constraintIds.has(r.node_id) || placed.has(r.node_id)) return
    const pos = resolveTopologySlot(
      {
        node_id: r.node_id,
        node_type: r.node_type,
        verdict: "NOT_OBSERVED",
        subnet_id: r.subnet_id,
        az: r.az,
      },
      ctx,
    )
    if (pos.fallback) return
    placed.add(r.node_id)
    const { x, y } = posToCard(pos)
    nodes.push({
      id: r.node_id,
      label: shortNodeLabel(r.node_id, r.node_type, r.name),
      subLabel: shortSubLabel(r.node_id, r.node_type, r.name),
      visualType: visualTypeFromNodeType(r.node_type),
      x,
      y,
      onChain: false,
      isCrownJewel: false,
      muted: true,
    })
  }

  for (const r of topology.resources) addResource(r)
  return nodes
}

function computeBounds(
  topology: TopologySnapshot,
  positions: Map<string, Position>,
  nodes: MapViewNode[],
): MapBounds {
  let minX = topology.vpc.x - 48
  let minY = topology.vpc.y - 96
  let maxX = topology.crown_jewel_column.x + CARD_W + 24
  let maxY = topology.drift_lane.y + topology.drift_lane.h + 72

  for (const p of positions.values()) {
    minX = Math.min(minX, p.x - CARD_W / 2 - 12)
    minY = Math.min(minY, p.y - CARD_H / 2 - 12)
    maxX = Math.max(maxX, p.x + CARD_W / 2 + 24)
    maxY = Math.max(maxY, p.y + CARD_H / 2 + 36)
  }
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + CARD_W + 8)
    maxY = Math.max(maxY, n.y + CARD_H + 8)
  }

  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

export function buildMapViewModel(
  payload: AttackMapPayload,
  topology: TopologySnapshot,
  positions: Map<string, Position>,
  density: DensityRules,
): MapViewModel {
  const chain = payload.movement_chain
  const chainIds = new Set(chain.map((h) => h.node_id))
  const constraintIds = new Set(payload.constraint_edges.map((c) => c.constraint_node_id))
  const placed = new Set<string>()
  const movementEdges = deriveMovementEdges(chain)

  const nodes: MapViewNode[] = backdropNodes(
    topology,
    payload,
    density,
    chainIds,
    constraintIds,
    placed,
  )

  chain.forEach((hop, idx) => {
    const pos = positions.get(hop.node_id)
    if (!pos) return
    const { x, y } = posToCard(pos)
    placed.add(hop.node_id)
    nodes.push({
      id: `${hop.node_id}::hop-${idx}`,
      label: shortNodeLabel(hop.node_id, hop.node_type),
      subLabel: shortSubLabel(hop.node_id, hop.node_type),
      visualType: visualTypeFromNodeType(hop.node_type),
      x,
      y,
      onChain: true,
      hopIndex: idx + 1,
      verdict: hop.verdict,
      isCrownJewel: Boolean(hop.is_crown_jewel || pos.anchor_kind === "jewel"),
      muted: false,
      fallback: pos.fallback,
    })
  })

  for (const jewel of topology.crown_jewels) {
    if (chainIds.has(jewel.node_id) || placed.has(jewel.node_id)) continue
    let pos = positions.get(jewel.node_id)
    if (!pos) {
      const offChainIdx = topology.crown_jewels.filter(
        (j) => !chainIds.has(j.node_id),
      ).indexOf(jewel)
      const chainJewelCount = chain.filter((h) => h.is_crown_jewel).length
      pos = {
        x: topology.crown_jewel_column.x,
        y:
          topology.crown_jewel_column.top_y +
          (offChainIdx + chainJewelCount) * topology.crown_jewel_column.row_height,
        layer: "L3_resource",
        z_index: 30,
        slot_id: `jewel.${jewel.node_id}`,
        anchor_kind: "jewel",
        placement_provenance: "hash",
      }
    }
    const { x, y } = posToCard(pos)
    placed.add(jewel.node_id)
    nodes.push({
      id: jewel.node_id,
      label: shortNodeLabel(jewel.node_id, jewel.node_type, jewel.name),
      subLabel: shortSubLabel(jewel.node_id, jewel.node_type, jewel.name),
      visualType: visualTypeFromNodeType(jewel.node_type),
      x,
      y,
      onChain: false,
      isCrownJewel: true,
      muted: true,
    })
  }

  const constraintChips: ConstraintChipView[] = []
  const now = new Date()
  movementEdges.forEach((edge, edgeIdx) => {
    const src = positions.get(edge.src)
    const dst = positions.get(edge.dst)
    if (!src || !dst) return
    const edgeKey = `${edge.src}→${edge.dst}`
    const compressed = compressConstraintsForEdge(
      edgeKey,
      payload.constraint_edges.filter((c) => c.gates_movement_edge === edgeKey),
      now,
    )
    compressed.visible.forEach((head, idx) => {
      const mx = (src.x + dst.x) / 2
      const my = (src.y + dst.y) / 2 - 14 + idx * 22
      constraintChips.push({
        id: `${edgeKey}-${head.node_type}-${idx}`,
        x: mx - 40,
        y: my - 10,
        label: `${head.node_type}${head.count > 1 ? ` ×${head.count}` : ""}${
          compressed.overflow > 0 && idx === 0 ? ` +${compressed.overflow}` : ""
        }`,
        severity: head.severity,
      })
    })
    void edgeIdx
  })

  const bounds = computeBounds(topology, positions, nodes)

  return {
    nodes,
    movementEdges,
    constraintChips,
    bounds,
    chainNodeIds: chainIds,
  }
}

export function chainPathD(
  chain: AttackMapPayload["movement_chain"],
  positions: Map<string, Position>,
): { d: string; length: number; points: Array<{ x: number; y: number }> } {
  const points = chain
    .map((h) => positions.get(h.node_id))
    .filter((p): p is Position => Boolean(p))
    .map((p) => ({ x: p.x, y: p.y }))

  if (points.length < 2) return { d: "", length: 0, points }

  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  return { d, length: Math.max(40, length), points }
}
