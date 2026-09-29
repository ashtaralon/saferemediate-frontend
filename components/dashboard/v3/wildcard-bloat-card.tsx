"use client"

import { ErrorCard, LoadingCard, Section } from "./card-shell"
import {
  accentByCategory,
  descriptorClass,
  heroNumberClass,
  scoreToneClass,
  unitClass,
} from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { lpMetricsHold, type LpMetricsHeldFields } from "@/lib/brss-held"
import { BrssHeldNotice } from "@/components/brss/brss-held-notice"

/**
 * Wildcard Bloat — point-in-time + week-over-week delta.
 *
 * What the metric IS (honest):
 *   averageBloatPercentage = unused_actions / total_allowed across the
 *   roles we've analyzed. The "how wide is your wildcard surface" number.
 *
 * WoW delta (added 2026-05-01): backend persists LPMetricsSnapshot
 * nodes on every metrics call (1h throttle). compute_wow_delta picks
 * the snapshot closest to 7 days back and returns
 * `bloatPercentageDeltaPp = current - baseline` in percentage points.
 * Negative = bloat shrank (improvement); positive = bloat grew.
 * Null on fresh installs that don't have 7 days of history yet —
 * card hides the delta block silently in that case.
 *
 * Held: the backend nulls averageBloatPercentage / rolesWithBloat /
 * totalUnusedPermissions when the IAM usage they are read off is not
 * verified (lib/brss-held.ts::lpMetricsHold). The card then shows the typed
 * code and reason and none of the three values — never 0 or 0%.
 */

type LpMetrics = LpMetricsHeldFields & {
  totalRoles: number
  analyzedRoles: number
  rolesWithBloat: number | null
  averageBloatPercentage: number | null
  totalUnusedPermissions: number | null
  lastAnalysisDate: string
  bloatPercentageDeltaPp?: number | null
  bloatBaselineAgeDays?: number | null
  bloatBaselineTimestamp?: string | null
}

export function WildcardBloatCard() {
  const { data, loading, error, retry } = useCachedFetch<LpMetrics>(
    "/api/proxy/least-privilege/metrics",
    { cacheKey: "lp-metrics", fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Wildcard bloat" />
  if (error && !data) return <ErrorCard label="Wildcard bloat" error={error} onRetry={retry} />
  if (!data) return null

  const hold = lpMetricsHold(data)
  if (hold) {
    // No value, no delta: a week-over-week change beside a withheld current
    // value would be read as a measurement of it.
    return (
      <Section
        label="Wildcard bloat"
        descriptor="Not computed yet — this is not an all-clear"
        className={`${accentByCategory.bloat} bg-gradient-to-br from-amber-50/70 via-white to-white`}
      >
        <div data-testid="wildcard-bloat-held">
          <div className="flex items-center gap-3 py-2">
            <span className={`${heroNumberClass} text-slate-400`}>—</span>
            <span className="text-sm text-slate-500">not available</span>
          </div>
          <BrssHeldNotice hold={hold} testId="wildcard-bloat-held-notice" />
        </div>
      </Section>
    )
  }

  // Past the hold, all three are finite numbers.
  const pct = Math.round(data.averageBloatPercentage as number)
  // For bloat, lower is better. Invert score for color tone.
  const toneScore = 100 - pct

  return (
    <Section
      label="Wildcard bloat"
      descriptor="Allowed actions sitting unused — point-in-time, not a delta"
      className={`${accentByCategory.bloat} bg-gradient-to-br from-amber-50/70 via-white to-white`}
    >
      <div className="flex items-baseline gap-3">
        <span className={`${heroNumberClass} ${scoreToneClass(toneScore)}`}>
          {pct}
        </span>
        <span className={unitClass}>%</span>
        {/* WoW delta. For bloat, lower is better — a NEGATIVE delta is
            an improvement (rendered green). Hides silently when the
            backend has no baseline yet (first week after install). */}
        {data.bloatPercentageDeltaPp != null && (
          <span
            className={`text-sm font-mono tabular-nums ${
              data.bloatPercentageDeltaPp < 0
                ? "text-emerald-600"
                : data.bloatPercentageDeltaPp > 0
                  ? "text-rose-600"
                  : "text-slate-500"
            }`}
          >
            {data.bloatPercentageDeltaPp > 0 ? "+" : ""}
            {data.bloatPercentageDeltaPp.toFixed(1)}pp
          </span>
        )}
      </div>

      <div className={`${descriptorClass} mt-3 space-y-1`}>
        <div>
          <span className="font-semibold text-slate-700">
            {(data.totalUnusedPermissions as number).toLocaleString()}
          </span>{" "}
          unused permissions across{" "}
          <span className="font-semibold text-slate-700">
            {data.rolesWithBloat}
          </span>{" "}
          / {data.analyzedRoles} roles
        </div>
        {data.bloatPercentageDeltaPp != null && data.bloatBaselineAgeDays != null ? (
          <div className="text-slate-500">
            vs {data.bloatBaselineAgeDays}d ago
            {data.bloatPercentageDeltaPp < 0
              ? " — narrowing"
              : data.bloatPercentageDeltaPp > 0
                ? " — widening"
                : " — flat"}
          </div>
        ) : (
          <div className="text-slate-500">
            Week-over-week delta accumulates from snapshot history; appears once
            the backend has ~7 days of metrics captured.
          </div>
        )}
      </div>
    </Section>
  )
}
