"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import {
  accentByCategory,
  descriptorClass,
  heroNumberClass,
  scoreToneClass,
  unitClass,
} from "./styles"

/**
 * Hero — Global Blast Radius Score.
 *
 * Primary source: /api/proxy/global-org-score
 *   Convergence-aware org aggregate computed by
 *   unified.scoring.global_org_score.compose_global_org_score(). Builds
 *   on top of per-system BRSS — does NOT replace per-resource scoring.
 *   Returns the per-system breakdowns so this card can name worst
 *   systems and weak planes inline (real data, not Phase C).
 *
 * Fallback: /api/proxy/posture-score
 *   Legacy weighted-mean of health_score. Used only when the new
 *   endpoint isn't yet reachable (Render deploy lag, dyno cold-
 *   start past timeout). Lets the card stay responsive during the
 *   global-org-score rollout.
 *
 * Trend: /api/proxy/posture-score/trend reads persisted
 *   BlastRadiusSnapshot history and returns a daily resource-weighted
 *   series.
 */

type GlobalOrgScore = {
  global_score: number | null
  org_risk?: number
  weighted_mean_risk?: number
  weighted_p90_risk?: number
  resources_analyzed: number
  system_count: number
  worst_systems?: string[]
  system_breakdowns?: Array<{
    system_name: string
    system_score: number
    weak_planes?: string[]
    convergence_multiplier?: number
    visibility_penalty?: number
    system_risk?: number
    environment?: string
  }>
  version?: string
  partial?: { succeeded: number; failed: number; discovered: number }
  error?: string
  message?: string
}

type PostureScore = {
  overall_score: number
  resources_analyzed: number
  system_count: number
  source: string
  error?: string
  message?: string
}

type TrendPoint = { date: string; score: number; system_count: number }

type PostureTrend = {
  window_days: number
  current: number | null
  previous: number | null
  delta: number | null
  series: TrendPoint[]
  snapshot_count: number
  error?: string
}

/**
 * Inline SVG line chart of the BRSS trend. Auto-scales y-axis to the
 * visible series range so a 50→55 swing is as legible as 20→80. Bars
 * (like the narrowing-summary sparkline) would compress small swings
 * into invisibility because BRSS values cluster within a narrow band.
 */
