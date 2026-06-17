"use client"

// AWS Architecture view — a WIDE, canonical AWS reference-style diagram of the
// selected path's real topology, built from the live SystemArchitecture:
//
//   AWS Cloud ▸ Region ▸ VPC ▸ (AZ columns) ▸ subnet tiers
//     · PUBLIC subnets  (ingress/egress: IGW-routed, NAT, ALB, bastion)
//     · PRIVATE app subnets (EC2 / Lambda workloads)
//     · PRIVATE data subnets (RDS / databases)
//   Regional / global services (S3, KMS, DynamoDB, SES) sit OUTSIDE the VPC,
//   reached via a Gateway VPC Endpoint (S3/DynamoDB) or the Internet Gateway.
//
// Placement, public/private classification, AZ, CIDR, IGW/NAT/VPCE routing and
// the on-path workloads all come from the live graph (no mock). The selected
// attack path is drawn as an ANIMATED flow (foothold ▸ access gateway ▸ crown
// jewel), coloured by evidence (observed = red, configured = amber). The point
// is that a CISO / SecOps / IT reader can see exactly where each service lives
// and how the attacker traverses to the data.

import { useMemo, type ReactNode } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type {
  SystemArchitecture,
  ServiceNode,
  EgressGatewayNode,
} from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import { CG } from "./cloud-graph-tokens" // light tokens

// ── palette ──────────────────────────────────────────────────────────────
const CAT = { compute: "#E8881C", network: "#7C5CFC", storage: "#2E9E5B", security: "#D9303F", user: "#2b3a4b" } as const
const OBS = "#D9303F" // observed attack edge
const CFG = "#C77F0F" // configured-only attack edge
const FR = {
  cloud: { s: "#9AA8B8", f: "rgba(58,71,87,.03)", l: "#5C6B7E" },
  region: { s: "#2E73E8", f: "rgba(46,115,232,.035)", l: "#2E73E8", d: "5 4" },
  vpc: { s: "#2E9E5B", f: "rgba(63,160,55,.04)", l: "#2E9E5B" },
  az: { s: "#3A6DA0", f: "rgba(58,109,160,.035)", l: "#3A6DA0", d: "4 4" },
}
const TIER = {
  public: { s: "#4E9A4A", f: "rgba(63,160,55,.07)", l: "#3E7E4E", label: "Public subnet" },
  app: { s: "#3F74C0", f: "rgba(48,96,192,.07)", l: "#3F74C0", label: "Application subnet (private)" },
  data: { s: "#5A64C8", f: "rgba(77,90,200,.08)", l: "#5A64C8", label: "Data subnet (private)" },
}

