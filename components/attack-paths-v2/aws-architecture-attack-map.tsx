"use client"

// AWS Architecture view — a WIDE, canonical AWS reference diagram of the
// system's REAL topology, with the selected attack path overlaid + animated.
//
//   AWS Cloud ▸ Region ▸ VPC ▸ (AZ columns) ▸ subnet tiers
//     · PUBLIC subnets  (IGW-routed: ALB / bastion / NAT)
//     · PRIVATE app subnets (EC2 / Lambda workloads)
//     · PRIVATE data subnets (RDS / databases)
//   Regional / global services (S3, KMS, DynamoDB, SES) sit OUTSIDE the VPC,
//   reached via a Gateway VPC Endpoint (S3/DynamoDB) or the Internet Gateway.
//
// The full infrastructure comes from the live topology
// (GET /api/proxy/topology-aws/<system>) so EVERY subnet, AZ and workload is
// drawn (not just the single path). The selected path is highlighted and the
// foothold ▸ access-gateway ▸ crown-jewel route is animated (observed = red,
// configured = amber). A CISO / SecOps / IT reader sees where each service
// lives (public vs private subnet) and exactly how the attacker reaches the
// data (via VPCE or IGW). No mock — all derived from the graph.

import { useMemo, type ReactNode } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, ServiceNode } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import type { TopologyResponse, TopoVPC, TopoWorkload } from "./containment-model"
import { CG } from "./cloud-graph-tokens"

const CAT = { compute: "#E8881C", network: "#7C5CFC", storage: "#2E9E5B", security: "#D9303F", user: "#2b3a4b" } as const
const OBS = "#D9303F", CFG = "#C77F0F"
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

