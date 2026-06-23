"use client"

// Attack Path Map — LIGHT (graph portion of attacker-path-map_alon-demo-app2.html).
//
// PURE RENDERER. Draws the real kill-chain spine (path.nodes, left→right) with
// gate-state-colored edges (report.gates: identity / network / data_plane) and
// the "THE GAP" callout (report.remediation_diff.remove_actions — the unused,
// fix-target actions). Recolored from the dark artifact to the light card
// palette so it sits on top of AttackPathCardLight (map-on-top, then the
// approve story — the artifact's exact layout). The before/diff/after columns
// from the artifact are NOT duplicated here: the card's "The fix you approve"
// section already owns them.
//
// NO MOCK DATA — every node, edge, gate badge, and gap action comes from the
// live path object + compiled report. Absent signal drops the element.

import type { CSSProperties } from "react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"
import type { AttackPathReport, GateState } from "./attack-path-report-types"
import { friendlyResourceName } from "./friendly-names"

// Light palette (subset of AttackPathCardLight's C — kept local so the map is
// self-contained and renders light regardless of the app theme).
const M = {
  ink: "#1f2733",
  muted: "#6b7480",
  faint: "#8a93a3",
  rule: "#e2e6ec",
  node: "#ffffff",
  red: "#c0392b",
  redInk: "#7a2419",
  redBg: "#fbeae8",
  amber: "#b5710f",
  green: "#2c8a57",
  gold: "#a37d14",
  goldBorder: "#d4a82a",
  neutral: "#9aa3b1",
} as const

// GateState → edge color + short tag (mirrors the card's gateMeta vocabulary).
function gateColor(g?: GateState): string {
  switch (g) {
    case "OPEN_OBSERVED":
      return M.red
    case "OPEN_CONFIG":
      return M.amber
    case "CLOSED":
    case "BLOCKED":
      return M.green
    case "UNKNOWN":
    default:
      return M.gold
  }
}
function gateTag(g?: GateState): string {
  switch (g) {
    case "OPEN_OBSERVED":
      return "OO"
    case "OPEN_CONFIG":
      return "OC"
    case "CLOSED":
    case "BLOCKED":
      return "closed"
    case "UNKNOWN":
    default:
      return "?"
  }
}

// Tier → node border color + sublabel. Crown jewel reads gold (the asset),
// identity reads pink/amber (IAM), entry neutral, network_control blue-grey.
function tierMeta(node: PathNodeDetail): { border: string; sub: string } {
  switch (node.tier) {
    case "crown_jewel":
      return { border: M.goldBorder, sub: "crown jewel" }
    case "identity":
      return { border: "#c2335e", sub: "identity" }
    case "network_control":
      return { border: "#2f6fd0", sub: "network" }
    case "entry":
    default:
      return { border: node.is_internet_exposed ? M.red : "#3a5570", sub: node.is_internet_exposed ? "internet-facing · foothold" : "entry" }
  }
}

