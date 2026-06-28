"use client"

/**
 * Topology v0.2 — Estate view, reusable + system-scoped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"
import { clearCachedFetch, useCachedFetch } from "@/lib/use-cached-fetch"
import { HeadlineStrip } from "@/components/topology-v0-2/headline-strip"
import { AwsFrame, dedupeLambdaServiceTwins, listTopologyAzs } from "@/components/topology-v0-2/aws-frame"
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
import type {
  DecisionRoutingSummary,
  FindingsSeveritySummary,
} from "@/components/topology-v0-2/estate-enrichment"
import type { CrownJewelSummary, IdentityAttackPath, IdentityAttackPathsResponse } from "@/components/identity-attack-paths/types"
import type { TopologyRiskResponse } from "@/components/topology-v0-2/types"
import { createMap } from "@/components/topology-v0-2/native-map"
import {
  buildTopologyNodeIdIndex,
  buildVisibleCanvasIds,
  attackPathEdgesToTrafficEdges,
  selectEstateFlowEdges,
  type EstateFlowMode,
} from "@/components/topology-v0-2/estate-flow-edges"

const VPC_STORAGE_PREFIX = "topology-vpc:"
const AZ_STORAGE_PREFIX = "topology-hidden-az:"

function azStorageKey(systemName: string, vpcKey: string): string {
  return `${AZ_STORAGE_PREFIX}${systemName}:${vpcKey}`
}

function loadHiddenAzs(systemName: string, vpcKey: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(azStorageKey(systemName, vpcKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

const EstateSystemView = dynamic(
  () => import("./estate-system-view").then(m => ({ default: m.EstateSystemView })),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm" style={{ color: "#5A6B7A" }}>Loading inventory…</div>
    ),
  },
)

export interface EstateMapViewProps {
  systemName: string
  embedded?: boolean
  /** Switch Topology tab to Traffic map (TFM graph). */
  onOpenTrafficMap?: () => void
}

const EDGE_SERVICE_TYPES = new Set(["S3", "DynamoDB", "RDS", "KMSKey", "Secret"])

/** Mirrors aws-frame populatedAzs — true when subnets exist but no workload lands in the grid. */
function topologyGridWouldBeEmpty(data: TopologyRiskResponse): boolean {
  const subnets = data.vpc_topology?.subnets ?? []
  if (subnets.length === 0) return false
  const subnetById = createMap(subnets.map((s) => [s.id, s]))
  for (const n of data.nodes ?? []) {
    if (n.stale) {
      const sub = n.subnet_id ? subnetById.get(n.subnet_id) : undefined
      if (sub?.az) return false
      continue
    }
    if (n.type && EDGE_SERVICE_TYPES.has(n.type)) continue
    const sub = n.subnet_id ? subnetById.get(n.subnet_id) : undefined
    if (sub?.az) return false
  }
  return true
}

