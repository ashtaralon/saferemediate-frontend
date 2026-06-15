// Killer containment map — builds the positioned SVG model from the SAME
// SystemArchitecture object TrafficFlowMap consumes (buildAttackerArchitecture
// over graph-view). Per cyntro_containment-map_binding-spec.md: same collectors,
// same data — lanes → nested AWS Cloud > Region > VPC > AZ > Subnet boxes.
//
// "Just this path" (default) renders only on-path nodes/edges from
// architecture.onPathNodeIds / onPathEdgeIds. "Full environment" merges
// supplementary topology-aws siblings when provided (§3 option b).

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, ServiceNode, SubnetNode, EgressGatewayNode } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import {
  type ContainmentModel,
  type CMFrame,
  type CMCard,
  type CMNote,
  type CMEdge,
  type Layer,
  type Category,
  type TopologyResponse,
  gateEdgeColor,
  EDGE_COLOR,
  isLambdaType,
  isCardWorkload,
} from "./containment-model"

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

export type ContainmentViewMode = "path" | "full"

/** Edge chip label — spec §2.5: "assumes role" only for real ASSUMES hops;
 *  HAS_INSTANCE_PROFILE / USES_ROLE → "runs as · via <profile>". */
export function edgeLabelForRelationship(
  rel: string,
  instanceProfileName?: string | null,
  excessAction?: string | null,
): string | null {
  const R = (rel || "").toUpperCase()
  if (R === "HAS_INSTANCE_PROFILE" || R === "USES_ROLE") {
    return instanceProfileName
      ? `runs as · via ${instanceProfileName}`
      : "runs as · via instance profile"
  }
  if (R === "ASSUMES_ROLE_ACTUAL" || R === "ASSUMES_ROLE") return "assumes role"
  if (R === "ENCRYPTED_BY") return "encrypts"
  if (R === "REACHES" || R === "ACTUAL_TRAFFIC") return "inbound · public IP"
  if (R === "ACCESSES_RESOURCE" || R === "ACTUAL_S3_ACCESS" || R === "READS_FROM") {
    return excessAction ? `${shortAction(excessAction)} · excess` : "data access"
  }
  return null
}

function shortAction(a: string): string {
  const m = a.match(/^([a-z0-9-]+):([A-Z][a-z]+)/)
  if (!m) return a
  return `${m[1]}:${m[2]}*`
}

interface Anchor {
  cx: number
  cy: number
  x: number
  y: number
  w: number
  h: number
}

const M = 16
const CLOUD_PAD = 18
const REGION_PAD = 20
const VPC_PAD = 18
const AZ_GAP = 14
const AZW = 320
const AZ_HEADER = 26
const SUBNET_HEADER = 36
const CARD_H = 46
const CARD_GAP = 8
const SUBNET_PAD = 12
const REGIONAL_CARD_H = 50

function rightMid(a: Anchor) {
  return { x: a.x + a.w, y: a.y + a.h / 2 }
}
function leftMid(a: Anchor) {
  return { x: a.x, y: a.y + a.h / 2 }
}
function topMid(a: Anchor) {
  return { x: a.x + a.w / 2, y: a.y }
}
function botMid(a: Anchor) {
  return { x: a.x + a.w / 2, y: a.y + a.h }
}
function r(n: number) {
  return Math.round(n * 10) / 10
}
function curveD(a: { x: number; y: number }, b: { x: number; y: number }) {
  const midY = (a.y + b.y) / 2
  return `M${r(a.x)},${r(a.y)} C${r(a.x)},${r(midY)} ${r(b.x)},${r(midY)} ${r(b.x)},${r(b.y)}`
}

function workloadCategory(type: string): Category {
  if (/rds|aurora|dynamodb|database|storage|s3|bucket/i.test(type)) return "storage"
  if (/lambda/i.test(type)) return "compute"
  return "compute"
}
function workloadIcon(type: string): string {
  if (isLambdaType(type)) return "ƒ"
  if (/rds|aurora|database/i.test(type)) return "▤"
  return "▣"
}

