"use client"

/**
 * Topology v0.2 — Estate headline strip.
 *
 * Dark navy band, Georgia serif "Estate overview" title, teal kicker, 5 KPI
 * tiles. All values are real reads from the topology-risk endpoint.
 *
 * Honest states:
 * - Posture freshness tile flips amber when not is_fresh; surfaces the
 *   auto_resolves_when clause inline (no hidden tooltip).
 * - Posture coverage tile shows scored/total + by_type breakdown.
 * - Flagged tile lights warn-red when count > 0.
 */

import type { SystemKpis } from "./types"

interface Props {
  systemName: string
  vpcId: string | null
  scoredAt: string
  kpis: SystemKpis
  isStale?: boolean
  fromStaleCache?: boolean
}

function Tile({
  num,
  label,
  sub,
  variant = "neutral",
}: {
  num: React.ReactNode
  label: string
  sub: React.ReactNode
  variant?: "neutral" | "warn" | "amber"
}) {
  const variantClass =
    variant === "warn"
      ? "border-l-4 border-l-rose-400/80"
      : variant === "amber"
      ? "border-l-4 border-l-amber-400/80"
      : "border-l-4 border-l-transparent"
  return (
    <div className={`bg-slate-900/40 border border-slate-700/60 rounded px-4 py-3 ${variantClass}`}>
      <div className="text-2xl font-semibold text-slate-50 leading-none">{num}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300 font-semibold mt-2">
        {label}
      </div>
      <div className="text-[11px] text-slate-400 mt-1 leading-snug">{sub}</div>
    </div>
  )
}

export function HeadlineStrip({
  systemName,
  vpcId,
  scoredAt,
  kpis,
  isStale,
  fromStaleCache,
}: Props) {
  const scored = scoredAt ? new Date(scoredAt) : null
  const scoredIso = scored ? scored.toISOString().replace(/\.\d+Z$/, "Z") : "—"

  const typeBreakdown = Object.entries(kpis.workloads_by_type)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${t} ${v}`)
    .join(" · ")

  const coverage = kpis.posture_coverage
  const coveragePct = coverage.total > 0
    ? Math.round((coverage.scored / coverage.total) * 100)
    : 0
  const coverageByType = Object.entries(coverage.by_type)
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, v]) => `${t} ${v.scored}/${v.total}`)
    .join(" · ")

  const freshness = kpis.posture_freshness
  const freshnessNum = freshness.age_days !== null ? `${freshness.age_days}d` : "—"

  return (
    <header
      className="border-b-2 border-teal-400 px-9 pt-6 pb-7"
      style={{ background: "#0D1B2A" }}
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-teal-400">
            Estate · Topology v0.2 · {systemName}
          </div>
          <div
            className="text-[22px] text-white mt-1"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Estate overview
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-300 flex flex-col gap-1">
          {vpcId && <div>VPC · {vpcId}</div>}
          <div>scored {scoredIso}</div>
          {isStale && (
            <div className="text-amber-300">cached locally</div>
          )}
          {fromStaleCache && (
            <div className="text-amber-300">backend timeout — serving stale</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile
          num={kpis.workloads_total}
          label="Workloads"
          sub={typeBreakdown || "—"}
        />
        <Tile
          num={kpis.flagged_count}
          label="Flagged"
          sub="posture_verdict_priority ≤ 3 (worst tier)"
          variant={kpis.flagged_count > 0 ? "warn" : "neutral"}
        />
        <Tile
          num={kpis.stale_workloads_count}
          label="Stale workloads"
          sub="aws_exists = false"
          variant={kpis.stale_workloads_count > 0 ? "amber" : "neutral"}
        />
        <Tile
          num={
            <>
              {coverage.scored}
              <span className="text-base text-slate-400"> / {coverage.total}</span>
            </>
          }
          label="Posture coverage"
          sub={
            <>
              {coveragePct}% scored
              {coverageByType && <span className="block text-[10px] mt-1">{coverageByType}</span>}
            </>
          }
          variant={coverage.scored < coverage.total ? "warn" : "neutral"}
        />
        <Tile
          num={freshnessNum}
          label="Posture freshness"
          sub={
            freshness.is_fresh
              ? `threshold ${freshness.threshold_days}d`
              : freshness.auto_resolves_when
          }
          variant={freshness.is_fresh ? "neutral" : "amber"}
        />
      </div>
    </header>
  )
}