function TrendSpark({ series }: { series: TrendPoint[] }) {
  if (!series || series.length < 2) return null
  const scores = series.map((p) => p.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1
  const w = 120
  const h = 28
  const pts = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * w
      // Higher BRSS = better. Plot literally: higher score = higher on
      // chart (more "up" = visually better). No inversion.
      const y = h - ((p.score - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-7 w-32 stroke-indigo-500 text-indigo-500"
      fill="none"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HeroBrssCard() {
  // Primary: convergence-aware org score from the new module.
  const {
    data: orgData,
    loading: orgLoading,
    error: orgError,
    retry: orgRetry,
  } = useCachedFetch<GlobalOrgScore>(
    "/api/proxy/global-org-score",
    { cacheKey: "global-org-score", fetchInit: { cache: "no-store" } },
  )

  // Fallback: legacy weighted-mean. Only consulted when primary
  // failed or returned null score (rolling deploy, cold start).
  const orgUsable =
    orgData &&
    typeof orgData.global_score === "number" &&
    !orgData.error
  const {
    data: legacyData,
    loading: legacyLoading,
    error: legacyError,
    retry: legacyRetry,
  } = useCachedFetch<PostureScore>(
    "/api/proxy/posture-score",
    {
      cacheKey: "posture-score",
      fetchInit: { cache: "no-store" },
      // Don't even fire when primary is healthy.
      enabled: !orgUsable,
    } as any,
  )

  // Trend is a secondary fetch — never blocks the hero score from
  // rendering. If the trend endpoint is slow or empty, the card still
  // shows the live score; we just skip the spark.
  const { data: trend } = useCachedFetch<PostureTrend>(
    "/api/proxy/posture-score/trend?days=30",
    { cacheKey: "posture-trend-30d", fetchInit: { cache: "no-store" } }
  )

  // Decide which source backs the render this turn. Prefer the new
  // org module when usable; otherwise the legacy aggregate.
  const usingOrg = orgUsable
  const score: number | null = usingOrg
    ? (orgData!.global_score as number)
    : legacyData && typeof legacyData.overall_score === "number"
      ? legacyData.overall_score
      : null
  const systemCount = usingOrg
    ? orgData!.system_count
    : (legacyData?.system_count ?? 0)
  const resourcesAnalyzed = usingOrg
    ? orgData!.resources_analyzed
    : (legacyData?.resources_analyzed ?? 0)
  const worstSystems = usingOrg ? (orgData!.worst_systems ?? []) : []
  // Distinct list of weak planes across the worst-3 systems — used
  // for the inline "weak planes" attribution under the score.
  const weakPlanesAcrossWorst: string[] = []
  if (usingOrg && Array.isArray(orgData!.system_breakdowns)) {
    const seen = new Set<string>()
    for (const wsName of (orgData!.worst_systems ?? []).slice(0, 3)) {
      const b = orgData!.system_breakdowns.find((x) => x.system_name === wsName)
      for (const plane of b?.weak_planes ?? []) {
        if (!seen.has(plane)) {
          seen.add(plane)
          weakPlanesAcrossWorst.push(plane)
        }
      }
    }
  }

  const loading =
    score === null && (orgLoading || (!usingOrg && legacyLoading))
  if (loading) return <LoadingCard label="Global blast radius score" />
  if (score === null) {
    const msg =
      orgError ||
      orgData?.message ||
      orgData?.error ||
      legacyError ||
      legacyData?.message ||
      legacyData?.error ||
      "Score unavailable"
    return (
      <ErrorCard
        label="Global blast radius score"
        error={msg}
        onRetry={() => (usingOrg ? orgRetry() : legacyRetry())}
      />
    )
  }
  // Compatibility shim — preserves the rest of the render below.
  const data: { overall_score: number; resources_analyzed: number; system_count: number } = {
    overall_score: score,
    resources_analyzed: resourcesAnalyzed,
    system_count: systemCount,
  }

  return (
    <Section
      label="Global blast radius score"
      descriptor={`Weighted by production criticality, exposed systems, and cross-plane convergence · ${data.system_count} systems · ${data.resources_analyzed.toLocaleString()} resources`}
      className={`${accentByCategory.brss} bg-gradient-to-br from-indigo-50/70 via-white to-white`}
    >
      <div className="flex items-baseline gap-3">
        <span className={`${heroNumberClass} ${scoreToneClass(data.overall_score)}`}>
          {data.overall_score.toFixed(0)}
        </span>
        <span className={unitClass}>/100</span>
      </div>

      {/* Trend block. Renders only when at least 2 days of snapshot
          history exist. On a fresh DB / new install, hides silently
          rather than showing "no data" noise.

          Honest framing: trend covers ONLY systems with persisted
          snapshots (set via issues_summary calls). The hero score above
          is the live aggregate across ALL systems — these two numbers
          can differ when not every system has snapshot history yet.
          The "N of M systems" descriptor surfaces that gap. */}
      {trend && trend.series && trend.series.length >= 2 && (
        <div className="mt-4 flex items-center gap-3">
          <TrendSpark series={trend.series} />
          {trend.delta != null && (
            <span
              className={`text-sm font-mono tabular-nums ${
                trend.delta > 0
                  ? "text-emerald-600"
                  : trend.delta < 0
                    ? "text-rose-600"
                    : "text-slate-500"
              }`}
            >
              {trend.delta > 0 ? "+" : ""}
              {trend.delta} pts
            </span>
          )}
          {(() => {
            const trendSystemCount = trend.series[trend.series.length - 1]?.system_count ?? 0
            const haveBoth = trendSystemCount > 0 && data.system_count > 0
            const partialTrend = haveBoth && trendSystemCount < data.system_count
            return (
              <span className={descriptorClass}>
                · last {trend.window_days}d
                {haveBoth && (
                  <>
                    {" · "}
                    {trendSystemCount}
                    {partialTrend ? ` of ${data.system_count}` : ""} system
                    {trendSystemCount === 1 ? "" : "s"} with history
                  </>
                )}
              </span>
            )
          })()}
        </div>
      )}

      {/* Inline attribution — replaces the "Phase C" disclosure. Real
          data when the new org module backs the render: weak planes
          surfaced from the worst-3 systems' per-family scores, plus
          the worst system names. Hidden cleanly when only the legacy
          aggregate is available (no per-system breakdowns to attribute
          from). */}
      {usingOrg && (worstSystems.length > 0 || weakPlanesAcrossWorst.length > 0) ? (
        <div className={`${descriptorClass} mt-4 space-y-1`}>
          {weakPlanesAcrossWorst.length > 0 ? (
            <p>
              Largest exposure:{" "}
              <span className="font-medium text-rose-700">
                {weakPlanesAcrossWorst.join(" + ")}
              </span>
            </p>
          ) : null}
          {worstSystems.length > 0 ? (
            <p>
              Worst systems:{" "}
              <span className="font-medium text-slate-800">
                {worstSystems.slice(0, 3).join(", ")}
              </span>
            </p>
          ) : null}
        </div>
      ) : !usingOrg ? (
        <p className={`${descriptorClass} mt-4`}>
          Showing legacy weighted-mean score — convergence-aware org score
          temporarily unavailable. Retry once backend warms.
        </p>
      ) : null}
    </Section>
  )
}
