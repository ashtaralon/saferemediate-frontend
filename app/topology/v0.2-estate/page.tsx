"use client"

/**
 * Topology v0.2 — Estate view (live data).
 *
 * All values come from /api/proxy/topology-risk/{system} per contract
 * docs/topology-v0.2-risk-contract.md. The canvas renders the AWS canonical
 * architecture frame (Cloud > Region > VPC > AZ × tier) as visual scaffold;
 * Neo4j-confirmed workloads + edge services are placed into the right cells,
 * empty cells stay drawn with honest "no <kind> observed" copy.
 *
 * Layout: HeadlineStrip (KPIs) + AwsFrame (canonical map) +
 *         FilterRail (client-side filters) + DetailPanel (slide-in on click).
 */

import { Suspense, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { HeadlineStrip } from "@/components/topology-v0-2/headline-strip"
import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
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
      <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#1A2330" }}>
        <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#00C2A8" }}>
          Topology v0.2 · Estate
        </div>
        <div>Loading topology risk for {systemName}…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#1A2330" }}>
        <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#00C2A8" }}>
          Topology v0.2 · Estate
        </div>
        <div className="font-semibold" style={{ color: "#E04545" }}>Topology risk unavailable</div>
        <div className="text-xs mt-2" style={{ color: "#5A6B7A" }}>{error}</div>
        <button
          type="button"
          className="mt-4 px-4 py-2 text-xs uppercase tracking-wider border rounded hover:bg-white"
          style={{ borderColor: "#5A6B7A" }}
          onClick={retry}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data || !data.system_kpis) {
    return (
      <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#1A2330" }}>
        <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#00C2A8" }}>
          Topology v0.2 · Estate
        </div>
        <div>
          No system_kpis returned for <span className="font-mono">{systemName}</span>.
        </div>
        <div className="text-xs mt-2" style={{ color: "#5A6B7A" }}>
          The endpoint responded but the rollup is empty.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: "#F4F6F8", color: "#1A2330" }}>
      <HeadlineStrip
        systemName={data.system}
        vpcId={data.vpc_id}
        scoredAt={data.scored_at}
        kpis={data.system_kpis}
        isStale={isStale && !!cachedAt}
        fromStaleCache={data.fromStaleCache}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 p-6 max-w-[1840px] mx-auto">
        <main>
          {data.vpc_topology ? (
            <AwsFrame
              vpcTopology={data.vpc_topology}
              nodes={filteredNodes}
              selectedNodeId={selectedNodeId}
              onSelect={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
            />
          ) : (
            <CanvasPane
              vpcId={data.vpc_id}
              nodes={filteredNodes}
              selectedNodeId={selectedNodeId}
              onSelect={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
            />
          )}
        </main>

        <FilterRail
          kpis={data.system_kpis}
          nodes={data.nodes}
          filters={effectiveFilters}
          onChange={setFilters}
        />
      </div>

      <footer className="px-6 pb-8 max-w-[1840px] mx-auto text-[10px] leading-relaxed" style={{ color: "#5A6B7A" }}>
        Every value on this page is a live read from{" "}
        <span className="font-mono">/api/topology-risk/{data.system}</span> per{" "}
        contract <span className="font-mono">docs/topology-v0.2-risk-contract.md</span>.
        The canonical AWS frame is structural — service icons appear only when Neo4j confirms the
        resource. Empty cells are honest, not fabricated.
      </footer>

      <DetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
    </div>
  )
}

export default function TopologyV02EstatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8" style={{ background: "#F4F6F8", color: "#5A6B7A" }}>Loading…</div>
      }
    >
      <EstateView />
    </Suspense>
  )
}
