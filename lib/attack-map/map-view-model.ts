/**
 * View-model adapters: compiler payload → path-only presentation layout.
 *
 * Slot-mapper positions are NOT used for rendering — only hop order, verdicts,
 * and constraint edges from the compiler. Cards are laid out linearly 1→N so
 * only the selected attack path is visible (no VPC/subnet/jewel backdrop).
 */
import {
  compressConstraintsForEdge,
  deriveMovementEdges,
  type AttackMapPayload,
  type DensityRules,
  type Fallback,
  type MovementEdge,
  type Position,
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

export interface ChainStepView {
  hopIndex: number
  nodeId: string
  label: string
  nodeType: string
  verdict: Verdict
  isCrownJewel: boolean
}

export interface MapViewModel {
  nodes: MapViewNode[]
  movementEdges: MovementEdge[]
  constraintChips: ConstraintChipView[]
  bounds: MapBounds
  chainNodeIds: Set<string>
  chainSteps: ChainStepView[]
  spinePoints: Array<{ x: number; y: number }>
  spineLength: number
  spinePath: string
}

const CARD_W = 130
const CARD_H = 60
const HOP_STEP = CARD_W + 56
const PAD = 40
const ROW_H = 160

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

function hopSubLabel(
  hop: AttackMapPayload["movement_chain"][number],
  positions: Map<string, Position>,
): string {
  if (hop.node_type === "Internet") return "External ingress"
  const parts: string[] = []
  if (hop.az) parts.push(hop.az.toUpperCase())
  if (hop.subnet_id) parts.push(`subnet …${hop.subnet_id.slice(-6)}`)
  const pos = positions.get(hop.node_id)
  if (pos?.fallback) parts.push(pos.fallback.replace(/_/g, " "))
  if (parts.length > 0) return parts.join(" · ")
  return hop.node_type.replace(/([A-Z])/g, " $1").trim()
}

/** Linear 1→N layout — one path, no topology chrome. Wraps to a second row after 5 hops. */
function layoutPathCenters(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return []
  const perRow = count <= 5 ? count : Math.ceil(count / 2)
  const centers: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const row = count <= 5 ? 0 : Math.floor(i / perRow)
    const col = count <= 5 ? i : i % perRow
    const rowCount = row === 0 ? perRow : count - perRow
    const rowWidth = (rowCount - 1) * HOP_STEP
    const startX = PAD + CARD_W / 2 + Math.max(0, (perRow - 1) * HOP_STEP - rowWidth) / 2
    centers.push({
      x: startX + col * HOP_STEP,
      y: PAD + CARD_H / 2 + 48 + row * ROW_H,
    })
  }
  return centers
}

function buildSpine(centers: Array<{ x: number; y: number }>): {
  path: string
  length: number
  points: Array<{ x: number; y: number }>
} {
  if (centers.length < 2) return { path: "", length: 0, points: centers }
  let length = 0
  for (let i = 1; i < centers.length; i++) {
    const dx = centers[i].x - centers[i - 1].x
    const dy = centers[i].y - centers[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }
  const path = centers.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  return { path, length: Math.max(40, length), points: centers }
}

function boundsFromCenters(centers: Array<{ x: number; y: number }>): MapBounds {
  if (centers.length === 0) {
    return { minX: 0, minY: 0, w: 480, h: 220 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of centers) {
    minX = Math.min(minX, c.x - CARD_W / 2 - PAD)
    minY = Math.min(minY, c.y - CARD_H / 2 - PAD)
    maxX = Math.max(maxX, c.x + CARD_W / 2 + PAD)
    maxY = Math.max(maxY, c.y + CARD_H / 2 + PAD)
  }
  return {
    minX: 0,
    minY: 0,
    w: Math.max(maxX + PAD, 480),
    h: Math.max(maxY + PAD, 200),
  }
}

export function buildMapViewModel(
  payload: AttackMapPayload,
  _topology: TopologySnapshot,
  positions: Map<string, Position>,
  _density: DensityRules,
): MapViewModel {
  const chain = payload.movement_chain
  const chainIds = new Set(chain.map((h) => h.node_id))
  const movementEdges = deriveMovementEdges(chain)
  const centers = layoutPathCenters(chain.length)
  const spine = buildSpine(centers)

  const nodes: MapViewNode[] = []
  const chainSteps: ChainStepView[] = []

  chain.forEach((hop, idx) => {
    const center = centers[idx]
    if (!center) return
    const pos = positions.get(hop.node_id)
    const label = shortNodeLabel(hop.node_id, hop.node_type)
    nodes.push({
      id: `${hop.node_id}::hop-${idx}`,
      label,
      subLabel: hopSubLabel(hop, positions),
      visualType: visualTypeFromNodeType(hop.node_type),
      x: center.x - CARD_W / 2,
      y: center.y - CARD_H / 2,
      onChain: true,
      hopIndex: idx + 1,
      verdict: hop.verdict,
      isCrownJewel: Boolean(hop.is_crown_jewel || pos?.anchor_kind === "jewel"),
      muted: false,
      fallback: pos?.fallback,
    })
    chainSteps.push({
      hopIndex: idx + 1,
      nodeId: hop.node_id,
      label,
      nodeType: hop.node_type,
      verdict: hop.verdict,
      isCrownJewel: Boolean(hop.is_crown_jewel),
    })
  })

  const constraintChips: ConstraintChipView[] = []
  const now = new Date()
  movementEdges.forEach((edge) => {
    const srcIdx = chain.findIndex((h) => h.node_id === edge.src)
    const dstIdx = chain.findIndex((h) => h.node_id === edge.dst)
    const src = centers[srcIdx]
    const dst = centers[dstIdx]
    if (!src || !dst) return
    const edgeKey = `${edge.src}→${edge.dst}`
    const compressed = compressConstraintsForEdge(
      edgeKey,
      payload.constraint_edges.filter((c) => c.gates_movement_edge === edgeKey),
      now,
    )
    compressed.visible.forEach((head, idx) => {
      constraintChips.push({
        id: `${edgeKey}-${head.node_type}-${idx}`,
        x: (src.x + dst.x) / 2 - 40,
        y: (src.y + dst.y) / 2 - 28 + idx * 22,
        label: `${head.node_type}${head.count > 1 ? ` ×${head.count}` : ""}${
          compressed.overflow > 0 && idx === 0 ? ` +${compressed.overflow}` : ""
        }`,
        severity: head.severity,
      })
    })
  })

  const bounds = boundsFromCenters(centers)

  return {
    nodes,
    movementEdges,
    constraintChips,
    bounds,
    chainNodeIds: chainIds,
    chainSteps,
    spinePoints: spine.points,
    spineLength: spine.length,
    spinePath: spine.path,
  }
}

/** @deprecated use MapViewModel.spinePath — kept for tests importing chainPathD */
export function chainPathD(
  chain: AttackMapPayload["movement_chain"],
  positions: Map<string, Position>,
): { d: string; length: number; points: Array<{ x: number; y: number }> } {
  const centers = layoutPathCenters(chain.length)
  const spine = buildSpine(centers)
  void positions
  return { d: spine.path, length: spine.length, points: spine.points }
}

export function fitScaleForViewport(
  bounds: MapBounds,
  viewportW: number,
  viewportH: number,
): number {
  if (viewportW <= 0 || viewportH <= 0) return 1
  const sx = viewportW / bounds.w
  const sy = viewportH / bounds.h
  return Math.min(sx, sy, 1.5)
}
