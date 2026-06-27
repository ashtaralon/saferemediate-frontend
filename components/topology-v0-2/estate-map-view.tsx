"use client"

/**
 * Topology v0.2 — Estate view, reusable + system-scoped.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react"
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
import {
  buildHeadlineNarrative,
  buildRankedEntries,
} from "@/components/topology-v0-2/headline-narrative"
import { RankedRail } from "@/components/topology-v0-2/ranked-rail"
import type { TopologyRiskResponse } from "@/components/topology-v0-2/types"

export interface EstateMapViewProps {
  systemName: string
  embedded?: boolean
}

export function EstateMapView({ systemName, embedded = false }: EstateMapViewProps) {
  const url = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  const { data, loading, error, isStale, cachedAt, retry } = useCachedFetch<TopologyRiskResponse>(url, {
    cacheKey: `topology-risk:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const [filters, setFilters] = useState<EstateFilters | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [highlightedRoleName, setHighlightedRoleName] = useState<string | null>(null)
  const [mapEnlarged, setMapEnlarged] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const closeEnlarged = useCallback(() => setMapEnlarged(false), [])

  useEffect(() => {
    if (!mapEnlarged) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEnlarged()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [mapEnlarged, closeEnlarged])

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

  const narrative = useMemo(
    () => (data ? buildHeadlineNarrative(data) : null),
    [data],
  )

  const rankedEntries = useMemo(
    () =>
      buildRankedEntries(
        data?.nodes ?? [],
        data?.vpc_topology?.iam_roles ?? [],
      ),
    [data?.nodes, data?.vpc_topology?.iam_roles],
  )

  const outerClass = embedded ? "w-full" : "min-h-screen"

  if (loading && !data) {
    return (
      <div className={`${outerClass} p-8`} style={{ background: "#F4F6F8", color: "#1A2330" }}>
        <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#00C2A8" }}>
          Topology v0.2 · Estate
        </div>
        <div>Loading topology risk for {systemName}…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={`${outerClass} p-8`} style={{ background: "#F4F6F8", color: "#1A2330" }}>
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

  if (!data || !data.system_kpis || !narrative) {
    return (
      <div className={`${outerClass} p-8`} style={{ background: "#F4F6F8", color: "#1A2330" }}>
        <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#00C2A8" }}>
          Topology v0.2 · Estate
        </div>
        <div>
          No system_kpis returned for <span className="font-mono">{systemName}</span>.
        </div>
      </div>
    )
  }

  const selectedRailId = highlightedRoleName
    ? `iam:${highlightedRoleName}`
    : selectedNodeId

  const renderMap = (presentationMode: boolean) => (data.vpc_topology ? (
    <AwsFrame
      vpcTopology={data.vpc_topology}
      nodes={filteredNodes}
      trafficEdges={data.traffic_edges}
      selectedNodeId={selectedNodeId}
      highlightedRoleName={highlightedRoleName}
      onSelect={id => {
        setSelectedNodeId(id === selectedNodeId ? null : id)
        setHighlightedRoleName(null)
      }}
      presentationMode={presentationMode}
    />
  ) : (
    <CanvasPane
      vpcId={data.vpc_id}
      nodes={filteredNodes}
      selectedNodeId={selectedNodeId}
      onSelect={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
    />
  ))

  const filterDrawer = (
    <div>
      <button
        type="button"
        onClick={() => setFiltersOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "#5A6B7A" }}
      >
        {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Filters
      </button>
      {filtersOpen ? (
        <FilterRail
          kpis={data.system_kpis}
          nodes={data.nodes}
          filters={effectiveFilters}
          onChange={setFilters}
        />
      ) : null}
    </div>
  )

  return (
    <div className={`${outerClass} flex flex-col`} style={{ background: "#F4F6F8", color: "#1A2330" }}>
      <HeadlineStrip
        systemName={data.system}
        vpcId={data.vpc_id}
        narrative={narrative}
        kpis={data.system_kpis}
        isStale={isStale && !!cachedAt}
        fromStaleCache={data.fromStaleCache}
        statsExpanded={statsExpanded}
        onToggleStats={() => setStatsExpanded(v => !v)}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 px-4 py-4 max-w-[1680px] mx-auto w-full">
        <main className="min-w-0 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            <button
              type="button"
              onClick={() => setMapEnlarged(true)}
              className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm hover:bg-white transition-colors"
              style={{ borderColor: "#CBD5E1", background: "#FFFFFF", color: "#1A2330" }}
              aria-label="Open map fullscreen"
              data-testid="topology-estate-map-enlarge"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Map fullscreen
            </button>
            <div
              className="h-full overflow-auto rounded-2xl"
              style={{ maxHeight: embedded ? "min(72vh, 900px)" : "calc(100vh - 200px)" }}
            >
              {!mapEnlarged ? renderMap(false) : null}
            </div>
          </div>
        </main>

        <div
          className="hidden xl:flex flex-col min-h-0 sticky top-4 self-start"
          style={{ maxHeight: embedded ? "min(72vh, 900px)" : "calc(100vh - 200px)" }}
        >
          <RankedRail
            entries={rankedEntries}
            selectedId={selectedRailId}
            onSelectWorkload={id => {
              setSelectedNodeId(id)
              setHighlightedRoleName(null)
            }}
            onSelectRole={name => {
              setHighlightedRoleName(name)
              setSelectedNodeId(null)
            }}
            filtersSlot={filterDrawer}
          />
        </div>
      </div>

      <div className="xl:hidden px-4 pb-4 max-w-[1680px] mx-auto w-full">
        <RankedRail
          entries={rankedEntries}
          selectedId={selectedRailId}
          onSelectWorkload={id => {
            setSelectedNodeId(id)
            setHighlightedRoleName(null)
          }}
          onSelectRole={name => {
            setHighlightedRoleName(name)
            setSelectedNodeId(null)
          }}
          filtersSlot={filterDrawer}
        />
      </div>

      <footer className="px-6 pb-6 max-w-[1680px] mx-auto text-[10px] leading-relaxed" style={{ color: "#5A6B7A" }}>
        Live read from <span className="font-mono">/api/topology-risk/{data.system}</span>.
        Empty cells are honest, not fabricated.
      </footer>

      {!mapEnlarged ? (
        <DetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
      ) : null}

      {mapEnlarged ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "#F4F6F8", color: "#1A2330" }}
          data-testid="topology-estate-map-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="Topology map full screen"
        >
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0"
            style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "#00C2A8" }}>
                Topology v0.2 · Estate
              </div>
              <div className="text-sm font-semibold mt-0.5">{data.system}</div>
            </div>
            <button
              type="button"
              onClick={closeEnlarged}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide hover:bg-[#F4F6F8] transition-colors"
              style={{ borderColor: "#CBD5E1", color: "#1A2330" }}
              aria-label="Exit map fullscreen"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit map
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {renderMap(true)}
          </div>
          {selectedNode ? (
            <div className="fixed inset-0 z-[210] pointer-events-none">
              <div className="pointer-events-auto">
                <DetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
