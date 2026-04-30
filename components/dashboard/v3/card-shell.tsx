"use client"

import { ReactNode } from "react"
import { dottedNotWiredClass, descriptorClass, labelClass, sectionClass } from "./styles"

/**
 * Base section wrapper — every V3 card uses this.
 */
export function Section({
  label,
  descriptor,
  right,
  icon,
  children,
  className = "",
}: {
  label?: string
  descriptor?: string
  right?: ReactNode
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`${sectionClass} ${className}`}>
      {(label || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {label && (
              <div className={`${labelClass} flex items-center gap-1.5`}>
                {icon}
                <span>{label}</span>
              </div>
            )}
            {descriptor && <div className={`${descriptorClass} mt-1`}>{descriptor}</div>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * Three-state card pattern — see feedback_no_mock_numbers_in_ui.md.
 *
 * NotWiredCard renders an honest empty state for sections whose backend
 * is not yet implemented. NEVER displays fake numbers; always explains
 * what's missing and links to the backlog when known.
 */
export function NotWiredCard({
  label,
  reason,
  backlog,
}: {
  label: string
  reason: string
  backlog?: string
}) {
  return (
    <div className={dottedNotWiredClass}>
      <div className={labelClass}>{label}</div>
      <div className="mt-2 text-sm text-slate-700">{reason}</div>
      {backlog && (
        <div className="mt-2 text-xs text-slate-500">
          Backlog: <span className="font-mono">{backlog}</span>
        </div>
      )}
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-200/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
        Backend not wired
      </div>
    </div>
  )
}

/**
 * LoadingCard — used while real data is in flight. NEVER displays
 * pseudo numbers (e.g. "0" as a placeholder). Skeleton bars only.
 *
 * Optional `attempt` prop surfaces auto-retry progress so users can
 * tell the card is recovering, not silently stuck. Used by
 * useRetryFetch-backed cards.
 */
export function LoadingCard({
  label,
  attempt,
  retrying,
}: {
  label: string
  attempt?: number
  retrying?: boolean
}) {
  const showRetry = retrying && typeof attempt === "number" && attempt > 0
  return (
    <div className={sectionClass}>
      <div className={labelClass}>{label}</div>
      <div className="mt-3 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
      </div>
      {showRetry && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          Retrying… attempt {attempt + 1}
        </div>
      )}
    </div>
  )
}

/**
 * StaleIndicator — small pill rendered on a card when its data is from
 * localStorage cache and a background refresh is in flight. Per memory
 * feedback_no_mock_numbers_in_ui.md, the user must be able to tell when
 * they're looking at cached data vs live data; this pill is that signal.
 *
 * The pill shows the age of the cached data ("as of 4 min ago, refreshing")
 * so the operator can decide whether the data is fresh enough to act on.
 *
 * Place inside a card's header `right` slot, or anywhere the card
 * visually exposes its load state.
 */
function formatAgeBrief(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function StaleIndicator({
  cachedAt,
  isStale,
}: {
  cachedAt: number | null
  isStale: boolean
}) {
  if (!isStale || cachedAt === null) return null
  const ageSeconds = Math.max(0, Math.floor((Date.now() - cachedAt) / 1000))
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
      title={`Showing cached data fetched ${formatAgeBrief(ageSeconds)}. A fresh request is in progress and the card will update when it returns.`}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      as of {formatAgeBrief(ageSeconds)}, refreshing
    </span>
  )
}

/**
 * ErrorCard — renders when fetch fails. Shows the actual error so the
 * operator can act, not a generic "something went wrong."
 */
export function ErrorCard({
  label,
  error,
  onRetry,
}: {
  label: string
  error: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-[14px] border border-rose-200 bg-rose-50/50 p-5">
      <div className={labelClass}>{label}</div>
      <div className="mt-2 text-sm text-rose-700">{error}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          Retry
        </button>
      )}
    </div>
  )
}
