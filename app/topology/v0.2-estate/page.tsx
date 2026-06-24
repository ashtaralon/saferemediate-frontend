"use client"

/**
 * Topology v0.2 — Estate view (live data).
 *
 * Replaces the static design mockup at public/design/topology-v0.2-estate.html
 * (which violates CLAUDE.md rule #1 by shipping hardcoded values to prod).
 *
 * Phase 4 (THIS file): minimal page — system_kpis tiles + nodes table.
 * Phase 5 ports the full 94KB mockup design (headline strip, risk chips,
 * Next-worst rail, detail panel) into React components.
 *
 * Contract: docs/topology-v0.2-risk-contract.md
 */

import { useSearchParams } from "next/navigation"
import { Suspense, useMemo } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"

interface PostureFreshness {
  most_recent_run: string | null
  age_days: number | null
  threshold_days: number
  is_fresh: boolean
  auto_resolves_when: string
}

interface PostureCoverage {
  scored: number
  total: number
  by_type: Record<string, { scored: number; total: number }>
}

interface SystemKpis {
  workloads_total: number
  workloads_by_type: Record<string, number>
  flagged_count: number
  stale_workloads_count: number
  posture_coverage: PostureCoverage
  posture_freshness: PostureFreshness
}

interface Contributor {
  signal: string
  weight: number
  value: number
  evidence: Record<string, unknown>
  freshness: {
    source: string
    as_of: string | null
    age_days?: number | null
    is_fresh: boolean
    threshold_days?: number
  }
  warnings?: Array<{ code: string; message: string; auto_resolves_when: string }>
}

interface NodeScore {
  value: number
  tier: "WORST" | "HIGH" | "ELEVATED" | "QUIET"
  rank: number | null
  confidence: {
    value: number
    tier: "FULL" | "DEGRADED" | "LOW"
    reasons: Array<{
      signal: string
      is_fresh: boolean
      age_days: number | null
      threshold_days: number
      auto_resolves_when: string
    }>
  }
  contributors: Contributor[]
}

interface TopologyNode {
  id: string
  name: string
  type: string | null
  subnet_id: string | null
  score: NodeScore | null
  stale: { since: string | null; reason: string } | null
  is_jewel: boolean
}

interface TopologyRiskResponse {
  system: string
  scored_at: string
  scoring_window_days: number
  vpc_id: string | null
  system_kpis: SystemKpis | null
  nodes: TopologyNode[]
  error?: string
  fromStaleCache?: boolean
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    WORST: "bg-red-900/40 text-red-200 border-red-700/50",
    HIGH: "bg-orange-900/40 text-orange-200 border-orange-700/50",
    ELEVATED: "bg-amber-900/40 text-amber-200 border-amber-700/50",
    QUIET: "bg-slate-700/40 text-slate-300 border-slate-600/50",
    FULL: "bg-emerald-900/40 text-emerald-200 border-emerald-700/50",
    DEGRADED: "bg-amber-900/40 text-amber-200 border-amber-700/50",
    LOW: "bg-red-900/40 text-red-200 border-red-700/50",
  }
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${colors[tier] || "bg-slate-700/40 text-slate-300 border-slate-600/50"}`}>
      {tier}
    </span>
  )
}

function KpiTile({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-3xl font-bold text-slate-100 mt-1">{value}</div>
      {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
  )
}

function PostureCoverageTile({ coverage }: { coverage: PostureCoverage }) {
  const pct = coverage.total > 0 ? Math.round((coverage.scored / coverage.total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Posture coverage</div>
      <div className="text-3xl font-bold text-slate-100 mt-1">
        {coverage.scored}<span className="text-lg text-slate-400"> / {coverage.total}</span>
      </div>
      <div className="text-xs text-slate-400 mt-1">{pct}% scored</div>
      <div className="mt-3 space-y-1">
        {Object.entries(coverage.by_type)
          .filter(([, v]) => v.total > 0)
          .map(([type, v]) => (
            <div key={type} className="flex justify-between text-xs">
              <span className="text-slate-400">{type}</span>
              <span className="text-slate-200 font-mono">
                {v.scored}/{v.total}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

function PostureFreshnessTile({ freshness }: { freshness: PostureFreshness }) {
  return (
    <div className={`rounded-lg border p-4 ${freshness.is_fresh
      ? "border-emerald-700/50 bg-emerald-900/10"
      : "border-amber-700/50 bg-amber-900/10"}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Posture freshness</div>
      <div className="text-3xl font-bold text-slate-100 mt-1">
        {freshness.age_days !== null ? `${freshness.age_days}d` : "—"}
      </div>
      <div className="text-xs text-slate-400 mt-1">
        threshold {freshness.threshold_days}d
      </div>
      {!freshness.is_fresh && (
        <div className="text-[11px] text-amber-300/80 mt-2 leading-snug">
          {freshness.auto_resolves_when}
        </div>
      )}
    </div>
  )
}