export function EstateMapView({ systemName, embedded = false, onOpenTrafficMap }: EstateMapViewProps) {
  const [selectedVpcId, setSelectedVpcId] = useState<string | "all">(() => {
    if (typeof window === "undefined") return "all"
    return window.localStorage.getItem(`${VPC_STORAGE_PREFIX}${systemName}`) ?? "all"
  })

  const scopedVpc = selectedVpcId === "all" ? null : selectedVpcId
  const azScopeKey = scopedVpc ?? "all"
  const [hiddenAzs, setHiddenAzs] = useState<string[]>([])
  const cacheKey = scopedVpc
    ? `topology-risk:${systemName}:v5:${scopedVpc}`
    : `topology-risk:${systemName}:v5:all`
  const url = scopedVpc
    ? `/api/proxy/topology-risk/${encodeURIComponent(systemName)}?vpc_id=${encodeURIComponent(scopedVpc)}`
    : `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  const { data, loading, error, isStale, cachedAt, retry } = useCachedFetch<TopologyRiskResponse>(url, {
    cacheKey,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  // Full unscoped node list — always fetched so serverless/regional tiers and
  // merged ("All VPCs") grid use the same superset. Scoped VPC picker still
  // uses scoped primary fetch for the subnet grid frame.
  const [fullSystemNodes, setFullSystemNodes] = useState<
    TopologyRiskResponse["nodes"] | null
  >(null)

  useEffect(() => {
    let cancelled = false
    const mergedUrl = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
    fetch(mergedUrl, { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then((body: TopologyRiskResponse | null) => {
        if (!cancelled && body?.nodes) setFullSystemNodes(body.nodes)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [systemName])

  const serverlessSourceNodes = useMemo(() => {
    const raw = fullSystemNodes ?? data?.nodes ?? []
    return dedupeLambdaServiceTwins(raw)
  }, [fullSystemNodes, data?.nodes])
  const regionalDataSourceNodes = serverlessSourceNodes

  const gridSourceNodes = useMemo(() => {
    if (scopedVpc) return data?.nodes ?? []
    return fullSystemNodes ?? data?.nodes ?? []
  }, [scopedVpc, data?.nodes, fullSystemNodes])

  const availableAzs = useMemo(() => {
    const subnets = data?.vpc_topology?.subnets ?? []
    if (subnets.length === 0) return []
    return listTopologyAzs(subnets, scopedVpc)
  }, [data?.vpc_topology?.subnets, scopedVpc])

  useEffect(() => {
    setHiddenAzs(loadHiddenAzs(systemName, azScopeKey))
  }, [systemName, azScopeKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(azStorageKey(systemName, azScopeKey), JSON.stringify(hiddenAzs))
  }, [hiddenAzs, systemName, azScopeKey])

  useEffect(() => {
    if (availableAzs.length === 0) return
    setHiddenAzs(prev => {
      const next = prev.filter(az => availableAzs.includes(az))
      return next.length === prev.length ? prev : next
    })
  }, [availableAzs])

  const toggleAzVisibility = useCallback((az: string) => {
    setHiddenAzs(prev => {
      if (prev.includes(az)) return prev.filter(x => x !== az)
      const next = [...prev, az]
      if (next.length >= availableAzs.length) return prev
      return next
    })
  }, [availableAzs.length])

  const [flowMode, setFlowMode] = useState<EstateFlowMode>("all_access")

  const depMapUrl = `/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}&maxNodes=500`
  const { data: depMapData } = useCachedFetch<{
    edges?: Array<{ source: string; target: string; type: string; port?: string | null; protocol?: string | null; last_seen?: string | null }>
    nodes?: Array<{ id: string; name?: string; type?: string; properties?: Record<string, unknown> }>
  }>(depMapUrl, {
    cacheKey: `estate-dep-map:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const poisonRetryRef = useRef(false)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${VPC_STORAGE_PREFIX}${systemName}`, selectedVpcId)
    }
  }, [selectedVpcId, systemName])

  // First visit: default to primary VPC when the system spans multiple VPCs.
  useEffect(() => {
    if (!data?.available_vpcs?.length) return
    const key = `${VPC_STORAGE_PREFIX}${systemName}`
    if (typeof window !== "undefined" && window.localStorage.getItem(key) != null) return
    const primary = data.vpc_id ?? data.available_vpcs[0]?.vpc_id
    if (primary) setSelectedVpcId(primary)
  }, [data?.available_vpcs, data?.vpc_id, systemName])
  useEffect(() => {
    if (!data || loading || poisonRetryRef.current) return
    if (!topologyGridWouldBeEmpty(data)) return
    if (!isStale && !data.fromStaleCache && !cachedAt) return
    poisonRetryRef.current = true
    clearCachedFetch(cacheKey)
    clearCachedFetch(`topology-risk:${systemName}:v2`)
    clearCachedFetch(`topology-risk:${systemName}`)
    retry()
  }, [data, loading, isStale, cachedAt, retry, cacheKey, systemName])

  const [filters, setFilters] = useState<EstateFilters | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [highlightedRoleName, setHighlightedRoleName] = useState<string | null>(null)
  const [mapEnlarged, setMapEnlarged] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Default to the visual map; the risk-guided inventory is the secondary tab.
  const [view, setView] = useState<"map" | "inventory">("map")

  const openSubnetMap = useCallback(() => setMapEnlarged(true), [])
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
    () => (gridSourceNodes.length ? applyFilters(gridSourceNodes, effectiveFilters) : []),
    [gridSourceNodes, effectiveFilters],
  )

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    console.log("[estate-map counts]", {
      mode: scopedVpc ? `scoped:${scopedVpc}` : "all-merged",
      dataNodes: data?.nodes?.length ?? 0,
      fullSystemNodes: fullSystemNodes?.length ?? 0,
      gridSourceNodes: gridSourceNodes.length,
      filteredNodes: filteredNodes.length,
      serverlessSource: serverlessSourceNodes.length,
    })
  }, [
    scopedVpc,
    data?.nodes,
    fullSystemNodes,
    gridSourceNodes.length,
    filteredNodes.length,
    serverlessSourceNodes.length,
  ])

  const unscopedNodes = serverlessSourceNodes

  // IAP fetch + derived attackPaths/iapBody MUST be declared before the flow
  // overlay memos below — overlayEdges/attackPathFlowCount reference them in
  // their dependency arrays, and a dep array is evaluated synchronously where
  // it's written (TDZ: "Cannot access 'attackPaths' before initialization").
  const iapUrl = `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`
  const { data: rawIap } = useCachedFetch<unknown>(iapUrl, {
    cacheKey: `estate-iap:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })
  const iapBody = useMemo((): IdentityAttackPathsResponse | null => {
    if (!rawIap) return null
    return (isTrustEnvelope(rawIap) ? rawIap.result : rawIap) as IdentityAttackPathsResponse
  }, [rawIap])
  const iapJewels: CrownJewelSummary[] = useMemo(
    () => iapBody?.crown_jewels ?? [],
    [iapBody],
  )
  const attackPaths: IdentityAttackPath[] = useMemo(
    () => iapBody?.paths ?? [],
    [iapBody],
  )

  const flowOverlayContext = useMemo(() => {
    const vpces = data?.vpc_topology?.edges?.vpces ?? []
    const nodeTypeById = createMap(
      unscopedNodes.map(n => [n.id, n.type] as const),
    )
    const index = buildTopologyNodeIdIndex(unscopedNodes, depMapData?.nodes ?? [])
    const visible = buildVisibleCanvasIds(filteredNodes, unscopedNodes, vpces)
    return { vpces, nodeTypeById, index, visible }
  }, [data?.vpc_topology?.edges?.vpces, unscopedNodes, depMapData?.nodes, filteredNodes])

  const overlayEdges = useMemo(
    () =>
      selectEstateFlowEdges({
        mode: flowMode,
        topologyTrafficEdges: data?.traffic_edges ?? [],
        depMapEdges: depMapData?.edges ?? null,
        attackPaths,
        materializationAvailable: iapBody?.materialization_available === true,
        visible: flowOverlayContext.visible,
        index: flowOverlayContext.index,
        nodeTypeById: flowOverlayContext.nodeTypeById,
        vpces: flowOverlayContext.vpces,
      }),
    [
      flowMode,
      data?.traffic_edges,
      depMapData?.edges,
      attackPaths,
      iapBody?.materialization_available,
      flowOverlayContext,
    ],
  )

  const attackPathFlowCount = useMemo(
    () =>
      attackPathEdgesToTrafficEdges(
        attackPaths,
        flowOverlayContext.visible,
        flowOverlayContext.index,
        flowOverlayContext.nodeTypeById,
        flowOverlayContext.vpces,
        iapBody?.materialization_available === true,
      ).length,
    [attackPaths, flowOverlayContext, iapBody?.materialization_available],
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

  const findingsUrl = `/api/proxy/findings/severity-summary?systemName=${encodeURIComponent(systemName)}&status=open`
  const { data: findingsSummary } = useCachedFetch<FindingsSeveritySummary>(findingsUrl, {
    cacheKey: `estate-findings:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const routingUrl = `/api/proxy/findings/decision-routing?limit=15&system_name=${encodeURIComponent(systemName)}`
  const { data: decisionRouting } = useCachedFetch<DecisionRoutingSummary>(routingUrl, {
    cacheKey: `estate-routing:${systemName}`,
    maxStaleMs: 10 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

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
      mergedVpcView={!scopedVpc}
      hiddenAzs={hiddenAzs}
      serverlessSourceNodes={serverlessSourceNodes}
      regionalDataSourceNodes={regionalDataSourceNodes}
      trafficEdges={data.traffic_edges}
      overlayEdges={overlayEdges}
      flowMode={flowMode}
      onFlowModeChange={setFlowMode}
      attackPathFlowCount={attackPathFlowCount}
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

      {(data.available_vpcs?.length ?? 0) > 0 ? (
        <div
          className="px-4 py-2 border-b flex flex-wrap items-center gap-3 max-w-[1680px] mx-auto w-full"
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
        >
          <label
            htmlFor="topology-vpc-select"
            className="text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: "#5A6B7A" }}
          >
            VPC scope
          </label>
          <select
            id="topology-vpc-select"
            value={selectedVpcId}
            onChange={e => {
              setSelectedNodeId(null)
              setHighlightedRoleName(null)
              setSelectedVpcId(e.target.value)
            }}
            className="text-[12px] font-mono rounded-md border px-2 py-1.5 min-w-[280px] max-w-full"
            style={{ borderColor: "#CBD5E1", color: "#1A2330", background: "#F8FAFC" }}
            data-testid="topology-vpc-select"
          >
            <option value="all">All VPCs (merged)</option>
            {(data.available_vpcs ?? []).map(v => (
              <option key={v.vpc_id} value={v.vpc_id}>
                {v.name} · {v.vpc_id} ({v.workload_count} workloads)
              </option>
            ))}
          </select>
          <span className="text-[11px]" style={{ color: "#5A6B7A" }}>
            {selectedVpcId === "all"
              ? "Merged view — full system node list; primary VPC frame for subnet-linked compute; edge services on the right rail."
              : "Inventory lists every tagged resource; subnet-linked compute appears in tier cells, the rest in Unplaced."}
          </span>
        </div>
      ) : null}

      {availableAzs.length > 0 ? (
        <div
          className="px-4 py-2 border-b flex flex-wrap items-center gap-2 max-w-[1680px] mx-auto w-full"
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
          data-testid="topology-az-scope"
        >
          <span
            className="text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0"
            style={{ color: "#5A6B7A" }}
          >
            Availability zones
          </span>
          {availableAzs.map(az => {
            const hidden = hiddenAzs.includes(az)
            return (
              <button
                key={az}
                type="button"
                aria-pressed={!hidden}
                title={hidden ? `Show ${az} on the map` : `Hide ${az} — remaining AZ columns expand`}
                onClick={() => toggleAzVisibility(az)}
                className="text-[11px] font-mono rounded-md border px-2 py-1 transition-colors"
                style={{
                  borderColor: hidden ? "#CBD5E1" : "#00C2A8",
                  background: hidden ? "#F8FAFC" : "#E6FBF7",
                  color: hidden ? "#94A3B8" : "#0E8B7A",
                  textDecoration: hidden ? "line-through" : "none",
                }}
                data-testid={`topology-az-toggle-${az}`}
              >
                {az}
              </button>
            )
          })}
          {hiddenAzs.length > 0 ? (
            <button
              type="button"
              onClick={() => setHiddenAzs([])}
              className="text-[10px] font-semibold uppercase tracking-wide rounded-md border px-2 py-1"
              style={{ borderColor: "#CBD5E1", color: "#5A6B7A", background: "#FFFFFF" }}
              data-testid="topology-az-show-all"
            >
              Show all AZs
            </button>
          ) : null}
          <span className="text-[11px] w-full sm:w-auto" style={{ color: "#5A6B7A" }}>
            Click an AZ to hide it from the grid — visible columns expand to use the space (one AZ fills the row).
          </span>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 px-4 py-4 max-w-[1680px] mx-auto w-full">
        <main className="min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3" role="tablist" aria-label="Estate view">
            {([
              ["map", "Map"],
              ["inventory", "Inventory"],
            ] as const).map(([id, label]) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(id)}
                  className="inline-flex items-center rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors"
                  style={{
                    borderColor: active ? "#00C2A8" : "#CBD5E1",
                    background: active ? "#E6FBF7" : "#FFFFFF",
                    color: active ? "#0E8B7A" : "#5A6B7A",
                  }}
                  data-testid={`topology-estate-view-${id}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="relative flex-1 min-h-0">
            {view === "map" ? (
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
            ) : null}
            <div
              className="h-full overflow-auto rounded-2xl"
              style={{ maxHeight: embedded ? "min(72vh, 900px)" : "calc(100vh - 200px)" }}
            >
              {view === "map" ? (
                !mapEnlarged ? renderMap(false) : null
              ) : (
                <EstateSystemView
                  data={data}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={id => {
                    setSelectedNodeId(id === selectedNodeId ? null : id)
                    setHighlightedRoleName(null)
                  }}
                  onShowNetwork={openSubnetMap}
                  onOpenTrafficMap={onOpenTrafficMap}
                  iapJewels={iapJewels}
                  findingsSummary={findingsSummary}
                  decisionRouting={decisionRouting}
                />
              )}
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
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "#5A6B7A" }}>
                Network placement · supporting context
              </div>
              <div className="text-sm font-semibold mt-0.5">{data.system}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "#5A6B7A" }}>
                Subnet grid — exit to return to the map view.
              </div>
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
