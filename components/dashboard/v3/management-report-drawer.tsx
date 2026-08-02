"use client"

import { useEffect } from "react"
import { FileText, X } from "lucide-react"

/**
 * Management Report — readiness drawer (entry point only).
 *
 * The report GENERATOR is a project; the entry point is not, and shipping
 * it now makes the gap legible instead of invisible.
 *
 * What this drawer does NOT do is quietly assemble a board brief out of
 * whichever cards happened to load. A board-quality report needs one scope,
 * one "as of", one graph generation, explicit completeness, reproducible
 * calculations and a period comparison. Cyntro does not yet have a
 * cross-dashboard governed snapshot, so `Board-ready` is honestly NO and
 * the drawer says which precondition is missing.
 *
 * It reports on the SAME payloads the page just rendered — passed in, not
 * re-fetched. A drawer that fetched its own copies would be describing a
 * different reading of the estate than the one on screen, which is the
 * exact inconsistency a governed snapshot exists to prevent.
 */

export type SourceReadiness = {
  label: string
  /** READY | PARTIAL | UNAVAILABLE — the source's own declaration. */
  state: "READY" | "PARTIAL" | "UNAVAILABLE"
  detail?: string | null
  /** When this particular payload was read. Different per source today. */
  cachedAt?: number | null
}

export type ReportReadiness = {
  scope: string
  sources: SourceReadiness[]
  /** Graph generation, when a source reports one. Null until plumbed. */
  generation?: string | null
}

const STATE_PILL: Record<SourceReadiness["state"], string> = {
  READY: "bg-emerald-50 text-emerald-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  UNAVAILABLE: "bg-rose-50 text-rose-700",
}

function fmt(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—"
  return new Date(ts).toLocaleString()
}

/**
 * Board-ready requires EVERY executive feed to be READY. One PARTIAL makes
 * the pack a draft, because a board brief that silently omits a system is
 * worse than one that says a system is missing.
 *
 * Even all-READY is only "draft" today: the feeds are read at different
 * times from potentially different graph generations, so the pack has no
 * single "as of". That precondition is PR 2, and until it lands this
 * function cannot return true — deliberately.
 */
export function deriveBoardReady(r: ReportReadiness): {
  ready: boolean
  blockers: string[]
} {
  const blockers: string[] = []
  const notReady = r.sources.filter((s) => s.state !== "READY")
  for (const s of notReady) {
    blockers.push(`${s.label} is ${s.state}${s.detail ? ` — ${s.detail}` : ""}`)
  }
  blockers.push(
    "No governed cross-dashboard snapshot: each section is read independently, " +
      "so the pack has no single as-of time or graph generation",
  )
  return { ready: false, blockers }
}

export function ManagementReportDrawer({
  open,
  onClose,
  readiness,
}: {
  open: boolean
  onClose: () => void
  readiness: ReportReadiness
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const { blockers } = deriveBoardReady(readiness)
  const readyCount = readiness.sources.filter((s) => s.state === "READY").length

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close report readiness"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/20"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Management report</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Readiness of the current reading — not a generated pack.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <div className="text-sm font-semibold text-amber-900">Board-ready: No</div>
            <ul className="mt-1.5 space-y-1 text-xs leading-5 text-amber-800">
              {blockers.map((b, i) => (
                <li key={i}>· {b}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Scope
            </div>
            <div className="mt-1 text-sm text-slate-800">{readiness.scope}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Graph generation
            </div>
            <div className="mt-1 font-mono text-xs text-slate-700">
              {readiness.generation ?? "not reported by any executive feed yet"}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Data completeness
              </div>
              <div className="text-xs text-slate-500">
                {readyCount} of {readiness.sources.length} feeds ready
              </div>
            </div>
            <ul className="mt-2 space-y-2">
              {readiness.sources.map((s) => (
                <li
                  key={s.label}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800">{s.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      read {fmt(s.cachedAt)}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATE_PILL[s.state]}`}
                  >
                    {s.state}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Each feed is read independently, so these times differ. A pack built
              from them has no single &ldquo;as of&rdquo;.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Available now
            </div>
            <button
              type="button"
              disabled
              title="Draft export lands with the executive data contract (PR 2)"
              className="mt-2 flex w-full cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-400"
            >
              <FileText className="h-4 w-4" />
              Export draft — watermarked, may contain unavailable sections
            </button>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Board brief and evidence appendix require the governed snapshot:
              one scope, one as-of, one generation, and a comparison with the
              previous period.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
