/**
 * ContainmentModel → nested React Flow (Payment-Prod structure).
 * Uses builder coordinates: Cloud → Region → VPC → AZ → Subnet + regional/external rail.
 * Path mode dims context (~22%); full mode shows everything. All cards always visible.
 */

import type { Edge, Node } from "reactflow"
import { MarkerType, Position } from "reactflow"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { CMCard, CMEdge, CMFrame, CMNote, ContainmentModel } from "./containment-model"
import type { ContainerKind } from "./cloud-graph-nodes"
import type { FlowEdgeData } from "./cloud-graph-edges"
import type { ContainmentViewMode } from "./build-containment-from-architecture"

function frameContains(outer: CMFrame, inner: { x: number; y: number; w: number; h: number }): boolean {
  const cx = inner.x + inner.w / 2
  const cy = inner.y + inner.h / 2
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h
}

const PARENT_KIND: Partial<Record<CMFrame["kind"], CMFrame["kind"]>> = {
  subnet: "az",
  az: "vpc",
  vpc: "region",
  region: "cloud",
}

function parentFrameId(frame: CMFrame, frames: CMFrame[]): string | undefined {
  const pk = PARENT_KIND[frame.kind]
  if (!pk) return undefined
  return frames.find((f) => f.kind === pk && frameContains(f, frame))?.id
}

function parentFrameForCard(card: CMCard, frames: CMFrame[]): string | undefined {
  for (const kind of ["subnet", "az", "vpc", "region", "cloud"] as const) {
    const f = frames.find((fr) => fr.kind === kind && frameContains(fr, card))
    if (f) return f.id
  }
  return undefined
}

function relPos(x: number, y: number, parentId: string | undefined, frames: CMFrame[]): { x: number; y: number } {
  if (!parentId) return { x, y }
  const parent = frames.find((f) => f.id === parentId)
  if (!parent) return { x, y }
  return { x: x - parent.x, y: y - parent.y }
}

function cardVariant(card: CMCard): "protagonist" | "standard" | "chip" {
  if (card.badge === "FOOTHOLD" || card.badge === "CROWN JEWEL") return "protagonist"
  if (card.cat === "security" && card.onPath) return "protagonist"
  if (card.cat === "network" && !/gateway|igw/i.test(card.title) && !card.onPath) return "chip"
  return card.onPath ? "protagonist" : "standard"
}

function cardTypeLabel(card: CMCard): string {
  if (card.badge === "FOOTHOLD") return "EC2 · FOOTHOLD"
  if (card.badge === "LAMBDA") return "LAMBDA"
  if (card.badge === "CROWN JEWEL") return "S3 · CROWN JEWEL"
  if (card.badge === "ENCRYPTS") return "KMS KEY"
  if (card.badge === "PROFILE") return "INSTANCE PROFILE"
  if (card.badge === "POLICY") return "IAM POLICY"
  if (card.cat === "user") return "USER / INTERNET"
  if (/gateway|igw/i.test(card.title)) return "INTERNET GATEWAY"
  if (card.sub === "NACL") return "NACL"
  if (card.sub === "Route table") return "ROUTE TABLE"
  if (/security group/i.test(card.sub ?? "")) return "SECURITY GROUP"
  if (card.sub === "Instance profile") return "INSTANCE PROFILE"
  if (card.sub === "IAM policy") return "IAM POLICY"
  if (card.cat === "security") return "IAM ROLE"
  if (card.cat === "compute") return "EC2"
  if (card.cat === "storage") return "STORAGE"
  if (card.cat === "network") return "NETWORK"
  return "RESOURCE"
}

export function buildSpineCardIds(model: ContainmentModel, path: IdentityAttackPath): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  if (model.meta.hasInternetEntry) {
    if (model.cards.some((c) => c.id === "user")) {
      ids.push("user")
      seen.add("user")
    }
    const igw = model.cards.find((c) => /internet gateway/i.test(c.title))
    if (igw && !seen.has(igw.id)) {
      ids.push(igw.id)
      seen.add(igw.id)
    }
  }
  for (const pn of path.nodes ?? []) {
    const card =
      model.cards.find((c) => c.id === pn.id) ??
      model.cards.find((c) => c.title === pn.name || c.sub === pn.id)
    const id = card?.id ?? pn.id
    if (!seen.has(id)) {
      ids.push(id)
      seen.add(id)
    }
  }
  for (const c of model.cards) {
    if (c.onPath && !seen.has(c.id)) {
      ids.push(c.id)
      seen.add(c.id)
    }
  }
  return ids
}

