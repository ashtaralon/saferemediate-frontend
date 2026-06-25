"use client"

/**
 * Topology v0.2 — Estate view (live data).
 *
 * Replaces the static mockup at public/design/topology-v0.2-estate.html
 * (which violated CLAUDE.md rule #1 by shipping hardcoded values to prod).
 *
 * All values come from /api/proxy/topology-risk/{system} per contract
 * docs/topology-v0.2-risk-contract.md. No fabricated decoration: where the
 * contract doesn't carry AZ / tier classification / fake route-tables, this
 * page falls back to subnet grouping (which the contract DOES carry).
 *
 * Layout: HeadlineStrip (KPIs) + CanvasPane (subnet-grouped nodes) +
 *         FilterRail (client-side filters) + DetailPanel (slide-in on click).
 */

import { Suspense, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { HeadlineStrip } from "@/components/topology-v0-2/headline-strip"
import { CanvasPane } from "@/components/topology-v0-2/canvas-pane"
import {
  applyFilters,
  defaultFilters,
  type EstateFilters,
  FilterRail,
} from "@/components/topology-v0-2/filter-rail"
import { DetailPanel } from "@/components/topology-v0-2/detail-panel"
import type { TopologyRiskResponse } from "@/components/topology-v0-2/types"

function EstateView() {
  const params = useSearchParams()
  const systemName = params.get("systemName") || "alon-prod"
  const url = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  const { data, loading, error, isStale, cachedAt, retry } = useCachedFetch<TopologyRiskResponse>(url, {
    cacheKey: `topology-risk:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const [filters, setFilters] = useState<EstateFilters | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const effectiveFilters = useMemo(
    () => filters ?? defaultFilters(data?.system_kpis ?? null),
    [filters, data?.system_kpis],
  )

  const filteredNodes = useMemo(
    () => (data?.nodes ? applyFilters(data.nodes, effectiveFilters) : []),
    [data?.nodes, effectiveFilters],
  )

  const selectedNode = useMemo(
    () => (selectedNodeId ? data?.nodes.find(n => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, data?.nodes],
  )

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 p-8">
        <div className="text-xs uppercase tracking-widest text-teal-400 font-semibold mb-2">
          Topology v0.2 · Estate
        </div>
        <div>Loading topology risk for {systemName}…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="text-xs uppercase tracking-widest text-teal-400 font-semibold mb-2">
          Topology v0.2 · Estate
        </div>
        <div className="text-rose-400 font-semibold">Topology risk unavailable</div>
        <div className="text-xs text-slate-400 mt-2">{error}</div>
        <button
          type="button"
          className="mt-4 px-4 py-2 text-xs uppercase tracking-wider border border-slate-600 hover:bg-slate-800 rounded"
          onClick={retry}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data || !data.system_kpis) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 p-8">
        <div className="text-xs uppercase tracking-widest text-teal-400 font-semibold mb-2">
          Topology v0.2 · Estate
        </div>
        <div>
          No system_kpis returned for <span className="font-mono">{systemName}</span>.
        </div>
        <div className="text-xs text-slate-500 mt-2">
          The endpoint responded but the rollup is empty. This usually means the
          system has no workloads yet or the backend hasn&apos;t collected this
          system. Verify in Neo4j: <code>MATCH (s:System {`{`}name:&apos;{systemName}&apos;{`}`}) RETURN s</code>.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <HeadlineStrip
        systemName={data.system}
        vpcId={data.vpc_id}
        scoredAt={data.scored_at}
        kpis={data.system_kpis}
        isStale={isStale && !!cachedAt}
        fromStaleCache={data.fromStaleCache}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 p-6 max-w-[1680px] mx-auto">
        <main>
          <CanvasPane
            vpcId={data.vpc_id}
            nodes={filteredNodes}
            selectedNodeId={selectedNodeId}
            onSelect={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
          />
        </main>

        <FilterRail
          kpis={data.system_kpis}
          nodes={data.nodes}
          filters={effectiveFilters}
          onChange={setFilters}
        />
      </div>

      <footer className="px-6 pb-8 max-w-[1680px] mx-auto text-[10px] text-slate-500 leading-relaxed">
        Every value on this page is a live read from{" "}
        <span className="font-mono">/api/topology-risk/{data.system}</span> per{" "}
        contract <span className="font-mono">docs/topology-v0.2-risk-contract.md</span>.
        AZ subgrouping and Web/App/Data tier classification (from the mockup at{" "}
        <span className="font-mono">public/design/topology-v0.2-estate.html</span>) are
        omitted because the contract does not carry them — per CLAUDE.md rule #1 we don&apos;t
        fabricate decoration.
      </footer>

      <DetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
    </div>
  )
}

export default function TopologyV02EstatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 p-8">Loading…</div>
      }
    >
      <EstateView />
    </Suspense>
  )
}
