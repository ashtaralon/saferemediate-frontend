"use client"

import { useEffect } from "react"

import { BrssHeldNotice } from "@/components/brss/brss-held-notice"
import {
  isFiniteScore,
  orgHeldSystemDetail,
  orgScoreHold,
  type BrssHold,
  type OrgHeldSystem,
} from "@/lib/brss-held"
import { STALE_BACKEND_RECOVERING, useCachedFetch } from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, NotWiredCard, Section } from "./card-shell"
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
 * Source: /api/proxy/global-org-score
 *   Convergence-aware org aggregate computed by
 *   unified.scoring.global_org_score.compose_global_org_score(). Builds
 *   on top of per-system BRSS — does NOT replace per-resource scoring.
 *   Returns the per-system breakdowns so this card can name worst
 *   systems and weak planes inline (real data, not Phase C).
 *
 * NO FALLBACK SCORE. This card used to fall back to /api/proxy/posture-score
 * (a legacy weighted mean of health_score) whenever the org score was not a
 * number. The backend nulls the org score ON PURPOSE when any system is held
 * (`error: "system_evaluations_held"`): composing over the remaining systems
 * drops exactly the ones whose exposure is unknown. The fallback painted the
 * legacy number in its place. A held or failed org score now renders the
 * typed code, the backend's reason and the held systems by name — no number.
 *
 * Trend: /api/proxy/posture-score/trend reads persisted
 *   BlastRadiusSnapshot history and returns a daily resource-weighted
 *   series. Shown only beside a live score, never in place of one.
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
  partial?: { succeeded: number; failed: number; held?: number; discovered: number }
  error?: string
  error_codes?: string[]
  message?: string
  held_systems?: OrgHeldSystem[]
}

/** Only a real org score may stand as a reading (or be kept in the SWR cache). */
function isOrgScoreReading(raw: unknown): boolean {
  const d = raw as GlobalOrgScore | null
  return !!d && isFiniteScore(d.global_score) && !d.error
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

function ageLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/**
 * Marks ANY reading that did not come from this session's live answer.
 *
 * useCachedFetch paints a localStorage entry younger than maxStaleMs (24h)
 * with `isStale: false` while its live request is still in flight — so the
 * shared StaleIndicator (which keys on isStale) showed a 10-minute-old score
 * as current for the whole proxy budget. `cachedAt` is the reliable signal:
 * it is the cached entry's timestamp for any cache-sourced reading and null
 * once a live answer lands. Local to this card on purpose; the hook's
 * semantics for its other callers are unchanged.
 *
 * "refreshing" is only ever true: with `failClosedOnError` (below) a
 * non-transient failure (4xx/500) discards the cached reading, so the only
 * cache-sourced states left are "request in flight" and "transport failure"
 * (STALE_BACKEND_RECOVERING → "live request failed"). Without it, a 500 left
 * the cached score up marked "refreshing" with nothing refreshing.
 */
function CachedReadingMarker({
  cachedAt,
  staleReason,
}: {
  cachedAt: number | null
  staleReason: string | null
}) {
  if (cachedAt === null) return null
  const when = new Date(cachedAt).toLocaleTimeString()
  const state = staleReason === STALE_BACKEND_RECOVERING ? "live request failed" : "refreshing"
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
      data-testid="org-brss-cached-marker"
      title="Cached reading from an earlier visit — not the live score."
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      as of {when} ({ageLabel(Date.now() - cachedAt)}), {state}
    </span>
  )
}

/**
 * `onHoldChange` reports the org hold (or null) to a parent that renders
 * other numbers beside this card, so they can say they are not the BRSS
 * without a second /global-org-score request.
 */
