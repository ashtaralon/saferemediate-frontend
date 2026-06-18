/**
 * 3-D slot mapper — path-centric kill-chain layout with topology-aware offsets.
 *
 * Axes (map_detailed_plan.md §4.1):
 *   X — network progression along the attack chain
 *   Y — identity plane (roles / SG above workloads)
 *   Z — data depth (deeper toward crown jewels)
 */

import {
  deriveMovementEdges,
  layoutPayload,
  type AttackMapPayload,
  type DensityRules,
  type MovementHop,
  type Position,
  type TopologySnapshot,
  type Verdict,
} from "./slot-mapper"
import {
  shortNodeLabel,
  visualTypeFromNodeType,
  type VisualNodeType,
} from "./map-view-model"

export interface Node3D {
  id: string
  x: number
  y: number
  z: number
  label: string
  nodeType: string
  visualType: VisualNodeType
  verdict: Verdict
  hopIndex: number
  onChain: boolean
  isCrownJewel: boolean
  riskScore: number
  accentColor: string
  layer: Position["layer"]
}

export interface Edge3D {
  id: string
  source: string
  target: string
  kind: "movement" | "constraint"
  onPath: boolean
  verdict?: Verdict
}

export interface Scene3DBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface AttackMapScene3D {
  nodes: Node3D[]
  edges: Edge3D[]
  bounds: Scene3DBounds
  pathNodeIds: string[]
  center: { x: number; y: number; z: number }
  /** Recommended camera distance from scene center */
  cameraDistance: number
}

const HOP_SPACING_X = 4.4
const HOP_SPACING_Z = 2.6
const TOPOLOGY_NUDGE = 0.018

const IDENTITY_TYPES = new Set([
  "IAMRole",
  "IAMUser",
  "InstanceProfile",
  "STS",
  "OktaUser",
  "AzureADUser",
  "SecurityGroup",
])

export function nodeAccentColor(visualType: VisualNodeType, isCrownJewel: boolean): string {
  if (isCrownJewel) return "#f59e0b"
  switch (visualType) {
    case "threat":
      return "#fb7185"
    case "alb":
      return "#22d3ee"
    case "nat":
      return "#64748b"
    case "compute":
      return "#94a3b8"
    case "database":
      return "#fbbf24"
    case "s3":
      return "#a78bfa"
    case "kms":
      return "#34d399"
    case "bastion":
      return "#818cf8"
    case "identity":
      return "#60a5fa"
    default:
      return "#cbd5e1"
  }
}

function elevationForHop(hop: MovementHop, visualType: VisualNodeType): number {
  if (IDENTITY_TYPES.has(hop.node_type) || visualType === "identity") return 3.4
  if (visualType === "threat") return 0.15
  if (visualType === "alb" || visualType === "nat") return 1.4
  if (hop.is_crown_jewel) return 1.8
  if (visualType === "s3" || visualType === "database" || visualType === "kms") return 1.2
  return 0.55
}

function depthForHop(hop: MovementHop, hopIndex: number, chainLen: number): number {
  const progress = chainLen <= 1 ? 0 : hopIndex / (chainLen - 1)
  let z = hopIndex * HOP_SPACING_Z
  if (hop.is_crown_jewel) z += 2.4
  if (hop.node_type === "KMSKey" || hop.node_type === "Secret") z += 1.2
  if (hop.node_type === "Internet" || hop.node_type === "ExternalPrincipal") z = -0.8
  // Slight arc so the path reads as a staircase, not a flat line
  z += Math.sin(progress * Math.PI) * 0.6
  return z
}

function riskFromHop(hop: MovementHop, pathScore: number): number {
  if (hop.is_crown_jewel) return Math.min(100, pathScore + 15)
  switch (hop.verdict) {
    case "ENTRY":
      return 72
    case "ALLOWED":
      return 58
    case "SEEN":
      return 44
    case "BLOCKED":
      return 22
    default:
      return 36
  }
}

function topologyNudge(
  hop: MovementHop,
  hopIndex: number,
  positions2d: Map<string, Position>,
  centerX: number,
): { dx: number; dz: number } {
  const pos = positions2d.get(hop.node_id)
  if (!pos) return { dx: 0, dz: 0 }
  const dx = (pos.x - centerX) * TOPOLOGY_NUDGE
  const dz = (pos.y - 300) * TOPOLOGY_NUDGE * 0.35
  // Keep nudge small so path order stays readable
  const damp = 1 - hopIndex * 0.04
  return { dx: dx * damp, dz: dz * damp }
}

function computeBounds(nodes: Node3D[]): Scene3DBounds {
  if (nodes.length === 0) {
    return { minX: -6, maxX: 6, minY: -1, maxY: 5, minZ: -2, maxZ: 10 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y)
    maxY = Math.max(maxY, n.y)
    minZ = Math.min(minZ, n.z)
    maxZ = Math.max(maxZ, n.z)
  }
  const pad = 3
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  }
}