function NodeRow({ node }: { node: TopologyNode }) {
  if (node.stale) {
    return (
      <tr className="border-b border-slate-800 opacity-50">
        <td className="px-3 py-2 text-xs font-mono text-slate-400">{node.id}</td>
        <td className="px-3 py-2 text-xs text-slate-300">{node.name}</td>
        <td className="px-3 py-2 text-xs text-slate-400">{node.type}</td>
        <td className="px-3 py-2 text-xs">
          <span className="text-slate-500">STALE</span>
        </td>
        <td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>
          {node.stale.reason}
        </td>
      </tr>
    )
  }
  if (!node.score) return null
  return (
    <tr className="border-b border-slate-800 hover:bg-slate-900/50">
      <td className="px-3 py-2 text-xs font-mono text-slate-400">{node.id}</td>
      <td className="px-3 py-2 text-xs text-slate-200">{node.name}</td>
      <td className="px-3 py-2 text-xs text-slate-300">{node.type}</td>
      <td className="px-3 py-2 text-xs">
        <span className="font-bold text-slate-100">{node.score.value}</span>
        <span className="ml-2"><TierBadge tier={node.score.tier} /></span>
      </td>
      <td className="px-3 py-2 text-xs">
        <span className="text-slate-300 mr-2">{Math.round(node.score.confidence.value * 100)}%</span>
        <TierBadge tier={node.score.confidence.tier} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">
        {node.score.contributors
          .filter((c) => c.value > 0)
          .map((c) => `${c.signal.replace(/_/g, " ")} ${Math.round(c.value * 100)}%`)
          .join(" · ")}
      </td>
    </tr>
  )
}

function EstateView() {
  const params = useSearchParams()
  const systemName = params.get("systemName") || "alon-prod"
  const url = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  const { data, loading, error, isStale, cachedAt } = useCachedFetch<TopologyRiskResponse>(url, {
    cacheKey: `topology-risk:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const nodes = useMemo(() => {
    if (!data?.nodes) return []
    // Scored first, sorted by rank; stale last.
    const scored = data.nodes.filter((n) => n.score).sort((a, b) =>
      (a.score!.rank ?? 999) - (b.score!.rank ?? 999)
    )
    const stale = data.nodes.filter((n) => n.stale)
    return [...scored, ...stale]
  }, [data])

  if (loading) {
    return <div className="p-8 text-slate-400">Loading topology risk for {systemName}…</div>
  }
  if (error && !data) {
    return (
      <div className="p-8">
        <div className="text-rose-400 font-semibold">Topology risk unavailable</div>
        <div className="text-xs text-slate-400 mt-2">{error}</div>
      </div>
    )
  }
  if (!data || !data.system_kpis) {
    return <div className="p-8 text-slate-400">No system_kpis data returned for {systemName}.</div>
  }

  const k = data.system_kpis
  const scoredAt = data.scored_at ? new Date(data.scored_at) : null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <div className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">
            Topology v0.2 · Estate
          </div>
          <h1 className="text-3xl font-bold mt-1">{data.system}</h1>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-3">
            <span>{data.vpc_id ?? "—"}</span>
            <span>·</span>
            <span>scored {scoredAt ? scoredAt.toISOString().replace(/\.\d+Z$/, "Z") : "—"}</span>
            {isStale && (
              <>
                <span>·</span>
                <span className="text-amber-300">
                  cached
                  {cachedAt ? ` ${Math.round((Date.now() - cachedAt) / 60_000)}m ago` : ""}
                </span>
              </>
            )}
            {data.fromStaleCache && (
              <>
                <span>·</span>
                <span className="text-amber-300">backend timeout — serving stale</span>
              </>
            )}
          </div>
        </header>

        {/* System KPIs strip — Phase 4 minimal render */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
          <KpiTile label="Workloads" value={k.workloads_total} subtext={Object.entries(k.workloads_by_type)
            .filter(([, v]) => v > 0)
            .map(([t, v]) => `${t}:${v}`)
            .join(" · ")} />
          <KpiTile label="Flagged" value={k.flagged_count} subtext="posture priority ≤ 3" />
          <KpiTile label="Stale" value={k.stale_workloads_count} subtext="aws_exists=false" />
          <PostureCoverageTile coverage={k.posture_coverage} />
          <PostureFreshnessTile freshness={k.posture_freshness} />
        </div>

        {/* Nodes table — Phase 4 minimal render */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-700 bg-slate-900/50">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Workloads · {nodes.length}
            </div>
          </div>
          <table className="w-full">
            <thead className="bg-slate-900/30 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">ID</th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Score</th>
                <th className="px-3 py-2 text-left font-semibold">Confidence</th>
                <th className="px-3 py-2 text-left font-semibold">Contributors</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <NodeRow key={n.id} node={n} />
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 text-[11px] text-slate-500">
          Phase 4 minimal render. Phase 5 ports the full mockup design
          (headline strip · risk chips · Next-worst rail · detail panel).
          Contract: docs/topology-v0.2-risk-contract.md.
        </footer>
      </div>
    </div>
  )
}

export default function TopologyV02EstatePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
      <EstateView />
    </Suspense>
  )
}
