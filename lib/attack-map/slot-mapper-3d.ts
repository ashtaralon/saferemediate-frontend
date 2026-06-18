/**
 * 3-D slot mapper — extends deterministic 2-D positions into (x, y, z) world space.
 *
 * Axes (map_detailed_plan.md §4.1):
 *   X — network plane (VPC → subnet → group), from slot-mapper x
 *   Y — identity plane (IAM strips above workloads)
 *   Z — data sensitivity depth (path progression + crown jewels)
 */

import {
  deriveMovementEdges,
  layoutPayload,
  type AttackMapPayload,
  type DensityRules,
  type MovementHop,
  type Position,
  type TopologySnapshot,
} from "./slot-mapper"
import { shortNodeLabel, visualTypeFromNodeType, type VisualNodeType } from "./map-view-model"

export interface Node3D {
  id: string
  x: number
  y: number
  z: number
  label: string
  nodeType: string
  visualType: VisualNodeType
  hopIndex: number
  onChain: boolean
  isCrownJewel: boolean
  riskScore: number
  layer: Position["layer"]
}

export interface Edge3D {
  id: string
  source: string
  target: string
  kind: "movement" | "constraint"
  onPath: boolean
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
}

const WORLD_SCALE = 0.028
const IDENTITY_LIFT = 2.8
const HOP_DEPTH = 1.35
const JEWEL_DEPTH_BONUS = 2.2

const IDENTITY_TYPES = new Set([
  "IAMRole",
  "IAMUser",
  "InstanceProfile",
  "STS",
  "OktaUser",
  "AzureADUser",
  "SecurityGroup",
])

function dataDepth(hop: MovementHop, hopIndex: number): number {
  let z = hopIndex * HOP_DEPTH
  if (hop.is_crown_jewel) z += JEWEL_DEPTH_BONUS
  if (hop.node_type === "KMSKey" || hop.node_type === "Secret") z += 1.5
  if (hop.node_type === "S3Bucket" || hop.node_type.includes("RDS")) z += 1
  if (hop.node_type === "Internet" || hop.node_type === "ExternalPrincipal") z = -1.2
  return z
}

function identityElevation(pos: Position, nodeType: string): number {
  if (pos.layer === "L4_identity" || pos.anchor_kind === "strip") return IDENTITY_LIFT
  if (IDENTITY_TYPES.has(nodeType)) return IDENTITY_LIFT * 0.65
  if (pos.layer === "L6_constraint") return 0.6
  return 0
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

function computeBounds(nodes: Node3D[]): Scene3DBounds {
  if (nodes.length === 0) {
    return { minX: -4, maxX: 4, minY: -1, maxY: 4, minZ: -2, maxZ: 8 }
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
  const pad = 2.5
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  }
}

/**
 * Build a 3-D scene from compiler payload + topology using the 2-D slot mapper as ground truth.
 */
export function layoutPayload3D(
  payload: AttackMapPayload,
  topology: TopologySnapshot,
  density: DensityRules,
  prior2d?: Map<string, Position>,
): AttackMapScene3D {
  const positions2d = layoutPayload(payload, topology, density, prior2d)
  const chainIds = new Set(payload.movement_chain.map((h) => h.node_id))
  const pathNodeIds = payload.movement_chain.map((h) => h.node_id)

  const xs = [...positions2d.values()].map((p) => p.x)
  const centerX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

  const nodes: Node3D[] = []

  payload.movement_chain.forEach((hop, hopIndex) => {
    const pos = positions2d.get(hop.node_id)
    if (!pos) return
    const x = (pos.x - centerX) * WORLD_SCALE
    const y = identityElevation(pos, hop.node_type)
    const z = dataDepth(hop, hopIndex)
    nodes.push({
      id: hop.node_id,
      x,
      y,
      z,
      label: shortNodeLabel(hop.node_id, hop.node_type),
      nodeType: hop.node_type,
      visualType: visualTypeFromNodeType(hop.node_type),
      hopIndex,
      onChain: true,
      isCrownJewel: Boolean(hop.is_crown_jewel),
      riskScore: riskFromHop(hop, payload.score),
      layer: pos.layer,
    })
  })

  for (const c of payload.constraint_edges) {
    if (nodes.some((n) => n.id === c.constraint_node_id)) continue
    const pos = positions2d.get(c.constraint_node_id)
    if (!pos) continue
    nodes.push({
      id: c.constraint_node_id,
      x: (pos.x - centerX) * WORLD_SCALE,
      y: identityElevation(pos, c.constraint_node_type) + 0.5,
      z: 0.8,
      label: c.constraint_node_type,
      nodeType: c.constraint_node_type,
      visualType: visualTypeFromNodeType(c.constraint_node_type),
      hopIndex: -1,
      onChain: false,
      isCrownJewel: c.appears_as === "terminus",
      riskScore: c.severity === "critical" ? 90 : c.severity === "high" ? 70 : 45,
      layer: pos.layer,
    })
  }

  const movement = deriveMovementEdges(payload.movement_chain)
  const edges: Edge3D[] = movement.map((e) => ({
    id: `${e.src}→${e.dst}`,
    source: e.src,
    target: e.dst,
    kind: "movement",
    onPath: chainIds.has(e.src) && chainIds.has(e.dst),
  }))

  for (const c of payload.constraint_edges) {
    if (!c.gates_movement_edge?.includes("→")) continue
    const [src, dst] = c.gates_movement_edge.split("→")
    edges.push({
      id: `c:${c.constraint_node_id}:${src}→${dst}`,
      source: src.trim(),
      target: dst.trim(),
      kind: "constraint",
      onPath: true,
    })
  }

  const bounds = computeBounds(nodes)
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  }

  return { nodes, edges, bounds, pathNodeIds, center }
}

export function riskColor(score: number): string {
  if (score >= 75) return "#ef4444"
  if (score >= 55) return "#f97316"
  if (score >= 35) return "#eab308"
  return "#22c55e"
}
