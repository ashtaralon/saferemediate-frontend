"use client"

import {
  useCachedFetch,
  type UseCachedFetchResult,
} from "@/lib/use-cached-fetch"
import { deriveCandidatesIntegrity, isCacheableCandidates } from "@/lib/candidates-integrity"
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

/** One constant so the request and the pagination claim cannot drift. */
const REQUEST_LIMIT = 50

export type CandidatesResponse = {
  candidates?: Candidate[]
  summary?: {
    total_candidates?: number
    auto_applicable?: number
    blocked?: number
  }
  error?: string
}

export function SafeRemediationsQueueCard({
  limit = 5,
  /** Lifted read from the cockpit — one endpoint, one reading per page. */
  shared,
}: {
  limit?: number
  shared?: UseCachedFetchResult<CandidatesResponse>
} = {}) {
  // Action queue — strict 10-min staleness. Showing yesterday's "ready
  // to apply" list could include items already remediated.
  const own = useCachedFetch<CandidatesResponse>(
    shared ? null : `/api/proxy/remediation-candidates?limit=${REQUEST_LIMIT}`,
    {
      cacheKey: "ciso-brief-remediations",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      isCacheable: isCacheableCandidates,
    }
  )
  // ONE reading, metadata included. Selecting `data` from `shared` but
  // `isStale`/`cachedAt` from `own` split the reading in half: in Executive
  // `own` has url=null and never refreshes, so a card hydrated from stale
  // cache kept rendering "as of N ago, refreshing" forever while the
  // parent's fresh payload was already on screen. Freshness metadata IS
  // part of the reading.
  const { data, loading, error, retry, isStale, cachedAt } = shared ?? own

  if (loading && !data) return <LoadingCard label="Proposed changes" />
  // The proxy answers an upstream failure with HTTP 200 and a fully-formed
  // EMPTY body carrying `error`. The previous guard was
  // `if ((error || bodyError) && !data)` — `data` IS that object, so `!data`
  // was false and the branch was unreachable. The card rendered "0 ready"
  // for a dead upstream: a false zero on the queue that drives remediation.
  const integrity = deriveCandidatesIntegrity(data)
  if (error || integrity.state !== "READY") {
    return (
      <ErrorCard
        label="Proposed changes"
        error={error || integrity.reason || "Unavailable"}
        onRetry={retry}
      />
    )
  }
  if (!data) return null

  const ready = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === true)
  const blocked = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === false)

  // These are PAGE counts, not totals. The fetch is ?limit=10, so "10 ready"
  // has always meant "all ten rows on page one were applicable" — it says
  // nothing about how many exist. The backend
  // (api/remediation_candidates.py:385) returns no summary block at all, so
  // an authoritative total is not available to any consumer today.
  //
  // Two honest options: label the page, or say unavailable. Labelling wins here
  // because the rows themselves are real and useful; it is only the COUNT that
  // was overclaiming. The estate brief takes the other option and renders "—",
  // which is why the two disagreed: the brief refused to publish a number it
  // could not source, and this card published one it could not source either.
  const pageSize = data.candidates?.length ?? 0
  // Threshold must follow the REQUEST. It stayed at 10 after the request
  // moved to ?limit=50, so ten legitimate candidates claimed "more may
  // exist" from a page that was 40 rows short of full — an invented
  // truncation, the mirror image of the silent one it was added to stop.
  const sawFullPage = pageSize >= REQUEST_LIMIT
  const countLabel = sawFullPage
    ? `${ready.length} ready and ${blocked.length} held on this page · more may exist`
    : `${ready.length} ready · ${blocked.length} held`

  return (
    <Section
      label="Proposed changes"
      descriptor={`Changes Cyntro would make, with the evidence behind each · ${countLabel}`}
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
          {ready.slice(0, limit).map((c, i) => (
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

      {ready.length > limit && (
        <div className={`${descriptorClass} mt-3`}>
          + {ready.length - limit} more ready · view all in Remediations
        </div>
      )}
    </Section>
  )
}
