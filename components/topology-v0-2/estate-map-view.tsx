"use client"

/**
 * Topology v0.2 — Estate view, reusable + system-scoped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { ChevronDown, ChevronUp, Maximize2, Minimize2, ZoomIn, ZoomOut, Scan, SlidersHorizontal } from "lucide-react"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"
import { clearCachedFetch, useCachedFetch } from "@/lib/use-cached-fetch"
import { HeadlineStrip } from "@/components/topology-v0-2/headline-strip"
import { AwsFrame, dedupeLambdaServiceTwins, listTopologyAzs } from "@/components/topology-v0-2/aws-frame"
import { CanvasPane } from "@/components/topology-v0-2/canvas-pane"
import {
  applyFilters,
  applyTypeFilter,
  allWorkloadTypes,
  defaultFilters,
  type EstateFilters,
  FilterRail,
  workloadTypeRowsFromNodes,
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
import {
  buildTopologyRiskCacheKey,
  buildTopologyRiskProxyUrl,
} from "@/components/topology-v0-2/topology-scope-url"
import { EVIDENCE_TIER_LABEL } from "@/lib/types/scope"
import type { TopologyNode, TopologyRiskResponse } from "@/components/topology-v0-2/types"
import { createMap } from "@/components/topology-v0-2/native-map"
import {
  buildTopologyNodeIdIndex,
  buildVisibleCanvasIds,
  attackPathEdgesToTrafficEdges,
  selectEstateFlowEdges,
  type EstateFlowMode,
} from "@/components/topology-v0-2/estate-flow-edges"

const VPC_STORAGE_PREFIX = "topology-vpc:"
const ACCOUNT_STORAGE_PREFIX = "topology-account:"
const REGION_STORAGE_PREFIX = "topology-region:"
const AZ_STORAGE_PREFIX = "topology-hidden-az:"
/** Full-width estate shell — no centered max-width cap stealing horizontal space. */
const ESTATE_SHELL_X = "w-full px-3 lg:px-4"

// Regional / serverless services (Lambda, S3, DynamoDB, KMS, Secret) have no VPC
// — they render on the right rails, not the subnet grid. Their SERVICES-chip
// counts are therefore ALWAYS account/system-wide; the VPC-grid services
// (EC2/RDS/LoadBalancer) are counted for the current scope (per-VPC when a VPC
// is picked). Splitting the two keeps the chips 1:1 with the map and the
// per-VPC header — mixing them read as the map lying about a VPC's workloads.
// (Type sets mirror aws-frame's SERVERLESS_TYPES + REGIONAL_EDGE_SERVICE_TYPES.)
const RAIL_SERVICE_TYPES = new Set<string>([
  "Lambda", "LambdaFunction",
  "S3", "S3Bucket",
  "KMSKey",
  "DynamoDB", "DynamoDBTable",
  "Secret", "SecretsManagerSecret",
])
const isRailServiceType = (t?: string | null): boolean => !!t && RAIL_SERVICE_TYPES.has(t)

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
  /** Initial flow overlay. The Business System Blast Radius view opens in
   *  "attack_paths" so the estate map lands showing reachability, not all
   *  access. Users can still toggle back to all-access. */
  defaultFlowMode?: EstateFlowMode
  /** Collapse AZ columns that hold no workloads by default (the Business
   *  System view — keeps the map from wasting canvas on empty AZs). Applied
   *  once per scope on first load and never over an explicit user choice; the
   *  AZ chips / "Show all AZs" reveal them. */
  collapseEmptyAzsByDefault?: boolean
  /** Open on the merged all-VPCs view (every VPC as its own frame) instead of
   *  landing on the primary VPC. The Business System Blast Radius shows the
   *  WHOLE system, so it must not hide the system's other VPCs. Safe now that
   *  the merged view renders one honest frame per VPC (BE #380), which the
   *  old primary-default was working around. */
  defaultToAllVpcs?: boolean
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

