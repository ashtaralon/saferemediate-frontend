/**
 * Cloud Graph layout — deterministic lane spine (Entry → Network → Compute → Identity → Data).
 * Path mode shows ONLY the attack chain; full mode adds off-path context dimmed in lanes.
 */

import type { Edge, Node } from "reactflow"
import { MarkerType, Position } from "reactflow"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import type { CMCard, CMEdge, ContainmentModel } from "./containment-model"
import type { FlowEdgeData } from "./cloud-graph-edges"
import type { ContainmentViewMode } from "./build-containment-from-architecture"

type Lane = "entry" | "network" | "compute" | "identity" | "data"

const LANE_ORDER: Lane[] = ["entry", "network", "compute", "identity", "data"]
const LANE_LABEL: Record<Lane, string> = {
  entry: "Entry",
  network: "Network",
  compute: "Compute",
  identity: "Identity",
  data: "Data",
}
const LANE_X: Record<Lane, number> = {
  entry: 32,
  network: 248,
  compute: 464,
  identity: 680,
  data: 896,
}
const LANE_W = 192
const STACK_GAP = 14
const TOP_PAD = 52

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

function cardVariant(card: CMCard): "protagonist" | "standard" | "chip" {
  if (card.badge === "FOOTHOLD" || card.badge === "CROWN JEWEL") return "protagonist"
  if (card.cat === "security" && card.onPath) return "protagonist"
  if (card.cat === "network" && !/gateway|igw/i.test(card.title)) return "chip"
  return card.onPath ? "protagonist" : "standard"
}

