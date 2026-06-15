/**
 * ContainmentModel → React Flow layout.
 * Tries flat ELK (fast); falls back to builder coordinates so the map never hangs.
 */

import type { Edge, Node } from "reactflow"
import { MarkerType, Position } from "reactflow"
import ELK from "elkjs/lib/elk.bundled.js"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { CMCard, CMEdge, CMFrame, ContainmentModel } from "./containment-model"
import type { ContainerKind } from "./cloud-graph-nodes"
import type { FlowEdgeData } from "./cloud-graph-edges"
import type { ContainmentViewMode } from "./build-containment-from-architecture"

const elk = new ELK()
const ELK_TIMEOUT_MS = 3000

const ELK_FLAT_OPTS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "56",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.edgeNodeBetweenLayers": "20",
  "elk.padding": "[top=24,left=24,bottom=24,right=24]",
}

function cardVariant(card: CMCard): "protagonist" | "standard" | "chip" {
  if (card.badge === "FOOTHOLD" || card.badge === "CROWN JEWEL") return "protagonist"
  if (card.cat === "security" && card.onPath) return "protagonist"
  if (card.cat === "network" && !/gateway|igw/i.test(card.title) && card.h <= 36) return "chip"
  if (card.cat === "network" && !card.onPath) return "chip"
  return "standard"
}

function cardDimensions(card: CMCard): { w: number; h: number } {
  const v = cardVariant(card)
  if (v === "chip") return { w: 168, h: 44 }
  if (v === "protagonist") return { w: 240, h: 76 }
  return { w: 220, h: 68 }
}

function cardTypeLabel(card: CMCard): string {
  if (card.badge === "FOOTHOLD") return "EC2 · FOOTHOLD"
  if (card.badge === "CROWN JEWEL") return "S3 · CROWN JEWEL"
  if (card.badge === "ENCRYPTS") return "KMS KEY"
  if (card.cat === "user") return "USER / INTERNET"
  if (/gateway|igw/i.test(card.title)) return "INTERNET GATEWAY"
  if (card.sub === "NACL") return "NACL"
  if (/security group/i.test(card.sub ?? "")) return "SECURITY GROUP"
  if (card.cat === "security") return "IAM ROLE"
  if (card.cat === "compute") return "EC2"
  if (card.cat === "storage") return "STORAGE"
  if (card.cat === "network") return "NETWORK"
  return "RESOURCE"
}

function frameContains(outer: CMFrame, inner: { x: number; y: number; w: number; h: number }): boolean {
  const cx = inner.x + inner.w / 2
  const cy = inner.y + inner.h / 2
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h
}

function findParentFrameId(card: CMCard, frames: CMFrame[]): string | null {
  for (const kind of ["subnet", "az", "vpc", "region", "cloud"] as const) {
    const match = frames.find((f) => f.kind === kind && frameContains(f, card))
    if (match) return match.id
  }
  return null
}

function frameParentId(frame: CMFrame, frames: CMFrame[]): string | undefined {
  const order: CMFrame["kind"][] = ["subnet", "az", "vpc", "region", "cloud"]
  const idx = order.indexOf(frame.kind)
  for (let i = idx + 1; i < order.length; i++) {
    const parent = frames.find((p) => p.kind === order[i] && frameContains(p, frame))
    if (parent) return parent.id
  }
  return undefined
}

function resolveCardEndpoint(id: string | undefined, cards: CMCard[]): string | undefined {
  if (!id) return undefined
  if (cards.some((c) => c.id === id)) return id
  return id
}

