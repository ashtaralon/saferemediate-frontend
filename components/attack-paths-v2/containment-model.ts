// Containment-map model — PURE, no React, no I/O. Composes the live AWS
// topology (GET /api/topology-aws) with the selected attack path
// (IdentityAttackPath) and its compiled report (AttackPathReport) into a
// positioned SVG model: AWS Cloud > Region > VPC > AZ > Subnet > workload
// cards, the regional/global services the path crosses (IAM role, crown
// jewel, KMS), the Internet Gateway / VPC Endpoint, and the attack-path
// edges between them.
//
// EVERY value is derived from the three live inputs — there are no hardcoded
// resources, coordinates-as-data, or sample nodes. The mockup that inspired
// this (aws-architecture-path.html) hardcoded all of it; this does not.
//
// Exported for unit testing (containment-model.test.ts) so the layout,
// EC2/Lambda partition, path overlay, and edge derivation are verifiable
// without a DOM.

import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import type { AttackPathReport, GateState } from "./attack-path-report-types"

// ── Live topology shape (subset of GET /api/topology-aws we render) ─────────
export interface TopoWorkload {
  id: string
  name: string
  type: string
  security_groups?: string[]
}
export interface TopoSubnet {
  id: string
  name: string
  cidr: string | null
  is_public: boolean
  workloads: TopoWorkload[]
}
export interface TopoAZ {
  name: string
  subnets: TopoSubnet[]
}
export interface TopoIGW {
  id: string
  name: string
}
export interface TopoVPCE {
  id: string
  name: string
  service: string | null
}
export interface TopoVPC {
  id: string
  name: string
  cidr: string | null
  region: string | null
  azs: TopoAZ[]
  internet_gateways: TopoIGW[]
  vpc_endpoints: TopoVPCE[]
}
export interface TopologyResponse {
  system_name: string
  vpcs: TopoVPC[]
}

// ── Output model ────────────────────────────────────────────────────────────
export type Category = "compute" | "network" | "storage" | "security" | "user"
export type Layer = "frame" | "ctx" | "path"
export type EdgeStyle = "path" | "enc" | "priv"

export interface CMFrame {
  id: string
  x: number
  y: number
  w: number
  h: number
  rx: number
  kind: "cloud" | "region" | "vpc" | "az" | "subnet"
  label: string
  sub?: string
  layer: Layer
}
export interface CMCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  cat: Category
  icon: string
  title: string
  sub?: string
  badge?: string
  onPath: boolean
  layer: Layer
}
export interface CMNote {
  id: string
  x: number
  y: number
  text: string
  anchor?: "start" | "middle"
}
export interface CMEdge {
  id: string
  d: string
  style: EdgeStyle
  color: string
  label?: string
  labelX?: number
  labelY?: number
  layer: Layer
}
export interface ContainmentModel {
  width: number
  height: number
  frames: CMFrame[]
  cards: CMCard[]
  notes: CMNote[]
  edges: CMEdge[]
  meta: {
    vpcId: string
    region: string
    hasInternetEntry: boolean
    onPathCount: number
    lambdaCount: number
  }
}

// ── Palette (mirrors the mockup's AWS category colors) ──────────────────────
export const CAT_COLOR: Record<Category, { c: string; bg: string }> = {
  compute: { c: "#e0820f", bg: "#fcefd9" },
  network: { c: "#8c4fff", bg: "#eee7ff" },
  storage: { c: "#3fa037", bg: "#e4f3e1" },
  security: { c: "#d9303f", bg: "#fbe3e5" },
  user: { c: "#2b3a4b", bg: "#e6ebf0" },
}
export const EDGE_COLOR = {
  path: "#c0392b",
  enc: "#0a9d87",
  priv: "#3fa037",
} as const

// GateState → path-edge color (so an observed identity gate reads red, a merely
// configured one amber — same vocabulary as the spine map). Falls back to the
// attack-red so a path edge is never invisible.
export function gateEdgeColor(g?: GateState): string {
  switch (g) {
    case "OPEN_OBSERVED":
      return "#c0392b"
    case "OPEN_CONFIG":
      return "#b5710f"
    case "CLOSED":
    case "BLOCKED":
      return "#2c8a57"
    case "UNKNOWN":
    default:
      return EDGE_COLOR.path
  }
}

