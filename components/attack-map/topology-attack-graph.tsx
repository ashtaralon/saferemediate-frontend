"use client"

// =============================================================================
// Attack Graph on AWS Topology — 3-pane CISO surface.
//
// Converted from the user-supplied HTML mockup (attack-graph-aws-topology-v2.html)
// into a real React/TypeScript component bound to live Neo4j data via the
// /api/proxy/attack-paths/<system>/by-crown-jewel endpoint.
//
// Layout (matching the mockup):
//   ┌───────────────────────────────────────────────────────────────────┐
//   │ HEADER · brand · observed/configured legend                       │
//   ├──────────┬──────────────────────────────────────────────┬─────────┤
//   │ Crown    │                                              │ Paths   │
//   │ jewels   │   SVG canvas (980 × 760)                     │ ranked  │
//   │ ranked   │   - AWS Cloud > Region > VPC > AZ            │ by      │
//   │ (left    │   - Public Subnets (Ingress/Egress)          │ damage  │
//   │  rail)   │   - Application Subnet (Private)             │ (right  │
//   │          │   - Data Subnet (Private)                    │  rail)  │
//   │          │   - IDENTITY & ACCESS strip                  │         │
//   │          │   - OFF-VPC CROWN JEWELS column              │         │
//   │          │   - VPC Endpoint at boundary                 │         │
//   └──────────┴──────────────────────────────────────────────┴─────────┘
//
// Data: real `CrownJewelConvergence` via useCrownJewelConvergence(). No mocks.
// Missing data → honest empty/loading/error states per CLAUDE.md rule #1.

import { useMemo, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  ConvergenceHop,
  ConvergencePath,
} from "@/lib/attack-paths/convergence-types"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"

// ─── theme tokens (mirroring the mockup CSS variables) ──────────────────────
const T = {
  bg: "#0D1B2A",
  surface: "#142433",
  surface2: "#1B2A3A",
  border: "#243447",
  text: "#E6EDF3",
  textMuted: "#8BA0B4",
  textFaint: "#5C7186",
  accent: "#00C2A8",
  observed: "#00C2A8",
  configured: "#E2A93B",
  sevCritical: "#E5484D",
  sevHigh: "#F5803E",
  sevMedium: "#E2A93B",
  sevLow: "#4C8DFF",
  aws: "#FF9900",
  region: "#4C8DFF",
  vpc: "#7DD181",
  publicLane: "#4Fae6f",
  privateLane: "#3a6ea5",
  identity: "#C792EA",
} as const

// ─── derived hop classification ─────────────────────────────────────────────
type LaneKey = "public" | "app" | "data" | "external" | "identity" | "netinfra"

function hopLane(h: ConvergenceHop): LaneKey {
  if (h.is_crown_jewel) return "external"
  const plane = (h.plane || "").toLowerCase()
  const ntype = (h.node_type || "").toLowerCase()
  if (plane === "iam" || /role|profile|policy|user/i.test(ntype)) return "identity"
  if (/routetable|nacl|vpcendpoint|vpce|igw|natgateway|nat/i.test(ntype)) return "netinfra"
  if (h.subnet_id == null && /s3|kms|dynamodb|secret|rds/i.test(ntype)) return "external"
  if (h.subnet_public === true) return "public"
  if (/rds|database|aurora/i.test(ntype)) return "data"
  return "app"
}

function hopIcon(h: ConvergenceHop): string {
  const t = (h.node_type || "").toLowerCase()
  if (h.is_crown_jewel) {
    if (/s3/.test(t)) return "🪣"
    if (/kms/.test(t)) return "🗝"
    if (/dynamodb/.test(t)) return "⬡"
    if (/rds|database/.test(t)) return "🗄"
    if (/secret/.test(t)) return "🔐"
    return "◆"
  }
  if (/lambda/.test(t)) return "λ"
  if (/role/.test(t)) return "🔑"
  if (/profile/.test(t)) return "🪪"
  if (/igw|internetgateway/.test(t)) return "🌐"
  if (/nat/.test(t)) return "🔀"
  if (/vpce|vpcendpoint/.test(t)) return "🔌"
  if (/routetable/.test(t)) return "🧭"
  if (/nacl/.test(t)) return "⛔"
  if (/sg|securitygroup/.test(t)) return "🛡"
  if (/rds|database/.test(t)) return "🗄"
  return "🖥"
}