export function orderPathFlowEdges(
  path: IdentityAttackPath,
  edges: CMEdge[],
  cardIds: Set<string>,
): { edgeId: string; step: number }[] {
  const pathLayer = edges.filter((e) => e.layer === "path" && e.sourceId && e.targetId)
  const byPair = new Map<string, CMEdge>()
  for (const e of pathLayer) {
    byPair.set(`${e.sourceId}→${e.targetId}`, e)
  }

  const ordered: CMEdge[] = []
  const seen = new Set<string>()
  const nodes = path.nodes ?? []

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const direct = byPair.get(`${a.id}→${b.id}`)
    if (direct && !seen.has(direct.id)) {
      ordered.push(direct)
      seen.add(direct.id)
      continue
    }
    for (const e of pathLayer) {
      if (seen.has(e.id)) continue
      if (
        (e.sourceId === a.id || e.sourceId === a.canonical_id) &&
        (e.targetId === b.id || e.targetId === b.canonical_id)
      ) {
        ordered.push(e)
        seen.add(e.id)
        break
      }
    }
  }

  for (const id of ["syn-user-igw", "syn-igw-foot", "syn-foot-role", "syn-role-jewel", "syn-jewel-kms"]) {
    const e = pathLayer.find((x) => x.id === id)
    if (e && !seen.has(e.id)) {
      ordered.push(e)
      seen.add(e.id)
    }
  }

  for (const e of pathLayer) {
    if (!seen.has(e.id) && cardIds.has(e.sourceId!) && cardIds.has(e.targetId!)) {
      ordered.push(e)
      seen.add(e.id)
    }
  }

  return ordered.map((e, i) => ({ edgeId: e.id, step: i + 1 }))
}

function buildRfEdges(
  model: ContainmentModel,
  viewMode: ContainmentViewMode,
  stepByEdge: Map<string, number>,
  cardIds: Set<string>,
): Edge<FlowEdgeData>[] {
  const dimCtx = viewMode === "path"
  const rfEdges: Edge<FlowEdgeData>[] = []

  for (const e of model.edges) {
    const src = resolveCardEndpoint(e.sourceId, model.cards)
    const tgt = resolveCardEndpoint(e.targetId, model.cards)
    if (!src || !tgt || !cardIds.has(src) || !cardIds.has(tgt)) continue

    const step = stepByEdge.get(e.id)
    const isPathLayer = e.layer === "path"
    rfEdges.push({
      id: e.id,
      source: src,
      target: tgt,
      type: "cloudGraph",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: e.style === "enc" ? "#0A9D87" : e.style === "priv" ? "#3fa037" : "#D9303F",
      },
      data: {
        label: e.label,
        edgeStyle: e.style,
        layer: e.layer,
        step,
        pulseDelay: step != null ? (step - 1) * 0.35 : 0,
        dimmed: dimCtx && !isPathLayer,
        animate: isPathLayer && step != null,
      },
      zIndex: isPathLayer ? 10 : 1,
    })
  }
  return rfEdges
}

function makeResourceNode(
  card: CMCard,
  position: { x: number; y: number },
  parentId: string | undefined,
  dimCtx: boolean,
): Node {
  const variant = cardVariant(card)
  const dimmed = dimCtx && !card.onPath && card.layer !== "path"
  const { w } = cardDimensions(card)
  return {
    id: card.id,
    type: "resource",
    parentId,
    extent: parentId ? "parent" : undefined,
    position,
    data: {
      title: card.title,
      sub: card.sub,
      typeLabel: cardTypeLabel(card),
      cat: card.cat,
      badge: card.badge,
      onPath: card.onPath,
      variant,
      dimmed,
      copyValue: card.sub?.startsWith("i-") ? card.sub : card.title,
    },
    style: { width: w },
    draggable: false,
    selectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function makeContainerNode(frame: CMFrame, position: { x: number; y: number }, parentId: string | undefined, dimCtx: boolean): Node {
  return {
    id: frame.id,
    type: "container",
    parentId,
    extent: parentId ? "parent" : undefined,
    position,
    data: {
      label: frame.label,
      sub: frame.sub,
      kind: frame.kind as ContainerKind,
      dimmed: dimCtx && frame.layer === "ctx",
    },
    style: {
      width: frame.w,
      height: frame.h,
      zIndex: frame.kind === "cloud" ? 0 : frame.kind === "subnet" ? 4 : 2,
    },
    draggable: false,
    selectable: false,
  }
}

function sortParentsFirst(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    if (a.parentId === b.id) return 1
    if (b.parentId === a.id) return -1
    return 0
  })
}