// ── icons (24px, light) ─────────────────────────────────────────────────
function Icon({ kind, size = 26 }: { kind: string; size?: number }) {
  const c =
    kind === "ec2" || kind === "lambda" ? CAT.compute
      : kind === "s3" || kind === "rds" || kind === "ddb" ? CAT.storage
      : kind === "kms" || kind === "role" ? CAT.security
      : kind === "ses" ? "#3060C0"
      : CAT.network
  const w = (inner: ReactNode) => (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={c} />
      {inner}
    </svg>
  )
  switch (kind) {
    case "ec2": return w(<><rect x="12" y="12" width="16" height="16" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" /><rect x="16.5" y="16.5" width="7" height="7" fill="#fff" /><path d="M16 9v3M24 9v3M16 28v3M24 28v3M9 16h3M9 24h3M28 16h3M28 24h3" stroke="#fff" strokeWidth="1.8" /></>)
    case "lambda": return w(<path d="M13 30 L20 13 L23 13 L31 30 H26.5 L21.4 18 L17.5 30 Z" fill="#fff" />)
    case "s3": return w(<path d="M12 13 H28 L26.3 29 Q20 31 13.7 29 Z" fill="#fff" />)
    case "rds": return w(<><ellipse cx="20" cy="14" rx="8" ry="3" fill="none" stroke="#fff" strokeWidth="2" /><path d="M12 14v12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V14" fill="none" stroke="#fff" strokeWidth="2" /></>)
    case "ddb": return w(<><ellipse cx="20" cy="14" rx="8" ry="2.8" fill="none" stroke="#fff" strokeWidth="2" /><path d="M12 14v12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8V14" fill="none" stroke="#fff" strokeWidth="2" /></>)
    case "kms": return w(<><circle cx="17" cy="17" r="5" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M20.5 20.5 L29 29 M26 26 h3 M29 26 v3" stroke="#fff" strokeWidth="2.4" fill="none" /></>)
    case "ses": return w(<><rect x="11" y="13" width="18" height="13" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" /><path d="M11 14 L20 21 L29 14" fill="none" stroke="#fff" strokeWidth="2" /></>)
    case "role": return w(<><circle cx="20" cy="16" r="4.4" fill="#fff" /><path d="M12 30 a8 8 0 0 1 16 0 Z" fill="#fff" /></>)
    case "igw": return w(<><path d="M11 24 V18 a9 9 0 0 1 18 0 V24" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M15 24v-6a5 5 0 0 1 10 0v6" fill="none" stroke="#fff" strokeWidth="2.4" /></>)
    case "nat": return w(<><path d="M14 27 V15 h12 v12 Z" fill="none" stroke="#fff" strokeWidth="2" /><path d="M17 21 h6 M20 18 v6" stroke="#fff" strokeWidth="2" /></>)
    case "vpce": return w(<><path d="M20 9 L29 14 V24 L20 30 L11 24 V14 Z" fill="none" stroke="#fff" strokeWidth="2" /><circle cx="20" cy="19.5" r="3.2" fill="#fff" /></>)
    default: return w(<><circle cx="20" cy="15" r="4.6" fill="#fff" /><path d="M11 31 a9 9 0 0 1 18 0 Z" fill="#fff" /></>)
  }
}

const norm = (s?: string | null) => (s || "").toLowerCase()
function computeKind(t: string): string { return /lambda/i.test(t) ? "lambda" : "ec2" }
function resourceKind(n: ServiceNode): string {
  const t = norm(n.type) + " " + norm(n.name)
  if (/dynamo/.test(t)) return "ddb"
  if (/kms|key/.test(t)) return "kms"
  if (/ses|email|sns/.test(t)) return "ses"
  if (/rds|aurora|database/.test(t)) return "rds"
  if (/s3|bucket/.test(t)) return "s3"
  return "s3"
}

interface Placed { id: string; cx: number; cy: number }

export function AwsArchitectureAttackMap({
  path,
  architecture,
}: {
  path: IdentityAttackPath
  report?: AttackPathReport | null
  architecture?: SystemArchitecture | null
  systemName?: string | null
}) {
  const model = useMemo(() => (architecture ? buildLayout(architecture, path) : null), [architecture, path])

  if (!model) {
    return (
      <p className="px-2 py-12 text-center text-[12px] text-muted-foreground">
        AWS architecture view needs the live topology for this path — it isn’t available yet.
      </p>
    )
  }

  return (
    <div className="relative overflow-auto rounded-[14px] border" style={{ borderColor: CG.border, background: CG.canvas }}>
      <svg
        width={model.W}
        height={model.H}
        viewBox={`0 0 ${model.W} ${model.H}`}
        style={{ display: "block", minWidth: Math.min(model.W, 1180), fontFamily: "var(--font-inter, sans-serif)" }}
      >
        <defs>
          <marker id="aws-ah-obs" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={OBS} /></marker>
          <marker id="aws-ah-cfg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={CFG} /></marker>
          <marker id="aws-ah-net" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill="#8c4fff" /></marker>
          <style>{`@keyframes awsdash{to{stroke-dashoffset:-24}}`}</style>
        </defs>

        {/* frames */}
        {model.frames.map((f) => (
          <g key={f.id}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} strokeDasharray={f.dash} />
            <text x={f.x + 11} y={f.y + 16} fontSize="11" fontWeight={600} fill={f.label}>
              {f.title}
              {f.sub ? <tspan fill={CG.faint} fontWeight={400}>{`   ${f.sub}`}</tspan> : null}
            </text>
          </g>
        ))}

        {/* infra / access edges */}
        {model.infraEdges.map((e, i) => (
          <g key={`ie${i}`}>
            <path d={e.d} fill="none" stroke="#8c4fff" strokeWidth={1.6} strokeDasharray={e.dashed ? "5 4" : undefined} markerEnd="url(#aws-ah-net)" opacity={0.85} />
            {e.label && (
              <text x={e.lx} y={e.ly} fontSize="9" fill="#7C5CFC" textAnchor="middle">{e.label}</text>
            )}
          </g>
        ))}

        {/* animated attack flow */}
        {model.flowEdges.map((e, i) => {
          const col = e.observed ? OBS : CFG
          return (
            <g key={`fe${i}`}>
              <path d={e.d} fill="none" stroke={col} strokeWidth={2.6} strokeLinecap="round"
                strokeDasharray="7 5" style={{ animation: "awsdash 1.1s linear infinite" }}
                markerEnd={`url(#aws-ah-${e.observed ? "obs" : "cfg"})`} opacity={0.95} />
              <circle r="3.4" fill={col}>
                <animateMotion dur="2.4s" repeatCount="indefinite" path={e.d} />
              </circle>
              {e.label && <text x={e.lx} y={e.ly} fontSize="9.5" fontWeight={600} fill={col} textAnchor="middle">{e.label}</text>}
            </g>
          )
        })}

        {/* cards */}
        {model.cards.map((c) => (
          <foreignObject key={c.id} x={c.x} y={c.y} width={c.w} height={c.h}>
            <div style={{
              boxSizing: "border-box", height: "100%", display: "flex", flexDirection: "column", gap: 4,
              alignItems: "center", justifyContent: "center", padding: "7px 6px", borderRadius: 9,
              background: CG.surface, border: `1.6px solid ${c.onPath ? c.accent : CG.border}`,
              boxShadow: c.onPath ? `0 0 0 2px ${c.accent}22, ${CG.shadow}` : CG.shadow, position: "relative",
            }} title={c.title}>
              {c.badge && (
                <span style={{ position: "absolute", top: -8, fontSize: 7.5, fontWeight: 800, letterSpacing: ".04em", padding: "1px 6px", borderRadius: 5, color: "#fff", background: c.badgeColor, whiteSpace: "nowrap" }}>{c.badge}</span>
              )}
              <Icon kind={c.icon} />
              <div style={{ fontFamily: "var(--font-mono-stack, monospace)", fontSize: 9.5, lineHeight: 1.15, color: CG.ink, textAlign: "center", wordBreak: "break-word", maxWidth: c.w - 8, fontWeight: c.onPath ? 600 : 400 }}>{c.title}</div>
              {c.sub && <div style={{ fontSize: 8, color: CG.faint, textAlign: "center" }}>{c.sub}</div>}
            </div>
          </foreignObject>
        ))}
      </svg>

      {/* legend / narrative */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", padding: "9px 13px", borderTop: `1px solid ${CG.border}`, fontSize: 11, color: CG.muted }}>
        <Legend color={OBS} label="observed attack flow (proven in logs)" />
        <Legend color={CFG} dashed label="configured-only (allowed, unproven)" />
        <Legend color="#8c4fff" dashed label="network / access route (IGW · NAT · VPCE)" />
        {model.access && <span style={{ color: CG.ink }}>{model.access}</span>}
        <span style={{ color: CG.faint, marginLeft: "auto" }}>region {model.region} · {model.azCount} AZ · {model.vpcLabel}</span>
      </div>
    </div>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={color} strokeWidth="2.4" strokeDasharray={dashed ? "5 4" : undefined} /></svg>
      {label}
    </span>
  )
}

// ── layout engine ────────────────────────────────────────────────────────
type Card = { id: string; x: number; y: number; w: number; h: number; icon: string; title: string; sub?: string; onPath: boolean; accent: string; badge?: string; badgeColor: string }
type Frame = { id: string; x: number; y: number; w: number; h: number; rx: number; stroke: string; fill: string; sw: number; dash?: string; label: string; title: string; sub?: string }
type Edge = { d: string; observed?: boolean; dashed?: boolean; label?: string; lx?: number; ly?: number }

function buildLayout(arch: SystemArchitecture, path: IdentityAttackPath) {
  const region = arch.region || "—"
  const onPath = new Set<string>([...(path.nodes ?? []).map((n) => n.id)])
  // subnet meta by id
  const subMeta = new Map<string, { name: string; isPublic: boolean | null; az: string; cidr?: string; computeIds: string[] }>()
  for (const s of arch.subnets ?? []) {
    subMeta.set(s.id, { name: s.shortName || s.name, isPublic: s.isPublic, az: s.availabilityZone || "—", cidr: s.cidrBlock, computeIds: s.connectedComputeIds ?? [] })
  }
  // enrich from vpcGroups (isPublic + nodeIds)
  const vpcGroups = arch.vpcGroups ?? []
  let vpcLabel = vpcGroups[0]?.vpcName || "VPC"
  let vpcCidr = vpcGroups[0]?.cidrBlock
  for (const vg of vpcGroups) {
    for (const s of vg.subnets) {
      const m = subMeta.get(s.subnetId) || { name: s.subnetName, isPublic: s.isPublic, az: "—", computeIds: [] as string[] }
      if (m.isPublic == null) m.isPublic = s.isPublic
      if (!m.computeIds.length) m.computeIds = s.nodeIds
      m.name = m.name || s.subnetName
      subMeta.set(s.subnetId, m)
    }
  }

  const computeById = new Map<string, ServiceNode>((arch.computeServices ?? []).map((c) => [c.id, c]))
  const isDb = (c?: ServiceNode) => !!c && /rds|aurora|database|db/i.test(`${c.type} ${c.name}`)

  // tier classification per subnet
  function tierOf(meta: { isPublic: boolean | null; name: string; computeIds: string[] }): "public" | "app" | "data" {
    if (meta.isPublic === true) return "public"
    const comps = meta.computeIds.map((id) => computeById.get(id))
    if (comps.some(isDb) || /data|db|rds/i.test(meta.name)) return "data"
    return "app"
  }

  // group subnets by AZ then tier
  const azNames = Array.from(new Set(Array.from(subMeta.values()).map((m) => m.az))).filter(Boolean).sort()
  if (azNames.length === 0) azNames.push("—")
  const tiers: Array<"public" | "app" | "data"> = ["public", "app", "data"]

  // per (az,tier) -> subnet metas
  const grid = new Map<string, Array<{ id: string; meta: ReturnType<typeof subMeta.get> }>>()
  for (const [id, meta] of subMeta) {
    if (!meta) continue
    const key = `${meta.az}|${tierOf(meta)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push({ id, meta })
  }

  // ── geometry ──
  const PAD = 18
  const cardW = 116, cardH = 64, cardGap = 12, perRow = 2
  const subnetPadX = 12, subnetHeaderH = 26, subnetGapY = 12
  const azPadX = 12, azHeaderH = 24
  const colGap = 26
  const azInnerW = subnetPadX * 2 + perRow * cardW + (perRow - 1) * cardGap
  const azW = azPadX * 2 + azInnerW

  // subnet box height for a set of metas at (az,tier)
  const subnetH = (metas: Array<{ id: string; meta: ReturnType<typeof subMeta.get> }>) => {
    let h = 0
    for (const { id } of metas) {
      const n = (subMeta.get(id)?.computeIds.length) || 0
      const rows = Math.max(1, Math.ceil(n / perRow))
      h += subnetHeaderH + rows * cardH + (rows - 1) * cardGap + 14 + subnetGapY
    }
    return Math.max(h, subnetHeaderH + cardH + 22)
  }
  // tier band height = max across AZs
  const tierBandH: Record<string, number> = {}
  for (const t of tiers) {
    let mx = 0
    for (const az of azNames) {
      const metas = grid.get(`${az}|${t}`) || []
      if (metas.length) mx = Math.max(mx, subnetH(metas))
    }
    tierBandH[t] = mx // 0 if tier absent everywhere
  }
  const presentTiers = tiers.filter((t) => tierBandH[t] > 0)

  // layout origins
  const cloudX = PAD, cloudY = PAD
  const cloudPad = 16, regionPad = 14, vpcPad = 16
  const igwH = 64
  const vpcInnerY0 = cloudY + cloudPad + 22 + regionPad + 22 + vpcPad + 22 + igwH + 10
  const azX0 = cloudX + cloudPad + regionPad + vpcPad + azPadX
  const azContentW = azNames.length * azW + (azNames.length - 1) * colGap

  const cards: Card[] = []
  const frames: Frame[] = []
  const infraEdges: Edge[] = []
  const flowEdges: Edge[] = []
  const placed = new Map<string, Placed>()

  // tier band Y positions inside AZ
  const bandY: Record<string, number> = {}
  let yCursor = vpcInnerY0 + azHeaderH + 8
  for (const t of presentTiers) {
    bandY[t] = yCursor
    yCursor += tierBandH[t] + 16
  }
  const azInnerBottom = yCursor
  const azBoxH = azInnerBottom - vpcInnerY0

  // place AZ columns + subnets + cards
  azNames.forEach((az, ai) => {
    const ax = azX0 + ai * (azW + colGap)
    frames.push({ id: `az-${az}`, x: ax, y: vpcInnerY0, w: azW, h: azBoxH, rx: 9, stroke: FR.az.s, fill: FR.az.f, sw: 1.3, dash: FR.az.d, label: FR.az.l, title: `Availability Zone · ${az}` })
    for (const t of presentTiers) {
      const metas = grid.get(`${az}|${t}`) || []
      if (!metas.length) continue
      const sx = ax + azPadX
      const sy = bandY[t]
      const sw = azInnerW
      const sh = tierBandH[t] - subnetGapY
      const ti = TIER[t]
      frames.push({ id: `sn-${az}-${t}`, x: sx, y: sy, w: sw, h: sh, rx: 8, stroke: ti.s, fill: ti.f, sw: 1.3, label: ti.l, title: ti.label, sub: metas[0]?.meta?.cidr || undefined })
      // place compute cards
      let cy = sy + subnetHeaderH
      for (const { id } of metas) {
        const meta = subMeta.get(id)!
        const comps = meta.computeIds.map((cid) => computeById.get(cid)).filter(Boolean) as ServiceNode[]
        comps.forEach((c, idx) => {
          const col = idx % perRow
          const row = Math.floor(idx / perRow)
          const cx = sx + subnetPadX + col * (cardW + cardGap)
          const yy = cy + row * (cardH + cardGap)
          const op = onPath.has(c.id)
          const isFoot = op && /ec2|instance|lambda|compute/i.test(`${c.type}`)
          cards.push({ id: c.id, x: cx, y: yy, w: cardW, h: cardH, icon: computeKind(c.type), title: c.shortName || c.name, onPath: op, accent: CAT.compute, badge: op && isFoot ? "FOOTHOLD" : undefined, badgeColor: CAT.compute })
          placed.set(c.id, { id: c.id, cx: cx + cardW / 2, cy: yy + cardH / 2 })
        })
        const rows = Math.max(1, Math.ceil(comps.length / perRow))
        cy += subnetHeaderH + rows * cardH + (rows - 1) * cardGap + 14 + subnetGapY
      }
    }
  })

  // VPC frame
  const vpcX = cloudX + cloudPad + regionPad
  const vpcY = cloudY + cloudPad + 22 + regionPad + 22
  const vpcW = vpcPad * 2 + azContentW
  const vpcH = (azInnerBottom - vpcY) + vpcPad
  // IGW node centered at VPC top
  const igwCx = vpcX + vpcW / 2
  const igwCy = vpcY + vpcPad + 22 + igwH / 2
  const igw = (arch.egressGateways ?? []).find((g) => g.kind === "InternetGateway")
  cards.push({ id: "__igw", x: igwCx - 30, y: igwCy - 30, w: 60, h: 60, icon: "igw", title: "IGW", sub: igw ? "internet" : "internet", onPath: false, accent: CAT.network, badgeColor: CAT.network })
  placed.set("__igw", { id: "__igw", cx: igwCx, cy: igwCy })

  // NAT (if present) — sit it near a public band
  const nat = (arch.egressGateways ?? []).find((g) => g.kind === "NATGateway")

  // Region + Cloud frames sized to contain everything + right rail
  // ── regional services OUTSIDE the VPC (right rail) ──
  const railX = vpcX + vpcW + 70
  const railCardW = 150, railCardH = 64, railGapY = 16
  const regional = dedupeResources(arch)
  const jewel = regional.find((r) => r.isCrownJewel) || regional[0]
  let ry = vpcInnerY0 + 10
  const railCards: Card[] = []
  for (const r of regional) {
    const op = onPath.has(r.id) || r.id === jewel?.id
    railCards.push({ id: r.id, x: railX, y: ry, w: railCardW, h: railCardH, icon: resourceKind(r), title: r.shortName || r.name, onPath: op, accent: r.isCrownJewel ? CAT.security : CAT.storage, badge: r.isCrownJewel ? "CROWN JEWEL" : undefined, badgeColor: CAT.security })
    placed.set(r.id, { id: r.id, cx: railX + railCardW / 2, cy: ry + railCardH / 2 })
    ry += railCardH + railGapY
  }
  cards.push(...railCards)

  // VPC Endpoint on the VPC right boundary (if a gateway VPCE exists for the path)
  const vpceGw: EgressGatewayNode | undefined = (arch.egressGateways ?? []).find((g) => g.kind === "VPCEndpoint")
  const vpce = vpceGw || ((arch.vpcEndpoints ?? [])[0] ? { id: arch.vpcEndpoints![0].id, kindLabel: "VPCE", serviceHint: arch.vpcEndpoints![0].serviceShort } as Partial<EgressGatewayNode> : undefined)
  let vpceCenter: Placed | null = null
  if (vpce && jewel) {
    const vx = vpcX + vpcW + 6, vy = (vpcInnerY0 + azInnerBottom) / 2
    cards.push({ id: "__vpce", x: vx - 24, y: vy - 24, w: 48, h: 48, icon: "vpce", title: "VPCE", sub: (vpce as EgressGatewayNode).serviceHint || "s3", onPath: true, accent: CAT.network, badgeColor: CAT.network })
    vpceCenter = { id: "__vpce", cx: vx, cy: vy }
    placed.set("__vpce", vpceCenter)
  }

  // ── access route: foothold/private → (VPCE | IGW) → jewel ──
  const footholds = (arch.computeServices ?? []).filter((c) => onPath.has(c.id) && placed.has(c.id))
  const accessVia = vpceCenter ? "VPC Endpoint" : "Internet Gateway"
  if (jewel && placed.has(jewel.id)) {
    const jp = placed.get(jewel.id)!
    for (const f of footholds) {
      const fp = placed.get(f.id)!
      const obs = (path.evidence_type ?? "configured") === "observed"
      if (vpceCenter) {
        flowEdges.push({ d: curve(fp.cx, fp.cy, vpceCenter.cx, vpceCenter.cy), observed: obs })
        flowEdges.push({ d: curve(vpceCenter.cx, vpceCenter.cy, jp.cx, jp.cy), observed: obs, label: `via ${(vpce as EgressGatewayNode)?.serviceHint || "S3"} VPCE`, lx: (vpceCenter.cx + jp.cx) / 2, ly: (vpceCenter.cy + jp.cy) / 2 - 6 })
      } else {
        const ig = placed.get("__igw")!
        flowEdges.push({ d: curve(fp.cx, fp.cy, ig.cx, ig.cy), observed: obs })
        flowEdges.push({ d: curve(ig.cx, ig.cy, jp.cx, jp.cy), observed: obs, label: "via IGW", lx: (ig.cx + jp.cx) / 2, ly: (ig.cy + jp.cy) / 2 - 6 })
      }
    }
  }
  // static access hint edge: private subnet → VPCE (shows reachability even w/o foothold)
  if (vpceCenter && jewel && placed.has(jewel.id)) {
    const jp = placed.get(jewel.id)!
    infraEdges.push({ d: curve(vpceCenter.cx, vpceCenter.cy, jp.cx, jp.cy), dashed: true })
  }

  // frames: cloud + region + vpc
  const rightExtent = Math.max(vpcX + vpcW, railX + railCardW) + PAD
  const bottomExtent = Math.max(azInnerBottom + vpcPad, ry) + PAD + 4
  const W = rightExtent + PAD
  const H = bottomExtent
  frames.unshift(
    { id: "cloud", x: cloudX, y: cloudY, w: W - 2 * PAD, h: H - cloudY - PAD, rx: 10, stroke: FR.cloud.s, fill: FR.cloud.f, sw: 1.1, label: FR.cloud.l, title: "AWS Cloud" },
    { id: "region", x: cloudX + cloudPad, y: cloudY + cloudPad, w: (W - 2 * PAD) - 2 * cloudPad, h: (H - cloudY - PAD) - cloudPad - 8, rx: 9, stroke: FR.region.s, fill: FR.region.f, sw: 1.3, dash: FR.region.d, label: FR.region.l, title: `Region · ${region}` },
    { id: "vpc", x: vpcX, y: vpcY, w: vpcW, h: vpcH, rx: 9, stroke: FR.vpc.s, fill: FR.vpc.f, sw: 1.4, label: FR.vpc.l, title: `VPC · ${vpcLabel}`, sub: vpcCidr || undefined },
  )

  const access = jewel ? `Access: ${footholds[0]?.shortName || "workload"} → ${jewel.shortName || jewel.name} via ${accessVia}${nat ? " · outbound via NAT" : ""}` : undefined

  return { W, H, frames, cards, infraEdges, flowEdges, region, azCount: azNames.length, vpcLabel, access }
}

function dedupeResources(arch: SystemArchitecture): ServiceNode[] {
  const seen = new Set<string>()
  const out: ServiceNode[] = []
  for (const r of [...(arch.resources ?? []), ...(arch.computeServices ?? []).filter((c) => c.isCrownJewel)]) {
    if (seen.has(r.id)) continue
    // regional/global services only (S3/KMS/DDB/SES/Secrets) or explicit crown jewels
    if (r.isCrownJewel || /s3|bucket|kms|key|dynamo|ses|secret|sns|sqs/i.test(`${r.type} ${r.name}`)) {
      seen.add(r.id)
      out.push(r)
    }
  }
  return out.slice(0, 8)
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.4)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
