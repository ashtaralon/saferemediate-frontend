// Cloud Graph layout helpers — AWS nested containment style:
// NACL + SG per AZ, route tables in subnets, identity stack, external rail.

import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { CMCard, CMNote, Layer, Anchor } from "./containment-model"

type ContainmentViewMode = "path" | "full"

type PushCard = (card: CMCard) => void

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

export function routeTableCardId(routeTableId: string): string {
  return `rtb-card-${routeTableId}`
}

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
  mode: ContainmentViewMode
}): void {
  const { architecture, azName, ax, azY, azW, cardH, cards, anchors, onPathNodeIds, mode } = opts
  const azKey = norm(azName)
  const chipH = Math.min(44, cardH)

  const azNacls = architecture.nacls.filter(
    (n) =>
      mode === "full" ||
      onPathNodeIds.has(n.id) ||
      n.onPath !== false,
  )
  const naclList = azNacls.length > 0 ? azNacls : architecture.nacls.slice(0, 1)
  naclList.forEach((nacl, i) => {
    if (anchors[nacl.id]) return
    const nx = ax + 10
    const ny = azY + 10 + i * (chipH + 4)
    const onPath = onPathNodeIds.has(nacl.id)
    cards({
      id: nacl.id,
      x: nx,
      y: ny,
      w: 96,
      h: chipH,
      cat: "network",
      icon: "⛨",
      title: nacl.shortName ?? nacl.name,
      sub: "NACL",
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[nacl.id] = { x: nx, y: ny, w: 96, h: chipH, cx: nx + 48, cy: ny + chipH / 2 }
  })

  const azSgs = architecture.securityGroups.filter(
    (s) =>
      mode === "full" ||
      onPathNodeIds.has(s.id) ||
      s.onPath !== false,
  )
  const sgList = azSgs.length > 0 ? azSgs : architecture.securityGroups.slice(0, 1)
  sgList.forEach((sg, i) => {
    if (anchors[sg.id]) return
    const sx = ax + azW - 106
    const sy = azY + 10 + i * (chipH + 4)
    const onPath = onPathNodeIds.has(sg.id)
    cards({
      id: sg.id,
      x: sx,
      y: sy,
      w: 96,
      h: chipH,
      cat: "network",
      icon: "⛉",
      title: sg.shortName ?? sg.name,
      sub: "Security group",
      badge: /public/i.test(sg.name) ? "PUBLIC" : undefined,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[sg.id] = { x: sx, y: sy, w: 96, h: chipH, cx: sx + 48, cy: sy + chipH / 2 }
  })

  const sn = architecture.subnets.find((s) => norm(s.availabilityZone) === azKey || azKey === "unknown")
  if (sn?.routeTableId) {
    void sn.routeTableId
  }
}

export function placeIdentityStack(opts: {
  architecture: SystemArchitecture
  x: number
  y: number
  w: number
  mode: ContainmentViewMode
  onPathNodeIds: Set<string>
  cards: PushCard
  anchors: Record<string, Anchor>
}): { bottom: number; width: number } {
  const { architecture, x, y, w, mode, onPathNodeIds, cards, anchors } = opts
  let cy = y
  const gap = 8

  const linkedProfileIds = new Set<string>()
  const linkedPolicyIds = new Set<string>()
  for (const e of architecture.edges ?? []) {
    const rel = (e.relationship || "").toUpperCase()
    if (rel.includes("INSTANCE_PROFILE") && onPathNodeIds.has(e.source_aws_id)) {
      if (architecture.instanceProfiles?.some((p) => p.id === e.target_aws_id)) {
        linkedProfileIds.add(e.target_aws_id)
      } else {
        for (const ip of architecture.instanceProfiles ?? []) {
          linkedProfileIds.add(ip.id)
        }
      }
    }
    if ((rel.includes("HAS_POLICY") || rel.includes("ATTACHED_POLICY")) && onPathNodeIds.has(e.source_aws_id)) {
      linkedPolicyIds.add(e.target_aws_id)
    }
  }

  const profiles =
    mode === "full"
      ? (architecture.instanceProfiles ?? [])
      : (architecture.instanceProfiles ?? []).filter(
          (p) => onPathNodeIds.has(p.id) || linkedProfileIds.has(p.id),
        )
  for (const ip of profiles) {
    if (anchors[ip.id]) continue
    const onPath = onPathNodeIds.has(ip.id)
    cards({
      id: ip.id,
      x,
      y: cy,
      w,
      h: 44,
      cat: "security",
      icon: "⎔",
      title: ip.shortName ?? ip.name,
      sub: "Instance profile",
      badge: "PROFILE",
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[ip.id] = { x, y: cy, w, h: 44, cx: x + w / 2, cy: cy + 22 }
    cy += 44 + gap
  }

  const roles =
    mode === "full"
      ? architecture.iamRoles
      : architecture.iamRoles.filter((r) => onPathNodeIds.has(r.id))
  for (const role of roles) {
    if (anchors[role.id]) continue
    const onPath = onPathNodeIds.has(role.id)
    cards({
      id: role.id,
      x,
      y: cy,
      w,
      h: 76,
      cat: "security",
      icon: "⚿",
      title: role.shortName ?? role.name,
      sub: "IAM role",
      badge: role.gapCount > 0 ? `${role.gapCount} unused` : undefined,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[role.id] = { x, y: cy, w, h: 76, cx: x + w / 2, cy: cy + 38 }
    cy += 76 + gap
  }

  const policies =
    mode === "full"
      ? (architecture.iamPolicies ?? [])
      : (architecture.iamPolicies ?? []).filter(
          (p) => onPathNodeIds.has(p.id) || linkedPolicyIds.has(p.id),
        )
  for (const pol of policies) {
    if (anchors[pol.id]) continue
    const onPath = onPathNodeIds.has(pol.id)
    cards({
      id: pol.id,
      x,
      y: cy,
      w,
      h: 76,
      cat: "security",
      icon: "📜",
      title: pol.shortName ?? pol.name,
      sub: "IAM policy",
      badge: "POLICY",
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[pol.id] = { x, y: cy, w, h: 76, cx: x + w / 2, cy: cy + 38 }
    cy += 76 + gap
  }

  return { bottom: cy > y ? cy - gap : y, width: w }
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
    ...architecture.resources.filter((r) => !r.isCrownJewel).slice(0, 3),
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
      h: Math.min(76, cardH + 26),
      cat: cat as CMCard["cat"],
      icon: cat === "security" ? "⚷" : "◈",
      title: r.shortName ?? r.name,
      sub: r.type,
      badge: r.isCrownJewel ? "CROWN JEWEL" : undefined,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[r.id] = {
      x,
      y: cy,
      w: railW,
      h: Math.min(76, cardH + 26),
      cx: x + railW / 2,
      cy: cy + Math.min(76, cardH + 26) / 2,
    }
    cy += Math.min(76, cardH + 26) + 8
  }
  return cy
}

export function subnetRouteNote(
  sn: { routeTableId?: string; shortName?: string },
  frameLabelX: number,
  sy: number,
): CMNote | null {
  if (!sn.routeTableId) return null
  return {
    id: `rt-note-${sn.routeTableId}`,
    x: frameLabelX,
    y: sy + 2,
    text: `rtb · ${sn.routeTableId.slice(0, 15)}…`,
    anchor: "start",
  }
}