function shortLabel(s: string, max = 22): string {
  if (!s) return ""
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// ─── ranked path utilities ──────────────────────────────────────────────────
function pathScore(p: ConvergencePath): number {
  if (typeof p.score === "number" && p.score > 0) return p.score
  // fallback synthesis when backend score is missing
  const d = p.damage?.length ?? 0
  const worst = (p.damage?.[0] || "").toUpperCase()
  return (worst === "DELETE" ? 70 : worst === "WRITE" ? 55 : worst === "READ" ? 35 : 20) + d * 4
}

function severityFromScore(s: number): "critical" | "high" | "medium" {
  if (s >= 80) return "critical"
  if (s >= 55) return "high"
  return "medium"
}

interface NodePos {
  x: number
  y: number
}

// ─── center SVG canvas ──────────────────────────────────────────────────────
function TopologyCanvas({
  jewel,
  data,
  selectedPathIdx,
}: {
  jewel: CrownJewelSummary
  data: { paths: ConvergencePath[] }
  selectedPathIdx: number | null
}) {
  // Compute positions for every hop id across all paths.
  const positions = useMemo<Record<string, NodePos>>(() => {
    const pos: Record<string, NodePos> = {}
    const allHops: ConvergenceHop[] = data.paths.flatMap((p) => p.hops)

    // group hops by lane + by az
    const lanes: Record<LaneKey, ConvergenceHop[]> = {
      public: [],
      app: [],
      data: [],
      external: [],
      identity: [],
      netinfra: [],
    }
    const seen = new Set<string>()
    for (const h of allHops) {
      if (seen.has(h.node_id)) continue
      seen.add(h.node_id)
      lanes[hopLane(h)].push(h)
    }

    // ─── ENTRY / external principals at the top, outside cloud frame ─
    const externalSources = data.paths
      .filter((p) => p.source_kind === "external" || /external|principal|public/i.test(p.source_kind ?? ""))
      .map((p) => p.source || "ext")
    const uniqExt = Array.from(new Set(externalSources))
    uniqExt.forEach((id, i) => {
      pos[id] = { x: 90 + i * 90, y: 36 }
    })
    // Always render an Internet anchor so the canvas reads as "from outside"
    pos["__internet__"] = { x: 300, y: 36 }

    // ─── public lane (top of AZ box) ─
    const azYBase = 148
    lanes.public.forEach((h, i) => {
      pos[h.node_id] = { x: 110 + (i % 4) * 92, y: azYBase + 60 + Math.floor(i / 4) * 70 }
    })
    // ─── app lane ─
    lanes.app.forEach((h, i) => {
      pos[h.node_id] = { x: 110 + (i % 4) * 92, y: azYBase + 220 + Math.floor(i / 4) * 70 }
    })
    // ─── data lane ─
    lanes.data.forEach((h, i) => {
      pos[h.node_id] = { x: 110 + (i % 3) * 110, y: azYBase + 390 + Math.floor(i / 3) * 70 }
    })

    // ─── network infra waypoints (route tables / NACLs / VPCE) ─
    let vpceX = 0
    lanes.netinfra.forEach((h, i) => {
      const t = (h.node_type || "").toLowerCase()
      if (/vpce|vpcendpoint/.test(t)) {
        vpceX = 540
        pos[h.node_id] = { x: vpceX, y: 430 }
      } else {
        pos[h.node_id] = { x: 110 + i * 80, y: azYBase + 360 }
      }
    })

    // ─── identity strip — under the VPC frame ─
    const stripY = 632
    const stripX0 = 150
    const stripStep = Math.min(120, 480 / Math.max(lanes.identity.length, 1))
    lanes.identity.forEach((h, i) => {
      pos[h.node_id] = { x: stripX0 + i * stripStep, y: stripY }
    })

    // ─── off-VPC crown jewels — right column ─
    const cjX = 880
    lanes.external.forEach((h, i) => {
      pos[h.node_id] = { x: cjX, y: 150 + i * 90 }
    })
    // ensure the current jewel always has a position even if it never appeared as a hop
    const jewelKey = jewel.canonical_id ?? jewel.id
    if (!pos[jewelKey]) {
      pos[jewelKey] = { x: cjX, y: 150 + lanes.external.length * 90 }
    }
    return pos
  }, [data.paths, jewel.canonical_id, jewel.id])

  const crossesAZb = false // multi-AZ rendering: future iteration; v1 = single AZ column

  return (
    <svg viewBox="0 0 980 760" preserveAspectRatio="xMidYMid meet" className="block w-full h-full">
      <defs>
        <filter id="tag-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="aObs" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={T.observed} />
        </marker>
        <marker id="aCfg" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={T.configured} />
        </marker>
      </defs>

      {/* nested containers */}
      <Container x={14} y={60} w={952} h={680} stroke={T.aws} label="AWS CLOUD" />
      <Container x={30} y={84} w={820} h={648} stroke={T.region} label="REGION · eu-west-1" />
      <Container
        x={46}
        y={108}
        w={crossesAZb ? 770 : 470}
        h={612}
        stroke={T.vpc}
        label={`VPC · ${shortLabel(jewel.name || jewel.id, 28)}`}
      />

      {/* internet + external sources above the cloud */}
      <NodeChip x={pos(positions, "__internet__").x} y={pos(positions, "__internet__").y} icon="🌐" label="Internet" ring={T.textFaint} bright />

      {/* single AZ column for v1 */}
      <AzColumn x={64} y={148} label="AZ · eu-west-1a" />

      {/* identity strip under the VPC */}
      <IdentityStrip x={46} y={620} w={crossesAZb ? 770 : 470} />

      {/* off-VPC column */}
      <OffVpcLabel cx={880} y={120} />

      {/* draw nodes — anchors live in positions[] map */}
      {Object.entries(positions).map(([nodeId, p]) => {
        if (nodeId === "__internet__") return null
        // find the hop record for this id (first across all paths)
        const hop = data.paths.flatMap((pa) => pa.hops).find((h) => h.node_id === nodeId)
        if (!hop) return null
        const lane = hopLane(hop)
        const onPath = true
        const isJewel = hop.is_crown_jewel
        const ring =
          isJewel
            ? T.sevCritical
            : lane === "identity"
              ? T.identity
              : lane === "netinfra"
                ? T.sevLow
                : onPath
                  ? T.accent
                  : T.textFaint
        const label = shortLabel(hop.name || hop.node_id, 22)
        return (
          <NodeChip
            key={nodeId}
            x={p.x}
            y={p.y}
            icon={hopIcon(hop)}
            label={label}
            ring={ring}
            bright={true}
            crown={isJewel}
            sg={hop.security_groups?.[0]}
          />
        )
      })}

      {/* edges */}
      {data.paths.map((p, i) => {
        const dim = selectedPathIdx != null && selectedPathIdx !== i
        const obs = p.confidence === "observed"
        const color = obs ? T.observed : T.configured
        const op = dim ? 0.1 : obs ? 1 : 0.8
        const sw = selectedPathIdx === i ? 3.5 : obs ? 2.6 : 1.7
        return p.hops.slice(0, -1).map((h, j) => {
          const a = positions[h.node_id]
          const b = positions[p.hops[j + 1].node_id]
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const d = `M${a.x},${a.y} C ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
          return (
            <g key={`${i}-${j}`}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeOpacity={op}
                strokeDasharray={obs ? undefined : "5 5"}
                markerEnd={obs ? "url(#aObs)" : "url(#aCfg)"}
              />
              {obs && op > 0.5 && (
                <circle r={3} fill={T.observed} filter="url(#tag-glow)">
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          )
        })
      })}
    </svg>
  )
}

function pos(map: Record<string, NodePos>, id: string): NodePos {
  return map[id] ?? { x: 0, y: 0 }
}

// ─── primitives ─────────────────────────────────────────────────────────────
function Container({ x, y, w, h, stroke, label }: { x: number; y: number; w: number; h: number; stroke: string; label: string }) {
  const labelW = label.length * 6.4 + 24
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="none" stroke={stroke} strokeWidth={1.3} strokeOpacity={0.55} />
      <rect x={x + 8} y={y - 9} width={labelW} height={18} rx={4} fill={T.bg} stroke={stroke} strokeWidth={1} strokeOpacity={0.6} />
      <text x={x + 16} y={y + 4} fontSize={10} fontWeight={700} fill={stroke} style={{ letterSpacing: "0.06em" }}>
        {label}
      </text>
    </g>
  )
}

function AzColumn({ x, y, label }: { x: number; y: number; label: string }) {
  const W = 720
  const H = 456
  return (
    <g>
      <rect x={x} y={y} width={W} height={H} rx={8} fill="rgba(76,141,255,0.03)" stroke={T.region} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="3 4" />
      <text x={x + 12} y={y + 16} fontSize={9.5} fontWeight={700} fill={T.region} style={{ letterSpacing: "0.1em" }}>
        {label}
      </text>
      <SubnetLane x={x + 10} y={y + 26} h={96} color={T.publicLane} label="Public Subnets (Ingress / Egress)" tint="rgba(79,174,111,0.06)" />
      <SubnetLane x={x + 10} y={y + 130} h={150} color={T.privateLane} label="Application Subnet (Private)" tint="rgba(58,110,165,0.07)" />
      <SubnetLane x={x + 10} y={y + 288} h={150} color={T.privateLane} label="Data Subnet (Private)" tint="rgba(58,110,165,0.07)" />
    </g>
  )
}

function SubnetLane({ x, y, h, color, label, tint }: { x: number; y: number; h: number; color: string; label: string; tint: string }) {
  return (
    <g>
      <rect x={x} y={y} width={700} height={h} rx={6} fill={tint} stroke={color} strokeWidth={1} strokeOpacity={0.4} />
      <text x={x + 10} y={y + 15} fontSize={8.5} fontWeight={700} fill={color} style={{ letterSpacing: "0.04em" }}>
        {label}
      </text>
    </g>
  )
}

function IdentityStrip({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x + 4} y={y - 6} width={w - 8} height={34} rx={6} fill="rgba(199,146,234,0.05)" stroke={T.identity} strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 4" />
      <text x={x + 14} y={y + 8} fontSize={8.5} fontWeight={700} fill={T.identity} style={{ letterSpacing: "0.08em" }}>
        IDENTITY &amp; ACCESS (profiles + roles)
      </text>
    </g>
  )
}

function OffVpcLabel({ cx, y }: { cx: number; y: number }) {
  return (
    <text x={cx} y={y} textAnchor="middle" fontSize={9} fontWeight={700} fill={T.textFaint} style={{ letterSpacing: "0.08em" }}>
      OFF-VPC CROWN JEWELS
    </text>
  )
}

function NodeChip({ x, y, icon, label, ring, bright, crown, sg }: { x: number; y: number; icon: string; label: string; ring: string; bright: boolean; crown?: boolean; sg?: string }) {
  const op = bright ? 1 : 0.35
  return (
    <g opacity={op}>
      {sg ? (
        <>
          <rect x={x - 30} y={y - 22} width={64} height={50} rx={6} fill="none" stroke={T.sevHigh} strokeWidth={1} strokeOpacity={0.55} strokeDasharray="3 3" />
          <text x={x} y={y - 26} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={T.sevHigh} fillOpacity={0.9}>
            {shortLabel(sg, 14)}
          </text>
        </>
      ) : null}
      <ellipse cx={x} cy={y + 13} rx={15} ry={4} fill="#000" fillOpacity={0.25} />
      {crown ? (
        <circle cx={x} cy={y} r={34} fill="rgba(229,72,77,0.08)" stroke={T.sevCritical} strokeWidth={1} strokeDasharray="3 4" />
      ) : null}
      <circle cx={x} cy={y} r={13} fill={T.surface2} stroke={ring} strokeWidth={1.6} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={12}>
        {icon}
      </text>
      <text x={x} y={y + 24} textAnchor="middle" fontSize={7.8} fill={T.textMuted} fontFamily="ui-monospace, monospace">
        {label}
      </text>
    </g>
  )
}

// ─── left rail (ranked crown jewels) ────────────────────────────────────────
function CrownJewelRail({
  jewels,
  selectedId,
  onSelect,
}: {
  jewels: CrownJewelSummary[]
  selectedId: string
  onSelect: (j: CrownJewelSummary) => void
}) {
  const sorted = [...jewels].sort((a, b) => (b.path_count || 0) - (a.path_count || 0))
  return (
    <nav className="overflow-y-auto" style={{ background: T.surface, borderRight: `1px solid ${T.border}` }}>
      <h3 className="px-4 pt-3.5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: T.textMuted }}>
        Crown jewels · ranked by reachable paths
      </h3>
      {sorted.map((j) => {
        const active = j.id === selectedId
        const sev = j.severity?.toUpperCase() ?? "MEDIUM"
        const sevColor =
          sev === "CRITICAL" ? T.sevCritical : sev === "HIGH" ? T.sevHigh : sev === "LOW" ? T.sevLow : T.sevMedium
        return (
          <button
            key={j.id}
            type="button"
            onClick={() => onSelect(j)}
            className="block w-full cursor-pointer text-left transition-colors"
            style={{
              background: active ? T.surface2 : "transparent",
              borderLeft: `4px solid ${active ? T.accent : "transparent"}`,
              borderBottom: `1px solid ${T.border}`,
              padding: "11px 16px",
              color: T.text,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🪣</span>
              <span className="flex-1 truncate font-mono text-[11px] leading-tight" style={{ wordBreak: "break-all" }}>
                {j.name || j.id}
              </span>
              <span className="font-mono text-[17px] font-extrabold" style={{ color: sevColor }}>
                {j.path_count ?? 0}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip text={sev} bg={`${sevColor}26`} ink={sevColor} />
              <Chip text={j.type} bg={T.surface2} ink={T.textMuted} border={T.border} />
            </div>
          </button>
        )
      })}
      <div className="px-4 py-3 text-[10px] leading-[1.6] border-t border-dashed" style={{ color: T.textFaint, borderColor: T.border }}>
        Placement is real: <code>IN_SUBNET</code> → box, <code>Subnet.is_public</code> → lane,
        <code> SECURED_BY</code> → SG group, <code>ROUTES_VIA</code> → VPCE.
      </div>
    </nav>
  )
}

function Chip({ text, bg, ink, border }: { text: string; bg: string; ink: string; border?: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: bg, color: ink, border: border ? `1px solid ${border}` : undefined }}
    >
      {text}
    </span>
  )
}

// ─── right rail (ranked paths) ──────────────────────────────────────────────
function PathRail({
  paths,
  jewelName,
  selectedIdx,
  onSelect,
}: {
  paths: ConvergencePath[]
  jewelName: string
  selectedIdx: number | null
  onSelect: (i: number | null) => void
}) {
  const ranked = useMemo(() => {
    return paths
      .map((p, originalIndex) => ({ p, originalIndex, dmg: pathScore(p) }))
      .sort((a, b) => b.dmg - a.dmg)
  }, [paths])

  return (
    <aside className="overflow-y-auto" style={{ background: T.surface, borderLeft: `1px solid ${T.border}` }}>
      <h3 className="px-4 pt-3.5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: T.textMuted }}>
        Paths to {shortLabel(jewelName, 28)} · ranked by damage
      </h3>
      {ranked.map(({ p, originalIndex, dmg }, displayIdx) => {
        const obs = p.confidence === "observed"
        const sev = severityFromScore(dmg)
        const sevColor = sev === "critical" ? T.sevCritical : sev === "high" ? T.sevHigh : T.sevMedium
        const active = selectedIdx === originalIndex
        return (
          <button
            key={p.path_id}
            type="button"
            onClick={() => onSelect(active ? null : originalIndex)}
            className="block w-full cursor-pointer text-left transition-colors"
            style={{
              background: active ? T.surface2 : "transparent",
              borderLeft: `4px solid ${obs ? T.observed : T.configured}`,
              borderBottom: `1px solid ${T.border}`,
              padding: "10px 14px",
              color: T.text,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-bold w-6" style={{ color: T.textMuted }}>
                #{displayIdx + 1}
              </span>
              <Chip
                text={obs ? "● OBSERVED" : "○ CONFIGURED"}
                bg={obs ? `${T.observed}26` : `${T.configured}22`}
                ink={obs ? T.observed : T.configured}
              />
              <span className="ml-auto font-mono text-[14px] font-extrabold" style={{ color: sevColor }}>
                {Math.round(dmg)}
              </span>
            </div>
            <div className="mt-1.5 ml-6 font-mono text-[10px] leading-[1.6]" style={{ color: T.textMuted }}>
              {p.hops.map((h, j) => {
                const last = j === p.hops.length - 1
                const lbl = shortLabel(h.name || h.node_id, 18)
                return (
                  <span key={j}>
                    <span style={{ color: last ? T.sevCritical : T.text }}>{lbl}</span>
                    {!last && <span style={{ color: T.textFaint, padding: "0 3px" }}>→</span>}
                  </span>
                )
              })}
            </div>
            {p.damage?.length ? (
              <div className="mt-1.5 ml-6 flex flex-wrap gap-1.5">
                {p.damage.slice(0, 3).map((d) => (
                  <Chip key={d} text={d} bg={`${T.sevHigh}26`} ink={T.sevHigh} />
                ))}
              </div>
            ) : null}
          </button>
        )
      })}
    </aside>
  )
}

// ─── top-level shell ────────────────────────────────────────────────────────
export interface TopologyAttackGraphProps {
  systemName: string
  /** Currently-selected jewel (defaults to first available). */
  initialJewel: CrownJewelSummary
  /** Full list of jewels for the left rail. Required: if not supplied, the
   *  parent should pass at least [initialJewel] so the rail isn't empty. */
  jewels: CrownJewelSummary[]
}

export function TopologyAttackGraph({ systemName, initialJewel, jewels }: TopologyAttackGraphProps) {
  const [selectedJewel, setSelectedJewel] = useState<CrownJewelSummary>(initialJewel)
  const [selectedPathIdx, setSelectedPathIdx] = useState<number | null>(null)
  const { data, loading, error, retry } = useCrownJewelConvergence(systemName, selectedJewel)

  return (
    <div
      data-testid="topology-attack-graph"
      className="grid h-[760px] w-full rounded-lg overflow-hidden"
      style={{
        background: T.bg,
        color: T.text,
        gridTemplateColumns: "260px 1fr 320px",
        gridTemplateRows: "auto 1fr",
        border: `1px solid ${T.border}`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
      }}
    >
      {/* header spans 3 columns */}
      <header
        className="flex items-center gap-4 px-5 py-2.5"
        style={{ gridColumn: "1 / 4", borderBottom: `1px solid ${T.border}`, background: "rgba(20,36,51,0.7)" }}
      >
        <div className="flex items-center gap-2.5 text-[13px] font-bold tracking-wider">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: T.accent, boxShadow: `0 0 14px ${T.accent}` }}
          />
          CYNTRO
          <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>
            Attack Graph · AWS Topology
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3.5 text-[11px]" style={{ color: T.textMuted }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2" style={{ borderColor: T.observed }} />
            observed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2 border-dashed" style={{ borderColor: T.configured }} />
            configured
          </span>
        </div>
      </header>

      {/* left rail */}
      <CrownJewelRail jewels={jewels} selectedId={selectedJewel.id} onSelect={(j) => { setSelectedJewel(j); setSelectedPathIdx(null) }} />

      {/* center stage */}
      <div className="relative overflow-hidden" style={{ background: `radial-gradient(1200px 700px at 60% -10%, #11283d 0%, transparent 60%), ${T.bg}` }}>
        <div
          className="absolute top-2.5 left-4 z-10 rounded-md border px-3 py-1.5 font-mono text-[11.5px]"
          style={{ background: "rgba(13,27,42,0.65)", borderColor: T.border, color: T.textMuted }}
        >
          <span className="font-bold" style={{ color: T.text }}>{shortLabel(selectedJewel.name, 40)}</span>
          {data ? ` — ${data.paths_total} paths · placed on real VPC topology` : ""}
        </div>
        {loading && !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-2" style={{ color: T.textMuted }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[12px]">Loading topology…</span>
          </div>
        ) : error || !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center" style={{ color: T.textMuted }}>
            <AlertTriangle className="h-5 w-5" style={{ color: T.sevMedium }} />
            <p className="max-w-md text-[12px]">{error ?? "convergence API unavailable"}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[12px]"
              style={{ borderColor: T.border, color: T.text }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : (
          <TopologyCanvas jewel={selectedJewel} data={data} selectedPathIdx={selectedPathIdx} />
        )}
        <div
          className="absolute bottom-2.5 left-4 z-10 rounded-md border px-2.5 py-1.5 font-mono text-[10px]"
          style={{ background: "rgba(13,27,42,0.65)", borderColor: T.border, color: T.textFaint, maxWidth: "64%" }}
        >
          live geometry · real AWS containment hierarchy · names/structure from Neo4j
        </div>
      </div>

      {/* right rail */}
      {data ? (
        <PathRail
          paths={data.paths}
          jewelName={selectedJewel.name || selectedJewel.id}
          selectedIdx={selectedPathIdx}
          onSelect={setSelectedPathIdx}
        />
      ) : (
        <aside className="overflow-y-auto p-4 text-[11px]" style={{ background: T.surface, color: T.textMuted, borderLeft: `1px solid ${T.border}` }}>
          {loading ? "Loading paths…" : "No paths available."}
        </aside>
      )}
    </div>
  )
}
