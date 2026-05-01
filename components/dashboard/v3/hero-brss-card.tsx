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
 * Real source: /api/proxy/posture-score (org-wide aggregate already
 * computed server-side as weighted average across systems).
 *
 * Trend (added 2026-05-01): /api/proxy/posture-score/trend reads
 * persisted BlastRadiusSnapshot history and returns a daily
 * resource-weighted series. Was a NotWired disclosure here until
 * the snapshot store was exposed via that endpoint.
 *
 * What's NOT shown (and why):
 *   - "Top driver" line — requires per-resource contribution
 *     attribution against the org-wide aggregate, which isn't surfaced
 *     by /api/posture-score today. Phase C work.
 *
 * Honest framing: large score + grade + 30-day spark + delta + how
 * many systems & resources contributed. Operator can see what's behind
 * the number AND which way it's moving.
 */

type PostureScore = {
  overall_score: number
  grade: "A" | "B" | "C" | "D" | "F"
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

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50",
  B: "text-emerald-700 bg-emerald-50",
  C: "text-amber-700 bg-amber-50",
  D: "text-rose-600 bg-rose-50",
  F: "text-rose-700 bg-rose-100",
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
  const { data, loading, error, retry } = useCachedFetch<PostureScore>(
    "/api/proxy/posture-score",
    { cacheKey: "posture-score", fetchInit: { cache: "no-store" } }
  )

  // Trend is a secondary fetch — never blocks the hero score from
  // rendering. If the trend endpoint is slow or empty, the card still
  // shows the live score; we just skip the spark.
  const { data: trend } = useCachedFetch<PostureTrend>(
    "/api/proxy/posture-score/trend?days=30",
    { cacheKey: "posture-trend-30d", fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Global blast radius score" />
  // /api/proxy/posture-score may return HTTP 200 with an `error` field
  // in the body to signal upstream failure. Post-validate.
  const bodyError = data?.error ? data.message || data.error : null
  if ((error || bodyError) && !data) {
    return <ErrorCard label="Global blast radius score" error={error || bodyError || ""} onRetry={retry} />
  }
  if (!data) return null

  return (
    <Section
      label="Global blast radius score"
      descriptor={`Weighted org aggregate · ${data.system_count} systems · ${data.resources_analyzed.toLocaleString()} resources`}
      className={`${accentByCategory.brss} bg-gradient-to-br from-indigo-50/70 via-white to-white`}
    >
      <div className="flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className={`${heroNumberClass} ${scoreToneClass(data.overall_score)}`}>
            {data.overall_score.toFixed(0)}
          </span>
          <span className={unitClass}>/100</span>
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 text-2xl font-bold ${GRADE_COLORS[data.grade] ?? "text-slate-700 bg-slate-100"}`}
        >
          {data.grade}
        </div>
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

      <p className={`${descriptorClass} mt-4`}>
        Top-driver attribution (which resources moved the score) requires
        per-resource contribution analysis against the org aggregate — Phase C work.
      </p>
    </Section>
  )
}
