"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { Check, RotateCcw, Zap } from "lucide-react"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { accentByCategory, descriptorClass } from "./styles"

/**
 * Recent Activity feed.
 *
 * Real source: /api/proxy/recent-activity (merges three sources server-
 * side: RemediationEvent timeline, snapshots, rollback history — sorted
 * by timestamp desc).
 *
 * Honest: surface real timestamps, real resource ids. If all sources
 * are empty the card says so.
 */

type ActivityItem = {
  kind: "remediation" | "snapshot" | "rollback"
  timestamp: string | null
  resource_type?: string
  resource_id?: string
  detail?: string
  action_type?: string
  status?: string
  permissions_removed?: number
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
  // Activity by definition is recent — strict 5-min staleness. Anything
  // older isn't "recent" anymore.
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<ActivityResponse>(
    "/api/proxy/recent-activity",
    {
      cacheKey: "recent-activity",
      // 30-min freshness window. Recent activity feels stale beyond
      // that, but we still keep last-resort cache available for
      // up to 7 days when fresh fetch fails.
      maxStaleMs: 30 * 60 * 1000,
      fetchInit: { cache: "no-store" },
    }
  )

  if (loading && !data) return <LoadingCard label="Recent activity" />
  if (error && !data) return <ErrorCard label="Recent activity" error={error} onRetry={retry} />
  if (!data) return null

  const items = data.items ?? []

  return (
    <Section
      label="Recent activity"
      descriptor={`${data.total ?? items.length} events · snapshots and rollbacks merged`}
      className={accentByCategory.activity}
      right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
    >
      {items.length === 0 ? (
        <div className={descriptorClass}>
          No remediation events recorded yet. The feed will populate as snapshots and
          rollbacks land.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((item, i) => {
            // Three event kinds: remediation (apply), rollback, snapshot.
            // Pick icon + tone for each.
            const isRemediation = item.kind === "remediation"
            const isRollback = item.kind === "rollback"
            const Icon = isRemediation ? Zap : isRollback ? RotateCcw : Check
            const iconWrap = isRemediation
              ? "bg-blue-100 text-blue-700"
              : isRollback
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            const verbLabel = isRemediation
              ? "Remediated"
              : isRollback
                ? "Rolled back"
                : "Snapshotted"
            const verbToneClass = isRemediation
              ? "text-blue-700"
              : isRollback
                ? "text-amber-700"
                : "text-emerald-700"
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
                    <span className={verbToneClass}>{verbLabel}</span>{" "}
                    <span className="font-medium">{item.resource_type}</span>{" "}
                    <span className="font-mono text-xs text-slate-700">
                      {item.resource_id}
                    </span>
                  </div>
                  {item.detail && (
                    <div className="mt-0.5 text-xs text-slate-500">{item.detail}</div>
                  )}
                  {isRemediation && item.permissions_removed ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      −{item.permissions_removed} permission
                      {item.permissions_removed === 1 ? "" : "s"} removed
                    </div>
                  ) : null}
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
