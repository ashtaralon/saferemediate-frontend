"use client"

import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import {
  accentByCategory,
  descriptorClass,
  heroNumberClass,
  scoreToneClass,
  unitClass,
} from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"

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
 */

type LpMetrics = {
  totalRoles: number | null
  analyzedRoles: number | null
  rolesWithBloat: number | null
  averageBloatPercentage: number | null
  totalUnusedPermissions: number | null
  lastAnalysisDate: string | null
  bloatPercentageDeltaPp?: number | null
  bloatBaselineAgeDays?: number | null
  bloatBaselineTimestamp?: string | null
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** A metrics reading the card may present: every figure it renders is a backend number. */
function isMetricsReading(value: unknown): value is LpMetrics {
  const m = value as Partial<LpMetrics> | null
  return Boolean(m) && finite(m?.analyzedRoles) !== null && finite(m?.rolesWithBloat) !== null
    && finite(m?.averageBloatPercentage) !== null && finite(m?.totalUnusedPermissions) !== null
}

export function WildcardBloatCard() {
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<LpMetrics>(
    "/api/proxy/least-privilege/metrics",
    // Only a complete reading is cached: a body with a missing figure must not
    // come back on the next visit as if it were one.
    { cacheKey: "lp-metrics", fetchInit: { cache: "no-store" }, isCacheable: isMetricsReading }
  )

  if (loading && !data) return <LoadingCard label="Wildcard bloat" />
  if (error && !data) return <ErrorCard label="Wildcard bloat" error={error} onRetry={retry} />
  if (!data) return null
  // A figure the backend did not send is not 0%: no number is shown for it.
  if (!isMetricsReading(data)) {
    return <ErrorCard label="Wildcard bloat" error="The least-privilege metrics carried no bloat figures." onRetry={retry} />
  }
  if (data.analyzedRoles === 0) {
    return (
      <Section
        label="Wildcard bloat"
        descriptor="Allowed actions sitting unused — point-in-time, not a delta"
        className={`${accentByCategory.bloat} bg-gradient-to-br from-amber-50/70 via-white to-white`}
        right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
      >
        <div className={descriptorClass}>No IAM roles have been analyzed yet, so there is no bloat figure.</div>
      </Section>
    )
  }

  const pct = Math.round(data.averageBloatPercentage as number)
  // For bloat, lower is better. Invert score for color tone.
  const toneScore = 100 - pct

  return (
    <Section
      label="Wildcard bloat"
      descriptor="Allowed actions sitting unused — point-in-time, not a delta"
      className={`${accentByCategory.bloat} bg-gradient-to-br from-amber-50/70 via-white to-white`}
      right={<StaleIndicator cachedAt={cachedAt} isStale={isStale} />}
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
