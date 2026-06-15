/**
 * ContainmentModel → React Flow + ELK layered/orthogonal layout.
 * Same data as the SVG builder; presentation-only relayout.
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

const ELK_ROOT_OPTS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.spacing.nodeNode": "28",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.padding": "[top=40,left=20,bottom=20,right=20]",
}

const CONTAINER_PAD: Record<ContainerKind, string> = {
  cloud: "[top=44,left=24,bottom=24,right=24]",
  region: "[top=40,left=20,bottom=20,right=20]",
  vpc: "[top=36,left=16,bottom=16,right=16]",
  az: "[top=32,left=14,bottom=14,right=14]",
  subnet: "[top=28,left=12,bottom=12,right=12]",
}

interface ElkNode {
  id: string
  width?: number
  height?: number
  children?: ElkNode[]
  layoutOptions?: Record<string, string>
}

interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
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
  const subnets = frames.filter((f) => f.kind === "subnet")
  for (const sn of subnets) {
    if (frameContains(sn, card)) return sn.id
  }
  const azs = frames.filter((f) => f.kind === "az")
  for (const az of azs) {
    if (frameContains(az, card)) return az.id
  }
  const vpcs = frames.filter((f) => f.kind === "vpc")
  for (const vpc of vpcs) {
    if (frameContains(vpc, card)) return vpc.id
  }
  const regions = frames.filter((f) => f.kind === "region")
  for (const r of regions) {
    if (frameContains(r, card)) return r.id
  }
  const clouds = frames.filter((f) => f.kind === "cloud")
  for (const c of clouds) {
    if (frameContains(c, card)) return c.id
  }
  return null
}

function frameParentKind(kind: CMFrame["kind"]): CMFrame["kind"] | null {
  switch (kind) {
    case "subnet":
      return "az"
    case "az":
      return "vpc"
    case "vpc":
      return "region"
    case "region":
      return "cloud"
    default:
      return null
  }
}

function buildFrameTree(frames: CMFrame[]): Map<string, CMFrame[]> {
  const children = new Map<string, CMFrame[]>()
  for (const f of frames) {
    const parentKind = frameParentKind(f.kind)
    if (!parentKind) continue
    const parent = frames.find((p) => p.kind === parentKind && frameContains(p, f))
    if (!parent) continue
    if (!children.has(parent.id)) children.set(parent.id, [])
    children.get(parent.id)!.push(f)
  }
  return children
}

function resolveCardEndpoint(id: string | undefined, cards: CMCard[]): string | undefined {
  if (!id) return undefined
  if (cards.some((c) => c.id === id)) return id
  if (id === "user" && cards.some((c) => c.id === "user")) return "user"
  return id
}

/** Order path edges by real attack flow: path.nodes chain, then spine synthetics. */
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
    const direct = byPair.get(`${a.id}→${b.id}`) ?? byPair.get(`${a.id}→${b.id}`)
    if (direct && !seen.has(direct.id)) {
      ordered.push(direct)
      seen.add(direct.id)
      continue
    }
    // Try matching card ids (foothold may differ from path node id)
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

  const spineOrder = [
    "syn-user-igw",
    "syn-igw-foot",
    "syn-foot-role",
    "syn-role-jewel",
    "syn-jewel-kms",
  ]
  for (const id of spineOrder) {
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

function elkCardNode(card: CMCard): ElkNode {
  const { w, h } = cardDimensions(card)
  return { id: card.id, width: w, height: h }
}

function elkFrameNode(frame: CMFrame, childElk: ElkNode[]): ElkNode {
  return {
    id: frame.id,
    layoutOptions: {
      "elk.padding": CONTAINER_PAD[frame.kind as ContainerKind] ?? CONTAINER_PAD.vpc,
      "elk.algorithm": frame.kind === "subnet" ? "box" : "layered",
    },
    children: childElk,
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
  const cardIds = new Set(model.cards.map((c) => c.id))
  const pathSequence = orderPathFlowEdges(path, model.edges, cardIds)
  const stepByEdge = new Map(pathSequence.map((p) => [p.edgeId, p.step]))
  const pathNodeIds = new Set(
    model.cards.filter((c) => c.onPath || c.layer === "path").map((c) => c.id),
  )
  for (const n of path.nodes ?? []) pathNodeIds.add(n.id)

  const frameChildren = buildFrameTree(model.frames)
  const cardsByParent = new Map<string, CMCard[]>()
  const rootCards: CMCard[] = []

  for (const card of model.cards) {
    const parentId = findParentFrameId(card, model.frames)
    if (parentId) {
      if (!cardsByParent.has(parentId)) cardsByParent.set(parentId, [])
      cardsByParent.get(parentId)!.push(card)
    } else {
      rootCards.push(card)
    }
  }

  function buildElkSubtree(frame: CMFrame): ElkNode {
    const childFrames = frameChildren.get(frame.id) ?? []
    const childElk: ElkNode[] = [
      ...(cardsByParent.get(frame.id) ?? []).map(elkCardNode),
      ...childFrames.map(buildElkSubtree),
    ]
    if (childElk.length === 0 && frame.h < 80) {
      return {
        id: frame.id,
        width: Math.max(frame.w, 120),
        height: 36,
        layoutOptions: { "elk.padding": "[top=8,left=8,bottom=8,right=8]" },
      }
    }
    return elkFrameNode(frame, childElk)
  }

  const cloudFrame = model.frames.find((f) => f.kind === "cloud")
  const regionFrame = model.frames.find((f) => f.kind === "region")
  const rootChildren: ElkNode[] = []

  if (rootCards.length) {
    rootChildren.push(...rootCards.map(elkCardNode))
  }

  if (cloudFrame) {
    const cloudChildren = (frameChildren.get(cloudFrame.id) ?? []).map(buildElkSubtree)
    rootChildren.push(elkFrameNode(cloudFrame, cloudChildren))
  } else if (regionFrame) {
    rootChildren.push(buildElkSubtree(regionFrame))
  }

  const elkEdges: ElkEdge[] = []
  for (const e of model.edges) {
    const src = resolveCardEndpoint(e.sourceId, model.cards)
    const tgt = resolveCardEndpoint(e.targetId, model.cards)
    if (!src || !tgt || !cardIds.has(src) || !cardIds.has(tgt)) continue
    elkEdges.push({ id: e.id, sources: [src], targets: [tgt] })
  }

  const elkGraph = {
    id: "root",
    layoutOptions: ELK_ROOT_OPTS,
    children: rootChildren,
    edges: elkEdges,
  }

  const layouted = await elk.layout(elkGraph)

  const rfNodes: Node[] = []
  const cardById = new Map(model.cards.map((c) => [c.id, c]))
  const frameById = new Map(model.frames.map((f) => [f.id, f]))
  const dimCtx = viewMode === "path"

  function walk(
    n: { id: string; x?: number; y?: number; width?: number; height?: number; children?: typeof layouted.children },
    parentId?: string,
    parentAbs = { x: 0, y: 0 },
  ) {
    const absX = n.x ?? 0
    const absY = n.y ?? 0
    const relX = parentId ? absX - parentAbs.x : absX
    const relY = parentId ? absY - parentAbs.y : absY

    const card = cardById.get(n.id)
    const frame = frameById.get(n.id)

    if (card) {
      const variant = cardVariant(card)
      const dimmed = dimCtx && !card.onPath && card.layer !== "path"
      rfNodes.push({
        id: card.id,
        type: "resource",
        parentId,
        extent: parentId ? "parent" : undefined,
        position: { x: relX, y: relY },
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
        style: { width: cardDimensions(card).w },
        draggable: false,
        selectable: true,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })
    } else if (frame) {
      rfNodes.push({
        id: frame.id,
        type: "container",
        parentId,
        extent: parentId ? "parent" : undefined,
        position: { x: relX, y: relY },
        data: {
          label: frame.label,
          sub: frame.sub,
          kind: frame.kind as ContainerKind,
          dimmed: dimCtx && frame.layer === "ctx",
        },
        style: {
          width: n.width ?? frame.w,
          height: n.height ?? frame.h,
          zIndex: frame.kind === "cloud" ? 0 : frame.kind === "subnet" ? 4 : 2,
        },
        draggable: false,
        selectable: false,
      })
    }

    const nextAbs = { x: absX, y: absY }
    const isParent = !!frame || n.id === "root"
    for (const ch of n.children ?? []) {
      walk(ch, isParent || frame ? n.id : parentId, isParent || frame ? nextAbs : parentAbs)
    }
  }

  for (const ch of layouted.children ?? []) {
    walk(ch)
  }

  const rfEdges: Edge<FlowEdgeData>[] = []
  for (const e of model.edges) {
    const src = resolveCardEndpoint(e.sourceId, model.cards)
    const tgt = resolveCardEndpoint(e.targetId, model.cards)
    if (!src || !tgt || !cardIds.has(src) || !cardIds.has(tgt)) continue

    const step = stepByEdge.get(e.id)
    const isPathLayer = e.layer === "path"
    const pulseDelay = step != null ? (step - 1) * 0.35 : 0
    const dimmed = dimCtx && !isPathLayer

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
        pulseDelay,
        dimmed,
        animate: isPathLayer && step != null,
      },
      zIndex: isPathLayer ? 10 : 1,
    })
  }

  // React Flow requires parent nodes before their children.
  rfNodes.sort((a, b) => {
    if (a.parentId === b.id) return 1
    if (b.parentId === a.id) return -1
    return 0
  })

  return { nodes: rfNodes, edges: rfEdges, pathSequence }
}
