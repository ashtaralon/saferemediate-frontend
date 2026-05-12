"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { accentByCategory, descriptorClass } from "./styles"

/**
 * Safe Remediations Queue.
 *
 * Real source: /api/proxy/remediation-candidates (passes through to
 * backend which already runs the unified safety-gate per row, populating
 * safety.can_auto_apply / block_reason / warnings).
 *
 * Only candidates whose safety.can_auto_apply === true are surfaced as
 * "ready" — anything blocked is excluded so the queue truly represents
 * what's safe to fire.
 *
 * No fabricated counts. If backend returns empty, the card says so.
 */

type Safety = {
  can_auto_apply?: boolean
  block_reason?: string | null
  block_layer?: string | null
  warnings?: string[]
  data_quality?: string
}

type Candidate = {
  resource_type: string
  resource_id: string
  system?: string
  unused_count?: number
  total_permissions?: number
  severity?: string
  safety?: Safety
}

type CandidatesResponse = {
  candidates?: Candidate[]
  summary?: {
    total_candidates?: number
    auto_applicable?: number
    blocked?: number
  }
  error?: string
}

export function SafeRemediationsQueueCard() {
  // Action queue — strict 10-min staleness. Showing yesterday's "ready
  // to apply" list could include items already remediated.
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<CandidatesResponse>(
    "/api/proxy/remediation-candidates?limit=10",
    {
      cacheKey: "remediation-candidates",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
    }
  )

  if (loading && !data) return <LoadingCard label="Ready-to-execute queue" />
  // Endpoint may return 200 with body.error to signal upstream failure.
  const bodyError = data?.error ? data.error : null
  if ((error || bodyError) && !data) {
    return <ErrorCard label="Ready-to-execute queue" error={error || bodyError || ""} onRetry={retry} />
  }
  if (!data) return null

  const ready = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === true)
  const blocked = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === false)

  return (
    <Section
      label="Ready-to-execute queue"
      descriptor={`Evidence-backed actions, simulated against AWS, with rollback snapshot stored · ${ready.length} ready · ${blocked.length} awaiting more evidence`}
      className={accentByCategory.queue}
      right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
    >
      {ready.length === 0 ? (
        <div className={descriptorClass}>
          No actions ready yet. Candidates are awaiting more evidence or manual approval —
          this is the honest fail-closed state, not an empty render.
        </div>
      ) : (
        <ul className="space-y-2">
          {ready.slice(0, 5).map((c, i) => (
            <li
              key={`${c.resource_type}-${c.resource_id}-${i}`}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">
                  {c.resource_type} · {c.resource_id}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {c.system ?? "—"} · {c.unused_count ?? 0} unused / {c.total_permissions ?? 0} total
                </div>
              </div>
              {c.severity && (
                <span
                  className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    c.severity === "CRITICAL"
                      ? "bg-rose-100 text-rose-700"
                      : c.severity === "HIGH"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {c.severity}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready.length > 5 && (
        <div className={`${descriptorClass} mt-3`}>
          + {ready.length - 5} more ready · view all in Remediations
        </div>
      )}
    </Section>
  )
}