// ── Classification helpers ──────────────────────────────────────────────────
const LAMBDA_RE = /lambda/i
const CARD_WORKLOAD_RE = /ec2|instance|rds|ecs|fargate|container|node/i

export function isLambdaType(t: string): boolean {
  return LAMBDA_RE.test(t || "")
}
export function isCardWorkload(t: string): boolean {
  return CARD_WORKLOAD_RE.test(t || "") && !isLambdaType(t || "")
}

function workloadCategory(t: string): Category {
  if (/rds|aurora|dynamodb|database/i.test(t)) return "storage"
  return "compute"
}
function workloadIcon(t: string): string {
  if (isLambdaType(t)) return "ƒ"
  if (/rds|aurora|database/i.test(t)) return "▤"
  return "▣"
}

// Region from explicit field, else inferred from an AZ name (eu-west-1a → eu-west-1).
export function deriveRegion(vpc: TopoVPC): string {
  if (vpc.region) return vpc.region
  const az = vpc.azs.find((a) => a.name)?.name ?? ""
  const m = az.match(/^([a-z]{2}-[a-z]+-\d+)/i)
  return m ? m[1] : "—"
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

// Identifiers that mark a topology node as "on the selected path": every path
// node id/canonical_id/name plus every edge endpoint. Matched case-insensitively.
export function onPathIdentifiers(path: IdentityAttackPath): Set<string> {
  const out = new Set<string>()
  for (const n of path.nodes ?? []) {
    if (n.id) out.add(norm(n.id))
    if (n.canonical_id) out.add(norm(n.canonical_id))
    if (n.name) out.add(norm(n.name))
  }
  for (const e of path.edges ?? []) {
    if (e.source) out.add(norm(e.source))
    if (e.target) out.add(norm(e.target))
  }
  return out
}

function workloadOnPath(w: TopoWorkload, ids: Set<string>): boolean {
  return ids.has(norm(w.id)) || ids.has(norm(w.name))
}

// Pick the VPC that actually hosts the path's foothold; fall back to the first.
function pickVpc(topo: TopologyResponse, ids: Set<string>): TopoVPC | null {
  if (!topo.vpcs?.length) return null
  for (const v of topo.vpcs) {
    for (const az of v.azs ?? []) {
      for (const s of az.subnets ?? []) {
        if ((s.workloads ?? []).some((w) => workloadOnPath(w, ids))) return v
      }
    }
  }
  return topo.vpcs[0]
}

// ── Geometry constants ──────────────────────────────────────────────────────
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

interface Anchor {
  cx: number
  cy: number
  x: number
  y: number
  w: number
  h: number
}
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

/**
 * Build the positioned containment model. Returns null when there's no VPC
 * topology to anchor on (caller falls back to the spine map).
 */
export function buildContainmentModel(
  topology: TopologyResponse | null | undefined,
  path: IdentityAttackPath,
  report: AttackPathReport,
): ContainmentModel | null {
  if (!topology?.vpcs?.length) return null
  const ids = onPathIdentifiers(path)
  const vpc = pickVpc(topology, ids)
  if (!vpc) return null

  const frames: CMFrame[] = []
  const cards: CMCard[] = []
  const notes: CMNote[] = []
  const edges: CMEdge[] = []
  const anchors: Record<string, Anchor> = {}

  const region = deriveRegion(vpc)
  const azs = vpc.azs ?? []
  const nAZ = Math.max(azs.length, 1)

  // Layout x-bands (nested frames).
  const cloudX = M
  const regionX = cloudX + CLOUD_PAD
  const vpcX = regionX + REGION_PAD
  const vpcInnerW = nAZ * AZW + (nAZ + 1) * AZ_GAP
  const regionW = vpcInnerW + REGION_PAD * 2
  const cloudW = regionW + CLOUD_PAD * 2
  const W = cloudX + cloudW + M

  // y-bands.
  const cs = report.current_state
  const srcLabel = norm(cs.source_label)

  // Foothold = the on-path COMPUTE workload placed in the architecture. The IAP
  // serialization often leaves node.tier null, so we don't rely on it: we
  // resolve the foothold against the topology (prefer the workload matching the
  // report's source_label, else the first on-path workload) in a pre-pass so
  // the layout can reserve the IGW band before drawing the AZ columns.
  let footholdId: string | null = null
  let footholdPublic = false
  for (const az of azs) {
    for (const sn of az.subnets ?? []) {
      for (const w of sn.workloads ?? []) {
        if (!workloadOnPath(w, ids)) continue
        if (srcLabel && norm(w.name) === srcLabel) {
          footholdId = w.id
          footholdPublic = sn.is_public
        } else if (!footholdId) {
          footholdId = w.id
          footholdPublic = sn.is_public
        }
      }
    }
  }
  const footholdNode =
    (path.nodes ?? []).find((n) => norm(n.name) === srcLabel) ??
    (path.nodes ?? []).find((n) => n.tier === "entry")
  const igw = vpc.internet_gateways?.[0]
  // Internet entry: an explicit is_internet_exposed flag wins; otherwise infer
  // from real topology — a public subnet fronted by an Internet Gateway. Never
  // drawn when the flag is explicitly false.
  const explicitIE = footholdNode?.is_internet_exposed
  const hasInternetEntry =
    explicitIE === true || (explicitIE !== false && footholdPublic && !!igw)

  let y = M
  // User / Internet (only when the path actually enters from the internet).
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
    y += 36 + 12
  }

  const cloudY = y
  const regionY = cloudY + 38
  const igwH = 50
  // IGW straddles the VPC top edge when the path uses an internet entry.
  const vpcY = regionY + (hasInternetEntry && igw ? 44 : 30)
  const azY = vpcY + 52

  // ── AZ columns / subnets / EC2 cards. Partition workloads: card-workloads
  //    (EC2/RDS) render in-subnet; Lambdas are collapsed into one regional
  //    group (they ENI-span every AZ, so per-AZ cards triple-count noise).
  const lambdaNames = new Set<string>()
  let maxAzBottom = azY
  azs.forEach((az, ai) => {
    const ax = vpcX + AZ_GAP + ai * (AZW + AZ_GAP)
    let sy = azY + AZ_HEADER
    const subnets = az.subnets ?? []
    if (subnets.length === 0) {
      notes.push({ id: `az-empty-${ai}`, x: ax + AZW / 2, y: sy + 30, text: "no subnets observed", anchor: "middle" })
    }
    subnets.forEach((sn, si) => {
      const cardWorkloads: TopoWorkload[] = []
      for (const w of sn.workloads ?? []) {
        if (isLambdaType(w.type)) lambdaNames.add(w.name)
        else if (isCardWorkload(w.type)) cardWorkloads.push(w)
        else cardWorkloads.push(w)
      }
      const bodyH =
        cardWorkloads.length > 0
          ? cardWorkloads.length * (CARD_H + CARD_GAP) + CARD_GAP
          : 40
      const subnetH = SUBNET_HEADER + bodyH
      frames.push({
        id: sn.id,
        x: ax + SUBNET_PAD,
        y: sy,
        w: AZW - SUBNET_PAD * 2,
        h: subnetH,
        rx: 9,
        kind: "subnet",
        label: `${sn.is_public ? "Public" : "Private"} subnet · ${sn.cidr ?? sn.id}`,
        sub: sn.id,
        layer: "ctx",
      })
      let cardY = sy + SUBNET_HEADER
      const cw = AZW - SUBNET_PAD * 2 - 16
      const cx = ax + SUBNET_PAD + 8
      for (const w of cardWorkloads) {
        const onPath = workloadOnPath(w, ids)
        const isFoothold = footholdId != null && w.id === footholdId
        cards.push({
          id: w.id,
          x: cx,
          y: cardY,
          w: cw,
          h: CARD_H,
          cat: workloadCategory(w.type),
          icon: workloadIcon(w.type),
          title: w.name,
          sub: w.id !== w.name ? w.id : undefined,
          badge: isFoothold ? "FOOTHOLD" : undefined,
          onPath,
          layer: onPath ? "path" : "ctx",
        })
        if (isFoothold) {
          anchors.foothold = { x: cx, y: cardY, w: cw, h: CARD_H, cx: cx + cw / 2, cy: cardY + CARD_H / 2 }
        }
        cardY += CARD_H + CARD_GAP
      }
      if (cardWorkloads.length === 0) {
        notes.push({ id: `sn-empty-${ai}-${si}`, x: ax + AZW / 2, y: sy + SUBNET_HEADER + 24, text: "no workloads observed", anchor: "middle" })
      }
      sy += subnetH + 10
    })
    // AZ frame wraps its subnets.
    const azBottom = sy
    frames.push({
      id: `az-${az.name}`,
      x: ax,
      y: azY,
      w: AZW,
      h: azBottom - azY,
      rx: 10,
      kind: "az",
      label: `AZ: ${az.name}`,
      layer: "ctx",
    })
    maxAzBottom = Math.max(maxAzBottom, azBottom)
  })

  // VPC Endpoint chip (network) — placed under the AZ columns, right-aligned.
  const vpce = vpc.vpc_endpoints?.[0]
  let vpceAnchor: Anchor | undefined
  let lambdaBottom = maxAzBottom + 8
  if (vpce) {
    const vw = 280
    const vx = vpcX + vpcInnerW - vw - AZ_GAP
    cards.push({
      id: vpce.id,
      x: vx,
      y: lambdaBottom,
      w: vw,
      h: REGIONAL_CARD_H,
      cat: "network",
      icon: "⛒",
      title: `VPC Endpoint · ${(vpce.service ?? "").toUpperCase() || "interface"}`,
      sub: vpce.id,
      badge: "PRIVATE",
      onPath: false,
      layer: "ctx",
    })
    vpceAnchor = { x: vx, y: lambdaBottom, w: vw, h: REGIONAL_CARD_H, cx: vx + vw / 2, cy: lambdaBottom + REGIONAL_CARD_H / 2 }
  }
  // Lambda group (deduped) — they're regional/ENI-spanning, shown once.
  if (lambdaNames.size > 0) {
    const lw = 280
    const lx = vpcX + AZ_GAP
    cards.push({
      id: "lambda-group",
      x: lx,
      y: lambdaBottom,
      w: lw,
      h: REGIONAL_CARD_H,
      cat: "compute",
      icon: "ƒ",
      title: `${lambdaNames.size} serverless function${lambdaNames.size === 1 ? "" : "s"}`,
      sub: "Lambda · span all AZs",
      onPath: false,
      layer: "ctx",
    })
  }
  if (vpce || lambdaNames.size > 0) lambdaBottom += REGIONAL_CARD_H + 8

  const vpcBottom = lambdaBottom + VPC_PAD
  frames.push({
    id: vpc.id,
    x: vpcX,
    y: vpcY,
    w: vpcInnerW,
    h: vpcBottom - vpcY,
    rx: 12,
    kind: "vpc",
    label: `VPC · ${vpc.id}${vpc.cidr ? ` · ${vpc.cidr}` : ""}`,
    layer: "frame",
  })

  // ── Regional & global services band (inside Region, outside VPC): the IAM
  //    role, crown jewel, and KMS key the path actually crosses. Tier is
  //    unreliable in the IAP serialization, so we resolve these from the
  //    report's friendly labels + node TYPE, never from tier alone, and never
  //    invent a node.
  const jewelNode =
    (path.nodes ?? []).find((n) => n.tier === "crown_jewel") ??
    (path.nodes ?? []).find((n) => norm(n.name) === norm(cs.target_label)) ??
    (path.nodes ?? [])[(path.nodes ?? []).length - 1]
  // Prefer the report's friendly role_name (the same label the header chip and
  // lede render) over a possibly-opaque (AROA…) role node name.
  const roleName =
    path.damage_capability?.role_name ||
    (path.nodes ?? []).find(
      (n) => /role|iam/i.test(n.type) && n.id !== jewelNode?.id && norm(n.name) !== srcLabel,
    )?.name ||
    null
  const roleNames: string[] = roleName ? [roleName] : []
  const kms = findKms(path, jewelNode)

  const regionalY = vpcBottom + 30
  const regionalCardsY = regionalY + 16
  notes.push({
    id: "regional-header",
    x: regionX + REGION_PAD,
    y: regionalY + 6,
    text: "REGIONAL & GLOBAL SERVICES (outside the VPC)",
    anchor: "start",
  })

  let rx = regionX + REGION_PAD
  const excess = report.remediation_diff?.remove_actions ?? []
  roleNames.forEach((rn, i) => {
    const rw = 260
    cards.push({
      id: `role-${i}`,
      x: rx,
      y: regionalCardsY,
      w: rw,
      h: REGIONAL_CARD_H,
      cat: "security",
      icon: "⚿",
      title: rn,
      sub: "IAM role",
      badge: excess.length > 0 ? shortAction(excess[0]) : undefined,
      onPath: true,
      layer: "path",
    })
    anchors[`role-${i}`] = { x: rx, y: regionalCardsY, w: rw, h: REGIONAL_CARD_H, cx: rx + rw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
    if (i === 0) anchors.role = anchors[`role-${i}`]
    rx += rw + 36
  })
  if (jewelNode) {
    const jw = 240
    cards.push({
      id: jewelNode.id || "jewel",
      x: rx,
      y: regionalCardsY,
      w: jw,
      h: REGIONAL_CARD_H,
      cat: "storage",
      icon: "◈",
      title: cs.target_label || jewelNode.name,
      sub: jewelNode.type,
      badge: "CROWN JEWEL",
      onPath: true,
      layer: "path",
    })
    anchors.jewel = { x: rx, y: regionalCardsY, w: jw, h: REGIONAL_CARD_H, cx: rx + jw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
    rx += jw + 36
  }
  if (kms) {
    const kw = 230
    cards.push({
      id: kms.id,
      x: rx,
      y: regionalCardsY,
      w: kw,
      h: REGIONAL_CARD_H,
      cat: "security",
      icon: "⚷",
      title: kms.name,
      sub: "KMS key",
      badge: "ENCRYPTS",
      onPath: true,
      layer: "path",
    })
    anchors.kms = { x: rx, y: regionalCardsY, w: kw, h: REGIONAL_CARD_H, cx: rx + kw / 2, cy: regionalCardsY + REGIONAL_CARD_H / 2 }
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
  const cloudBottom = regionBottom + CLOUD_PAD
  frames.push({
    id: "aws-cloud",
    x: cloudX,
    y: cloudY,
    w: cloudW,
    h: cloudBottom - cloudY,
    rx: 14,
    kind: "cloud",
    label: "AWS Cloud",
    layer: "frame",
  })

  // IGW (network) — straddles the VPC top edge, between region and VPC.
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
      sub: igw.id,
      onPath: true,
      layer: "path",
    })
    igwAnchor = { x: ix, y: iy, w: iw, h: igwH, cx: ix + iw / 2, cy: iy + igwH / 2 }
  }

  // No compute foothold placed in the architecture — an identity-only path
  // (assume-chain Shape B/C) has no subnet workload to anchor on, so the
  // containment view would be mostly empty context. The spine map tells that
  // story better; signal the caller to fall back by returning null.
  if (!anchors.foothold) return null

  const H = cloudBottom + M

  // ── Edges (attack path on top). Each derived from real path structure +
  //    report gates; absent anchors simply drop the edge.
  const gates = report.gates ?? {}
  if (anchors.user && igwAnchor) {
    edges.push(straight("e-user-igw", botMid(anchors.user), topMid(igwAnchor), EDGE_COLOR.path, "inbound · public IP"))
  }
  if (igwAnchor && anchors.foothold) {
    edges.push(straight("e-igw-foothold", botMid(igwAnchor), topMid(anchors.foothold), EDGE_COLOR.path))
  } else if (anchors.user && anchors.foothold && !igwAnchor) {
    edges.push(straight("e-user-foothold", botMid(anchors.user), topMid(anchors.foothold), EDGE_COLOR.path, "inbound"))
  }
  const dataLbl = excess.length > 0 ? `${shortAction(excess[0])} · excess` : "data access"
  if (anchors.foothold && anchors.role) {
    edges.push(
      curve(
        "e-foothold-role",
        botMid(anchors.foothold),
        topMid(anchors.role),
        gateEdgeColor(gates.identity),
        "assumes role",
      ),
    )
    // role → jewel (data plane): label the excess capability the fix removes.
    if (anchors.jewel) {
      edges.push(straight("e-role-jewel", rightMid(anchors.role), leftMid(anchors.jewel), gateEdgeColor(gates.data_plane ?? gates.network), dataLbl))
    }
  } else if (anchors.foothold && anchors.jewel) {
    // No IAM role node — connect the foothold straight to the jewel so the
    // chain is never broken (e.g. resource-policy / direct-access paths).
    edges.push(curve("e-foothold-jewel", botMid(anchors.foothold), topMid(anchors.jewel), gateEdgeColor(gates.data_plane ?? gates.network), dataLbl))
  }
  if (anchors.jewel && anchors.kms) {
    edges.push(straight("e-jewel-kms", rightMid(anchors.jewel), leftMid(anchors.kms), EDGE_COLOR.enc, "encrypts"))
  }
  // Private alternate route: foothold → VPCE → jewel, when the endpoint serves
  // the jewel's service (e.g. an S3 VPC endpoint to an S3 jewel). "Unused"
  // because the observed path went via the public/IGW route.
  if (vpceAnchor && anchors.foothold && anchors.jewel && jewelMatchesEndpointService(jewelNode, vpce)) {
    edges.push({
      id: "e-foothold-vpce",
      d: curveD(rightMid(anchors.foothold), topMid(vpceAnchor)),
      style: "priv",
      color: EDGE_COLOR.priv,
      label: "private · unused",
      labelX: (anchors.foothold.x + anchors.foothold.w + vpceAnchor.cx) / 2,
      labelY: vpceAnchor.y - 8,
      layer: "ctx",
    })
    edges.push({
      id: "e-vpce-jewel",
      d: curveD(botMid(vpceAnchor), topMid(anchors.jewel)),
      style: "priv",
      color: EDGE_COLOR.priv,
      layer: "ctx",
    })
  }

  return {
    width: W,
    height: H,
    frames,
    cards,
    notes,
    edges,
    meta: {
      vpcId: vpc.id,
      region,
      hasInternetEntry,
      onPathCount: cards.filter((c) => c.onPath).length,
      lambdaCount: lambdaNames.size,
    },
  }
}

