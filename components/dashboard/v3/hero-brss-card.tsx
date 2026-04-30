"use client"

import { useRetryFetch } from "@/lib/use-retry-fetch"
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
 * What's NOT shown (and why):
 *   - Sparkline / trend / week-over-week delta — requires history
 *     endpoint that doesn't exist yet. Showing a fake delta would
 *     violate feedback_no_mock_numbers_in_ui.md.
 *   - "Top driver" line — requires per-system contribution analysis
 *     not surfaced by the current aggregate. Phase C work.
 *
 * Honest framing instead: large score + grade + how many systems &
 * resources contributed. Operator can see what's behind the number.
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

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50",
  B: "text-emerald-700 bg-emerald-50",
  C: "text-amber-700 bg-amber-50",
  D: "text-rose-600 bg-rose-50",
  F: "text-rose-700 bg-rose-100",
}

export function HeroBrssCard() {
  const { data, loading, error, attempt, retrying, retry } = useRetryFetch<PostureScore>(
    "/api/proxy/posture-score",
    { fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Global blast radius score" attempt={attempt} retrying={retrying} />
  // The /api/proxy/posture-score endpoint may return HTTP 200 with an
  // `error` field in the body to signal an upstream failure that should
  // be surfaced to the user. The hook only treats HTTP status as the
  // error signal, so we post-validate the body here.
  const bodyError = data?.error ? data.message || data.error : null
  if (error || bodyError) {
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

      <p className={`${descriptorClass} mt-4`}>
        Trend, sparkline and top-driver attribution require backend history endpoints that
        aren&apos;t wired yet. They&apos;ll appear here once Phase C lands.
      </p>
    </Section>
  )
}