function layoutChainNodes(
  payload: AttackMapPayload,
  positions2d: Map<string, Position>,
  centerX: number,
): Node3D[] {
  const chain = payload.movement_chain
  const n = chain.length
  const xStart = -((n - 1) * HOP_SPACING_X) / 2

  return chain.map((hop, hopIndex) => {
    const visualType = visualTypeFromNodeType(hop.node_type)
    const nudge = topologyNudge(hop, hopIndex, positions2d, centerX)
    const pos2d = positions2d.get(hop.node_id)

    return {
      id: hop.node_id,
      x: xStart + hopIndex * HOP_SPACING_X + nudge.dx,
      y: elevationForHop(hop, visualType),
      z: depthForHop(hop, hopIndex, n) + nudge.dz,
      label: shortNodeLabel(hop.node_id, hop.node_type),
      nodeType: hop.node_type,
      visualType,
      verdict: hop.verdict,
      hopIndex,
      onChain: true,
      isCrownJewel: Boolean(hop.is_crown_jewel),
      riskScore: riskFromHop(hop, payload.score),
      accentColor: nodeAccentColor(visualType, Boolean(hop.is_crown_jewel)),
      layer: pos2d?.layer ?? "L5_movement",
    }
  })
}

/**
 * Build a 3-D scene from compiler payload + topology.
 * Primary layout: readable kill-chain staircase; topology nudges preserve VPC context.
 */
export function layoutPayload3D(
  payload: AttackMapPayload,
  topology: TopologySnapshot,
  density: DensityRules,
  prior2d?: Map<string, Position>,
): AttackMapScene3D {
  const positions2d = layoutPayload(payload, topology, density, prior2d)
  const pathNodeIds = payload.movement_chain.map((h) => h.node_id)
  const chainIds = new Set(pathNodeIds)

  const xs = [...positions2d.values()].map((p) => p.x)
  const centerX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

  const nodes = layoutChainNodes(payload, positions2d, centerX)

  for (const c of payload.constraint_edges) {
    if (nodes.some((n) => n.id === c.constraint_node_id)) continue
    const pos = positions2d.get(c.constraint_node_id)
    if (!pos) continue

    let x = 0
    let y = 2.2
    let z = 1
    if (c.gates_movement_edge?.includes("→")) {
      const [src, dst] = c.gates_movement_edge.split("→")
      const a = nodes.find((n) => n.id === src.trim())
      const b = nodes.find((n) => n.id === dst.trim())
      if (a && b) {
        x = (a.x + b.x) / 2
        y = Math.max(a.y, b.y) + 1.6
        z = (a.z + b.z) / 2
      }
    }

    const visualType = visualTypeFromNodeType(c.constraint_node_type)
    nodes.push({
      id: c.constraint_node_id,
      x,
      y,
      z,
      label: c.constraint_node_type,
      nodeType: c.constraint_node_type,
      visualType,
      verdict: c.verdict,
      hopIndex: -1,
      onChain: false,
      isCrownJewel: c.appears_as === "terminus",
      riskScore: c.severity === "critical" ? 90 : c.severity === "high" ? 70 : 45,
      accentColor: nodeAccentColor(visualType, c.appears_as === "terminus"),
      layer: pos.layer,
    })
  }

  const movement = deriveMovementEdges(payload.movement_chain)
  const edges: Edge3D[] = movement.map((e, i) => {
    const srcHop = payload.movement_chain[i]
    return {
      id: `${e.src}→${e.dst}`,
      source: e.src,
      target: e.dst,
      kind: "movement",
      onPath: chainIds.has(e.src) && chainIds.has(e.dst),
      verdict: srcHop?.verdict,
    }
  })

  for (const c of payload.constraint_edges) {
    if (!c.gates_movement_edge?.includes("→")) continue
    const [src, dst] = c.gates_movement_edge.split("→")
    edges.push({
      id: `c:${c.constraint_node_id}:${src}→${dst}`,
      source: src.trim(),
      target: dst.trim(),
      kind: "constraint",
      onPath: true,
      verdict: c.verdict,
    })
  }

  const bounds = computeBounds(nodes)
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  }
  const span = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    8,
  )

  return {
    nodes,
    edges,
    bounds,
    pathNodeIds,
    center,
    cameraDistance: span * 0.95 + 6,
  }
}

export function riskColor(score: number): string {
  if (score >= 75) return "#ef4444"
  if (score >= 55) return "#f97316"
  if (score >= 35) return "#eab308"
  return "#22c55e"
}

export function verdictEdgeColor(verdict?: Verdict): string {
  switch (verdict) {
    case "ENTRY":
      return "#38bdf8"
    case "SEEN":
      return "#22d3ee"
    case "ALLOWED":
      return "#fb923c"
    case "BLOCKED":
      return "#f87171"
    default:
      return "#64748b"
  }
}
