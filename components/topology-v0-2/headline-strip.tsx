"use client"

/**
 * Topology v0.2 — Estate headline strip (light theme).
 *
 * Light editorial header matching design/topology-v0.2-estate.html:
 *   - Teal kicker "Estate · Topology v0.2 · <system>"
 *   - Georgia serif "Estate overview" title
 *   - 5 KPI tiles with severity-aware left-border accents
 *
 * All values are real reads from the topology-risk endpoint. Honest states:
 *   - Posture freshness tile gets an amber accent when not is_fresh and
 *     surfaces the auto_resolves_when clause inline.
 *   - Posture coverage tile shows scored/total + by_type breakdown.
 *   - Flagged tile lights warn-red when count > 0.
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
  const accent =
    variant === "warn"
      ? "#E04545"
      : variant === "amber"
      ? "#F5A623"
      : "transparent"
  return (
    <div
      className="rounded px-4 py-3"
      style={{
        background: "white",
        border: "1px solid #DDE3E8",
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div className="text-3xl font-semibold leading-none" style={{ color: "#1A2330" }}>
        {num}
      </div>
      <div
        className="text-[10px] uppercase tracking-[0.18em] font-semibold mt-2"
        style={{ color: "#5A6B7A" }}
      >
        {label}
      </div>
      <div className="text-[11px] mt-1 leading-snug" style={{ color: "#5A6B7A" }}>
        {sub}
      </div>
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
      className="px-9 pt-6 pb-7 border-b-2"
      style={{ background: "#F4F6F8", borderColor: "#00C2A8" }}
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <div
            className="text-[11px] tracking-[0.18em] uppercase font-semibold"
            style={{ color: "#00C2A8" }}
          >
            Estate · Topology v0.2 · {systemName}
          </div>
          <div
            className="text-[24px] mt-1"
            style={{ fontFamily: "Georgia, serif", color: "#1A2330" }}
          >
            Estate overview
          </div>
        </div>
        <div className="text-right text-[11px] flex flex-col gap-1" style={{ color: "#5A6B7A" }}>
          {vpcId && <div>VPC · {vpcId}</div>}
          <div>scored {scoredIso}</div>
          {isStale && <div style={{ color: "#F5A623" }}>cached locally</div>}
          {fromStaleCache && (
            <div style={{ color: "#F5A623" }}>backend timeout — serving stale</div>
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
              <span className="text-base" style={{ color: "#5A6B7A" }}> / {coverage.total}</span>
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