function Icon({ kind, size = 26 }: { kind: string; size?: number }) {
  const c = kind === "ec2" || kind === "lambda" ? CAT.compute
    : kind === "s3" || kind === "rds" || kind === "ddb" ? CAT.storage
    : kind === "kms" || kind === "role" ? CAT.security
    : kind === "ses" ? "#3060C0" : CAT.network
  const w = (inner: ReactNode) => (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill={c} />{inner}</svg>
  )
  switch (kind) {
    case "ec2": return w(<><rect x="12" y="12" width="16" height="16" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" /><rect x="16.5" y="16.5" width="7" height="7" fill="#fff" /><path d="M16 9v3M24 9v3M16 28v3M24 28v3M9 16h3M9 24h3M28 16h3M28 24h3" stroke="#fff" strokeWidth="1.8" /></>)
    case "lambda": return w(<path d="M13 30 L20 13 L23 13 L31 30 H26.5 L21.4 18 L17.5 30 Z" fill="#fff" />)
    case "s3": return w(<path d="M12 13 H28 L26.3 29 Q20 31 13.7 29 Z" fill="#fff" />)
    case "rds": return w(<><ellipse cx="20" cy="14" rx="8" ry="3" fill="none" stroke="#fff" strokeWidth="2" /><path d="M12 14v12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V14" fill="none" stroke="#fff" strokeWidth="2" /></>)
    case "ddb": return w(<><ellipse cx="20" cy="14" rx="8" ry="2.8" fill="none" stroke="#fff" strokeWidth="2" /><path d="M12 14v12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8V14" fill="none" stroke="#fff" strokeWidth="2" /><path d="M28 19l-2 2-2-2" stroke="#fff" strokeWidth="2" fill="none" /></>)
    case "kms": return w(<><circle cx="17" cy="17" r="5" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M20.5 20.5 L29 29 M26 26 h3 M29 26 v3" stroke="#fff" strokeWidth="2.4" fill="none" /></>)
    case "ses": return w(<><rect x="11" y="13" width="18" height="13" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" /><path d="M11 14 L20 21 L29 14" fill="none" stroke="#fff" strokeWidth="2" /></>)
    case "role": return w(<><circle cx="20" cy="16" r="4.4" fill="#fff" /><path d="M12 30 a8 8 0 0 1 16 0 Z" fill="#fff" /></>)
    case "igw": return w(<><path d="M11 24 V18 a9 9 0 0 1 18 0 V24" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M15 24v-6a5 5 0 0 1 10 0v6" fill="none" stroke="#fff" strokeWidth="2.4" /></>)
    case "vpce": return w(<><path d="M20 9 L29 14 V24 L20 30 L11 24 V14 Z" fill="none" stroke="#fff" strokeWidth="2" /><circle cx="20" cy="19.5" r="3.2" fill="#fff" /></>)
    default: return w(<><circle cx="20" cy="15" r="4.6" fill="#fff" /><path d="M11 31 a9 9 0 0 1 18 0 Z" fill="#fff" /></>)
  }
}
const norm = (s?: string | null) => (s || "").toLowerCase().trim()
const computeKind = (t: string) => (/lambda/i.test(t) ? "lambda" : /rds|aurora|database/i.test(t) ? "rds" : "ec2")
function jewelKind(name: string, type: string): string {
  const t = norm(type) + " " + norm(name)
  if (/dynamo/.test(t)) return "ddb"
  if (/kms|key|cmk/.test(t)) return "kms"
  if (/ses|email|sns/.test(t)) return "ses"
  if (/rds|aurora|database/.test(t)) return "rds"
  return "s3"
}

type Card = { id: string; x: number; y: number; w: number; h: number; icon: string; title: string; sub?: string; onPath: boolean; accent: string; badge?: string; badgeColor: string; stack?: number }
type Frame = { id: string; x: number; y: number; w: number; h: number; rx: number; stroke: string; fill: string; sw: number; dash?: string; label: string; title: string; sub?: string }
type Edge = { d: string; observed?: boolean; dashed?: boolean; label?: string; lx?: number; ly?: number }
type Model = { W: number; H: number; frames: Frame[]; cards: Card[]; infraEdges: Edge[]; flowEdges: Edge[]; region: string; azCount: number; vpcLabel: string; access?: string }

export function AwsArchitectureAttackMap({
  path,
  report,
  architecture,
  systemName,
}: {
  path: IdentityAttackPath
  report?: AttackPathReport | null
  architecture?: SystemArchitecture | null
  systemName?: string | null
}) {
  const topoUrl = systemName ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}` : null
  const { data: topology } = useCachedFetch<TopologyResponse>(topoUrl, { cacheKey: `topology-aws:${systemName}` })

  const model = useMemo<Model | null>(() => {
    if (topology && (topology.vpcs?.length ?? 0) > 0) {
      const m = buildFromTopology(topology, architecture ?? null, path, report ?? null)
      if (m) return m
    }
    return architecture ? buildFromArchitecture(architecture, path) : null
  }, [topology, architecture, path, report])

  if (!model) {
    return <p className="px-2 py-12 text-center text-[12px] text-muted-foreground">AWS architecture view needs the live topology for this path — it isn’t available yet.</p>
  }

  return (
    <div className="relative overflow-auto rounded-[14px] border" style={{ borderColor: CG.border, background: CG.canvas }}>
      <svg width={model.W} height={model.H} viewBox={`0 0 ${model.W} ${model.H}`} style={{ display: "block", minWidth: Math.min(model.W, 1180), fontFamily: "var(--font-inter, sans-serif)" }}>
        <defs>
          <marker id="aws-ah-obs" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={OBS} /></marker>
          <marker id="aws-ah-cfg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={CFG} /></marker>
          <marker id="aws-ah-net" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill="#8c4fff" /></marker>
          <style>{`@keyframes awsdash{to{stroke-dashoffset:-24}}`}</style>
        </defs>
        {model.frames.map((f) => (
          <g key={f.id}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx} fill={f.fill} stroke={f.stroke} strokeWidth={f.sw} strokeDasharray={f.dash} />
            <text x={f.x + 11} y={f.y + 16} fontSize="11" fontWeight={600} fill={f.label}>{f.title}{f.sub ? <tspan fill={CG.faint} fontWeight={400}>{`   ${f.sub}`}</tspan> : null}</text>
          </g>
        ))}
        {model.infraEdges.map((e, i) => (
          <g key={`ie${i}`}>
            <path d={e.d} fill="none" stroke="#8c4fff" strokeWidth={1.6} strokeDasharray={e.dashed ? "5 4" : undefined} markerEnd="url(#aws-ah-net)" opacity={0.8} />
            {e.label && <text x={e.lx} y={e.ly} fontSize="9" fill="#7C5CFC" textAnchor="middle">{e.label}</text>}
          </g>
        ))}
        {model.flowEdges.map((e, i) => {
          const col = e.observed ? OBS : CFG
          return (
            <g key={`fe${i}`}>
              <path d={e.d} fill="none" stroke={col} strokeWidth={2.6} strokeLinecap="round" strokeDasharray="7 5" style={{ animation: "awsdash 1.1s linear infinite" }} markerEnd={`url(#aws-ah-${e.observed ? "obs" : "cfg"})`} opacity={0.95} />
              <circle r="3.4" fill={col}><animateMotion dur="2.4s" repeatCount="indefinite" path={e.d} /></circle>
              {e.label && <text x={e.lx} y={e.ly} fontSize="9.5" fontWeight={600} fill={col} textAnchor="middle">{e.label}</text>}
            </g>
          )
        })}
        {model.cards.map((c) => (
          <g key={c.id}>
            {c.stack && c.stack > 1 ? (
              <>
                <rect x={c.x + 10} y={c.y + 10} width={c.w} height={c.h} rx={9} fill={CG.surface} stroke={CG.border} strokeWidth={1.3} />
                <rect x={c.x + 5} y={c.y + 5} width={c.w} height={c.h} rx={9} fill={CG.surface} stroke={CG.border} strokeWidth={1.3} />
              </>
            ) : null}
            <foreignObject x={c.x} y={c.y - 14} width={c.w} height={c.h + 14}>
              <div style={{ boxSizing: "border-box", height: c.h, marginTop: 14, display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", padding: "8px 6px 6px", borderRadius: 9, background: CG.surface, border: `1.6px solid ${c.onPath ? c.accent : CG.border}`, boxShadow: c.onPath ? `0 0 0 2px ${c.accent}22, ${CG.shadow}` : CG.shadow, position: "relative" }} title={c.stack && c.stack > 1 ? `${c.title} — runs in ${c.stack} AZs` : c.title}>
                {c.badge && <span style={{ position: "absolute", top: -9, fontSize: 7.5, fontWeight: 800, letterSpacing: ".04em", padding: "1px 6px", borderRadius: 5, color: "#fff", background: c.badgeColor, whiteSpace: "nowrap" }}>{c.badge}</span>}
                {c.stack && c.stack > 1 ? <span style={{ position: "absolute", top: 3, right: 3, fontSize: 7.5, fontWeight: 700, padding: "1px 5px", borderRadius: 5, color: "#fff", background: CAT.network }}>{`×${c.stack}`}</span> : null}
                <Icon kind={c.icon} />
                <div style={{ fontFamily: "var(--font-mono-stack, monospace)", fontSize: 9.5, lineHeight: 1.15, color: CG.ink, textAlign: "center", wordBreak: "break-word", maxWidth: c.w - 8, fontWeight: c.onPath ? 600 : 400 }}>{c.title}</div>
                {c.sub && <div style={{ fontSize: 8, color: CG.faint, textAlign: "center" }}>{c.sub}</div>}
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", padding: "9px 13px", borderTop: `1px solid ${CG.border}`, fontSize: 11, color: CG.muted }}>
        <Legend color={OBS} label="observed attack flow (proven in logs)" />
        <Legend color={CFG} dashed label="configured-only (allowed, unproven)" />
        <Legend color="#8c4fff" dashed label="network / access route (IGW · NAT · VPCE)" />
        {model.access && <span style={{ color: CG.ink }}>{model.access}</span>}
        <span style={{ color: CG.faint }}>tiers grouped by role · ×N = same-function / multi-AZ resources collapsed</span>
        <span style={{ color: CG.faint, marginLeft: "auto" }}>region {model.region} · {model.azCount} AZ · {model.vpcLabel}</span>
      </div>
    </div>
  )
}
function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={color} strokeWidth="2.4" strokeDasharray={dashed ? "5 4" : undefined} /></svg>{label}</span>
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.4)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

// geometry shared by both builders
const G = { PAD: 18, cardW: 116, cardH: 64, cardGap: 12, perRow: 2, subnetPadX: 12, subnetHeaderH: 24, azPadX: 12, azHeaderH: 24, colGap: 26, cloudPad: 16, regionPad: 14, vpcPad: 16, igwH: 60, railCardW: 158, railCardH: 64, railGapY: 18, vpcGapY: 28 }

// ── builder from full live topology (all subnets/AZs/workloads) ────────────
function buildFromTopology(topo: TopologyResponse, arch: SystemArchitecture | null, path: IdentityAttackPath, report: AttackPathReport | null): Model | null {
  const vpcs = (topo.vpcs ?? []).filter((v) => (v.azs ?? []).some((az) => (az.subnets ?? []).some((s) => (s.workloads ?? []).length)))
  if (!vpcs.length) return null
  const region = vpcs[0].region || arch?.region || "—"

  const opNames = new Set<string>()
  for (const n of path.nodes ?? []) { if (n.name) opNames.add(norm(n.name)) }
  const sourceLabel = norm(report?.current_state?.source_label)
  const targetLabel = norm(report?.current_state?.target_label)
  const onPathName = (n: string) => opNames.has(norm(n))
  // Canonical 3-tier classification by ROLE so the reference Public/App/Data
  // structure renders from the real workloads even when the underlying subnets
  // are flat (e.g. a default VPC where every subnet routes to the IGW).
  const roleTier = (w: TopoWorkload): "public" | "app" | "data" => {
    const t = `${w.type} ${w.name}`.toLowerCase()
    if (/rds|aurora|dynamo|database|\bdb\b|elasticache|redis|memcached/.test(t)) return "data"
    if (/alb|elb|nlb|load.?balancer|bastion|\bnat\b|gateway|frontend|web[-_]?server|reverse.?proxy|waf|ingress|public|api[-_]?gw|apigateway/.test(t)) return "public"
    return "app"
  }
  const tiers: Array<"public" | "app" | "data"> = ["public", "app", "data"]

  const azInnerW = G.subnetPadX * 2 + G.perRow * G.cardW + (G.perRow - 1) * G.cardGap
  const azW = G.azPadX * 2 + azInnerW

  const frames: Frame[] = [], cards: Card[] = [], infraEdges: Edge[] = [], flowEdges: Edge[] = []
  const placed = new Map<string, { cx: number; cy: number }>()

  const regionX = G.PAD + G.cloudPad, regionTop = G.PAD + G.cloudPad
  const innerX0 = regionX + G.regionPad
  let cursorY = regionTop + 22 + G.vpcPad // below region header
  let maxRight = innerX0
  const igwAnchors: Array<{ cx: number; cy: number }> = []

  vpcs.forEach((vpc, vi) => {
    const azs = (vpc.azs ?? []).filter((az) => (az.subnets ?? []).some((s) => (s.workloads ?? []).length))
    if (!azs.length) return
    const vpcX = innerX0
    const vpcY = cursorY
    const vpcInnerY0 = vpcY + G.vpcPad + 22 + G.igwH + 12 // header + IGW band

    // Collapse duplicates into ONE stacked card with a ×N count:
    //  • the SAME workload spanning multiple AZs (VPC Lambda with an ENI per AZ)
    //  • SAME-FUNCTION siblings (name minus a trailing -N/_N, e.g. App-1/App-2)
    type UN = { w: TopoWorkload; azIdx: number[]; cidr: string | null }
    const uniq = new Map<string, UN>()
    azs.forEach((az, ai) => { for (const s of az.subnets ?? []) for (const w of s.workloads ?? []) {
      const e = uniq.get(w.name) || { w, azIdx: [], cidr: s.cidr }
      if (!e.azIdx.includes(ai)) e.azIdx.push(ai)
      uniq.set(w.name, e)
    } })
    const baseName = (n: string) => n.replace(/[-_]\s*\d+$/, "")
    type WL = { title: string; kind: string; cidr: string | null; stack: number; members: string[] }
    const groups = new Map<string, WL & { tier: "public" | "app" | "data"; az: number }>()
    for (const [name, e] of uniq) {
      const tier = roleTier(e.w)
      const key = `${tier}|${baseName(name)}`
      const az0 = Math.min(...e.azIdx)
      const g = groups.get(key)
      if (!g) groups.set(key, { title: baseName(name), kind: tier === "data" ? jewelKind(name, e.w.type) : computeKind(e.w.type), cidr: e.cidr, stack: 0, members: [name], tier, az: az0 })
      else { g.members.push(name); g.az = Math.min(g.az, az0) }
    }
    const azBands: Array<Record<string, WL[]>> = azs.map(() => ({ public: [], app: [], data: [] }))
    for (const g of groups.values()) {
      const instances = g.members.length
      const azSpan = instances === 1 ? (uniq.get(g.members[0])?.azIdx.length ?? 1) : 0
      azBands[g.az][g.tier].push({ title: instances > 1 ? g.title : g.members[0], kind: g.kind, cidr: g.cidr, stack: Math.max(instances, azSpan), members: g.members })
    }
    const bandH = (items: WL[]) => {
      const rows = Math.max(1, Math.ceil(items.length / G.perRow))
      return G.subnetHeaderH + rows * G.cardH + (rows - 1) * G.cardGap + 26
    }
    const tierBandH: Record<string, number> = { public: 0, app: 0, data: 0 }
    for (const t of tiers) for (const ab of azBands) if (ab[t].length) tierBandH[t] = Math.max(tierBandH[t], bandH(ab[t]))
    const presentTiers = tiers.filter((t) => tierBandH[t] > 0)

    const bandY: Record<string, number> = {}
    let yc = vpcInnerY0 + G.azHeaderH + 8
    for (const t of presentTiers) { bandY[t] = yc; yc += tierBandH[t] + 16 }
    const azBoxH = yc - vpcInnerY0
    const azX0 = vpcX + G.vpcPad + G.azPadX
    const activeAZ = azs.map((_, ai) => ai).filter((ai) => tiers.some((t) => azBands[ai][t].length > 0))
    const nAZ = Math.max(1, activeAZ.length)
    const vpcInnerW = G.vpcPad * 2 + nAZ * azW + (nAZ - 1) * G.colGap

    // VPC + IGW
    const igwCx = vpcX + vpcInnerW / 2, igwCy = vpcY + G.vpcPad + 22 + G.igwH / 2
    igwAnchors.push({ cx: igwCx, cy: igwCy })
    cards.push({ id: `__igw-${vi}`, x: igwCx - 30, y: igwCy - 30, w: 60, h: 60, icon: "igw", title: "IGW", sub: "internet", onPath: false, accent: CAT.network, badgeColor: CAT.network })
    placed.set(`__igw-${vi}`, { cx: igwCx, cy: igwCy })

    azs.forEach((az, ai) => {
      const slot = activeAZ.indexOf(ai)
      if (slot < 0) return
      const ax = azX0 + slot * (azW + G.colGap)
      frames.push({ id: `az-${vi}-${ai}`, x: ax, y: vpcInnerY0, w: azW, h: azBoxH, rx: 9, stroke: FR.az.s, fill: FR.az.f, sw: 1.3, dash: FR.az.d, label: FR.az.l, title: `Availability Zone · ${az.name}` })
      for (const t of presentTiers) {
        const items = azBands[ai][t]
        if (!items.length) continue
        const sx = ax + G.azPadX, sy = bandY[t], sw = azInnerW, sh = tierBandH[t] - 12, ti = TIER[t]
        frames.push({ id: `sn-${vi}-${ai}-${t}`, x: sx, y: sy, w: sw, h: sh, rx: 8, stroke: ti.s, fill: ti.f, sw: 1.3, label: ti.l, title: ti.label, sub: items[0]?.cidr || undefined })
        const cy = sy + G.subnetHeaderH
        items.forEach((it, idx) => {
          const col = idx % G.perRow, row = Math.floor(idx / G.perRow)
          const cx = sx + G.subnetPadX + col * (G.cardW + G.cardGap), yy = cy + row * (G.cardH + G.cardGap)
          const op = it.members.some(onPathName)
          const isFoot = it.members.some((m) => norm(m) === sourceLabel)
          const multiInstance = it.members.length > 1
          const sub = it.stack > 1 ? (multiInstance ? `×${it.stack}` : `×${it.stack} AZ`) : undefined
          const center = { cx: cx + G.cardW / 2, cy: yy + G.cardH / 2 }
          cards.push({ id: `wl-${vi}-${ai}-${t}-${idx}`, x: cx, y: yy, w: G.cardW, h: G.cardH, icon: it.kind, title: it.title, sub, stack: it.stack, onPath: op, accent: CAT.compute, badge: isFoot ? "FOOTHOLD" : undefined, badgeColor: CAT.compute })
          for (const m of it.members) placed.set(`name:${norm(m)}`, center)
        })
      }
    })

    const vpcH = (vpcInnerY0 + azBoxH) - vpcY + G.vpcPad
    frames.push({ id: `vpc-${vi}`, x: vpcX, y: vpcY, w: vpcInnerW, h: vpcH, rx: 9, stroke: FR.vpc.s, fill: FR.vpc.f, sw: 1.4, label: FR.vpc.l, title: `VPC · ${vpc.name}`, sub: vpc.cidr || undefined })
    cursorY = vpcY + vpcH + G.vpcGapY
    maxRight = Math.max(maxRight, vpcX + vpcInnerW)
  })

  // ── crown jewels OUTSIDE the VPC (right rail) ──
  const railX = maxRight + 76
  const regional = collectJewels(arch, report)
  const target = regional.find((r) => norm(r.name) === targetLabel || norm(r.title) === targetLabel) || regional.find((r) => r.crown) || regional[0]
  let ry = regionTop + 30
  const railRight = railX + G.railCardW
  for (const r of regional) {
    const op = r === target
    cards.push({ id: r.id, x: railX, y: ry, w: G.railCardW, h: G.railCardH, icon: r.icon, title: r.title, onPath: op, accent: r.crown ? CAT.security : CAT.storage, badge: r.crown ? "CROWN JEWEL" : undefined, badgeColor: CAT.security })
    placed.set(`jewel:${r.id}`, { cx: railX + G.railCardW / 2, cy: ry + G.railCardH / 2 })
    ry += G.railCardH + G.railGapY
  }

  // VPCE on the right boundary of the first VPC
  let vpce: { cx: number; cy: number } | null = null
  const hasS3Vpce = vpcs.some((v) => (v.vpc_endpoints ?? []).some((e) => /s3/i.test(`${e.service || e.name}`)))
  if (target && hasS3Vpce) {
    const vx = maxRight + 18, vy = regionTop + 30 + 200
    cards.push({ id: "__vpce", x: vx - 24, y: vy - 24, w: 48, h: 48, icon: "vpce", title: "VPCE", sub: "s3", onPath: true, accent: CAT.network, badgeColor: CAT.network })
    vpce = { cx: vx, cy: vy }
    placed.set("__vpce", vpce)
  }

  // ── animate foothold → (VPCE|IGW) → jewel ──
  const observed = norm(report?.current_state?.status).includes("open") || (path.evidence_type ?? "configured") === "observed"
  const footKey = placed.get(`name:${sourceLabel}`) ? `name:${sourceLabel}` : null
  const footAnchor = footKey ? placed.get(footKey)! : Array.from(opNames).map((n) => placed.get(`name:${n}`)).find(Boolean) || null
  const jp = target ? placed.get(`jewel:${target.id}`) : null
  if (footAnchor && jp) {
    if (vpce) {
      flowEdges.push({ d: curve(footAnchor.cx, footAnchor.cy, vpce.cx, vpce.cy), observed })
      flowEdges.push({ d: curve(vpce.cx, vpce.cy, jp.cx, jp.cy), observed, label: "via VPCE", lx: (vpce.cx + jp.cx) / 2, ly: (vpce.cy + jp.cy) / 2 - 9 })
    } else if (igwAnchors[0]) {
      const ig = igwAnchors[0]
      flowEdges.push({ d: curve(footAnchor.cx, footAnchor.cy, ig.cx, ig.cy), observed })
      flowEdges.push({ d: curve(ig.cx, ig.cy, jp.cx, jp.cy), observed, label: "via IGW", lx: (ig.cx + jp.cx) / 2, ly: (ig.cy + jp.cy) / 2 - 7 })
    } else {
      flowEdges.push({ d: curve(footAnchor.cx, footAnchor.cy, jp.cx, jp.cy), observed, label: "data access", lx: (footAnchor.cx + jp.cx) / 2, ly: (footAnchor.cy + jp.cy) / 2 - 7 })
    }
  } else if (vpce && jp) {
    infraEdges.push({ d: curve(vpce.cx, vpce.cy, jp.cx, jp.cy), dashed: true })
  }

  // outer frames
  const W = Math.max(railRight, maxRight) + G.PAD + G.cloudPad + 6
  const H = Math.max(cursorY, ry) + G.PAD
  frames.unshift(
    { id: "cloud", x: G.PAD, y: G.PAD, w: W - 2 * G.PAD, h: H - G.PAD - G.PAD, rx: 10, stroke: FR.cloud.s, fill: FR.cloud.f, sw: 1.1, label: FR.cloud.l, title: "AWS Cloud" },
    { id: "region", x: regionX, y: regionTop, w: (W - G.PAD) - regionX - 6, h: (H - G.PAD) - regionTop - 6, rx: 9, stroke: FR.region.s, fill: FR.region.f, sw: 1.3, dash: FR.region.d, label: FR.region.l, title: `Region · ${region}` },
  )

  const access = target ? `Access: ${report?.current_state?.source_label || "workload"} → ${target.title} via ${vpce ? "VPC Endpoint" : "Internet Gateway"}` : undefined
  const azCount = vpcs.reduce((a, v) => a + (v.azs ?? []).filter((az) => (az.subnets ?? []).some((s) => s.workloads?.length)).length, 0)
  return { W, H, frames, cards, infraEdges, flowEdges, region, azCount, vpcLabel: vpcs.map((v) => v.name).join(" · "), access }
}

type JewelCard = { id: string; name: string; title: string; icon: string; crown: boolean }
function collectJewels(arch: SystemArchitecture | null, report: AttackPathReport | null): JewelCard[] {
  const seen = new Set<string>(), out: JewelCard[] = []
  const push = (n: ServiceNode) => {
    if (seen.has(n.id)) return
    const t = `${n.type} ${n.name}`
    if (n.isCrownJewel || /s3|bucket|kms|key|cmk|dynamo|ses|secret|sns|sqs/i.test(t)) {
      seen.add(n.id); out.push({ id: n.id, name: n.name, title: n.shortName || n.name, icon: jewelKind(n.name, n.type), crown: !!n.isCrownJewel })
    }
  }
  for (const r of arch?.resources ?? []) push(r)
  for (const c of arch?.computeServices ?? []) if (c.isCrownJewel) push(c)
  if (!out.length && report?.current_state?.target_label) {
    out.push({ id: "__target", name: report.current_state.target_label, title: report.current_state.target_label, icon: jewelKind(report.current_state.target_label, ""), crown: true })
  }
  return out.slice(0, 8)
}

// ── fallback builder from per-path architecture (topology unavailable) ─────
function buildFromArchitecture(arch: SystemArchitecture, path: IdentityAttackPath): Model | null {
  // Minimal: synthesize a one-VPC topology from architecture.subnets so the
  // same renderer applies. Keeps a usable view when /topology-aws is empty.
  const onPath = new Set<string>((path.nodes ?? []).map((n) => n.id))
  const compById = new Map((arch.computeServices ?? []).map((c) => [c.id, c]))
  const azs = new Map<string, TopoVPC["azs"][number]>()
  for (const s of arch.subnets ?? []) {
    const azName = s.availabilityZone || "—"
    if (!azs.has(azName)) azs.set(azName, { name: azName, subnets: [] })
    const workloads: TopoWorkload[] = (s.connectedComputeIds ?? []).map((id) => compById.get(id)).filter(Boolean).map((c) => ({ id: c!.id, name: c!.shortName || c!.name, type: c!.type })) as TopoWorkload[]
    azs.get(azName)!.subnets.push({ id: s.id, name: s.shortName || s.name, cidr: s.cidrBlock ?? null, is_public: s.isPublic === true, workloads })
  }
  const vg = (arch.vpcGroups ?? [])[0]
  const topo: TopologyResponse = {
    system_name: "",
    vpcs: [{ id: vg?.vpcId || "vpc", name: vg?.vpcName || "VPC", cidr: vg?.cidrBlock ?? null, region: arch.region ?? null, azs: Array.from(azs.values()), internet_gateways: [], vpc_endpoints: (arch.vpcEndpoints ?? []).map((e) => ({ id: e.id, name: e.name, service: e.serviceShort })) }],
  }
  // mark onPath via path nodes already handled in buildFromTopology
  void onPath
  return buildFromTopology(topo, arch, path, null)
}
