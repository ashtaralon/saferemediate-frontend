"use client"

import { useRetryFetch } from "@/lib/use-retry-fetch"
import { Check, RotateCcw } from "lucide-react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { accentByCategory, descriptorClass } from "./styles"

/**
 * Recent Activity feed.
 *
 * Real source: /api/proxy/recent-activity (merges /api/snapshots and
 * /api/automation-rules/rollback/history server-side, sorted by
 * timestamp desc).
 *
 * Honest: surface real timestamps, real resource ids. If both sources
 * are empty the card says so.
 */

type ActivityItem = {
  kind: "snapshot" | "rollback"
  timestamp: string | null
  resource_type?: string
  resource_id?: string
  detail?: string
}

type ActivityResponse = {
  items?: ActivityItem[]
  total?: number
  errors?: string[]
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    const t = new Date(iso).getTime()
    const diffMs = Date.now() - t
    if (Number.isNaN(diffMs)) return "—"
    if (diffMs < 0) return "just now"
    const minutes = Math.round(diffMs / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 48) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
  } catch {
    return "—"
  }
}

export function RecentActivityCard() {
  const { data, loading, error, attempt, retrying, retry } = useRetryFetch<ActivityResponse>(
    "/api/proxy/recent-activity",
    { fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Recent activity" attempt={attempt} retrying={retrying} />
  if (error) return <ErrorCard label="Recent activity" error={error} onRetry={retry} />
  if (!data) return null

  const items = data.items ?? []

  return (
    <Section
      label="Recent activity"
      descriptor={`${data.total ?? items.length} events · snapshots and rollbacks merged`}
      className={accentByCategory.activity}
    >
      {items.length === 0 ? (
        <div className={descriptorClass}>
          No remediation events recorded yet. The feed will populate as snapshots and
          rollbacks land.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((item, i) => {
            const isRollback = item.kind === "rollback"
            const Icon = isRollback ? RotateCcw : Check
            const iconWrap = isRollback
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
            return (
              <li
                key={`${item.kind}-${item.resource_id}-${i}`}
                className="flex items-start gap-3 text-sm"
              >
                <span
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${iconWrap}`}
                >
                  <Icon className="h-3 w-3" strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-900">
                    <span
                      className={
                        item.kind === "rollback"
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }
                    >
                      {item.kind === "rollback" ? "Rolled back" : "Snapshotted"}
                    </span>{" "}
                    <span className="font-medium">
                      {item.resource_type}
                    </span>{" "}
                    <span className="font-mono text-xs text-slate-700">
                      {item.resource_id}
                    </span>
                  </div>
                  {item.detail && (
                    <div className="mt-0.5 text-xs text-slate-500">{item.detail}</div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {relativeTime(item.timestamp)}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {data.errors && data.errors.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-amber-700">
          Source errors: {data.errors.join(" · ")}
        </div>
      )}
    </Section>
  )
}