function cardDimensions(card: CMCard): { w: number; h: number } {
  const v = cardVariant(card)
  if (v === "chip") return { w: LANE_W, h: 48 }
  if (v === "protagonist") return { w: LANE_W, h: 80 }
  return { w: LANE_W, h: 68 }
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

function laneFromPathNode(pn: PathNodeDetail): Lane {
  const lane = pn.lane ?? ""
  const t = `${pn.type} ${lane}`.toLowerCase()
  if (lane === "entry" || pn.tier === "entry" || /principal|internet|igw|gateway/.test(t)) return "entry"
  if (lane === "crown_jewel" || pn.tier === "crown_jewel" || /s3|bucket|kms|jewel|rds/.test(t)) return "data"
  if (lane === "iam" || pn.tier === "identity" || /role|profile|policy|identity/.test(t)) return "identity"
  if (/ec2|lambda|compute|instance|workload/.test(t)) return "compute"
  if (/subnet|sg|security.?group|nacl|vpc|network/.test(t)) return "network"
  return "network"
}

function laneForCard(card: CMCard): Lane {
  if (card.id === "user" || card.cat === "user") return "entry"
  if (/gateway|igw/i.test(card.title)) return "entry"
  if (card.badge === "FOOTHOLD" || card.cat === "compute") return "compute"
  if (card.badge === "CROWN JEWEL" || card.badge === "ENCRYPTS") return "data"
  if (card.cat === "storage") return "data"
  if (card.cat === "security") return "identity"
  if (card.cat === "network") return "network"
  return "network"
}

function pathNodeToCard(pn: PathNodeDetail): CMCard {
  const lane = laneFromPathNode(pn)
  const cat =
    lane === "entry" ? "user" : lane === "compute" ? "compute" : lane === "identity" ? "security" : lane === "data" ? "storage" : "network"
  return {
    id: pn.id,
    x: 0,
    y: 0,
    w: LANE_W,
    h: 48,
    cat: cat as CMCard["cat"],
    icon: "",
    title: pn.name || pn.id,
    sub: pn.type,
    onPath: true,
    layer: "path",
    badge: pn.tier === "crown_jewel" ? "CROWN JEWEL" : undefined,
  }
}

function resolveCardForPathNode(pn: PathNodeDetail, cards: CMCard[]): CMCard {
  const hit =
    cards.find((c) => c.id === pn.id) ??
    cards.find((c) => pn.canonical_id && c.id === pn.canonical_id) ??
    cards.find((c) => norm(c.title) === norm(pn.name)) ??
    cards.find((c) => c.sub === pn.id || c.title === pn.name)
  return hit ?? pathNodeToCard(pn)
}

export function buildSpineCardIds(model: ContainmentModel, path: IdentityAttackPath): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  if (model.meta.hasInternetEntry) {
    if (model.cards.some((c) => c.id === "user")) {
      ids.push("user")
      seen.add("user")
    }
    const igw = model.cards.find((c) => /internet gateway/i.test(c.title) || /igw/i.test(c.sub ?? ""))
    if (igw && !seen.has(igw.id)) {
      ids.push(igw.id)
      seen.add(igw.id)
    }
  }

  for (const pn of path.nodes ?? []) {
    const card = resolveCardForPathNode(pn, model.cards)
    if (!seen.has(card.id)) {
      ids.push(card.id)
      seen.add(card.id)
    }
  }

  for (const c of model.cards) {
    if (c.onPath && (c.badge === "CROWN JEWEL" || c.badge === "ENCRYPTS") && !seen.has(c.id)) {
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
    const a = path.nodes![i]
    const b = path.nodes![i + 1]
    const e = byPair.get(`${a.id}→${b.id}`)
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

function makeResourceNode(
  card: CMCard,
  position: { x: number; y: number },
  dimmed: boolean,
  step?: number,
): Node {
  return {
    id: card.id,
    type: "resource",
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
    style: { width: cardDimensions(card).w, zIndex: 2 },
    draggable: false,
    selectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function makeLaneBackdrop(lane: Lane, height: number): Node {
  return {
    id: `lane-${lane}`,
    type: "lane",
    position: { x: LANE_X[lane] - 8, y: TOP_PAD - 8 },
    data: { label: LANE_LABEL[lane] },
    style: { width: LANE_W + 16, height, zIndex: 0 },
    draggable: false,
    selectable: false,
  }
}

function findEdge(model: ContainmentModel, src: string, tgt: string): CMEdge | undefined {
  return model.edges.find((e) => e.sourceId === src && e.targetId === tgt)
}

function buildSpineEdges(
  spineIds: string[],
  model: ContainmentModel,
  stepByEdge: Map<string, number>,
  viewMode: ContainmentViewMode,
): Edge<FlowEdgeData>[] {
  const edges: Edge<FlowEdgeData>[] = []
  const visible = new Set(spineIds)

  for (let i = 0; i < spineIds.length - 1; i++) {
    const src = spineIds[i]
    const tgt = spineIds[i + 1]
    if (!visible.has(src) || !visible.has(tgt)) continue

    const existing = findEdge(model, src, tgt)
    const id = existing?.id ?? `spine-${src}-${tgt}`
    const step = stepByEdge.get(existing?.id ?? id) ?? i + 1
    const style = existing?.style ?? "path"

    edges.push({
      id,
      source: src,
      target: tgt,
      type: "cloudGraph",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: style === "enc" ? "#0A9D87" : "#D9303F",
      },
      data: {
        label: existing?.label,
        edgeStyle: style,
        layer: "path",
        step,
        pulseDelay: (step - 1) * 0.35,
        dimmed: false,
        animate: true,
      },
      zIndex: 10,
    })
  }

  if (viewMode === "full") {
    for (const e of model.edges) {
      if (e.layer === "path" || !e.sourceId || !e.targetId) continue
      if (!visible.has(e.sourceId) || !visible.has(e.targetId)) continue
      if (edges.some((x) => x.id === e.id)) continue
      edges.push({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: "cloudGraph",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#3fa037" },
        data: {
          label: e.label,
          edgeStyle: e.style,
          layer: e.layer,
          dimmed: false,
          animate: false,
        },
        zIndex: 1,
      })
    }
  }

  return edges
}

export interface CloudGraphFlowResult {
  nodes: Node[]
  edges: Edge<FlowEdgeData>[]
  pathSequence: { edgeId: string; step: number }[]
}

function layoutLaneSpine(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): CloudGraphFlowResult {
  const spineIds = buildSpineCardIds(model, path)
  const spineSet = new Set(spineIds)

  const cardMap = new Map(model.cards.map((c) => [c.id, c]))
  for (const pn of path.nodes ?? []) {
    const c = resolveCardForPathNode(pn, model.cards)
    if (!cardMap.has(c.id)) cardMap.set(c.id, c)
  }

  const visibleCards: CMCard[] =
    viewMode === "path"
      ? spineIds.map((id) => cardMap.get(id)).filter((c): c is CMCard => !!c)
      : Array.from(cardMap.values())

  const byLane = new Map<Lane, CMCard[]>()
  for (const c of visibleCards) {
    const pn = path.nodes?.find((n) => n.id === c.id || n.name === c.title)
    const lane = pn ? laneFromPathNode(pn) : laneForCard(c)
    if (!byLane.has(lane)) byLane.set(lane, [])
    const laneCards = byLane.get(lane)!
    if (!laneCards.some((x) => x.id === c.id)) laneCards.push(c)
  }

  for (const [lane, list] of byLane) {
    list.sort((a, b) => {
      const pa = cardVariant(a) === "protagonist" ? 0 : cardVariant(a) === "chip" ? 2 : 1
      const pb = cardVariant(b) === "protagonist" ? 0 : cardVariant(b) === "chip" ? 2 : 1
      return pa - pb
    })
    byLane.set(lane, list)
  }

  let canvasH = 280
  for (const lane of LANE_ORDER) {
    const stack = byLane.get(lane) ?? []
    const h = stack.reduce((sum, c) => sum + cardDimensions(c).h + STACK_GAP, TOP_PAD + 40) - STACK_GAP
    canvasH = Math.max(canvasH, h)
  }

  const rfNodes: Node[] = []
  const stepByNode = new Map(spineIds.map((id, i) => [id, i + 1]))

  for (const lane of LANE_ORDER) {
    const stack = byLane.get(lane) ?? []
    if (stack.length === 0 && viewMode === "path") continue
    rfNodes.push(makeLaneBackdrop(lane, canvasH - TOP_PAD + 16))
  }

  for (const lane of LANE_ORDER) {
    const stack = byLane.get(lane) ?? []
    if (stack.length === 0) continue
    const totalH = stack.reduce((s, c) => s + cardDimensions(c).h + STACK_GAP, -STACK_GAP)
    let y = TOP_PAD + Math.max(24, (canvasH - TOP_PAD - totalH) / 2)
    for (const card of stack) {
      const dimmed = viewMode === "full" && !spineSet.has(card.id) && !card.onPath
      rfNodes.push(makeResourceNode(card, { x: LANE_X[lane], y }, dimmed, stepByNode.get(card.id)))
      y += cardDimensions(card).h + STACK_GAP
    }
  }

  const cardIds = new Set(visibleCards.map((c) => c.id))
  const pathSequence = orderPathFlowEdges(path, model.edges, cardIds, spineIds)
  const stepByEdge = new Map(pathSequence.map((p) => [p.edgeId, p.step]))
  for (let i = 0; i < spineIds.length - 1; i++) {
    const synId = `spine-${spineIds[i]}-${spineIds[i + 1]}`
    if (!stepByEdge.has(synId)) stepByEdge.set(synId, i + 1)
  }

  return {
    nodes: rfNodes,
    edges: buildSpineEdges(spineIds, model, stepByEdge, viewMode),
    pathSequence,
  }
}

export async function layoutCloudGraphFlow(
  model: ContainmentModel,
  path: IdentityAttackPath,
  viewMode: ContainmentViewMode,
): Promise<CloudGraphFlowResult> {
  return layoutLaneSpine(model, path, viewMode)
}
