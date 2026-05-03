"use client"

import type { BlastRadiusScore } from "@/lib/types"
import {
  accentByCategory,
  descriptorClass,
  familyBarClass,
  heroNumberClass,
  numberClass,
  scoreToneClass,
  unitClass,
} from "@/components/dashboard/v3/styles"
import { Section } from "@/components/dashboard/v3/card-shell"

type HistoryPoint = {
  timestamp: string
  score: number
  score_raw: number
  coverage_ratio: number
  resource_count: number
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50",
  B: "text-emerald-700 bg-emerald-50",
  C: "text-amber-700 bg-amber-50",
  D: "text-rose-600 bg-rose-50",
  F: "text-rose-700 bg-rose-100",
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

function TrendSpark({ series }: { series: HistoryPoint[] }) {
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

const PLANE_TILES: Array<{
  key: keyof BlastRadiusScore["per_family"] | "iam"
  label: string
  family: "permissions" | "network" | "data"
  pip: string
}> = [
  { key: "data", label: "Data", family: "data", pip: "bg-teal-500" },
  { key: "iam", label: "Permissions", family: "permissions", pip: "bg-violet-500" },
  { key: "network", label: "Network", family: "network", pip: "bg-blue-500" },
]

export function SystemBlastRadiusHero({
  brss,
  brssHistory,
  systemName,
  resourceCount,
}: {
  brss: BlastRadiusScore | null
  brssHistory: HistoryPoint[]
  systemName: string
  resourceCount: number
}) {
  // Editorial layout mirrors the global Blast Radius hero
  // (components/dashboard/v3/hero-brss-card.tsx + family-strip.tsx),
  // scoped to one system. Hero number + grade + trend on top; three
  // plane cards (Data / Permissions / Network) below at the same
  // visual weight as on the home dashboard.
  if (!brss) {
    return (
      <section
        className={`rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${accentByCategory.brss}`}
        data-testid="system-blast-radius-hero-empty"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Blast Radius Score
        </div>
        <div className="mt-3 text-sm text-slate-500">
          Awaiting first scan for {systemName}.
        </div>
      </section>
    )
  }

  const overlay = brss.overlay && !brss.overlay.error ? brss.overlay : null
  const score = overlay?.score ?? brss.score
  const grade = gradeFromScore(score)
  const coveragePercent = Math.round(brss.coverage_ratio * 100)

  // Newest-first → oldest-first for the spark; cap to 30.
  const sparkSeries = [...brssHistory].reverse().slice(-30)

  // Delta — prefer the persisted snapshot delta the backend computes,
  // fall back to history-derived delta when only the latest two
  // snapshots are persisted.
  const persistedDelta = brss.delta?.score_delta ?? null
  const persistedPrev = brss.delta?.previous_score ?? null
  const histDelta =
    sparkSeries.length >= 2
      ? Math.round(
          sparkSeries[sparkSeries.length - 1].score - sparkSeries[0].score,
        )
      : null
  const delta = persistedDelta ?? histDelta
  const deltaText: string | null = (() => {
    if (delta === null) return null
    if (persistedPrev === null && persistedDelta === null && histDelta === null) {
      return null
    }
    if (persistedPrev === null && persistedDelta !== null) {
      return "baseline established"
    }
    if (delta > 0) return `+${delta} pts`
    if (delta < 0) return `${delta} pts`
    return "no change"
  })()

  // Weak planes — prefer the convergence-overlay's weak_planes (already
  // computed against the cross-plane convergence threshold). Fallback
  // to per_family entries < 70.
  const weakPlanes: string[] = (() => {
    if (overlay && overlay.weak_planes && overlay.weak_planes.length > 0) {
      return overlay.weak_planes
    }
    const out: string[] = []
    for (const tile of PLANE_TILES) {
      const v = (brss.per_family as Record<string, number | undefined>)[tile.key]
      if (typeof v === "number" && v < 70) {
        out.push(tile.label.toLowerCase())
      }
    }
    return out
  })()

  // Window length for the descriptor; if history is empty fall back to
  // resource count + coverage so the descriptor stays load-bearing.
  const trendDays = sparkSeries.length >= 2 ? sparkSeries.length - 1 : 0

  return (
    <div className="space-y-5" data-testid="system-blast-radius-hero">
      {/* Hero — full-width editorial section. */}
      <Section
        label="Blast Radius Score"
        descriptor={`Weighted by production criticality, exposed resources, and cross-plane convergence · ${systemName} · ${resourceCount} resources · ${coveragePercent}% coverage`}
        className={`${accentByCategory.brss} bg-gradient-to-br from-indigo-50/70 via-white to-white`}
      >
        {/* Tight cluster — number + unit + grade live together at the
            left edge instead of being pushed apart by `justify-between`.
            The previous layout pinned the grade to the right of the
            full-width section, leaving a wide dead band between the two.
            Trend, weak-planes, and convergence stack underneath the
            number in a single column to keep the eye moving down rather
            than scanning a sparse horizontal row. */}
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`${heroNumberClass} ${scoreToneClass(score)}`}>
            {score.toFixed(0)}
          </span>
          <span className={unitClass}>/100</span>
          <span
            className={`ml-2 inline-flex items-center justify-center rounded-lg px-3 py-1 text-2xl font-bold leading-none ${
              GRADE_COLORS[grade] ?? "text-slate-700 bg-slate-100"
            }`}
            data-testid="system-blast-radius-grade"
          >
            {grade}
          </span>

          {/* Trend + delta tucked inline to the right of the grade so
              the row stays informationally dense. Renders only when at
              least 2 history points exist. */}
          {sparkSeries.length >= 2 && (
            <span className="ml-4 inline-flex items-center gap-2">
              <TrendSpark series={sparkSeries} />
              {deltaText !== null && delta !== null && (
                <span
                  className={`text-sm font-mono tabular-nums ${
                    delta > 0
                      ? "text-emerald-600"
                      : delta < 0
                        ? "text-rose-600"
                        : "text-slate-500"
                  }`}
                >
                  {deltaText}
                </span>
              )}
              <span className={descriptorClass}>
                · last {trendDays} snapshot{trendDays === 1 ? "" : "s"}
              </span>
            </span>
          )}
        </div>

        {/* Inline attribution — weak planes when present. Hidden cleanly
            when every plane is healthy (≥70). Mirrors the global hero's
            "weak planes:" line so operators recognize the pattern. */}
        {weakPlanes.length > 0 ? (
          <div className={`${descriptorClass} mt-3`}>
            <p>
              Weak planes:{" "}
              <span className="font-medium text-rose-700">
                {weakPlanes.join(" + ")}
              </span>
            </p>
          </div>
        ) : null}

        {/* Convergence-overlay attribution — only shown when overlay
            actually shifted the score AND the multiplier is genuinely
            >1.0 (i.e. cross-plane convergence is biting, not a no-op). */}
        {overlay &&
        overlay.score !== brss.score &&
        overlay.convergence_multiplier > 1.0 ? (
          <p className={`${descriptorClass} mt-2`}>
            Cross-plane convergence ×{overlay.convergence_multiplier.toFixed(2)} —
            shows {brss.score.toFixed(0)} without the multiplier.
          </p>
        ) : null}
      </Section>

      {/* Three plane cards — Data / Permissions / Network. Same shape as
          the global FamilyStrip but scoped to this system's per_family
          payload. Tiles render even when a plane has no score
          (per_family[k] is missing) — they show "—" so the grid stays
          symmetric instead of collapsing. */}
      <section className="grid gap-5 grid-cols-1 sm:grid-cols-3">
        {PLANE_TILES.map(({ key, label, family, pip }) => {
          const raw = (brss.per_family as Record<string, number | undefined>)[key]
          const has = typeof raw === "number"
          const planeScore = has ? raw : 0
          return (
            <Section
              key={key}
              className={accentByCategory[family]}
              descriptor={
                has
                  ? `${planeScore >= 75 ? "Healthy" : planeScore >= 50 ? "At risk" : "Weak"} on this plane`
                  : "No resources contribute to this plane"
              }
            >
              <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span className={`inline-block h-2 w-2 rounded-full ${pip}`} />
                {label}
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`${numberClass} ${
                    has ? scoreToneClass(planeScore) : "text-slate-400"
                  }`}
                >
                  {has ? planeScore.toFixed(0) : "—"}
                </span>
                {has && <span className={unitClass}>/100</span>}
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className={`h-1.5 rounded-full ${familyBarClass(family)}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, has ? planeScore : 0))}%`,
                  }}
                />
              </div>
            </Section>
          )
        })}
      </section>
    </div>
  )
}