// Which gate (if any) governs the edge ENTERING `to`. Identity gate on the
// becoming-the-role hop; data-plane (then network) on the reach-the-jewel hop;
// network on a network-control hop; entry otherwise.
function edgeGateFor(to: PathNodeDetail, gates: AttackPathReport["gates"]): GateState | undefined {
  switch (to.tier) {
    case "identity":
      return gates.identity
    case "crown_jewel":
      return gates.data_plane ?? gates.network
    case "network_control":
      return gates.network
    case "entry":
    default:
      return gates.entry
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// Human-readable node label (BE-8). The lede resolves identity via
// pathIdentityLabel (friendly role name); the map renders raw path.nodes, so an
// opaque IAM principal node (an `AROA…`/`AIDA…` unique id) would leak through.
// Delegated to the shared resolver so the map and the lateral view stay in sync.
function friendlyNodeName(node: PathNodeDetail): string {
  return friendlyResourceName(node.name, node.type)
}

// Orient the spine to the compiler's AUTHORITATIVE source→jewel direction (BE-9).
// The operator-confirmed lede reads source_label → … → target_label. Some
// assume-chains serialize path.nodes out of attack order — the assumed role
// first (tagged `entry`), the operator-facing source role mid-chain (tagged
// `identity`) — so a naive render shows the attacker "entering" at the assumed
// role, contradicting the card's own header. A plain reverse doesn't fix it: the
// jewel is already last, so only the head is wrong. We re-anchor instead: pull
// the source node to the head and the crown jewel to the tail, and — only when
// we actually reorder — re-derive each node's display tier from its position
// (head = entry, tail = jewel, middle hops = assumed identity) so the sublabels
// and per-edge gate badges line up with the story. A correct Shape-A chain
// (source already first) is returned untouched, so this never disturbs a
// well-ordered path.
export function orientSpine(
  spine: PathNodeDetail[],
  src?: string | null,
  tgt?: string | null,
): PathNodeDetail[] {
  if (spine.length < 2) return spine
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()
  const labelsMatch = (a?: string | null, b?: string | null) => {
    const x = norm(a)
    const y = norm(b)
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
  }

  // Jewel anchor: prefer the crown_jewel tier, then a target_label match, else
  // assume the last node terminates the chain.
  let jewelIdx = spine.findIndex((nd) => nd.tier === "crown_jewel")
  if (jewelIdx < 0) jewelIdx = spine.findIndex((nd) => labelsMatch(nd.name, tgt))
  if (jewelIdx < 0) jewelIdx = spine.length - 1

  const srcIdx = spine.findIndex((nd) => labelsMatch(nd.name, src))

  // Source unknown — can't re-anchor on it. Still flip a clearly jewel-first
  // array (the simple reversal case) so the jewel ends up on the right.
  if (srcIdx < 0) {
    const first = spine[0]
    if (first?.tier === "crown_jewel" || labelsMatch(first?.name, tgt)) {
      return [...spine].reverse()
    }
    return spine
  }

  // Source already leads (and isn't itself the jewel) — well-ordered, leave it.
  if (srcIdx === 0 || srcIdx === jewelIdx) return spine

  const source = spine[srcIdx]
  const jewel = spine[jewelIdx]
  const middle = spine.filter((_, i) => i !== srcIdx && i !== jewelIdx)
  const reordered = [source, ...middle, jewel]

  // Re-derive display tier from the authoritative position. The crown jewel
  // keeps its tier; the head becomes entry (preserving an internet-foothold
  // node's existing entry tier), middle hops are the assumed identities crossed.
  return reordered.map((node, i, arr) => {
    if (i === arr.length - 1) return node
    if (i === 0) return node.tier === "entry" ? node : { ...node, tier: "entry" }
    return node.tier === "identity" ? node : { ...node, tier: "identity" }
  })
}

// Build a minimal honest spine from the report's structured labels when the
// serialized path.nodes comes through sparse (the facade's hops.nodes is
// sometimes thinner than the canvas spine — see attack-path-panel). Uses ONLY
// real fields: source_label, the role name, target_label. Not mock data — the
// same labels the header chips and lede already render.
function synthSpineFromReport(path: IdentityAttackPath, report: AttackPathReport): PathNodeDetail[] {
  const cs = report.current_state
  const base = (
    over: Partial<PathNodeDetail> & Pick<PathNodeDetail, "id" | "name" | "type" | "tier">,
  ): PathNodeDetail => ({
    is_internet_exposed: false,
    lp_score: null,
    gap_count: 0,
    remediation: null,
    internet_exposure_alert: null,
    ...over,
  })
  const out: PathNodeDetail[] = []
  if (cs.source_label) {
    out.push(base({ id: "syn-source", name: cs.source_label, type: "Workload", tier: "entry" }))
  }
  const roleName = path.damage_capability?.role_name
  if (roleName && roleName !== cs.source_label && roleName !== cs.target_label) {
    out.push(base({ id: "syn-role", name: roleName, type: "IAMRole", tier: "identity" }))
  }
  if (cs.target_label) {
    const jewelType = path.damage_capability?.jewel_service
      ? `${path.damage_capability.jewel_service} resource`
      : "CrownJewel"
    out.push(base({ id: "syn-jewel", name: cs.target_label, type: jewelType, tier: "crown_jewel" }))
  }
  return out
}

export function AttackPathMapLight({
  path,
  report,
}: {
  path: IdentityAttackPath
  report: AttackPathReport
}) {
  const realNodes = path.nodes ?? []
  const rawSpine = realNodes.length >= 2 ? [...realNodes] : synthSpineFromReport(path, report)
  if (rawSpine.length < 2) return null // can't form a source→target spine — nothing to draw

  // Orient to the authoritative source→jewel direction (BE-9). See orientSpine:
  // re-anchors assume-chains the backend serialized out of attack order so the
  // attacker always enters at source_label (left) and lands on the jewel (right).
  const nodes = orientSpine(
    rawSpine,
    report.current_state.source_label,
    report.current_state.target_label,
  )

  const diff = report.remediation_diff
  const gates = report.gates ?? {}

  // ── Layout ────────────────────────────────────────────────────────────────
  const BOX_W = 158
  const BOX_H = 66
  const GAP_W = 104 // horizontal room for the edge + its gate badge
  const MARGIN = 22
  const chainTop = 30
  const n = nodes.length
  const W = MARGIN * 2 + n * BOX_W + (n - 1) * GAP_W
  const removed = diff?.remove_actions ?? []
  const showGap = removed.length > 0
  const gapTop = chainTop + BOX_H + 44
  const gapH = showGap ? 78 : 0
  const H = gapTop + gapH + (showGap ? 14 : 8)

  const xs = nodes.map((_, i) => MARGIN + i * (BOX_W + GAP_W))
  const yMid = chainTop + BOX_H / 2

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Attack path: ${report.current_state.source_label} to ${report.current_state.target_label}`}
      style={{ width: "100%", height: "auto", fontFamily: "system-ui, sans-serif" }}
      data-testid="attack-path-map-light"
    >
      <style>{`
        @keyframes apm-flow {
          0%   { transform: translateX(0); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(var(--apm-d)); opacity: 0; }
        }
        .apm-dot { animation: apm-flow 1.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .apm-dot { animation: none; opacity: 0; } }
      `}</style>
      <defs>
        {(["OPEN_OBSERVED", "OPEN_CONFIG", "UNKNOWN", "CLOSED"] as const).map((g) => (
          <marker
            key={g}
            id={`apm-arrow-${g}`}
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="4.5"
            orient="auto"
          >
            <path d="M0,0 L9,4.5 L0,9 Z" fill={gateColor(g)} />
          </marker>
        ))}
      </defs>

      <text x={MARGIN} y={18} fontSize="10.5" fontWeight={700} letterSpacing="0.08em" fill={M.muted}>
        ATTACK PATH
      </text>

      {/* edges (drawn first, behind nodes) */}
      {nodes.slice(1).map((to, i) => {
        const x1 = xs[i] + BOX_W
        const x2 = xs[i + 1]
        const g = edgeGateFor(to, gates)
        const color = gateColor(g)
        const markerG: GateState = g === "BLOCKED" ? "CLOSED" : (g ?? "UNKNOWN")
        const midX = (x1 + x2) / 2
        return (
          <g key={`edge-${i}`}>
            <line
              x1={x1}
              y1={yMid}
              x2={x2 - 2}
              y2={yMid}
              stroke={color}
              strokeWidth={2.4}
              markerEnd={`url(#apm-arrow-${markerG})`}
            />
            {/* traversal pulse — a dot walking the edge in attack direction,
                staggered per hop so the eye follows the chain. CSS-driven so
                prefers-reduced-motion disables it. */}
            <circle
              className="apm-dot"
              cx={x1}
              cy={yMid}
              r={3.2}
              fill={color}
              style={{
                ["--apm-d" as string]: `${x2 - x1 - 2}px`,
                animationDelay: `${i * 0.5}s`,
              } as CSSProperties}
            />
            {g && (
              <>
                <rect
                  x={midX - 30}
                  y={yMid + 8}
                  width={60}
                  height={16}
                  rx={8}
                  fill={M.node}
                  stroke={color}
                />
                <text
                  x={midX}
                  y={yMid + 19.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight={700}
                  fill={color}
                >
                  {`${to.tier === "crown_jewel" ? "data" : to.tier === "identity" ? "identity" : "reach"} · ${gateTag(g)}`}
                </text>
              </>
            )}
          </g>
        )
      })}

      {/* nodes */}
      {nodes.map((node, i) => {
        const meta = tierMeta(node)
        const x = xs[i]
        const isJewel = node.tier === "crown_jewel"
        return (
          <g key={`node-${node.id ?? i}`}>
            <rect
              x={x}
              y={chainTop}
              width={BOX_W}
              height={BOX_H}
              rx={9}
              fill={M.node}
              stroke={meta.border}
              strokeWidth={1.7}
            />
            {isJewel && (
              <>
                <circle cx={x + 16} cy={chainTop + 15} r={6} fill="none" stroke={M.goldBorder} strokeWidth={1.6} />
                <circle cx={x + 16} cy={chainTop + 15} r={1.8} fill={M.goldBorder} />
              </>
            )}
            <text
              x={x + BOX_W / 2}
              y={chainTop + 27}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight={700}
              fill={M.ink}
            >
              {truncate(friendlyNodeName(node), 20)}
            </text>
            <text
              x={x + BOX_W / 2}
              y={chainTop + 43}
              textAnchor="middle"
              fontSize="9"
              fill={M.muted}
            >
              {truncate(node.type || "", 24)}
            </text>
            <text
              x={x + BOX_W / 2}
              y={chainTop + 56}
              textAnchor="middle"
              fontSize="8.7"
              fontWeight={isJewel ? 700 : 400}
              fill={isJewel ? M.gold : meta.border}
            >
              {meta.sub}
            </text>
          </g>
        )
      })}

      {/* THE GAP callout — the unused, fix-target actions */}
      {showGap && (
        <g>
          <rect
            x={MARGIN}
            y={gapTop}
            width={W - MARGIN * 2}
            height={gapH}
            rx={8}
            fill={M.redBg}
            stroke={M.red}
            strokeWidth={1.3}
          />
          <text x={MARGIN + 14} y={gapTop + 20} fontSize="11" fontWeight={700} fill={M.red}>
            THE GAP — allowed, unused in the observed window (the fix target)
          </text>
          <text x={MARGIN + 14} y={gapTop + 39} fontSize="10" fill={M.redInk}>
            {truncate(removed.slice(0, 6).join(" · "), 96)}
            {removed.length > 6 ? `  (+${removed.length - 6} more)` : ""}
          </text>
          <text x={MARGIN + 14} y={gapTop + 57} fontSize="9.5" fill={M.muted}>
            removing these shrinks the damage without breaking what the path actually uses
          </text>
        </g>
      )}
    </svg>
  )
}
