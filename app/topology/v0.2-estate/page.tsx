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

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Maximize2, Minimize2 } from "lucide-react"
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
  const [mapEnlarged, setMapEnlarged] = useState(false)

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

  const mapContent = data.vpc_topology ? (
    <AwsFrame
      vpcTopology={data.vpc_topology}
      nodes={filteredNodes}
      trafficEdges={data.traffic_edges}
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
  )

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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 px-4 py-4 max-w-[1600px] mx-auto">
        <main className="min-w-0 min-h-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMapEnlarged(true)}
              className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm hover:bg-white transition-colors"
              style={{ borderColor: "#CBD5E1", background: "#FFFFFF", color: "#1A2330" }}
              aria-label="Enlarge topology map to full screen"
              data-testid="topology-estate-map-enlarge"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Enlarge
            </button>
            <div
              className="w-full overflow-auto rounded-2xl"
              style={{ maxHeight: "calc(100vh - 220px)" }}
            >
              {!mapEnlarged ? mapContent : null}
            </div>
          </div>
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
              <div className="text-sm font-semibold mt-0.5">
                {data.system}
                {data.vpc_id ? (
                  <span className="font-mono text-xs font-normal ml-2" style={{ color: "#5A6B7A" }}>
                    {data.vpc_id}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={closeEnlarged}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide hover:bg-[#F4F6F8] transition-colors"
              style={{ borderColor: "#CBD5E1", color: "#1A2330" }}
              aria-label="Exit full screen"
              data-testid="topology-estate-map-exit-fullscreen"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-4">
            <FitToViewport>{mapContent}</FitToViewport>
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

/**
 * Scales children to fit the parent container's available width AND height
 * via CSS transform: scale(). Used in the topology fullscreen mode so the
 * entire AwsFrame (Internet + IGW + VPC frame + SG groups + IAM strip +
 * traffic band + legend) is visible at once without scrolling.
 *
 * Why this works with the flow SVG overlay: `getBoundingClientRect` returns
 * the visually-rendered rect, i.e. AFTER all transforms. The flow overlay
 * derives every path coordinate from these rects, so scaling the parent
 * scales the arrows in lockstep and the geometry stays consistent.
 */
function FitToViewport({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [innerSize, setInnerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const compute = () => {
      const wrapper = wrapperRef.current
      const inner = innerRef.current
      if (!wrapper || !inner) return
      const nw = inner.offsetWidth
      const nh = inner.offsetHeight
      if (nw === 0 || nh === 0) return
      const availW = wrapper.clientWidth
      // Use the wrapper's clientHeight if it's a flex child with a real
      // bounded height; otherwise fall back to the viewport.
      const availH = wrapper.clientHeight > 0
        ? wrapper.clientHeight
        : Math.max(420, window.innerHeight - 200)
      const s = Math.min(1, availW / nw, availH / nh)
      setScale(s)
      setInnerSize({ w: nw, h: nh })
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (innerRef.current) ro.observe(innerRef.current)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    window.addEventListener("resize", compute)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", compute)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full flex items-start justify-center"
      style={{ overflow: "hidden" }}
    >
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: innerSize.w > 0 ? innerSize.w : "fit-content",
        }}
      >
        {children}
      </div>
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