function nodeOnPath(id: string, onPath: Set<string>, mode: ContainmentViewMode): boolean {
  if (mode === "full") return true
  return onPath.has(norm(id))
}

/**
 * Build containment layout from SystemArchitecture (graph-view path-scoped).
 * Returns null when there's no compute foothold to anchor (identity-only paths).
 */
export function buildContainmentFromArchitecture(
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
  report: AttackPathReport,
  mode: ContainmentViewMode = "path",
  fullTopology?: TopologyResponse | null,
): ContainmentModel | null {
  const onPathNodes = architecture.onPathNodeIds ?? new Set<string>()
  const onPathEdges = architecture.onPathEdgeIds ?? new Set<string>()
  const cs = report.current_state
  const srcLabel = norm(cs.source_label)
  const excess = report.remediation_diff?.remove_actions ?? []
  const gates = report.gates ?? {}

  const computeById = new Map(architecture.computeServices.map((c) => [c.id, c]))
  const vpc = architecture.vpcGroups?.[0]
  if (!vpc && architecture.subnets.length === 0) return null

  const vpcId = vpc?.vpcId ?? architecture.subnets[0]?.vpcId ?? "vpc"
  const vpcCidr = vpc?.cidrBlock
  const region = architecture.region ?? "—"

  // Resolve foothold compute — the path entry workload in the architecture.
  let footholdCompute: ServiceNode | null = null
  for (const c of architecture.computeServices) {
    if (srcLabel && norm(c.name) === srcLabel) {
      footholdCompute = c
      break
    }
  }
  if (!footholdCompute) {
    for (const c of architecture.computeServices) {
      if (onPathNodes.has(c.id) || nodeOnPath(c.id, onPathNodes, "path")) {
        footholdCompute = c
        break
      }
    }
  }
  if (!footholdCompute) return null

  const frames: CMFrame[] = []
  const cards: CMCard[] = []
  const notes: CMNote[] = []
  const edges: CMEdge[] = []
  const anchors: Record<string, Anchor> = {}

  // Subnets grouped by AZ — merge full topology subnets when mode=full.
  type SubnetRow = { subnet: SubnetNode; computes: ServiceNode[] }
  const azMap = new Map<string, SubnetRow[]>()

  const addSubnetRow = (sn: SubnetNode, computes: ServiceNode[]) => {
    const az = sn.availabilityZone || "unknown"
    if (!azMap.has(az)) azMap.set(az, [])
    azMap.get(az)!.push({ subnet: sn, computes })
  }

  if (mode === "full" && fullTopology?.vpcs?.length) {
    const topoVpc = fullTopology.vpcs.find((v) => v.id === vpcId) ?? fullTopology.vpcs[0]
    for (const az of topoVpc.azs ?? []) {
      for (const ts of az.subnets ?? []) {
        const archSubnet = architecture.subnets.find((s) => s.id === ts.id)
        const computes: ServiceNode[] = []
        for (const w of ts.workloads ?? []) {
          if (isLambdaType(w.type)) continue
          const existing = computeById.get(w.id) ?? computeById.get(w.name)
          if (existing) {
            computes.push(existing)
          } else if (isCardWorkload(w.type)) {
            computes.push({ id: w.id, name: w.name, shortName: w.name, type: w.type })
          }
        }
        addSubnetRow(
          archSubnet ?? {
            id: ts.id,
            name: ts.name,
            shortName: ts.name,
            isPublic: ts.is_public,
            cidrBlock: ts.cidr ?? undefined,
            availabilityZone: az.name,
            connectedComputeIds: computes.map((c) => c.id),
          },
          computes,
        )
      }
    }
  } else {
    for (const sn of architecture.subnets) {
      const computes = sn.connectedComputeIds
        .map((id) => computeById.get(id))
        .filter((c): c is ServiceNode => !!c)
      if (mode === "path" && computes.every((c) => !nodeOnPath(c.id, onPathNodes, mode))) {
        if (!computes.some((c) => norm(c.name) === srcLabel)) continue
      }
      addSubnetRow(sn, computes)
    }
  }

  const azNames = Array.from(azMap.keys()).sort()
  const nAZ = Math.max(azNames.length, 1)
  const cloudX = M
  const regionX = cloudX + CLOUD_PAD
  const vpcX = regionX + REGION_PAD
  const vpcInnerW = nAZ * AZW + (nAZ + 1) * AZ_GAP
  const regionW = vpcInnerW + REGION_PAD * 2
  const cloudW = regionW + CLOUD_PAD * 2

  const igw = architecture.egressGateways.find((g) => g.kind === "InternetGateway")
  const footholdSubnet = architecture.subnets.find((s) =>
    s.connectedComputeIds.includes(footholdCompute!.id),
  )
  const entryNode = path.nodes?.find((n) => norm(n.name) === srcLabel)
  const explicitIE = entryNode?.is_internet_exposed
  const hasInternetEntry =
    explicitIE === true || (explicitIE !== false && footholdSubnet?.isPublic === true && !!igw)

  let y = M
  if (hasInternetEntry) {
    const uw = 150
    const ux = cloudX + cloudW / 2 - uw / 2
    cards.push({
      id: "user",
      x: ux,
      y,
      w: uw,
      h: 36,
      cat: "user",
      icon: "◐",
      title: "User / Internet",
      sub: "0.0.0.0/0",
      onPath: true,
      layer: "path",
    })
    anchors.user = { x: ux, y, w: uw, h: 36, cx: ux + uw / 2, cy: y + 18 }
    y += 48
  }

  const cloudY = y
  const regionY = cloudY + 38
  const igwH = 50
  const vpcY = regionY + (hasInternetEntry && igw ? 44 : 30)
  const azY = vpcY + 52

  let maxAzBottom = azY
  azNames.forEach((azName, ai) => {
    const ax = vpcX + AZ_GAP + ai * (AZW + AZ_GAP)
    const rows = azMap.get(azName) ?? []
    let sy = azY + AZ_HEADER
    if (rows.length === 0) {
      notes.push({ id: `az-empty-${ai}`, x: ax + AZW / 2, y: sy + 30, text: "no workloads observed", anchor: "middle" })
      frames.push({
        id: `az-${azName}`,
        x: ax,
        y: azY,
        w: AZW,
        h: 60,
        rx: 10,
        kind: "az",
        label: azName === "unknown" ? "AZ" : `AZ: ${azName}`,
        layer: "ctx",
      })
      maxAzBottom = Math.max(maxAzBottom, azY + 60)
      return
    }
    for (const { subnet: sn, computes } of rows) {
      const visible =
        mode === "full"
          ? computes
          : computes.filter((c) => nodeOnPath(c.id, onPathNodes, mode) || norm(c.name) === srcLabel)
      const bodyH = visible.length > 0 ? visible.length * (CARD_H + CARD_GAP) + CARD_GAP : 40
      const subnetH = SUBNET_HEADER + bodyH
      const pub =
        sn.isPublic === true ? "Public" : sn.isPublic === false ? "Private" : "Unknown"
      frames.push({
        id: sn.id,
        x: ax + SUBNET_PAD,
        y: sy,
        w: AZW - SUBNET_PAD * 2,
        h: subnetH,
        rx: 9,
        kind: "subnet",
        label: `${pub} subnet · ${sn.cidrBlock ?? sn.shortName ?? sn.id}`,
        sub: sn.id,
        layer: "ctx",
      })
      let cardY = sy + SUBNET_HEADER
      const cw = AZW - SUBNET_PAD * 2 - 16
      const cx = ax + SUBNET_PAD + 8
      if (visible.length === 0) {
        notes.push({ id: `sn-empty-${sn.id}`, x: ax + AZW / 2, y: sy + SUBNET_HEADER + 24, text: "no workloads observed", anchor: "middle" })
      }
      for (const c of visible) {
        const onPath = nodeOnPath(c.id, onPathNodes, mode) || norm(c.name) === srcLabel
        const isFoothold = c.id === footholdCompute!.id || norm(c.name) === srcLabel
        const layer: Layer = onPath ? "path" : "ctx"
        cards.push({
          id: c.id,
          x: cx,
          y: cardY,
          w: cw,
          h: CARD_H,
          cat: workloadCategory(c.type),
          icon: workloadIcon(c.type),
          title: c.name,
          sub: c.instanceId && c.instanceId !== c.name ? c.instanceId : undefined,
          badge: isFoothold ? "FOOTHOLD" : undefined,
          onPath,
          layer,
        })
        anchors[c.id] = { x: cx, y: cardY, w: cw, h: CARD_H, cx: cx + cw / 2, cy: cardY + CARD_H / 2 }
        if (isFoothold) anchors.foothold = anchors[c.id]
        cardY += CARD_H + CARD_GAP
      }
      sy += subnetH + 10
    }
    frames.push({
      id: `az-${azName}`,
      x: ax,
      y: azY,
      w: AZW,
      h: sy - azY,
      rx: 10,
      kind: "az",
      label: azName === "unknown" ? "AZ" : `AZ: ${azName}`,
      layer: "ctx",
    })
    maxAzBottom = Math.max(maxAzBottom, sy)
  })

  // VPC-level gateways (VPCE at VPC level per spec §2.4 — not inside an AZ).
  let gatewayBottom = maxAzBottom + 8
  const vpces = architecture.egressGateways.filter((g) => g.kind === "VPCEndpoint")
  vpces.forEach((vpce, i) => {
    const onPath = onPathNodes.has(vpce.id)
    const vw = 280
    const vx = vpcX + (i % 2 === 0 ? AZ_GAP : vpcInnerW - vw - AZ_GAP)
    const badge = onPath ? undefined : "UNUSED"
    cards.push({
      id: vpce.id,
      x: vx,
      y: gatewayBottom,
      w: vw,
      h: REGIONAL_CARD_H,
      cat: "network",
      icon: "⛒",
      title: vpce.kindLabel || "VPC Endpoint",
      sub: vpce.serviceHint ? `VPCE · ${vpce.serviceHint}` : vpce.id,
      badge,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    anchors[vpce.id] = { x: vx, y: gatewayBottom, w: vw, h: REGIONAL_CARD_H, cx: vx + vw / 2, cy: gatewayBottom + REGIONAL_CARD_H / 2 }
  })
  if (vpces.length) gatewayBottom += REGIONAL_CARD_H + 8

  frames.push({
    id: vpcId,
    x: vpcX,
    y: vpcY,
    w: vpcInnerW,
    h: gatewayBottom - vpcY + VPC_PAD,
    rx: 12,
    kind: "vpc",
    label: `VPC · ${vpcId}${vpcCidr ? ` · ${vpcCidr}` : ""}`,
    layer: "frame",
  })

  // Regional band — IAM role, instance profile hint, crown jewel, KMS.
  const profile = architecture.instanceProfiles?.[0]
  const role = architecture.iamRoles[0]
  const jewel = architecture.resources.find((r) => r.isCrownJewel) ?? architecture.resources[0]
  const kms = architecture.resources.find((r) => /kms|key/i.test(r.type))

  const regionalY = gatewayBottom + VPC_PAD + 30
  const regionalCardsY = regionalY + 16
  notes.push({
    id: "regional-header",
    x: regionX + REGION_PAD,
    y: regionalY + 6,
    text: "REGIONAL & GLOBAL SERVICES (outside the VPC)",
    anchor: "start",
  })

  let rxPos = regionX + REGION_PAD
  if (role) {
    const rw = 280
    const roleSub = profile ? `via ${profile.shortName ?? profile.name}` : "IAM role"
    cards.push({
      id: role.id,
      x: rxPos,
      y: regionalCardsY,
      w: rw,
      h: REGIONAL_CARD_H,
      cat: "security",
      icon: "⚿",
      title: role.shortName ?? role.name,
      sub: roleSub,
      badge: excess.length > 0 ? shortAction(excess[0]) : role.gapCount > 0 ? `${role.gapCount} unused` : undefined,
      onPath: true,
      layer: "path",
    })
    anchors[role.id] = { x: rxPos, y: regionalCardsY, w: rw, h: REGIONAL_CARD_H, cx: rxPos + rw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
    anchors.role = anchors[role.id]
    rxPos += rw + 36
  }
  if (jewel) {
    const jw = 240
    cards.push({
      id: jewel.id,
      x: rxPos,
      y: regionalCardsY,
      w: jw,
      h: REGIONAL_CARD_H,
      cat: "storage",
      icon: "◈",
      title: cs.target_label || jewel.name,
      sub: jewel.type,
      badge: "CROWN JEWEL",
      onPath: true,
      layer: "path",
    })
    anchors[jewel.id] = { x: rxPos, y: regionalCardsY, w: jw, h: REGIONAL_CARD_H, cx: rxPos + jw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
    anchors.jewel = anchors[jewel.id]
    rxPos += jw + 36
  }
  if (kms) {
    const kw = 230
    cards.push({
      id: kms.id,
      x: rxPos,
      y: regionalCardsY,
      w: kw,
      h: REGIONAL_CARD_H,
      cat: "security",
      icon: "⚷",
      title: kms.shortName ?? kms.name,
      sub: "KMS key",
      badge: "ENCRYPTS",
      onPath: true,
      layer: "path",
    })
    anchors[kms.id] = { x: rxPos, y: regionalCardsY, w: kw, h: REGIONAL_CARD_H, cx: rxPos + kw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
  }

  const regionBottom = regionalCardsY + REGIONAL_CARD_H + REGION_PAD
  frames.push({
    id: `region-${region}`,
    x: regionX,
    y: regionY,
    w: regionW,
    h: regionBottom - regionY,
    rx: 12,
    kind: "region",
    label: `Region — ${region}`,
    layer: "frame",
  })
  frames.push({
    id: "aws-cloud",
    x: cloudX,
    y: cloudY,
    w: cloudW,
    h: regionBottom - cloudY + CLOUD_PAD,
    rx: 14,
    kind: "cloud",
    label: "AWS Cloud",
    layer: "frame",
  })

  let igwAnchor: Anchor | undefined
  if (igw && hasInternetEntry) {
    const iw = 170
    const ix = cloudX + cloudW / 2 - iw / 2
    const iy = regionY + 22
    cards.push({
      id: igw.id,
      x: ix,
      y: iy,
      w: iw,
      h: igwH,
      cat: "network",
      icon: "⇅",
      title: "Internet Gateway",
      sub: igw.shortName ?? igw.id,
      onPath: true,
      layer: "path",
    })
    igwAnchor = { x: ix, y: iy, w: iw, h: igwH, cx: ix + iw / 2, cy: iy + igwH / 2 }
    anchors[igw.id] = igwAnchor
  }

  const H = regionBottom + CLOUD_PAD + M
  const profileName = profile?.shortName ?? profile?.name ?? null

  // Attack edges from architecture.edges (on-path only in path mode).
  for (const e of architecture.edges ?? []) {
    if (mode === "path" && !onPathEdges.has(e.id)) continue
    const src = anchors[e.source_aws_id]
    const tgt = anchors[e.target_aws_id]
    if (!src || !tgt) continue
    const rel = e.relationship || ""
    const label = edgeLabelForRelationship(rel, profileName, excess[0] ?? null)
    const isPriv = !onPathEdges.has(e.id) && mode === "full"
    const color = isPriv
      ? EDGE_COLOR.priv
      : rel.toUpperCase().includes("ENCRYPT")
        ? EDGE_COLOR.enc
        : rel.toUpperCase().includes("ASSUME") || rel.toUpperCase().includes("INSTANCE_PROFILE") || rel.toUpperCase().includes("USES_ROLE")
          ? gateEdgeColor(gates.identity)
          : gateEdgeColor(gates.data_plane ?? gates.network)
    edges.push({
      id: e.id,
      d: curveD(botMid(src), topMid(tgt)),
      style: isPriv ? "priv" : rel.toUpperCase().includes("ENCRYPT") ? "enc" : "path",
      color,
      label: label ?? undefined,
      labelX: (src.cx + tgt.cx) / 2,
      labelY: (src.cy + tgt.cy) / 2,
      layer: onPathEdges.has(e.id) ? "path" : "ctx",
    })
  }

  // Synthetic spine edges when canvas edges don't resolve to placed anchors.
  if (!edges.some((e) => e.layer === "path")) {
    if (anchors.user && igwAnchor) {
      edges.push({ id: "syn-user-igw", d: `M${r(anchors.user.cx)},${r(anchors.user.y + 36)} L${r(igwAnchor.cx)},${r(igwAnchor.y)}`, style: "path", color: EDGE_COLOR.path, label: "inbound · public IP", labelX: anchors.user.cx, labelY: (anchors.user.y + igwAnchor.y) / 2, layer: "path" })
    }
    if (igwAnchor && anchors.foothold) {
      edges.push({ id: "syn-igw-foot", d: `M${r(igwAnchor.cx)},${r(igwAnchor.y + igwH)} L${r(anchors.foothold.cx)},${r(anchors.foothold.y)}`, style: "path", color: EDGE_COLOR.path, layer: "path" })
    }
    if (anchors.foothold && anchors.role) {
      edges.push({ id: "syn-foot-role", d: curveD(botMid(anchors.foothold), topMid(anchors.role)), style: "path", color: gateEdgeColor(gates.identity), label: profileName ? `runs as · via ${profileName}` : "runs as · via instance profile", labelX: (anchors.foothold.cx + anchors.role.cx) / 2, labelY: (anchors.foothold.cy + anchors.role.cy) / 2, layer: "path" })
    }
    if (anchors.role && anchors.jewel) {
      edges.push({ id: "syn-role-jewel", d: `M${r(anchors.role.x + anchors.role.w)},${r(anchors.role.cy)} L${r(anchors.jewel.x)},${r(anchors.jewel.cy)}`, style: "path", color: gateEdgeColor(gates.data_plane ?? gates.network), label: excess[0] ? `${shortAction(excess[0])} · excess` : "data access", labelX: (anchors.role.cx + anchors.jewel.cx) / 2, labelY: anchors.role.cy - 8, layer: "path" })
    }
    if (anchors.jewel && kms && anchors[kms.id]) {
      edges.push({ id: "syn-jewel-kms", d: `M${r(anchors.jewel.x + anchors.jewel.w)},${r(anchors.jewel.cy)} L${r(anchors[kms.id].x)},${r(anchors[kms.id].cy)}`, style: "enc", color: EDGE_COLOR.enc, label: "encrypts", labelX: (anchors.jewel.cx + anchors[kms.id].cx) / 2, labelY: anchors.jewel.cy + 12, layer: "path" })
    }
  }

  // Private unused VPCE route (context layer).
  const vpce = vpces[0]
  if (vpce && anchors.foothold && anchors.jewel && anchors[vpce.id] && !onPathEdges.has(vpce.id)) {
    const va = anchors[vpce.id]
    edges.push({
      id: "priv-foot-vpce",
      d: curveD(rightMid(anchors.foothold), topMid(va)),
      style: "priv",
      color: EDGE_COLOR.priv,
      label: "private · unused",
      labelX: (anchors.foothold.cx + va.cx) / 2,
      labelY: va.y - 8,
      layer: "ctx",
    })
  }

  return {
    width: cloudW + M * 2,
    height: H,
    frames,
    cards,
    notes,
    edges,
    meta: {
      vpcId,
      region,
      hasInternetEntry,
      onPathCount: cards.filter((c) => c.onPath).length,
      lambdaCount: 0,
    },
  }
}