export function HeroBrssCard({
  onHoldChange,
}: { onHoldChange?: (hold: BrssHold | null) => void } = {}) {
  const {
    data: orgData,
    loading: orgLoading,
    error: orgError,
    cachedAt,
    staleReason,
    retry: orgRetry,
  } = useCachedFetch<GlobalOrgScore>(
    "/api/proxy/global-org-score",
    {
      cacheKey: "global-org-score",
      fetchInit: { cache: "no-store" },
      // A held / failed answer evicts the last good score instead of
      // standing beside it, and is never written as one.
      isCacheable: isOrgScoreReading,
      // An authoritative failure (non-transient status) is not a reason to
      // keep presenting an older score: it discards the cache and the card
      // shows the failure. Transport failures still keep the reading, marked
      // "live request failed".
      failClosedOnError: true,
    },
  )

  // Trend is a secondary fetch — never blocks the hero score from
  // rendering. If the trend endpoint is slow or empty, the card still
  // shows the live score; we just skip the spark. Only requested beside a
  // real org score: persisted history is never shown in place of one, so
  // a held or failed answer does not fetch it at all.
  const { data: trend } = useCachedFetch<PostureTrend>(
    isOrgScoreReading(orgData) ? "/api/proxy/posture-score/trend?days=30" : null,
    { cacheKey: "posture-trend-30d", fetchInit: { cache: "no-store" } }
  )

  const hold = orgScoreHold(orgData)
  useEffect(() => {
    onHoldChange?.(orgScoreHold(orgData))
  }, [orgData, onHoldChange])
  if (hold) {
    const heldSystems = orgData?.held_systems ?? []
    const partial = orgData?.partial
    return (
      <Section
        label="Global blast radius score"
        descriptor="Held — no org score is computed while a system is held"
        className={`${accentByCategory.brss} bg-gradient-to-br from-amber-50/60 via-white to-white`}
      >
        <div data-testid="org-brss-held">
          <p className="text-lg font-semibold text-slate-800">Score held</p>
          <BrssHeldNotice hold={hold} testId="org-brss-held-notice" />
          {partial && typeof partial.held === "number" && typeof partial.discovered === "number" ? (
            <p className={`${descriptorClass} mt-2`} data-testid="org-brss-held-count">
              {partial.held} of {partial.discovered} system{partial.discovered === 1 ? "" : "s"} held
              {typeof partial.failed === "number" && partial.failed > 0
                ? ` · ${partial.failed} failed to evaluate`
                : ""}
            </p>
          ) : null}
          {heldSystems.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs" data-testid="org-brss-held-systems">
              {heldSystems.map((h) => (
                <li key={h.system_name} data-testid={`org-brss-held-system-${h.system_name}`}>
                  <span className="font-medium text-slate-800">{h.system_name}</span>
                  <span className="text-slate-500"> — held · {orgHeldSystemDetail(h)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>
    )
  }

  const score: number | null = isOrgScoreReading(orgData) ? orgData!.global_score : null

  if (score === null && orgLoading) return <LoadingCard label="Global blast radius score" />
  if (score === null) {
    const msg = orgError || orgData?.message || orgData?.error || "Score unavailable"
    return (
      <ErrorCard
        label="Global blast radius score"
        error={msg}
        onRetry={() => orgRetry()}
      />
    )
  }
  const systemCount = orgData!.system_count
  const resourcesAnalyzed = orgData!.resources_analyzed
  const worstSystems = orgData!.worst_systems ?? []
  // Distinct list of weak planes across the worst-3 systems — used
  // for the inline "weak planes" attribution under the score.
  const weakPlanesAcrossWorst: string[] = []
  if (Array.isArray(orgData!.system_breakdowns)) {
    const seen = new Set<string>()
    for (const wsName of worstSystems.slice(0, 3)) {
      const b = orgData!.system_breakdowns.find((x) => x.system_name === wsName)
      for (const plane of b?.weak_planes ?? []) {
        if (!seen.has(plane)) {
          seen.add(plane)
          weakPlanesAcrossWorst.push(plane)
        }
      }
    }
  }

  // Defense-in-depth against backend regressions: a score on zero
  // systems / zero resources is meaningless by construction. The
  // backend was caught returning 100/100 with `0 systems · 0 resources`
  // (api/global_org_score.py used to default to 100 when discovery
  // returned no rows). Per feedback_no_mock_numbers_in_ui.md, never
  // render a fabricated number — surface the empty-corpus reality
  // even if a future backend deploy regresses to a synthetic default.
  if (!systemCount || !resourcesAnalyzed) {
    return (
      <NotWiredCard
        label="Global blast radius score"
        reason={
          orgData?.message ||
          orgData?.error ||
          "No systems or resources discovered in the graph. The score is undefined until at least one system contributes a BRSS computation. Run a collector sync or verify system-tagging has completed."
        }
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
      <div className="flex items-baseline gap-3" data-testid="org-brss-score">
        <span className={`${heroNumberClass} ${scoreToneClass(data.overall_score)}`}>
          {data.overall_score.toFixed(0)}
        </span>
        <span className={unitClass}>/100</span>
        {/* Any cache-sourced reading — fresh-looking or aged, while the
            live request is pending or after it failed on transport — is
            marked with its time. A held answer evicts it (isCacheable). */}
        <CachedReadingMarker cachedAt={cachedAt} staleReason={staleReason} />
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
          data from the org module: weak planes surfaced from the worst-3
          systems' per-family scores, plus the worst system names. */}
      {worstSystems.length > 0 || weakPlanesAcrossWorst.length > 0 ? (
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
      ) : null}
    </Section>
  )
}
