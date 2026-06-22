"use client"

/**
 * Topology tab Crown Jewel picker.
 *
 * Renders ABOVE the TFM canvas when no Spotlight is currently open
 * AND the system has at least one Crown Jewel. Closes the
 * discoverability gap where operators landing on a system's Topology
 * tab had no way to see "this system has N Crown Jewels — pick one to
 * inspect paths" — they had to either drill in from the home dashboard
 * or click a CJ node on the canvas (whose badge only became visible
 * after the always-on marking shipped in PR #184).
 *
 * UX: single row with the brand crown chip, the count, and a dropdown
 * trigger. Click trigger → list of all CJs sorted by priority_score
 * descending (same ordering as the home dashboard's Top Damage Paths
 * card). Click a row → calls `onSelect(cj)`, which the parent routes
 * through `handleEnterSpotlight` — same code path as a canvas click.
 *
 * Real data: every row comes from the live IAP fetch in
 * dependency-map-tab.tsx. No mock; the picker doesn't render at all
 * when the fetch returns an empty list.
 */

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, ChevronDown, Crown, Globe, RefreshCw, X } from "lucide-react"
import type { CrownJewelSummary } from "../identity-attack-paths/types"

interface CJPickerStripProps {
  crownJewels: CrownJewelSummary[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onSelect: (cj: CrownJewelSummary) => void
}

const SEVERITY_ACCENT: Record<string, string> = {
  CRITICAL: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  HIGH: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  MEDIUM: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  LOW: "bg-blue-500/15 text-blue-300 border-blue-500/40",
}

const TYPE_TINT: Record<string, string> = {
  S3Bucket: "bg-teal-500/15 text-teal-300",
  KMSKey: "bg-purple-500/15 text-purple-300",
  RDSInstance: "bg-blue-500/15 text-blue-300",
  DynamoDBTable: "bg-indigo-500/15 text-indigo-300",
  IAMRole: "bg-violet-500/15 text-violet-300",
}

export function CJPickerStrip({
  crownJewels,
  loading = false,
  error = null,
  onRetry,
  onSelect,
}: CJPickerStripProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current || !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  // Sorted worst-first by priority_score. The backend already returns
  // them in this order; we re-sort defensively in case a future caller
  // (or a different envelope shape) returns them unordered.
  const sorted = [...crownJewels].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0),
  )

  const totalPaths = sorted.reduce((sum, c) => sum + (c.path_count ?? 0), 0)
  const exposedCount = sorted.filter((c) => c.is_internet_exposed).length

  // Loading state — no data yet. Renders the strip frame with a spinner
  // so operators know the lookup is in flight (Render cold-cycle can
  // be 100s+; without this they saw nothing and assumed the system had
  // no Crown Jewels).
  if (loading && sorted.length === 0) {
    return (
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-y border-amber-500/30 px-4 py-2">
        <div className="flex items-center gap-3 text-xs text-amber-200">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="font-bold uppercase tracking-wider">
            Loading Crown Jewels…
          </span>
          <span className="text-[11px] text-slate-400">
            Backend may be cold; this can take up to a minute.
          </span>
        </div>
      </div>
    )
  }

  // Error state — explicit "Crown Jewels couldn't load" with retry,
  // instead of the strip vanishing silently (the prior failure mode
  // made it look like the system had no Crown Jewels at all).
  if (error && sorted.length === 0) {
    return (
      <div className="bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-y border-rose-500/40 px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-rose-200">
            Crown Jewels — couldn't load
          </span>
          <span className="text-[11px] text-rose-300/80 truncate max-w-[480px]" title={error}>
            {error}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-rose-100"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  // Populated state — fall through.
  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-y border-amber-500/30 px-4 py-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
          <Crown className="w-3.5 h-3.5" />
          Crown Jewels in this system
        </div>
        <div className="text-[11px] text-slate-400">
          <span className="font-semibold text-slate-200">{sorted.length}</span> jewel
          {sorted.length === 1 ? "" : "s"}
          {totalPaths > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-slate-200">{totalPaths}</span> attack path
              {totalPaths === 1 ? "" : "s"} total
            </>
          )}
          {exposedCount > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-rose-300">{exposedCount}</span> internet-exposed
            </>
          )}
        </div>
        <div ref={ref} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1 text-[11px] font-semibold text-amber-100"
            title="Pick a Crown Jewel to inspect its attack paths"
          >
            Pick a Crown Jewel
            <ChevronDown
              className={`w-3 h-3 text-amber-200 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
          {open && (
            <div className="absolute top-full right-0 mt-1.5 z-50 w-[560px] max-w-[calc(100vw-32px)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/40">
              <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {sorted.length} Crown Jewel{sorted.length === 1 ? "" : "s"} — sorted by priority_score
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-500 hover:text-slate-200"
                  aria-label="Close picker"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto py-1">
                {sorted.map((cj) => (
                  <button
                    key={cj.id}
                    type="button"
                    onClick={() => {
                      onSelect(cj)
                      setOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800/70 text-left"
                  >
                    <span
                      className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        TYPE_TINT[cj.type] ?? "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {cj.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm font-medium text-slate-100">
                        <span className="truncate">{cj.name || cj.id}</span>
                        {cj.is_internet_exposed && (
                          <Globe className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {cj.path_count ?? 0} path
                        {cj.path_count === 1 ? "" : "s"}
                        {cj.data_classification ? ` · ${cj.data_classification}` : ""}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        SEVERITY_ACCENT[cj.severity] ?? "bg-slate-700 text-slate-300 border-slate-600"
                      }`}
                    >
                      {cj.severity}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {(cj.priority_score ?? 0).toFixed(0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