/** Reliable layout — uses coordinates from buildContainmentFromArchitecture. */
function layoutFromContainmentCoordinates(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): CloudGraphFlowResult {
  const cardIds = new Set(model.cards.map((c) => c.id))
  const pathSequence = orderPathFlowEdges(path, model.edges, cardIds)
  const stepByEdge = new Map(pathSequence.map((p) => [p.edgeId, p.step]))
  const dimCtx = viewMode === "path"

  const frameAbs = new Map(model.frames.map((f) => [f.id, { x: f.x, y: f.y }]))
  const rfNodes: Node[] = []

  const frameOrder = ["cloud", "region", "vpc", "az", "subnet"] as const
  for (const kind of frameOrder) {
    for (const frame of model.frames.filter((f) => f.kind === kind)) {
      const parentId = frameParentId(frame, model.frames)
      const parentAbs = parentId ? frameAbs.get(parentId) : { x: 0, y: 0 }
      const abs = frameAbs.get(frame.id)!
      rfNodes.push(
        makeContainerNode(
          frame,
          { x: abs.x - (parentAbs?.x ?? 0), y: abs.y - (parentAbs?.y ?? 0) },
          parentId,
          dimCtx,
        ),
      )
    }
  }

  for (const card of model.cards) {
    const parentId = findParentFrameId(card, model.frames) ?? undefined
    const parentAbs = parentId ? frameAbs.get(parentId) : { x: 0, y: 0 }
    rfNodes.push(
      makeResourceNode(
        card,
        { x: card.x - (parentAbs?.x ?? 0), y: card.y - (parentAbs?.y ?? 0) },
        parentId,
        dimCtx,
      ),
    )
  }

  return {
    nodes: sortParentsFirst(rfNodes),
    edges: buildRfEdges(model, viewMode, stepByEdge, cardIds),
    pathSequence,
  }
}

/** Flat ELK — cards only (no compound nesting) to avoid browser hangs. */
async function layoutElkFlat(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): Promise<CloudGraphFlowResult> {
  const cardIds = new Set(model.cards.map((c) => c.id))
  const pathSequence = orderPathFlowEdges(path, model.edges, cardIds)
  const stepByEdge = new Map(pathSequence.map((p) => [p.edgeId, p.step]))
  const dimCtx = viewMode === "path"

  if (model.cards.length === 0) {
    return layoutFromContainmentCoordinates(model, path, viewMode)
  }

  const elkEdges = model.edges
    .map((e) => {
      const src = resolveCardEndpoint(e.sourceId, model.cards)
      const tgt = resolveCardEndpoint(e.targetId, model.cards)
      if (!src || !tgt || !cardIds.has(src) || !cardIds.has(tgt)) return null
      return { id: e.id, sources: [src], targets: [tgt] }
    })
    .filter(Boolean) as { id: string; sources: string[]; targets: string[] }[]

  const layouted = await elk.layout({
    id: "root",
    layoutOptions: ELK_FLAT_OPTS,
    children: model.cards.map((c) => {
      const { w, h } = cardDimensions(c)
      return { id: c.id, width: w, height: h }
    }),
    edges: elkEdges,
  })

  const positions = new Map<string, { x: number; y: number }>()
  for (const ch of layouted.children ?? []) {
    positions.set(ch.id, { x: ch.x ?? 0, y: ch.y ?? 0 })
  }

  const rfNodes: Node[] = model.cards.map((card) => {
    const pos = positions.get(card.id) ?? { x: card.x, y: card.y }
    return makeResourceNode(card, pos, undefined, dimCtx)
  })

  return {
    nodes: rfNodes,
    edges: buildRfEdges(model, viewMode, stepByEdge, cardIds),
    pathSequence,
  }
}

export interface CloudGraphFlowResult {
  nodes: Node[]
  edges: Edge<FlowEdgeData>[]
  pathSequence: { edgeId: string; step: number }[]
}

export async function layoutCloudGraphFlow(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): Promise<CloudGraphFlowResult> {
  // Coordinate layout is reliable (same geometry as the data builder). Try flat ELK
  // only when the graph is small; always fall back on timeout/error.
  if (model.cards.length <= 24) {
    try {
      const result = await Promise.race([
        layoutElkFlat(model, path, viewMode),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("ELK layout timeout")), ELK_TIMEOUT_MS)
        }),
      ])
      if (result.nodes.length > 0) return result
    } catch {
      // fall through
    }
  }
  return layoutFromContainmentCoordinates(model, path, viewMode)
}
