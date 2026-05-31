"use client"

// =============================================================================
// ExfilPathListColumn — center column for the Exfil Phase A tab.
// =============================================================================
//
// Mirrors PathListGrouped's role in the Attack Path tab: takes the flat list
// of exfil paths returned from /api/proxy/attack-chain/exfil-paths, groups
// them by channel, renders a click-to-select rail in the existing 400px
// center column of attack-paths-v2.tsx.
//
// Before this column existed, the operator switched exfil paths via a
// dropdown buried inside the canvas toolbar (`Path 1/9 Direct API`). That
// hides the path catalog behind a click — operators had to drill down to
// see what doors existed, then drill down again to switch. Lifting the
// selector into the same center-column slot the Attack Path tab uses gives
// the Exfil tab the same mental model: jewel (left) → paths (center) →
// canvas (right). Switching tabs no longer changes the navigation
// vocabulary.
//
// Grouping discipline (locked 2026-05-31):
//   - Section header per channel (NETWORK · IGW, SERVERLESS · DIRECT,
//     DIRECT API, EC2 NO EGRESS). Mirrors PathListGrouped's "FROM EC2 /
//     FROM LAMBDA / FROM ROOT CREDENTIALS" grouping by source-type —
//     same shape, just by exit door instead of entry door.
//   - Channel order: most-traffic first within group (the backend's
//     ExfilPayload.paths array is already pre-sorted).
//
// Row content discipline:
//   - Channel color dot (matches dotFor() in exfil-view-v3.tsx)
//   - Accessor name (mono, truncate-with-title)
//   - OBSERVED / CAPABLE badge (red vs amber, matches the canvas
//     provenance treatment)
//   - jewel_hits compact number on the right
//
// Sibling strip (the old "Same role · other channels" canvas pill row)
// was removed in the same redesign — the channel-grouped column makes it
// redundant. Operators glancing left see every channel a role can exit
// through, no chip-strip needed.
// =============================================================================

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Route } from "lucide-react"
import {
  type ExfilPath,
  friendlyAccessorName,
  compactNumber,
} from "./exfil-view-v3"

// ─── Channel display configuration ────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  network_via_igw: "Network · IGW / NAT",
  serverless_direct: "Serverless · Direct",
  ec2_no_egress: "EC2 · No Egress",
  direct_api: "Direct API",
}

// Channel color dot — must match dotFor() in exfil-view-v3.tsx so the
// rail dots and canvas chips read as the same channel.
const CHANNEL_DOT: Record<string, string> = {
  network_via_igw: "bg-amber-400",
  serverless_direct: "bg-violet-400",
  ec2_no_egress: "bg-slate-300",
  direct_api: "bg-rose-400",
}

// Section accent border-left color (matches the dot for that channel).
// Subtle 40% alpha so the section reads as a marker, not a heavy box.
const CHANNEL_BORDER: Record<string, string> = {
  network_via_igw: "border-l-amber-400/40",
  serverless_direct: "border-l-violet-400/40",
  ec2_no_egress: "border-l-slate-300/40",
  direct_api: "border-l-rose-400/40",
}

// Channel render order — the four currently-emitted channels, plus a
// fallback bucket for any unknown channel type the backend introduces.
// `network_via_igw` and `direct_api` are the most observed-traffic-heavy
// channels in practice (alon-prod); listed first so the operator sees
// the loudest doors above the fold.
const CHANNEL_ORDER = [
  "network_via_igw",
  "direct_api",
  "serverless_direct",
  "ec2_no_egress",
] as const

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel.replace(/_/g, " ")
}

function channelDot(channel: string): string {
  return CHANNEL_DOT[channel] ?? "bg-slate-400"
}

function channelBorder(channel: string): string {
  return CHANNEL_BORDER[channel] ?? "border-l-slate-400/40"
}

// ─── Component ────────────────────────────────────────────────────

interface ExfilPathListColumnProps {
  paths: ExfilPath[]
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
  /** Optional — null when the parent hasn't resolved a jewel yet.
   *  When null, the column renders an empty-state instead of a
   *  silent blank rail. */
  jewelName?: string | null
  loading?: boolean
}

