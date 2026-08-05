"use client"

/**
 * Topology v0.2 — Estate headline strip (narrative + compact provenance).
 */
import type { HeadlineNarrative } from "./headline-narrative"
import type { SystemKpis } from "./types"

interface Props {
  systemName: string
  vpcId: string | null
  narrative: HeadlineNarrative
  kpis: SystemKpis
  isStale?: boolean
  fromStaleCache?: boolean
  fromSnapshot?: boolean
  snapshotAgeSeconds?: number
  scoredAt?: string
  refreshing?: boolean
  statsExpanded?: boolean
  onToggleStats?: () => void
}

export function formatEvidenceTimestamp(value?: string): string {
  if (!value) return "Evidence time unavailable"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Evidence time unavailable"
  return `Evidence computed ${parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`
}

function formatSnapshotAge(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Snapshot"
  if (seconds < 60) return `Snapshot ${Math.max(0, Math.round(seconds))}s old`
  if (seconds < 3600) return `Snapshot ${Math.round(seconds / 60)}m old`
  return `Snapshot ${Math.round(seconds / 3600)}h old`
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px]"
      style={{ background: "#FFFFFF", border: "1px solid #DDE3E8", color: "#5A6B7A" }}
    >
      <span className="uppercase tracking-wider font-semibold">{label}</span>
      <span className="font-mono font-semibold" style={{ color: "#1A2330" }}>{value}</span>
    </span>
  )
}

export function HeadlineStrip({
  systemName,
  vpcId,
  narrative,
  kpis,
  isStale,
  fromStaleCache,
  fromSnapshot,
  snapshotAgeSeconds,
  scoredAt,
  refreshing,
  statsExpanded = false,
  onToggleStats,
}: Props) {
  const coverage = kpis.posture_coverage
  const coveragePct =
    coverage.total > 0 ? Math.round((coverage.scored / coverage.total) * 100) : 0

  return (
    <header
      className="px-6 pt-3 pb-2 border-b-2"
      style={{ background: "#F4F6F8", borderColor: "#00C2A8" }}
    >
      <div className="flex flex-col items-start justify-between gap-4 mb-3 md:flex-row">
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] tracking-[0.18em] uppercase font-semibold"
            style={{ color: "#00C2A8" }}
          >
            Estate · Topology v0.2 · {systemName}
          </div>
          <div
            className="text-[18px] md:text-[20px] mt-2 leading-snug font-medium"
            style={{ color: "#1A2330" }}
          >
            {narrative.title}
          </div>
          <div className="text-[11px] mt-2 leading-relaxed" style={{ color: "#5A6B7A" }}>
            {narrative.provenance}
            {vpcId ? ` · VPC ${vpcId}` : ""}
            {isStale ? " · cached locally" : ""}
            {fromStaleCache ? " · backend timeout — serving stale" : ""}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col items-start gap-2 md:w-auto md:items-end">
          <div className="text-left text-[10px] md:text-right" style={{ color: "#5A6B7A" }}>
            <div>{formatEvidenceTimestamp(scoredAt)}</div>
            <div className="mt-1 flex justify-start gap-1.5 md:justify-end">
              <span
                className="rounded border px-2 py-0.5 font-semibold"
                style={{
                  borderColor: isStale || fromStaleCache ? "#F2B8B5" : "#A7E7DC",
                  background: isStale || fromStaleCache ? "#FFF1F0" : "#E6FBF7",
                  color: isStale || fromStaleCache ? "#B42318" : "#0E8B7A",
                }}
              >
                {fromSnapshot
                  ? formatSnapshotAge(snapshotAgeSeconds)
                  : isStale || fromStaleCache
                    ? "Last-good cache"
                    : "Live graph"}
              </span>
              {refreshing ? (
                <span className="rounded border border-[#DDE3E8] bg-white px-2 py-0.5 font-semibold">
                  Refreshing
                </span>
              ) : null}
            </div>
          </div>
          {onToggleStats ? (
            <button
              type="button"
              onClick={onToggleStats}
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border hover:bg-white"
              style={{ borderColor: "#CBD5E1", color: "#5A6B7A" }}
            >
              {statsExpanded ? "Hide stats" : "System stats"}
            </button>
          ) : null}
        </div>
      </div>

      {statsExpanded ? (
        <div className="flex flex-wrap gap-2">
          <StatPill label="Workloads" value={kpis.workloads_total} />
          <StatPill label="Flagged" value={kpis.flagged_count} />
          <StatPill label="Stale" value={kpis.stale_workloads_count} />
          <StatPill label="Coverage" value={`${coverage.scored}/${coverage.total} (${coveragePct}%)`} />
          <StatPill
            label="Freshness"
            value={kpis.posture_freshness.age_days != null ? `${kpis.posture_freshness.age_days}d` : "—"}
          />
        </div>
      ) : null}
    </header>
  )
}