export function orderPathFlowEdges(
  path: IdentityAttackPath,
  edges: CMEdge[],
  cardIds: Set<string>,
  spineIds: string[] = [],
): { edgeId: string; step: number }[] {
  const pathLayer = edges.filter((e) => e.layer === "path" && e.sourceId && e.targetId)
  const byPair = new Map<string, CMEdge>()
  for (const e of pathLayer) byPair.set(`${e.sourceId}→${e.targetId}`, e)

  const ordered: CMEdge[] = []
  const seen = new Set<string>()

  for (let i = 0; i < spineIds.length - 1; i++) {
    const e = byPair.get(`${spineIds[i]}→${spineIds[i + 1]}`)
    if (e && !seen.has(e.id)) {
      ordered.push(e)
      seen.add(e.id)
    }
  }
  for (let i = 0; i < (path.nodes?.length ?? 0) - 1; i++) {
    const e = byPair.get(`${path.nodes![i].id}→${path.nodes![i + 1].id}`)
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

function makeContainerNode(
  frame: CMFrame,
  position: { x: number; y: number },
  parentId: string | undefined,
  dimmed: boolean,
): Node {
  const isPublicSubnet = frame.kind === "subnet" && /public/i.test(frame.label)
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
      isPublicSubnet,
      dimmed,
    },
    style: {
      width: frame.w,
      height: frame.h,
      zIndex: frame.kind === "cloud" ? 0 : frame.kind === "subnet" ? 3 : 1,
    },
    draggable: false,
    selectable: false,
  }
}

function makeResourceNode(
  card: CMCard,
  position: { x: number; y: number },
  parentId: string | undefined,
  dimmed: boolean,
  step?: number,
): Node {
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
      variant: cardVariant(card),
      dimmed,
      step,
      copyValue: card.sub?.startsWith("i-") ? card.sub : card.title,
    },
    style: { width: card.w, height: card.h, zIndex: 5 },
    draggable: false,
    selectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function makeNoteNode(note: CMNote, parentId: string | undefined, frames: CMFrame[]): Node {
  const parent = parentId ? frames.find((f) => f.id === parentId) : undefined
  const x = parent ? note.x - parent.x : note.x
  const y = parent ? note.y - parent.y : note.y
  return {
    id: note.id,
    type: "note",
    parentId,
    extent: parentId ? "parent" : undefined,
    position: { x, y },
    data: { text: note.text, anchor: note.anchor ?? "start" },
    draggable: false,
    selectable: false,
    style: { zIndex: 6, pointerEvents: "none" as const },
  }
}

function absoluteCardBounds(card: CMCard, frames: CMFrame[]): { x: number; y: number; w: number; h: number } {
  let x = card.x
  let y = card.y
  let parentId = parentFrameForCard(card, frames)
  while (parentId) {
    const parent = frames.find((f) => f.id === parentId)
    if (!parent) break
    x += parent.x
    y += parent.y
    parentId = parentFrameId(parent, frames)
  }
  return { x, y, w: card.w, h: card.h }
}

function edgePositions(
  src: { x: number; y: number; w: number; h: number },
  tgt: { x: number; y: number; w: number; h: number },
): { sourcePosition: Position; targetPosition: Position } {
  const scx = src.x + src.w / 2
  const scy = src.y + src.h / 2
  const tcx = tgt.x + tgt.w / 2
  const tcy = tgt.y + tgt.h / 2
  const dx = tcx - scx
  const dy = tcy - scy
  if (Math.abs(dy) > Math.abs(dx) * 1.15) {
    return dy > 0
      ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
      : { sourcePosition: Position.Top, targetPosition: Position.Bottom }
  }
  return dx >= 0
    ? { sourcePosition: Position.Right, targetPosition: Position.Left }
    : { sourcePosition: Position.Left, targetPosition: Position.Right }
}