export function ExfilPathListColumn({
  paths,
  selectedPathId,
  onSelectPath,
  jewelName,
  loading = false,
}: ExfilPathListColumnProps) {
  // Group paths by channel, preserving backend's traffic-sorted order
  // inside each group. Unknown channels fall into a synthetic "OTHER"
  // bucket so we never silently drop a path.
  const grouped = useMemo(() => {
    const buckets = new Map<string, ExfilPath[]>()
    for (const p of paths) {
      const key = p.channel || "other"
      const arr = buckets.get(key)
      if (arr) arr.push(p)
      else buckets.set(key, [p])
    }
    // Order: known channels first (in CHANNEL_ORDER), then any unknown
    // tail in arrival order. Mirrors the "stable sort with fallback"
    // pattern in path-list-grouped.tsx.
    const ordered: Array<{ channel: string; paths: ExfilPath[] }> = []
    for (const ch of CHANNEL_ORDER) {
      const arr = buckets.get(ch)
      if (arr && arr.length > 0) {
        ordered.push({ channel: ch, paths: arr })
        buckets.delete(ch)
      }
    }
    for (const [ch, arr] of buckets) {
      ordered.push({ channel: ch, paths: arr })
    }
    return ordered
  }, [paths])

  // Per-section collapse state. Default everything expanded — the
  // operator's first read should be every door at once. Collapsing is
  // an operator-driven affordance once they've oriented.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (channel: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })
  }

  if (loading) {
    return (
      <div className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">
        Loading exfil paths…
      </div>
    )
  }

  if (paths.length === 0) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          Paths to {jewelName ?? "this jewel"}
        </div>
        <div className="text-xs text-slate-500 leading-relaxed">
          No exfil paths surfaced. Either no role currently reaches this
          jewel via any of the four channels, or the collector hasn't
          observed traffic yet.
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 py-2 space-y-3">
      <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
        <Route className="h-3 w-3 text-slate-400" />
        Paths to {jewelName ?? "jewel"}
        <span className="ml-auto font-mono text-slate-600 tabular-nums">
          {paths.length}
        </span>
      </div>

      {grouped.map(({ channel, paths: groupPaths }) => {
        const isCollapsed = collapsed.has(channel)
        return (
          <div
            key={channel}
            data-exfil-channel={channel}
            className={`border-l-2 ${channelBorder(channel)} pl-2`}
          >
            <button
              type="button"
              onClick={() => toggle(channel)}
              className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-wider font-bold text-slate-300 hover:text-slate-100 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 text-slate-500" />
              ) : (
                <ChevronDown className="h-3 w-3 text-slate-500" />
              )}
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${channelDot(channel)}`} />
              <span className="truncate">{channelLabel(channel)}</span>
              <span className="ml-auto font-mono text-slate-500 tabular-nums">
                {groupPaths.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="mt-1 space-y-0.5">
                {groupPaths.map((p) => {
                  const isSelected = p.path_id === selectedPathId
                  const observed = p.accessor_provenance === "observed"
                  return (
                    <button
                      key={p.path_id}
                      type="button"
                      data-exfil-path-row={p.path_id}
                      data-exfil-path-selected={isSelected ? "true" : "false"}
                      onClick={() => onSelectPath(p.path_id)}
                      className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
                        isSelected
                          ? "bg-slate-800/80 ring-1 ring-slate-600"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[8px] uppercase tracking-wider font-bold shrink-0 ${
                            observed ? "text-red-300" : "text-amber-300"
                          }`}
                        >
                          {observed ? "obs" : "cap"}
                        </span>
                        <span
                          className="text-[10px] font-mono text-slate-200 truncate flex-1"
                          title={p.accessor_name}
                        >
                          {friendlyAccessorName(p.accessor_name)}
                        </span>
                        <span className="text-[10px] tabular-nums font-mono text-slate-400 shrink-0">
                          {compactNumber(p.jewel_hits)}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span>
                          {p.workload_count} wkld
                          {p.workload_count === 1 ? "" : "s"}
                        </span>
                        <span className="text-slate-700">·</span>
                        <span>
                          {p.gateway_count} gw
                          {p.gateway_count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