// ── small derivation helpers ────────────────────────────────────────────────
function shortAction(a: string): string {
  // "s3:DeleteObject" → "s3:Delete*"; keep service + the leading CamelCase verb.
  const m = a.match(/^([a-z0-9-]+):([A-Z][a-z]+)/)
  if (!m) return a
  return `${m[1]}:${m[2]}*`
}

interface KmsRef {
  id: string
  name: string
}
function findKms(path: IdentityAttackPath, jewelNode?: PathNodeDetail): KmsRef | null {
  // A KMS path node, else the jewel's infra_context KMS neighbor, else its
  // encryption key arn — friendly-named down to the key alias/id.
  const kmsNode = (path.nodes ?? []).find((n) => /kms|key/i.test(n.type))
  if (kmsNode) return { id: kmsNode.id, name: shortName(kmsNode.name) }
  const neighbor = jewelNode?.infra_context?.kms_keys?.[0]
  if (neighbor?.name || neighbor?.id) return { id: neighbor.id ?? neighbor.name ?? "kms", name: shortName(neighbor.name ?? neighbor.id ?? "kms") }
  return null
}
function shortName(s: string): string {
  // arn:aws:kms:…:key/abcd → abcd…; alias/foo → foo.
  if (s.includes("alias/")) return s.split("alias/").pop() ?? s
  if (s.includes("key/")) {
    const k = s.split("key/").pop() ?? s
    return k.length > 12 ? `${k.slice(0, 10)}…` : k
  }
  return s
}
function jewelMatchesEndpointService(jewelNode: PathNodeDetail | undefined, vpce?: TopoVPCE): boolean {
  if (!jewelNode || !vpce?.service) return false
  const svc = vpce.service.toLowerCase()
  return new RegExp(svc, "i").test(jewelNode.type) || new RegExp(svc, "i").test(jewelNode.name)
}

// ── edge geometry ─────────────────────────────────────────────────────────
type Pt = { x: number; y: number }
function straight(id: string, a: Pt, b: Pt, color: string, label?: string): CMEdge {
  return {
    id,
    d: `M${r(a.x)},${r(a.y)} L${r(b.x)},${r(b.y)}`,
    style: "path",
    color,
    label,
    labelX: label ? (a.x + b.x) / 2 : undefined,
    labelY: label ? (a.y + b.y) / 2 - 8 : undefined,
    layer: "path",
  }
}
function curve(id: string, a: Pt, b: Pt, color: string, label?: string): CMEdge {
  return {
    id,
    d: curveD(a, b),
    style: "path",
    color,
    label,
    labelX: label ? (a.x + b.x) / 2 : undefined,
    labelY: label ? (a.y + b.y) / 2 : undefined,
    layer: "path",
  }
}
function curveD(a: Pt, b: Pt): string {
  const midY = (a.y + b.y) / 2
  return `M${r(a.x)},${r(a.y)} C${r(a.x)},${r(midY)} ${r(b.x)},${r(midY)} ${r(b.x)},${r(b.y)}`
}
function r(n: number): number {
  return Math.round(n * 10) / 10
}
