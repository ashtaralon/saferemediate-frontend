"use client"

import Link from "next/link"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { StaleIndicator } from "@/components/dashboard/v3/card-shell"

/**
 * Dense systems table — the centerpiece of the operator-dense home.
 *
 * Replaces the V3 home's "Top 5 systems by blast radius" card-grid
 * pattern with a full Wiz-style table: every system, sortable, with
 * per-family bars rendered as mini-charts in cells. Per the design
 * conversation, this is what an operator scanning at 9am Tuesday
 * actually wants — not 13 cards.
 *
 * Real data only — no mock rows, no fabricated bars. If a system has
 * no `layers` from /api/service-risk-scores, the bar cells render
 * "—" instead of inventing a value.
 *
 * Data sources:
 *   /api/proxy/systems/with-families — systems + privilege/network/data
 *                                       layer scores (resource-weighted)
 *
 * Stale-while-revalidate via useCachedFetch. 5-min freshness for
 * action cards is too aggressive here — the systems table is posture,
 * not action. Falls back to default 24h staleness.
 */

type Layer = { name: string; score: number; resource_count: number }

type System = {
  name?: string
  SystemName?: string
  displayName?: string
  environment?: string
  criticality?: string
  resourceCount?: number
  resource_count?: number
  health_score?: number
  healthScore?: number
  critical_count?: number
  criticalIssues?: number
  high_count?: number
  highIssues?: number
  medium_count?: number
  mediumIssues?: number
  low_count?: number
  lowIssues?: number
  totalFindings?: number
  lastScan?: string
  lastScanAt?: string | null
  layers?: Record<string, Layer> | null
}

type Response = {
  systems?: System[]
  total?: number
  errors?: string[]
}

const STALE_DAYS = 7

function daysSinceISO(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24))
}

function isStale(iso: string | null | undefined): boolean {
  // Per memory feedback_safety_language.md: never-scanned ≠ healthy.
  // Treat null as stale-by-default.
  if (!iso) return true
  const d = daysSinceISO(iso)
  return d === null || d >= STALE_DAYS
}

function severityChipClass(count: number, severity: "critical" | "high" | "medium" | "low") {
  if (!count) return "text-slate-400"
  return {
    critical: "text-rose-700 bg-rose-50 border-rose-200",
    high: "text-amber-700 bg-amber-50 border-amber-200",
    medium: "text-blue-700 bg-blue-50 border-blue-200",
    low: "text-slate-700 bg-slate-50 border-slate-200",
  }[severity]
}

function familyBarClass(score: number) {
  if (score >= 80) return "bg-emerald-500"
  if (score >= 60) return "bg-amber-400"
  if (score >= 40) return "bg-orange-400"
  return "bg-rose-500"
}

function FamilyBar({ score }: { score: number | null | undefined }) {
  // No fabrication — if backend didn't return a layer score, render "—".
  if (typeof score !== "number") {
    return <span className="text-xs text-slate-300">—</span>
  }
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${familyBarClass(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-slate-600">
        {Math.round(pct)}
      </span>
    </div>
  )
}

function CriticalityBadge({ value }: { value?: string }) {
  if (!value) return null
  const cls = (() => {
    const v = value.toUpperCase()
    if (v.includes("MISSION")) return "bg-rose-100 text-rose-800 border-rose-200"
    if (v.includes("BUSINESS")) return "bg-orange-100 text-orange-800 border-orange-200"
    if (v.includes("IMPORTANT")) return "bg-amber-100 text-amber-800 border-amber-200"
    return "bg-slate-100 text-slate-700 border-slate-200"
  })()
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {value}
    </span>
  )
}

export function DenseSystemsTable() {
  const { data, loading, error, retry, isStale: cacheStale, cachedAt } = useCachedFetch<Response>(
    "/api/proxy/systems/with-families",
    {
      cacheKey: "dense-systems-with-families",
      fetchInit: { cache: "no-store" },
    },
  )

  if (loading && !data) {
    return (
      <div className="rounded-[14px] border border-slate-200 bg-white p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-50" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-[14px] border border-rose-200 bg-rose-50/50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Systems</div>
        <div className="mt-2 text-sm text-rose-700">{error}</div>
        <button
          onClick={retry}
          className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          Retry
        </button>
      </div>
    )
  }

  const systems = (data?.systems ?? []).slice()

  // Sort by total open findings desc — the operator's first scan target.
  // Resource count breaks ties so larger systems surface first.
  systems.sort((a, b) => {
    const af = (a.critical_count ?? a.criticalIssues ?? 0) * 1000 + (a.high_count ?? a.highIssues ?? 0)
    const bf = (b.critical_count ?? b.criticalIssues ?? 0) * 1000 + (b.high_count ?? b.highIssues ?? 0)
    if (af !== bf) return bf - af
    return (b.resource_count ?? b.resourceCount ?? 0) - (a.resource_count ?? a.resourceCount ?? 0)
  })

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Systems
          </div>
          <div className="text-sm text-slate-600">
            {systems.length} systems · sorted by open findings (critical + high)
          </div>
        </div>
        <StaleIndicator cachedAt={cachedAt} isStale={cacheStale} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">System</th>
              <th className="px-3 py-2.5 font-semibold">Env</th>
              <th className="px-3 py-2.5 text-right font-semibold">Resources</th>
              <th className="px-3 py-2.5 text-right font-semibold">Critical</th>
              <th className="px-3 py-2.5 text-right font-semibold">High</th>
              <th className="px-3 py-2.5 font-semibold">Permissions</th>
              <th className="px-3 py-2.5 font-semibold">Network</th>
              <th className="px-3 py-2.5 font-semibold">Data</th>
              <th className="px-3 py-2.5 text-right font-semibold">Last scan</th>
            </tr>
          </thead>
          <tbody>
            {systems.map((s) => {
              const name = s.SystemName ?? s.name ?? "—"
              const stale = isStale(s.lastScanAt)
              const lastScanLabel = s.lastScan ?? "—"
              const critical = s.critical_count ?? s.criticalIssues ?? 0
              const high = s.high_count ?? s.highIssues ?? 0
              const resources = s.resource_count ?? s.resourceCount ?? 0
              const layers = s.layers ?? {}
              return (
                <tr
                  key={name}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/?system=${encodeURIComponent(name)}`}
                      className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <CriticalityBadge value={s.criticality} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 tabular-nums">
                    {resources}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${severityChipClass(critical, "critical")}`}
                    >
                      {critical || "0"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${severityChipClass(high, "high")}`}
                    >
                      {high || "0"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <FamilyBar score={layers.privilege?.score} />
                  </td>
                  <td className="px-3 py-2.5">
                    <FamilyBar score={layers.network?.score} />
                  </td>
                  <td className="px-3 py-2.5">
                    <FamilyBar score={layers.data?.score} />
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-xs tabular-nums"
                    title={
                      stale
                        ? `Stale: ${daysSinceISO(s.lastScanAt) ?? "?"} days old. Re-ingest to refresh.`
                        : undefined
                    }
                  >
                    <span className={stale ? "text-rose-600" : "text-slate-500"}>
                      {lastScanLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
            {systems.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                  No systems found. Run the collector to populate the graph.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.errors && data.errors.length > 0 && (
        <div className="border-t border-slate-100 bg-amber-50/40 px-5 py-2 text-xs text-amber-700">
          {data.errors.length} system(s) failed to load family scores —{" "}
          {data.errors.slice(0, 2).join(" · ")}
          {data.errors.length > 2 ? ` (+${data.errors.length - 2} more)` : ""}
        </div>
      )}
    </div>
  )
}
