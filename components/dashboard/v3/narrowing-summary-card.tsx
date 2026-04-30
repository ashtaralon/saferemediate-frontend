"use client"

import { TrendingDown } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { descriptorClass, heroNumberClass, unitClass } from "./styles"

/**
 * "This week's narrowing" — sum of permissions removed via remediation
 * events in the last 7 days.
 *
 * Was previously a NotWiredCard claiming "Backend not wired — needs a
 * narrowing-history endpoint that doesn't exist yet." That was wrong:
 * RemediationEvent nodes already store metadata.permissions_removed
 * with a timestamp, so a window-summed total was always derivable.
 * Backend endpoint /api/remediation-history/narrowing-summary added
 * 2026-05-01 to expose this.
 *
 * Honest framing:
 *   - Headline = sum of permissions_removed across non-rollback events
 *     in the window (default 7 days).
 *   - Rollback count is shown alongside (not netted in) so operators
 *     see both narrowing AND rollback rate. UN-narrowing isn't hidden.
 *   - Per-day breakdown rendered as a tiny sparkline of values so the
 *     operator can tell "1 big day" from "steady stream."
 */

type ByDay = {
  date: string
  permissions_removed: number
  events_count: number
}

type NarrowingResp = {
  window_days?: number
  permissions_removed?: number
  events_count?: number
  rollbacks_count?: number
  period_start?: string
  period_end?: string
  by_day?: ByDay[]
}

function MiniSparkline({ days }: { days: ByDay[] }) {
  if (!days || days.length === 0) return null
  const max = Math.max(...days.map((d) => d.permissions_removed), 1)
  return (
    <div
      className="flex items-end gap-0.5 h-6"
      title={days
        .map((d) => `${d.date}: ${d.permissions_removed} removed (${d.events_count} events)`)
        .join("\n")}
    >
      {days.map((d, i) => {
        const h = Math.max(2, Math.round((d.permissions_removed / max) * 24))
        return (
          <div
            key={i}
            className="w-1.5 rounded-sm bg-emerald-500/70"
            style={{ height: `${h}px` }}
          />
        )
      })}
    </div>
  )
}

export function NarrowingSummaryCard() {
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<NarrowingResp>(
    "/api/proxy/remediation-history/narrowing-summary?days=7",
    {
      cacheKey: "narrowing-summary-7d",
      maxStaleMs: 60 * 60 * 1000, // 1h freshness; falls back to older cache on failure
      fetchInit: { cache: "no-store" },
    },
  )

  if (loading && !data) return <LoadingCard label="This week's narrowing" />
  if (error && !data) return <ErrorCard label="This week's narrowing" error={error} onRetry={retry} />
  if (!data) return null

  const removed = data.permissions_removed ?? 0
  const events = data.events_count ?? 0
  const rollbacks = data.rollbacks_count ?? 0
  const days = data.by_day ?? []

  return (
    <Section
      label="This week's narrowing"
      descriptor={
        events === 0
          ? "No remediation events recorded in the last 7 days"
          : `${events} remediation event${events === 1 ? "" : "s"} · ${data.window_days ?? 7}-day window`
      }
      icon={<TrendingDown className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />}
      className="border-l-[3px] border-l-emerald-500"
      right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={heroNumberClass}>−{removed}</span>
            <span className={unitClass}>permissions</span>
          </div>
          <div className={`${descriptorClass} mt-1`}>
            removed across {events} action{events === 1 ? "" : "s"}
            {rollbacks > 0 ? (
              <>
                {" · "}
                <span className="text-amber-700">
                  {rollbacks} rollback{rollbacks === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {days.length > 1 && (
          <div className="flex flex-col items-end gap-1">
            <MiniSparkline days={days} />
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              per day
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}
