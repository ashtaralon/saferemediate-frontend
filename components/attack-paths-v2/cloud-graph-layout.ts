// Cloud Graph layout helpers — Payment-Prod / nested containment style:
// NACL + SG checkpoints per AZ, route-table hints, external services rail.

import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { CMCard, CMNote, CMEdge, Layer, Anchor } from "./containment-model"

type PushCard = (card: CMCard) => void

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

export function placeAzNetworkControls(opts: {
  architecture: SystemArchitecture
  azName: string
  ax: number
  azY: number
  azW: number
  cardH: number
  cards: PushCard
  anchors: Record<string, Anchor>
  onPathNodeIds: Set<string>
}): void {
  const { architecture, azName, ax, azY, azW, cardH, cards, anchors, onPathNodeIds } = opts
  const azKey = norm(azName)

  const nacl = architecture.nacls.find((n) => norm(n.name).includes("acl") || n.id.startsWith("acl-")) ?? architecture.nacls[0]
  if (nacl && !anchors[nacl.id]) {
    const nx = ax + 10
    const ny = azY + 10
    const onPath = onPathNodeIds.has(nacl.id)
    cards({
      id: nacl.id,
      x: nx,
      y: ny,
      w: 86,
      h: Math.min(28, cardH),
      cat: "network",
      icon: "⛨",
      title: nacl.shortName ?? nacl.name,
      sub: "NACL",
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[nacl.id] = { x: nx, y: ny, w: 86, h: Math.min(28, cardH), cx: nx + 43, cy: ny + Math.min(28, cardH) / 2 }
  }

  const sg =
    architecture.securityGroups.find((s) => s.onPath !== false) ?? architecture.securityGroups[0]
  if (sg && !anchors[sg.id]) {
    const sx = ax + azW - 96
    const sy = azY + 10
    const onPath = onPathNodeIds.has(sg.id)
    cards({
      id: sg.id,
      x: sx,
      y: sy,
      w: 86,
      h: Math.min(28, cardH),
      cat: "network",
      icon: "⛉",
      title: sg.shortName ?? sg.name,
      sub: "Security group",
      badge: /public/i.test(sg.name) ? "PUBLIC" : undefined,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[sg.id] = { x: sx, y: sy, w: 86, h: Math.min(28, cardH), cx: sx + 43, cy: sy + Math.min(28, cardH) / 2 }
  }

  const sn = architecture.subnets.find((s) => norm(s.availabilityZone) === azKey || azKey === "unknown")
  if (sn?.routeTableId) {
    // Route table is a label on the subnet frame (builder adds CMNote) — not a full card here.
    void sn.routeTableId
  }
}

export function placeExternalServicesRail(opts: {
  architecture: SystemArchitecture
  x: number
  y: number
  cardH: number
  cards: PushCard
  anchors: Record<string, Anchor>
  onPathNodeIds: Set<string>
}): number {
  const { architecture, x, y, cardH, cards, anchors, onPathNodeIds } = opts
  let cy = y
  const railW = 168
  const items = [
    ...architecture.resources.filter((r) => r.isCrownJewel),
    ...architecture.resources.filter((r) => !r.isCrownJewel).slice(0, 2),
    ...architecture.iamRoles.slice(0, 1),
  ]
  const seen = new Set<string>()
  for (const r of items) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (anchors[r.id]) continue
    const onPath = onPathNodeIds.has(r.id)
    const cat = /kms|key/i.test(r.type) ? "security" : "storage"
    cards({
      id: r.id,
      x,
      y: cy,
      w: railW,
      h: Math.min(38, cardH),
      cat: cat as CMCard["cat"],
      icon: cat === "security" ? "⚷" : "◈",
      title: r.shortName ?? r.name,
      sub: r.type,
      badge: r.isCrownJewel ? "CROWN JEWEL" : undefined,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[r.id] = { x, y: cy, w: railW, h: Math.min(38, cardH), cx: x + railW / 2, cy: cy + Math.min(38, cardH) / 2 }
    cy += Math.min(38, cardH) + 8
  }
  return cy
}

export function subnetRouteNote(sn: { routeTableId?: string; shortName?: string }, frameLabelX: number, sy: number): CMNote | null {
  if (!sn.routeTableId) return null
  return {
    id: `rt-${sn.routeTableId}`,
    x: frameLabelX,
    y: sy + 2,
    text: `rtb · ${sn.routeTableId.slice(0, 15)}…`,
    anchor: "start",
  }
}