function buildEdges(
  model: ContainmentModel,
  viewMode: ContainmentViewMode,
  stepByEdge: Map<string, number>,
  cardIds: Set<string>,
): Edge<FlowEdgeData>[] {
  const dimCtx = viewMode === "path"
  const rfEdges: Edge<FlowEdgeData>[] = []
  const cardById = new Map(model.cards.map((c) => [c.id, c]))

  for (const e of model.edges) {
    const src = e.sourceId
    const tgt = e.targetId
    if (!src || !tgt || !cardIds.has(src) || !cardIds.has(tgt)) continue

    const srcCard = cardById.get(src)
    const tgtCard = cardById.get(tgt)
    const positions =
      srcCard && tgtCard
        ? edgePositions(absoluteCardBounds(srcCard, model.frames), absoluteCardBounds(tgtCard, model.frames))
        : { sourcePosition: Position.Right, targetPosition: Position.Left }

    const step = stepByEdge.get(e.id)
    const isPath = e.layer === "path"
    // Position hints captured for potential sourceHandle/targetHandle wiring
    // (reactflow auto-routes without them today; kept inert via void).
    void positions
    rfEdges.push({
      id: e.id,
      source: src,
      target: tgt,
      type: "cloudGraph",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: isPath ? 16 : 14,
        height: isPath ? 16 : 14,
        color: e.style === "enc" ? "#0A9D87" : e.style === "priv" ? "#3fa037" : "#D9303F",
      },
      data: {
        label: e.label,
        edgeStyle: e.style,
        layer: e.layer,
        step: isPath ? step : undefined,
        pulseDelay: step != null ? (step - 1) * 0.35 : 0,
        dimmed: dimCtx && !isPath && !e.flowActive,
        animate: (isPath && step != null) || e.flowActive === true,
        flowActive: e.flowActive,
      },
      zIndex: isPath ? 10 : 1,
    })
  }

  return rfEdges
}

function sortParentsFirst(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    if (a.parentId === b.id) return 1
    if (b.parentId === a.id) return -1
    const depth = (n: Node) => (n.type === "container" ? (n.data?.kind === "cloud" ? 0 : 1) : 2)
    return depth(a) - depth(b)
  })
}

export interface CloudGraphFlowResult {
  nodes: Node[]
  edges: Edge<FlowEdgeData>[]
  pathSequence: { edgeId: string; step: number }[]
  width: number
  height: number
}

function layoutContainmentNested(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): CloudGraphFlowResult {
  const frames = model.frames
  const dimCtx = viewMode === "path"
  const spineIds = buildSpineCardIds(model, path)
  const stepByNode = new Map(spineIds.map((id, i) => [id, i + 1]))
  const cardIds = new Set(model.cards.map((c) => c.id))
  const pathSequence = orderPathFlowEdges(path, model.edges, cardIds, spineIds)
  const stepByEdge = new Map(pathSequence.map((p) => [p.edgeId, p.step]))

  const rfNodes: Node[] = []

  const frameOrder: CMFrame["kind"][] = ["cloud", "region", "vpc", "az", "subnet"]
  for (const kind of frameOrder) {
    for (const frame of frames.filter((f) => f.kind === kind)) {
      const parentId = parentFrameId(frame, frames)
      const pos = relPos(frame.x, frame.y, parentId, frames)
      const dimmed = dimCtx && frame.layer === "ctx"
      rfNodes.push(makeContainerNode(frame, pos, parentId, dimmed))
    }
  }

  for (const card of model.cards) {
    const parentId = parentFrameForCard(card, frames)
    const pos = relPos(card.x, card.y, parentId, frames)
    const dimmed = dimCtx && !card.onPath && card.layer !== "path"
    rfNodes.push(
      makeResourceNode(card, pos, parentId, dimmed, stepByNode.get(card.id)),
    )
  }

  for (const note of model.notes) {
    if (note.text.startsWith("REGIONAL") || note.text.startsWith("EXTERNAL")) continue
    const parentId = frames.find((f) => frameContains(f, { x: note.x, y: note.y, w: 1, h: 1 }))?.id
    rfNodes.push(makeNoteNode(note, parentId, frames))
  }

  return {
    nodes: sortParentsFirst(rfNodes),
    edges: buildEdges(model, viewMode, stepByEdge, cardIds),
    pathSequence,
    width: model.width,
    height: model.height,
  }
}

export async function layoutCloudGraphFlow(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): Promise<CloudGraphFlowResult> {
  return layoutContainmentNested(model, path, viewMode)
}