export function EstateMapView({ systemName, embedded = false, onOpenTrafficMap, defaultFlowMode = "all_access", collapseEmptyAzsByDefault = false, defaultToAllVpcs = false }: EstateMapViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return window.localStorage.getItem(`${ACCOUNT_STORAGE_PREFIX}${systemName}`)
  })
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const acct = window.localStorage.getItem(`${ACCOUNT_STORAGE_PREFIX}${systemName}`)
    const key = `${REGION_STORAGE_PREFIX}${systemName}:${acct ?? "default"}`
    return window.localStorage.getItem(key)
  })
  const [selectedVpcId, setSelectedVpcId] = useState<string | "all">(() => {
    if (defaultToAllVpcs) return "all"
    if (typeof window === "undefined") return "all"
    return window.localStorage.getItem(`${VPC_STORAGE_PREFIX}${systemName}`) ?? "all"
  })

  const scopedVpc = selectedVpcId === "all" ? null : selectedVpcId
  const azScopeKey = `${selectedAccountId ?? "all"}:${selectedRegionId ?? "all"}:${scopedVpc ?? "all"}`
  const [hiddenAzs, setHiddenAzs] = useState<string[]>([])
  const scopeParams = useMemo(
    () => ({
      accountId: selectedAccountId,
      region: selectedRegionId,
      vpcId: scopedVpc,
    }),
    [selectedAccountId, selectedRegionId, scopedVpc],
  )
  const cacheKey = buildTopologyRiskCacheKey(systemName, scopeParams)
  const url = buildTopologyRiskProxyUrl(systemName, scopeParams)
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
    const mergedUrl = buildTopologyRiskProxyUrl(systemName, {
      accountId: selectedAccountId,
      region: selectedRegionId,
    })
    fetch(mergedUrl, { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then((body: TopologyRiskResponse | null) => {
        if (!cancelled && body?.nodes) setFullSystemNodes(body.nodes)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [systemName, selectedAccountId, selectedRegionId])

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

  // AZs that have subnets but zero workloads landing in the grid (mirrors
  // topologyGridWouldBeEmpty's per-node rule — stale + non-edge nodes count).
  const emptyAzs = useMemo(() => {
    const subnets = data?.vpc_topology?.subnets ?? []
    if (subnets.length === 0 || availableAzs.length === 0) return []
    const subnetById = createMap(subnets.map((s) => [s.id, s]))
    const populated = new Set<string>()
    for (const n of gridSourceNodes) {
      const sub = n.subnet_id ? subnetById.get(n.subnet_id) : undefined
      if (!sub?.az) continue
      if (n.stale) {
        populated.add(sub.az)
        continue
      }
      if (n.type && EDGE_SERVICE_TYPES.has(n.type)) continue
      populated.add(sub.az)
    }
    return availableAzs.filter((az) => !populated.has(az))
  }, [data?.vpc_topology?.subnets, gridSourceNodes, availableAzs])

  // Track, per scope, whether the user already had a saved AZ preference when we
  // first loaded it (so auto-collapse never overrides an explicit choice) and
  // which scopes we've already auto-collapsed this mount.
  const azPrefExistedRef = useRef<Map<string, boolean>>(new Map())
  const azAutoCollapsedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!azPrefExistedRef.current.has(azScopeKey)) {
      const existed =
        typeof window !== "undefined" &&
        window.localStorage.getItem(azStorageKey(systemName, azScopeKey)) != null
      azPrefExistedRef.current.set(azScopeKey, existed)
    }
    setHiddenAzs(loadHiddenAzs(systemName, azScopeKey))
  }, [systemName, azScopeKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(azStorageKey(systemName, azScopeKey), JSON.stringify(hiddenAzs))
  }, [hiddenAzs, systemName, azScopeKey])

  // Default-collapse empty AZs once per scope, only on first data load with no
  // prior user preference. Never hides ALL AZs. The AZ chips + "Show all AZs"
  // reveal them, and a revealed AZ persists (we don't re-collapse).
  useEffect(() => {
    if (!collapseEmptyAzsByDefault) return
    if (availableAzs.length === 0 || emptyAzs.length === 0) return
    if (azAutoCollapsedRef.current.has(azScopeKey)) return
    if (azPrefExistedRef.current.get(azScopeKey)) return
    azAutoCollapsedRef.current.add(azScopeKey)
    setHiddenAzs((prev) => {
      const set = new Set(prev)
      for (const az of emptyAzs) set.add(az)
      if (set.size >= availableAzs.length) return prev
      return [...set]
    })
  }, [collapseEmptyAzsByDefault, availableAzs, emptyAzs, azScopeKey])

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

  const [flowMode, setFlowMode] = useState<EstateFlowMode>(defaultFlowMode)

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

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `${ACCOUNT_STORAGE_PREFIX}${systemName}`
    if (selectedAccountId) window.localStorage.setItem(key, selectedAccountId)
    else window.localStorage.removeItem(key)
  }, [selectedAccountId, systemName])

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `${REGION_STORAGE_PREFIX}${systemName}:${selectedAccountId ?? "default"}`
    if (selectedRegionId) window.localStorage.setItem(key, selectedRegionId)
    else window.localStorage.removeItem(key)
  }, [selectedRegionId, selectedAccountId, systemName])

  const regionOptions = useMemo(() => {
    const accounts = data?.available_accounts ?? []
    if (selectedAccountId) {
      const acct = accounts.find(a => a.account_id === selectedAccountId)
      if (acct?.regions?.length) return acct.regions
    }
    return data?.available_regions ?? []
  }, [data?.available_accounts, data?.available_regions, selectedAccountId])

  // Default to primary account when the system spans multiple AWS accounts.
  useEffect(() => {
    const accounts = data?.available_accounts ?? []
    if (accounts.length <= 1) return
    const key = `${ACCOUNT_STORAGE_PREFIX}${systemName}`
    if (typeof window !== "undefined" && window.localStorage.getItem(key) != null) return
    if (selectedAccountId) return
    const primary = data?.account_id ?? accounts[0]?.account_id
    if (primary) setSelectedAccountId(primary)
  }, [data?.available_accounts, data?.account_id, selectedAccountId, systemName])

  // Default region within the selected account.
  useEffect(() => {
    if (regionOptions.length <= 1) return
    const key = `${REGION_STORAGE_PREFIX}${systemName}:${selectedAccountId ?? "default"}`
    if (typeof window !== "undefined" && window.localStorage.getItem(key) != null) return
    if (selectedRegionId) return
    const primary = data?.region ?? regionOptions[0]
    if (primary) setSelectedRegionId(primary)
  }, [regionOptions, data?.region, selectedRegionId, selectedAccountId, systemName])

  useEffect(() => {
    if (!selectedRegionId) return
    if (regionOptions.length === 0 || regionOptions.includes(selectedRegionId)) return
    setSelectedRegionId(regionOptions[0] ?? null)
  }, [regionOptions, selectedRegionId])

  // Self-heal a region scope that resolves to literally nothing (0 subnets,
  // 0 nodes) — e.g. an incidental region entry ('global', or a region the
  // system barely touches) that isn't where its real infrastructure lives.
  // The backend ECHOES BACK whatever region was requested as `data.region`
  // when a region filter is active, so that field can't be used to detect a
  // wrong scope — emptiness is the only honest signal. Runs at most ONCE per
  // system per mount so it never fights a later explicit user pick of a
  // genuinely-empty region. Without this, a wrong region — once written to
  // localStorage by ANY path (a race in the default-region effect above, a
  // stray click, an upstream data glitch) — stays wrong FOREVER: the map
  // silently scopes to nothing, shows no error, and there is no way out
  // short of clearing browser storage by hand (observed live on a real
  // multi-region system whose infrastructure is entirely in one region —
  // the map just sat on "Loading topology risk…" indefinitely).
  const healedRegionSystemRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data || loading) return
    if (!selectedRegionId) return // already unscoped — nothing to heal
    if (healedRegionSystemRef.current === systemName) return
    healedRegionSystemRef.current = systemName
    const hasContent = (data.vpc_topology?.subnets?.length ?? 0) > 0 || (data.nodes?.length ?? 0) > 0
    if (!hasContent) setSelectedRegionId(null)
  }, [data, loading, selectedRegionId, systemName])

  // First visit: default to primary VPC when the system spans multiple VPCs.
  // Runs at most ONCE per system per mount (defaultedVpcSystemRef) so it never
  // fights a later user switch. Without the guard this effect re-fires on every
  // `data` refetch, and because we treat a persisted "all" as unset (below),
  // selecting "All VPCs" triggers a merged refetch → new data ref → effect
  // re-runs → snaps straight back to the primary VPC. The guard lets an
  // explicit "All VPCs" choice stick for the session.
  const defaultedVpcSystemRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data?.available_vpcs?.length) return
    if (defaultedVpcSystemRef.current === systemName) return
    defaultedVpcSystemRef.current = systemName
    // Business System Blast Radius shows the whole system — stay on the merged
    // all-VPCs frame (per-VPC islands) rather than landing on the primary VPC.
    if (defaultToAllVpcs) return
    const key = `${VPC_STORAGE_PREFIX}${systemName}`
    // Treat a persisted "all" as unset. The merged view crams cross-VPC
    // workloads into ONE VPC's subnet frame (the backend's vpc_topology only
    // carries the primary VPC's subnets, so a second VPC's workloads get
    // force-fit into the primary's tiers) — honest per-VPC frames are a
    // follow-up. Until then a multi-VPC system should LAND on its primary
    // VPC (a true 1:1 scoped view), not the confusing merged canvas. An
    // explicit non-"all" VPC choice is still respected.
    const persisted =
      typeof window !== "undefined" ? window.localStorage.getItem(key) : null
    if (persisted != null && persisted !== "all") return
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
  const [fsScopeOpen, setFsScopeOpen] = useState(false)
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

  // ── Fullscreen fit-to-viewport zoom + pan (P0-A) ──────────────────────────
  // The frame's height is data-driven; the viewport isn't. We wrap the frame in
  // a transform: translate()/scale() container and drive it with a computed Fit
  // scale, +/− steps, wheel-zoom-around-cursor, and background drag-pan.
  // AwsFrame forwards `zoom` to FlowOverlay, which divides its measured rects by
  // it so the animated edges stay pinned to chips at any zoom (retires PR #227).
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // True once the operator zooms/pans by hand — auto-refit (content growth,
  // window resize) then stops stealing the view and only refreshes the fit
  // target so the relative-% readout stays honest.
  const userAdjustedRef = useRef(false)
  const MIN_ZOOM = 0.15
  const MAX_ZOOM = 2
  // Below this zoom, full cards are unreadable → collapse to density tiles.
  // ONE-WAY lock: the fit is a function of content size, and collapsing to tiles
  // CHANGES that size. A two-way threshold flip-flops tiles↔cards and (via the
  // ResizeObserver below) fed an infinite re-fit loop that froze the tab
  // (2026-07-04). So the decision is monotonic per fullscreen session: while
  // showing full cards, if the scale needed to show the WHOLE map drops below
  // LOD_THRESHOLD we collapse to tiles and STAY collapsed. That lets the refit
  // safely re-fit the now-shorter tile content so the tiers fill the viewport,
  // instead of being stuck at the small card-fit with big empty margins.
  const LOD_THRESHOLD = 0.55
  const densityLockRef = useRef(false)
  const [densityCollapsed, setDensityCollapsed] = useState(false)

  const computeFit = useCallback((apply: boolean) => {
    const vp = viewportRef.current
    const content = contentRef.current
    if (!vp || !content) return
    // Natural (pre-transform) size — offset* ignores CSS transform; scroll*
    // additionally includes children that overflow the content box (the
    // regional/serverless rails). offsetHeight alone under-measured a tall
    // map so "fit" cut the DATA TIER off below the fold (2026-07-04).
    const nw = Math.max(content.offsetWidth, content.scrollWidth)
    const nh = Math.max(content.offsetHeight, content.scrollHeight)
    if (nw === 0 || nh === 0) return
    // The fit targets the tier stacks — the 3 subnet tiers + IAM per VPC
    // (data-testid topology-tier-stack), measured from the content top — so the
    // tall side rails (VPCE/serverless/regional, which stretch the row and used
    // to shrink everything) do NOT drive the fit. Rails that run taller overflow
    // below and pan. Ratio-based so the current scale cancels out; falls back to
    // full content height if no anchor is in the DOM yet.
    //
    // The merged (all-VPCs) view renders ONE tier-stack per VPC frame, all at
    // the same stretched height (frames render at equal heights, all-VPCs
    // parallel-frame fix). querySelector (singular) only ever measured the
    // FIRST frame — with 2+ VPCs that under-measured fitH, so "100%" fit only
    // the first VPC's content and every other frame silently clipped below the
    // fold (overflow:hidden, unreachable — no scrollbar, no pan affordance).
    // querySelectorAll + max(bottom) covers every VPC frame; since all frames
    // render at equal height this is also just each one's real bottom, not an
    // over-estimate. Single-VPC (scoped) view still has exactly one match, so
    // behavior there is unchanged.
    let fitH = nh
    const stacks = content.querySelectorAll('[data-testid="topology-tier-stack"]')
    if (stacks.length > 0) {
      const cr = content.getBoundingClientRect()
      if (cr.height > 0) {
        let maxBottom = 0
        stacks.forEach(el => {
          maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom)
        })
        const frac = (maxBottom - cr.top) / cr.height // 0..1
        if (frac > 0.1 && frac <= 1) fitH = nh * frac
      }
    }
    const pad = 24
    const fit = Math.max(
      MIN_ZOOM,
      Math.min(1, (vp.clientWidth - pad) / nw, (vp.clientHeight - pad) / fitH),
    )
    // One-way LOD (see lock comment above). While still showing full cards, if
    // the whole map won't fit at a readable scale, drop to density tiles and
    // stay there — the ResizeObserver then re-fits the shorter tile content so
    // the three subnet tiers fill the viewport. Never re-expands, so no bounce.
    if (!densityLockRef.current && fit < LOD_THRESHOLD) {
      densityLockRef.current = true
      setDensityCollapsed(true)
    }
    setFitScale(fit)
    if (apply) {
      setZoom(fit)
      const scaledW = nw * fit
      setPan({ x: Math.max(0, (vp.clientWidth - scaledW) / 2), y: pad / 2 })
    }
  }, [])

  // On open, Fit once the frame has laid out (double rAF lets fonts + grid
  // settle so the measured size is real), then keep fitting as the map settles:
  // async cells/rails land (GROW) and, once, the density collapse SHRINKS the
  // content so the three tiers fill the viewport. A ResizeObserver drives both.
  useEffect(() => {
    if (!mapEnlarged) return
    userAdjustedRef.current = false
    densityLockRef.current = false // re-decide LOD fresh each time fullscreen opens
    setDensityCollapsed(false)
    let r1 = 0
    let r2 = 0
    let winRaf = 0
    let roRaf = 0
    let autoRefits = 0
    // Hard backstop against a runaway refit. With the one-way LOD lock the fit
    // sequence is short (async growth + a single collapse), so anything past this
    // cap is a pathology — stop it so the refit can NEVER freeze the tab again.
    const MAX_AUTO_REFITS = 40

    // Initial fit once fonts + grid settle (double rAF).
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => computeFit(true))
    })

    // Window resize changes the VIEWPORT basis. Re-decide LOD (a bigger window
    // may now fit full cards) and re-fit. User-driven, not the loop — uncapped.
    const onWinResize = () => {
      if (winRaf) return
      winRaf = requestAnimationFrame(() => {
        winRaf = 0
        if (!userAdjustedRef.current) densityLockRef.current = false
        computeFit(!userAdjustedRef.current)
      })
    }
    window.addEventListener("resize", onWinResize)

    // Content ResizeObserver: re-fit on ANY content-size change — async cells/
    // rails landing AND the one-time density collapse (which SHRINKS the content
    // so the tiers can fill the viewport). Safe from the old freeze because the
    // LOD lock makes collapse one-way (content size settles, never bounces);
    // rAF-coalesced, and the hard cap is the last-resort guard.
    const onContentResize = () => {
      if (roRaf) return
      roRaf = requestAnimationFrame(() => {
        roRaf = 0
        if (userAdjustedRef.current) {
          computeFit(false) // refresh the % target only; never steal the view
          return
        }
        if (autoRefits >= MAX_AUTO_REFITS) return
        autoRefits += 1
        computeFit(true)
      })
    }
    const content = contentRef.current
    let ro: ResizeObserver | null = null
    if (content) {
      ro = new ResizeObserver(onContentResize)
      ro.observe(content)
    }
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
      if (winRaf) cancelAnimationFrame(winRaf)
      if (roRaf) cancelAnimationFrame(roRaf)
      window.removeEventListener("resize", onWinResize)
      ro?.disconnect()
    }
  }, [mapEnlarged, computeFit])

  // Explicit re-fit when the VPC scope changes while fullscreen is already
  // open. In principle the ResizeObserver above should catch this (switching
  // to "All VPCs" adds a whole second frame, a real content-size change) —
  // but switching scope also re-fetches data, and empirically the observer's
  // callback can land before the new frame has actually painted, leaving the
  // fit computed against the OLD (single-VPC, shorter) content. The visible
  // bug: "100%" showed far less than the whole map, and the second VPC's
  // lower tiers were clipped below the fold with no scrollbar and no pan
  // affordance to discover them (observed live 2026-07-08 — switching to "All
  // VPCs (merged)" while already in fullscreen left the fit stuck at the
  // pre-switch scale). This is a second, independent trigger on the one
  // signal that actually changes frame COUNT, so it doesn't depend on the
  // observer's timing at all — double-rAF lets the new frame's layout (and,
  // if data was already cached, its content) settle first.
  useEffect(() => {
    if (!mapEnlarged) return
    let r1 = 0
    let r2 = 0
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => computeFit(!userAdjustedRef.current))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [mapEnlarged, selectedVpcId, computeFit])

  const zoomTo = useCallback((next: number, originClientX?: number, originClientY?: number) => {
    const vp = viewportRef.current
    userAdjustedRef.current = true // manual zoom — stop auto-refit stealing the view
    setZoom(prev => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
      if (vp && originClientX != null && originClientY != null && clamped !== prev) {
        const rect = vp.getBoundingClientRect()
        const cx = originClientX - rect.left
        const cy = originClientY - rect.top
        // Keep the point under the cursor stationary through the zoom.
        setPan(p => ({
          x: cx - ((cx - p.x) * clamped) / prev,
          y: cy - ((cy - p.y) * clamped) / prev,
        }))
      }
      return clamped
    })
  }, [])

  const fitView = useCallback(() => {
    // Returning to 100%-of-map re-enables auto-refit on content growth.
    userAdjustedRef.current = false
    computeFit(true)
  }, [computeFit])
  const zoomInStep = useCallback(() => zoomTo(zoom * 1.25), [zoom, zoomTo])
  const zoomOutStep = useCallback(() => zoomTo(zoom / 1.25), [zoom, zoomTo])
  // Zoom is DISPLAYED relative to the fit scale: "100%" = 100% OF THE MAP on
  // screen (Alon, 2026-07-04 — a CSS-pixel 100% that clips the map is a
  // meaningless number to an operator). Fit ⇒ 100%; zooming in reads 125%,
  // 185%, …; the raw CSS scale stays internal.
  const relZoomPct = Math.round((zoom / (fitScale || 1)) * 100)

  const onViewportWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    zoomTo(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY)
  }, [zoom, zoomTo])

  const onPanDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Let chips / buttons / links handle their own clicks; only the bare canvas pans.
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, select, [data-flow-id], [role="button"]')) return
    userAdjustedRef.current = true // manual pan — stop auto-refit stealing the view
    panDrag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    setPanning(true)
  }, [pan.x, pan.y])
  const onPanMove = useCallback((e: React.PointerEvent) => {
    const d = panDrag.current
    if (!d) return
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }, [])
  const onPanUp = useCallback(() => {
    panDrag.current = null
    setPanning(false)
  }, [])

  const chipCountNodes = useMemo(() => {
    const byId = new Map<string, TopologyNode>()
    for (const n of gridSourceNodes) byId.set(n.id, n)
    for (const n of serverlessSourceNodes) byId.set(n.id, n)
    return [...byId.values()]
  }, [gridSourceNodes, serverlessSourceNodes])

  const effectiveFilters = useMemo(
    () => filters ?? defaultFilters(data?.system_kpis ?? null, chipCountNodes),
    [filters, data?.system_kpis, chipCountNodes],
  )

  const filteredNodes = useMemo(
    () => (gridSourceNodes.length ? applyFilters(gridSourceNodes, effectiveFilters) : []),
    [gridSourceNodes, effectiveFilters],
  )

  const filteredServerlessSource = useMemo(
    () => applyTypeFilter(serverlessSourceNodes, effectiveFilters),
    [serverlessSourceNodes, effectiveFilters],
  )

  const filteredRegionalSource = useMemo(
    () => applyTypeFilter(regionalDataSourceNodes, effectiveFilters),
    [regionalDataSourceNodes, effectiveFilters],
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

  // VPC-grid services (EC2/RDS/LB) counted for the CURRENT scope — per-VPC when a
  // VPC is picked (gridSourceNodes is the scoped fetch then), account-wide when
  // merged. Regional/serverless services counted account-wide from the full node
  // superset. See RAIL_SERVICE_TYPES for why the two are scoped differently.
  const vpcServiceRows = useMemo(
    () => workloadTypeRowsFromNodes(gridSourceNodes.filter(n => !isRailServiceType(n.type))),
    [gridSourceNodes],
  )
  const systemWideRows = useMemo(
    () => workloadTypeRowsFromNodes(serverlessSourceNodes.filter(n => isRailServiceType(n.type))),
    [serverlessSourceNodes],
  )
  const workloadTypeRows = useMemo(
    () => [...vpcServiceRows, ...systemWideRows],
    [vpcServiceRows, systemWideRows],
  )

  const toggleWorkloadType = useCallback(
    (type: string) => {
      setFilters(prev => {
        const base = prev ?? defaultFilters(data?.system_kpis ?? null, chipCountNodes)
        const next = new Set(base.types)
        if (next.has(type)) next.delete(type)
        else next.add(type)
        return { ...base, types: next }
      })
    },
    [data?.system_kpis, chipCountNodes],
  )

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

  const renderMap = (presentationMode: boolean, scale = 1, densityCollapsed = false) => (data.vpc_topology ? (
    <AwsFrame
      vpcTopology={data.vpc_topology}
      nodes={filteredNodes}
      mergedVpcView={!scopedVpc}
      hiddenAzs={hiddenAzs}
      serverlessSourceNodes={filteredServerlessSource}
      regionalDataSourceNodes={filteredRegionalSource}
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
      scale={scale}
      densityCollapsed={densityCollapsed}
    />
  ) : (
    <CanvasPane
      vpcId={data.vpc_id}
      nodes={filteredNodes}
      selectedNodeId={selectedNodeId}
      onSelect={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
    />
  ))

  const renderScopeControls = (compact = false) => (
    <>
      {(data.available_accounts?.length ?? 0) > 1 ? (
        <div
          className={`${ESTATE_SHELL_X} ${compact ? "py-1" : "py-2"} border-b flex flex-wrap items-center gap-2`}
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
        >
          <label
            htmlFor={compact ? "topology-account-select-fs" : "topology-account-select"}
            className="text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: "#5A6B7A" }}
          >
            Account scope
          </label>
          <select
            id={compact ? "topology-account-select-fs" : "topology-account-select"}
            value={selectedAccountId ?? ""}
            onChange={e => {
              setSelectedNodeId(null)
              setHighlightedRoleName(null)
              setSelectedRegionId(null)
              setSelectedAccountId(e.target.value || null)
            }}
            className={
              compact
                ? "text-[11px] font-mono rounded-md border px-2 py-0.5 min-w-[180px] max-w-full"
                : "text-[12px] font-mono rounded-md border px-2 py-1.5 min-w-[220px] max-w-full"
            }
            style={{ borderColor: "#CBD5E1", color: "#1A2330", background: "#F8FAFC" }}
            data-testid="topology-account-select"
          >
            {(data.available_accounts ?? []).map(a => (
              <option key={a.account_id} value={a.account_id}>
                {a.name} · {a.account_id} ({a.workload_count} workloads ·{" "}
                {EVIDENCE_TIER_LABEL[a.evidence_tier] ?? a.evidence_tier})
              </option>
            ))}
          </select>
          {!compact ? (
            <span className="text-[11px]" style={{ color: "#5A6B7A" }}>
              One AWS account at a time — never merged across account boundaries.
            </span>
          ) : null}
        </div>
      ) : null}

      {regionOptions.length > 1 ? (
        <div
          className={`${ESTATE_SHELL_X} ${compact ? "py-1" : "py-2"} border-b flex flex-wrap items-center gap-2`}
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
        >
          <label
            htmlFor={compact ? "topology-region-select-fs" : "topology-region-select"}
            className="text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: "#5A6B7A" }}
          >
            Region scope
          </label>
          <select
            id={compact ? "topology-region-select-fs" : "topology-region-select"}
            value={selectedRegionId ?? ""}
            onChange={e => {
              setSelectedNodeId(null)
              setHighlightedRoleName(null)
              setSelectedRegionId(e.target.value || null)
            }}
            className={
              compact
                ? "text-[11px] font-mono rounded-md border px-2 py-0.5 min-w-[140px] max-w-full"
                : "text-[12px] font-mono rounded-md border px-2 py-1.5 min-w-[160px] max-w-full"
            }
            style={{ borderColor: "#CBD5E1", color: "#1A2330", background: "#F8FAFC" }}
            data-testid="topology-region-select"
          >
            {regionOptions.map(region => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {(data.available_vpcs?.length ?? 0) > 0 ? (
        <div
          className={`${ESTATE_SHELL_X} ${compact ? "py-1" : "py-2"} border-b flex flex-wrap items-center gap-2`}
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
        >
          <label
            htmlFor={compact ? "topology-vpc-select-fs" : "topology-vpc-select"}
            className="text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: "#5A6B7A" }}
          >
            VPC scope
          </label>
          <select
            id={compact ? "topology-vpc-select-fs" : "topology-vpc-select"}
            value={selectedVpcId}
            onChange={e => {
              setSelectedNodeId(null)
              setHighlightedRoleName(null)
              setSelectedVpcId(e.target.value)
            }}
            className={
              compact
                ? "text-[11px] font-mono rounded-md border px-2 py-0.5 min-w-[180px] max-w-full"
                : "text-[12px] font-mono rounded-md border px-2 py-1.5 min-w-[220px] max-w-full"
            }
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
          {!compact ? (
            <span className="text-[11px]" style={{ color: "#5A6B7A" }}>
              {selectedVpcId === "all"
                ? "Merged view — full system node list; Lambda/S3/DDB on the right edge rail."
                : "Subnet-linked compute in tier cells; regional/serverless on the right rail."}
            </span>
          ) : null}
        </div>
      ) : null}

      {availableAzs.length > 0 ? (
        <div
          className={`${ESTATE_SHELL_X} ${compact ? "py-1" : "py-2"} border-b flex flex-wrap items-center gap-2`}
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
                title={hidden ? `Show ${az}` : `Hide ${az}`}
                onClick={() => toggleAzVisibility(az)}
                className={
                  compact
                    ? "text-[10px] font-mono rounded-md border px-1.5 py-0.5 transition-colors"
                    : "text-[11px] font-mono rounded-md border px-2 py-1 transition-colors"
                }
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
        </div>
      ) : null}

      {workloadTypeRows.length > 0 ? (
        <div
          className={`${ESTATE_SHELL_X} ${compact ? "py-1" : "py-2"} border-b flex flex-wrap items-center gap-2`}
          style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
          data-testid="topology-service-scope"
        >
          {vpcServiceRows.length > 0 ? (
            <>
              <span
                className="text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0"
                style={{ color: "#5A6B7A" }}
                title={scopedVpc ? "EC2 / RDS / LoadBalancer in the selected VPC" : "EC2 / RDS / LoadBalancer across all VPCs"}
              >
                {scopedVpc ? "In this VPC" : "VPC services"}
              </span>
              {vpcServiceRows.map(([t, v]) => {
                const on = effectiveFilters.types.has(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleWorkloadType(t)}
                    className="text-[11px] rounded-md border px-2 py-1 transition-colors"
                    style={{
                      borderColor: on ? "#00C2A8" : "#CBD5E1",
                      background: on ? "#E6FBF7" : "#F8FAFC",
                      color: on ? "#0E8B7A" : "#94A3B8",
                      textDecoration: on ? "none" : "line-through",
                    }}
                    data-testid={`topology-service-toggle-${t}`}
                  >
                    {t} ({v})
                  </button>
                )
              })}
            </>
          ) : null}
          {systemWideRows.length > 0 ? (
            <>
              <span
                className="text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0 border-l pl-2 ml-1"
                style={{ color: "#5A6B7A", borderColor: "#E2E8F0" }}
                title="Regional / serverless services (Lambda, S3, DynamoDB, KMS, Secrets) have no VPC — count is always account/system-wide"
              >
                System-wide
              </span>
              {systemWideRows.map(([t, v]) => {
                const on = effectiveFilters.types.has(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleWorkloadType(t)}
                    className="text-[11px] rounded-md border px-2 py-1 transition-colors"
                    style={{
                      borderColor: on ? "#00C2A8" : "#CBD5E1",
                      background: on ? "#E6FBF7" : "#F8FAFC",
                      color: on ? "#0E8B7A" : "#94A3B8",
                      textDecoration: on ? "none" : "line-through",
                    }}
                    data-testid={`topology-service-toggle-${t}`}
                  >
                    {t} ({v})
                  </button>
                )
              })}
            </>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setFilters(prev => ({
                ...(prev ?? defaultFilters(data.system_kpis, chipCountNodes)),
                types: allWorkloadTypes(data.system_kpis, chipCountNodes),
              }))
            }
            className="text-[10px] font-semibold uppercase tracking-wide rounded-md border px-2 py-1"
            style={{ borderColor: "#CBD5E1", color: "#0E8B7A", background: "#FFFFFF" }}
          >
            Show all
          </button>
          <button
            type="button"
            onClick={() =>
              setFilters(prev => ({
                ...(prev ?? defaultFilters(data.system_kpis, chipCountNodes)),
                types: new Set(),
              }))
            }
            className="text-[10px] font-semibold uppercase tracking-wide rounded-md border px-2 py-1"
            style={{ borderColor: "#CBD5E1", color: "#5A6B7A", background: "#FFFFFF" }}
          >
            Clear all
          </button>
        </div>
      ) : null}
    </>
  )

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
          nodes={chipCountNodes}
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

      {renderScopeControls()}

      <div className={`flex flex-1 min-h-0 gap-2 ${ESTATE_SHELL_X} py-3`}>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Estate view">
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
            {view === "map" ? (
              <button
                type="button"
                onClick={() => setMapEnlarged(true)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm hover:bg-[#F8FAFC] transition-colors shrink-0"
                style={{ borderColor: "#CBD5E1", background: "#FFFFFF", color: "#1A2330" }}
                aria-label="Open map fullscreen"
                data-testid="topology-estate-map-enlarge"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Map fullscreen
              </button>
            ) : null}
          </div>
          <div className="relative flex-1 min-h-0">
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

        <aside
          className="hidden xl:flex flex-col min-h-0 w-[212px] shrink-0 sticky top-4 self-start"
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
        </aside>
      </div>

      <div className={`xl:hidden pb-4 ${ESTATE_SHELL_X}`}>
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

      <footer className={`${ESTATE_SHELL_X} pb-6 text-[10px] leading-relaxed`} style={{ color: "#5A6B7A" }}>
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
          {/* P0-C — slim one-row chrome: identity · scope toggle · zoom controls · exit */}
          <div
            className="flex items-center gap-3 shrink-0 border-b px-4 h-11"
            style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0" style={{ color: "#5A6B7A" }}>
                Estate map
              </span>
              <span className="text-[13px] font-semibold truncate" style={{ color: "#1A2330" }}>
                {data.system}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFsScopeOpen(o => !o)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-[#F4F6F8] transition-colors shrink-0"
              style={{ borderColor: fsScopeOpen ? "#0E8B7A" : "#CBD5E1", color: fsScopeOpen ? "#0E8B7A" : "#5A6B7A" }}
              aria-expanded={fsScopeOpen}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Scope
            </button>

            <div className="flex-1" />

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5 shrink-0" style={{ borderColor: "#CBD5E1", background: "#FFFFFF" }}>
              <button
                type="button"
                onClick={fitView}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-[#F4F6F8] transition-colors"
                style={{ color: relZoomPct === 100 ? "#0E8B7A" : "#1A2330" }}
                title="Show 100% of the map (fit to screen)"
              >
                <Scan className="h-3.5 w-3.5" />
                100%
              </button>
              <button
                type="button"
                onClick={zoomOutStep}
                className="inline-flex items-center justify-center rounded p-1 hover:bg-[#F4F6F8] transition-colors"
                style={{ color: "#1A2330" }}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span
                className="w-10 text-center text-[10px] font-mono tabular-nums"
                style={{ color: relZoomPct === 100 ? "#0E8B7A" : "#5A6B7A" }}
                title="Zoom relative to the whole map — 100% = entire estate on screen"
              >
                {relZoomPct}%
              </span>
              <button
                type="button"
                onClick={zoomInStep}
                className="inline-flex items-center justify-center rounded p-1 hover:bg-[#F4F6F8] transition-colors"
                style={{ color: "#1A2330" }}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={closeEnlarged}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide hover:bg-[#F4F6F8] transition-colors shrink-0"
              style={{ borderColor: "#CBD5E1", color: "#1A2330" }}
              aria-label="Exit map fullscreen"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit
            </button>
          </div>

          {/* Scope controls — collapsed by default in fullscreen to reclaim chrome */}
          {fsScopeOpen ? (
            <div className="shrink-0 border-b px-2 py-1" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
              {renderScopeControls(true)}
            </div>
          ) : null}

          {/* P0-A — zoom/pan viewport. overflow-hidden (was overflow-auto): the map
              fits via transform, it does not scroll. */}
          <div
            ref={viewportRef}
            className="flex-1 min-h-0 relative overflow-hidden"
            style={{ cursor: panning ? "grabbing" : "grab", touchAction: "none" }}
            onWheel={onViewportWheel}
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerLeave={onPanUp}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "top left",
                willChange: "transform",
              }}
            >
              <div ref={contentRef} className="inline-block">
                {renderMap(true, zoom, densityCollapsed)}
              </div>
            </div>
            {densityCollapsed ? (
              <div
                className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-medium shadow-lg"
                style={{ background: "rgba(26,35,48,0.82)", color: "#FFFFFF" }}
              >
                Overview density — zoom in (or click a stack tile) for full cards
              </div>
            ) : null}
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
