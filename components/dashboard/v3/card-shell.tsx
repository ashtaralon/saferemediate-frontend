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
  children,
  className = "",
}: {
  label?: string
  descriptor?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`${sectionClass} ${className}`}>
      {(label || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {label && <div className={labelClass}>{label}</div>}
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
 */
export function LoadingCard({ label }: { label: string }) {
  return (
    <div className={sectionClass}>
      <div className={labelClass}>{label}</div>
      <div className="mt-3 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
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
