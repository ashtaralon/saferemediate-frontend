'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Map as MapIcon, Search, RefreshCw, Network, Layers, Cloud, GitBranch, Activity, CheckCircle, XCircle } from 'lucide-react'
import dynamic from 'next/dynamic'
import GraphView from './dependency-map/graph-view'
import ResourceView from './dependency-map/resource-view'
import { CJSpotlightStrip } from './dependency-map/cj-spotlight-strip'
import { CJPickerStrip } from './dependency-map/cj-picker-strip'
import { useCachedFetch } from '@/lib/use-cached-fetch'
import type { CrownJewelSummary } from './identity-attack-paths/types'
import { useCrownJewelConvergence } from '@/lib/attack-paths/use-crown-jewel-convergence'

// Lazy load SankeyView with SSR disabled (nivo uses browser APIs)
const SankeyView = dynamic(
  () => import('./dependency-map/sankey').then(mod => mod.SankeyView),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[550px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }
)

// Lazy load GraphViewX6 with SSR disabled to prevent build errors
const GraphViewX6 = dynamic(
  () => import('./dependency-map/graph-view-x6'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }
)

// Lazy load InfrastructureFlowViz (Observed-first, tiered flow visualization) with SSR disabled
const InfrastructureFlowViz = dynamic(
  () => import('./dependency-map/infrastructure-flow-viz'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    )
  }
)

// Lazy load ComprehensiveFlowViz (Full 6-tier visualization with all edge types) with SSR disabled
const ComprehensiveFlowViz = dynamic(
  () => import('./dependency-map/comprehensive-flow-viz'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    )
  }
)

// AWSArchitectureDiagram (the "Full Map" sub-tab) was retired 2026-06-22
// per Alon: System Map is the focus, Full Map's force-directed AWS-icon
// layout was redundant with the Topology · Graph View tab and added
// cognitive load. TrafficFlowMap is now the only graph engine inside the
// Topology · Graph View sub-tab. The component file still exists for
// other consumers (none currently) — clean removal can come later.

// Lazy load Neo4jAWSMap (Neo4j-powered dynamic visualization with animated flows) with SSR disabled
const Neo4jAWSMap = dynamic(
  () => import('./dependency-map/aws-infrastructure-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Neo4j Map...</p>
          <p className="text-slate-400 text-xs mt-1">Connecting to database</p>
        </div>
      </div>
    )
  }
)

// Lazy load FlowStripView (Full Stack Flows with SG + IAM checkpoints) with SSR disabled
const FlowStripView = dynamic(
  () => import('./security-posture/flow-strip/FlowStripView').then(mod => ({ default: mod.FlowStripView })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }
)

// Lazy load Neo4jDataView (Data table view for Neo4j data) with SSR disabled
const Neo4jDataView = dynamic(
  () => import('./dependency-map/neo4j-data-view'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }
)

// Lazy load TrafficFlowMap (Full stack flows with stack components, connection details, gaps, blast radius) with SSR disabled
const TrafficFlowMap = dynamic(
  () => import('./dependency-map/traffic-flow-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Traffic Flow Map...</p>
          <p className="text-slate-400 text-xs mt-1">Building full stack flows</p>
        </div>
      </div>
    )
  }
)

// Feature flag for v2 (Observed-first) dependency map
// Set NEXT_PUBLIC_DEPENDENCY_MAP_V2=true to enable
const DEPENDENCY_MAP_V2_ENABLED = process.env.NEXT_PUBLIC_DEPENDENCY_MAP_V2 === 'true'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Props {
  systemName: string
  highlightPath?: { source: string; target: string; port?: string }
  defaultGraphEngine?: 'logical' | 'architectural' | 'observed' | 'comprehensive' | 'neo4j'
  onGraphEngineChange?: (engine: 'logical' | 'architectural' | 'observed' | 'comprehensive' | 'neo4j') => void
  onHighlightPathClear?: () => void
}

type ViewType = 'graph' | 'resource' | 'sankey' | 'flows'

export default function DependencyMapTab({
  systemName,
  highlightPath,
  defaultGraphEngine = 'neo4j',
  onGraphEngineChange,
  onHighlightPathClear
}: Props) {
  const [activeView, setActiveView] = useState<ViewType>('graph')
  const [graphEngine, setGraphEngine] = useState<'logical' | 'architectural' | 'observed' | 'comprehensive' | 'neo4j'>(defaultGraphEngine || 'neo4j')

  // ── Crown Jewel Spotlight (2026-06-22) ───────────────────────────
  // Click a CJ-tagged Resource on TFM → Spotlight enters with that jewel.
  // URL contract: ?cj=<id-or-arn> for Aggregate; ?cj=… &path=<path_id> for
  // Drill. Real data only — the strip fetches from the live by-crown-jewel
  // proxy via useCrownJewelConvergence; no mock, no hardcoded paths.
  const [spotlightJewel, setSpotlightJewel] = useState<CrownJewelSummary | null>(null)
  const [spotlightPathId, setSpotlightPathId] = useState<string | null>(null)

  // Hydrate Spotlight from URL on first mount + system change so deep-links
  // (Slack-shared URLs) land directly on the Spotlight view.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const u = new URL(window.location.href)
      const cj = u.searchParams.get('cj')
      const pathId = u.searchParams.get('path')
      if (!cj) {
        setSpotlightJewel(null)
        setSpotlightPathId(null)
        return
      }
      // Reconstruct a minimal CrownJewelSummary — the hook reads id /
      // canonical_id / name. Name and type fields display in the strip
      // until the real graph data arrives; using cj itself as the
      // human-readable identifier is honest (the operator pasted it).
      const isArn = cj.startsWith('arn:')
      setSpotlightJewel({
        id: cj,
        canonical_id: isArn ? cj : null,
        name: cj,
        type: 'resource',
        severity: 'LOW',
        path_count: 0,
        highest_risk_score: 0,
        is_internet_exposed: false,
        data_classification: null,
        priority_score: 0,
      })
      setSpotlightPathId(pathId)
    } catch {
      // No-op — URL parse error shouldn't break the page.
    }
  }, [systemName])

  // Push current Spotlight selection back into the URL (no full nav).
  // Sticky: shareable via copy-link, survives refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const u = new URL(window.location.href)
      if (spotlightJewel) {
        u.searchParams.set('cj', spotlightJewel.canonical_id || spotlightJewel.id)
        if (spotlightPathId) {
          u.searchParams.set('path', spotlightPathId)
        } else {
          u.searchParams.delete('path')
        }
      } else {
        u.searchParams.delete('cj')
        u.searchParams.delete('path')
      }
      window.history.replaceState(null, '', u.toString())
    } catch {
      // No-op.
    }
  }, [spotlightJewel?.id, spotlightJewel?.canonical_id, spotlightPathId])

  const handleEnterSpotlight = useCallback(
    (cj: { id: string; arn?: string | null; name: string; type: string }) => {
      setSpotlightJewel({
        id: cj.id,
        canonical_id: cj.arn ?? (cj.id.startsWith('arn:') ? cj.id : null),
        name: cj.name,
        type: cj.type,
        severity: 'LOW',
        path_count: 0,
        highest_risk_score: 0,
        is_internet_exposed: false,
        data_classification: null,
        priority_score: 0,
      })
      setSpotlightPathId(null)
    },
    [],
  )

  const handleResetSpotlight = useCallback(() => {
    setSpotlightJewel(null)
    setSpotlightPathId(null)
  }, [])

  // v1.2 (2026-06-22): single fetch shared between strip + TFM canvas
  // dimming. Hook returns null data when jewel is null — no fetch fires,
  // no waste. Strip is now pure presentational (receives data as props),
  // and TFM gets spotlightActiveNodeIds derived from the same response.
  const spotlightConvergence = useCrownJewelConvergence(
    spotlightJewel ? systemName : null,
    spotlightJewel,
    spotlightPathId,
  )

  // System-wide Crown Jewel list — drives BOTH the always-on amber crown
  // badge on CJ resource nodes in TFM AND the picker affordance on the
  // Topology tab when no Spotlight is currently open. Before 2026-06-22
  // CJs only got the crown badge when `applyPathFilter` ran on them, so
  // operators viewing the default System Map had no visual way to tell
  // which resources were jewels — and they had to drill from the home
  // dashboard to even reach the Spotlight strip.
  //
  // Real data: hits the per-system IAP endpoint (same source as the
  // home dashboard's Top Damage Paths card via the /all fan-out) and
  // keeps the full `crown_jewels[]` list so the picker can render rich
  // rows (severity, paths count, priority score). `systemCrownJewelIds`
  // is derived from the list — we add BOTH `id` and `canonical_id`
  // because the graph stores some CJs by id (resource_id) and some by
  // canonical ARN, depending on which collector wrote the node, and the
  // TFM resource map can key on either.
  // 2026-06-23: migrated to `useCachedFetch` for stale-while-revalidate.
  // The IAP backend is intermittently 502'ing under DB saturation, and
  // the previous plain-`fetch` version surfaced every cold-cycle miss
  // as "CROWN JEWELS — COULDN'T LOAD" — even when the operator had a
  // perfectly good list cached in localStorage from a minute ago.
  // Now the picker:
  //   - Renders cached jewels immediately on every visit (no skeleton flash)
  //   - Reads `isStale=true` when displaying older-than-fresh data so it
  //     can surface an "as of N ago, refreshing" indicator
  //   - On fresh-fetch failure (502/timeout): keeps showing the cached
  //     list (up to 7 days old, the hook's hard cap) instead of vanishing
  //   - Only surfaces an error to the picker UI when there's NO cached
  //     fallback at all (true first-ever visit)
  //
  // Net: operators on alon-prod stop seeing "couldn't load" the moment
  // their browser has visited once, regardless of what the backend's
  // doing right now. Real data discipline preserved — cached jewels
  // came from a real successful past response.
  type IapResponseShape = {
    result?: { crown_jewels?: CrownJewelSummary[] }
    data?: { crown_jewels?: CrownJewelSummary[] }
    crown_jewels?: CrownJewelSummary[]
  }
  const iapUrl = systemName
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`
    : null
  const {
    data: iapData,
    loading: iapLoading,
    error: iapError,
    isStale: iapIsStale,
    retry: retryCrownJewels,
  } = useCachedFetch<IapResponseShape>(iapUrl, {
    cacheKey: `iap-cj-list:${systemName}`,
    maxStaleMs: 10 * 60 * 1000, // 10 min fresh window
    fetchInit: { cache: 'no-store' },
  })
  const systemCrownJewels = useMemo<CrownJewelSummary[]>(() => {
    // Envelope shape varies by deploy: `{result: {crown_jewels}}`,
    // `{data: {crown_jewels}}`, or flat `{crown_jewels}`. Accept all
    // three — empty array if none match.
    const cjs =
      iapData?.result?.crown_jewels ??
      iapData?.data?.crown_jewels ??
      iapData?.crown_jewels ??
      []
    return Array.isArray(cjs) ? cjs : []
  }, [iapData])
  // Treat the in-flight retry state as "still loading" so the picker
  // doesn't vanish between Retry-click and response. useCachedFetch
  // doesn't reset its internal `loading` on retry (it stays false after
  // first fetch resolved/rejected), so without this gate the parent's
  // "render picker if loading || error || hasData" predicate evaluates
  // false during retry-in-flight and the picker disappears entirely.
  const crownJewelsLoading =
    iapLoading || (iapUrl !== null && iapData === null && iapError === null)
  const crownJewelsError = iapError
  const crownJewelsIsStale = iapIsStale
  const systemCrownJewelIds = useMemo<Set<string>>(() => {
    const out = new Set<string>()
    for (const cj of systemCrownJewels) {
      if (cj?.id) out.add(String(cj.id))
      if (cj?.canonical_id) out.add(String(cj.canonical_id))
    }
    return out
  }, [systemCrownJewels])

  // Set of node IDs the TFM canvas should keep lit when Spotlight is
  // active; every node NOT in this set is dimmed (ghosted). Two scoping
  // modes — single-path takes precedence over union:
  //
  //   1. `spotlightPathId` set → ONLY the nodes on that specific path.
  //      Operator clicked a path row in the strip; they want to see
  //      that one path on the canvas, not the union of all paths to
  //      the CJ. This is the bug we hit at 2026-06-22 — the strip's
  //      path picker switched the kill-chain visualization in the
  //      strip, but the canvas kept dimming to the union, so picking
  //      path 1/6 vs path 2/6 made no visible canvas difference.
  //
  //   2. `spotlightPathId` null → union of every path to the CJ.
  //      The "show me how reachable this jewel is" view; no specific
  //      path picked yet (first-mount via ?cj=, no &path=).
  //
  // Real-data only: every id comes from the live by-crown-jewel
  // response. Empty set when Spotlight is off → TFM renders normally.
  const spotlightActiveNodeIds = useMemo<Set<string>>(() => {
    const out = new Set<string>()
    const data = spotlightConvergence.data
    if (!data?.paths || data.paths.length === 0) return out
    const pathsToRender = spotlightPathId
      ? data.paths.filter((p) => p.path_id === spotlightPathId)
      : data.paths
    for (const p of pathsToRender) {
      if (p.source) out.add(p.source)
      if (p.identity) out.add(p.identity)
      if (p.cj_target_id) out.add(p.cj_target_id)
      for (const h of p.hops || []) {
        if (h.node_id) out.add(h.node_id)
      }
    }
    // Always include the selected CJ itself (defensive — cj_target_id
    // is usually populated but the field is optional in the type).
    if (spotlightJewel) {
      out.add(spotlightJewel.id)
      if (spotlightJewel.canonical_id) out.add(spotlightJewel.canonical_id)
    }
    return out
  }, [spotlightConvergence.data, spotlightJewel, spotlightPathId])

  // Auto-select the first path the moment convergence data lands.
  // Without this, `spotlightPathId` stays null until the operator
  // explicitly clicks a row in the strip — and so the canvas dims to
  // the UNION of every path to the CJ even though the kill-chain in
  // the strip is already showing path 1 (the strip auto-defaults to
  // paths[0] when no selectedPathId). That mismatch confused operators
  // who expected "open spotlight → see this one path on canvas." Now
  // the URL gets &path=<first_id> on first paint and the single-path
  // canvas filter applies from the start. Operator can still pick a
  // different path; clicking ANY row updates `spotlightPathId` via
  // the existing onSelectPath handler.
  useEffect(() => {
    if (!spotlightJewel) return
    if (spotlightPathId) return
    const paths = spotlightConvergence.data?.paths
    if (!paths || paths.length === 0) return
    setSpotlightPathId(paths[0].path_id)
  }, [spotlightConvergence.data, spotlightJewel, spotlightPathId])

  // Update graph engine when prop changes
  useEffect(() => {
    if (defaultGraphEngine) {
      setGraphEngine(defaultGraphEngine)
    }
  }, [defaultGraphEngine])
  
  // Clear highlight path when switching views
  useEffect(() => {
    if (highlightPath && onHighlightPathClear) {
      // Clear after a delay to allow the graph to render
      const timer = setTimeout(() => {
        onHighlightPathClear()
      }, 5000) // Clear after 5 seconds
      return () => clearTimeout(timer)
    }
  }, [highlightPath, onHighlightPathClear])
  
  const handleGraphEngineChange = (engine: 'logical' | 'architectural' | 'observed' | 'comprehensive' | 'neo4j') => {
    setGraphEngine(engine)
    if (onGraphEngineChange) {
      onGraphEngineChange(engine)
    }
  }
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [graphData, setGraphData] = useState<any>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [syncJobId, setSyncJobId] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ step: number; total: number; message: string; percent: number } | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const syncPollingRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch graph data
  const fetchGraphData = useCallback(async () => {
    setIsLoading(true)
    setResourcesLoading(true)
    try {
      console.log('[DependencyMapTab] Fetching graph data for system:', systemName, 'search:', searchQuery)

      // Add client-side timeout to prevent infinite loading (60s for cold starts)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('[DependencyMapTab] Request timeout - aborting')
        controller.abort('Request timeout after 60 seconds')
      }, 60000) // 60 second client timeout for cold starts

      // Build URL with optional search parameter. Params MUST match the
      // ones TFM uses at traffic-flow-map.tsx:6892 (`includeUnused=true`,
      // `maxNodes=300`) so both consumers hit the SAME proxy cache key
      // — without this both call /api/proxy/dependency-map/full with
      // different query strings, the proxy treats them as separate
      // cache entries, and the (already-saturated) Neo4j runs the same
      // dependency-map query twice per page load. (Audit 2026-06-22 P4.)
      let url = `/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}&includeUnused=true&maxNodes=300`
      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`
      }

      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      })

      clearTimeout(timeoutId)
      console.log('[DependencyMapTab] Response status:', res.status, res.ok)
      if (res.ok) {
        const data = await res.json()
        console.log('[DependencyMapTab] Graph data received:', {
          nodesCount: data.nodes?.length || 0,
          edgesCount: data.edges?.length || 0,
          hasNodes: !!data.nodes,
          hasEdges: !!data.edges,
          dataKeys: Object.keys(data)
        })
        
        // Ensure we have valid data structure
        const validData = {
          nodes: data.nodes || [],
          edges: data.edges || [],
          ...data
        }
        setGraphData(validData)
        console.log('[DependencyMapTab] ✅ Graph data set:', {
          nodes: validData.nodes?.length || 0,
          edges: validData.edges?.length || 0,
          systemName: validData.system_name,
          dataSources: validData.data_sources
        })
        
        // Extract resources from graph nodes
        const resourceList: Resource[] = (validData.nodes || []).map((n: any) => ({
          id: n.id,
          name: n.name || n.id,
          type: n.type,
          arn: n.arn
        }))
        console.log('[DependencyMapTab] Extracted resources:', resourceList.length)
        setResources(resourceList)
        setIsLoading(false) // Explicitly set loading to false on success
        setResourcesLoading(false)
      } else {
        const errorText = await res.text()
        console.error('[DependencyMapTab] Response not OK:', res.status, errorText)
        
        // Set empty data structure to prevent infinite loading
        setGraphData({ nodes: [], edges: [] })
        setResources([])
        setResourcesLoading(false)
      }
    } catch (e: any) {
      console.error('[DependencyMapTab] Failed to fetch graph data:', e)
      
      // Check if it's a timeout
      if (e.name === 'AbortError' || e.message?.includes('timeout')) {
        console.warn('[DependencyMapTab] Request timed out, using empty data')
        setGraphData({ nodes: [], edges: [] })
        setResources([])
        setIsLoading(false)
        setResourcesLoading(false)
        return
      }
      
      // Set empty data to prevent infinite loading
      console.warn('[DependencyMapTab] Graph fetch failed, setting empty data')
      setGraphData({ nodes: [], edges: [] })
      setResources([])
      setResourcesLoading(false)
    } finally {
      // Always set loading to false, even on error
      setIsLoading(false)
      setResourcesLoading(false)
    }
  }, [systemName, searchQuery])

  // Fetch resources separately if not loaded from graph
  const fetchResources = useCallback(async () => {
    if (resources.length > 0) return

    setResourcesLoading(true)
    try {
      // Use dependency-map endpoint to get resources (same as fetchGraphData).
      // Params aligned with TFM (`includeUnused=true`, `maxNodes=300`) so the
      // proxy cache key matches and a Resource-View switch after a Graph-View
      // load gets a near-instant cache hit instead of paying the heavy query
      // a second time. (Audit 2026-06-22 P4.)
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}&includeUnused=true&maxNodes=300`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      })
      if (res.ok) {
        const data = await res.json()
        const resourceList: Resource[] = (data.nodes || []).map((n: any) => ({
          id: n.id,
          name: n.name || n.id,
          type: n.type,
          arn: n.arn
        }))
        console.log('[DependencyMapTab] fetchResources got', resourceList.length, 'resources')
        setResources(resourceList)
        // Also set graph data if not already set
        if (!graphData || graphData.nodes?.length === 0) {
          setGraphData({ nodes: data.nodes || [], edges: data.edges || [] })
        }
      }
    } catch (e) {
      console.error('Failed to fetch resources:', e)
    } finally {
      setResourcesLoading(false)
    }
  }, [systemName, resources.length, graphData])

  useEffect(() => {
    // Graph view: TrafficFlowMap owns dep-map fetch via useCachedFetch.
    // Skipping here removes a duplicate heavy Neo4j call per Topology mount.
    if (activeView !== 'resource') {
      setIsLoading(false)
      return
    }
    fetchGraphData()
  }, [fetchGraphData, activeView])

  useEffect(() => {
    if (activeView === 'resource' && resources.length === 0) {
      fetchResources()
    }
  }, [activeView, fetchResources, resources.length])

  // Handle node click from graph view
  const handleNodeClick = useCallback((nodeId: string, nodeType: string, nodeName: string) => {
    const resource = resources.find(r => r.id === nodeId) || {
      id: nodeId,
      name: nodeName,
      type: nodeType
    }
    setSelectedResource(resource)
    setActiveView('resource')
  }, [resources])

  // Handle resource selection
  const handleSelectResource = useCallback((resource: Resource) => {
    setSelectedResource(resource)
  }, [])

  // Handle back to graph
  const handleBackToGraph = useCallback(() => {
    setActiveView('graph')
  }, [])

  // Poll for sync job status
  const pollSyncStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/proxy/collectors/sync-all/status/${jobId}`, {
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        console.log('[DependencyMapTab] Status check failed, will retry')
        return
      }

      const data = await response.json()
      setSyncProgress({
        step: data.current_step,
        total: data.total_steps,
        message: data.message,
        percent: data.progress_percent
      })

      if (data.status === 'completed') {
        setSyncing(false)
        setSyncJobId(null)
        if (syncPollingRef.current) {
          clearInterval(syncPollingRef.current)
          syncPollingRef.current = null
        }

        const results = data.results || {}
        setSyncMessage({
          type: 'success',
          text: `Synced: ${results.flow_logs?.relationships_created || 0} traffic, ${results.cloudtrail?.events_processed || 0} events`
        })

        // Refresh the graph data
        setTimeout(() => fetchGraphData(), 1000)
        setTimeout(() => setSyncMessage(null), 8000)
      } else if (data.status === 'failed') {
        setSyncing(false)
        setSyncJobId(null)
        if (syncPollingRef.current) {
          clearInterval(syncPollingRef.current)
          syncPollingRef.current = null
        }
        setSyncMessage({
          type: 'error',
          text: data.error || 'Sync failed'
        })
        setTimeout(() => setSyncMessage(null), 8000)
      }
    } catch (error) {
      console.log('[DependencyMapTab] Status poll error (sync still running)')
    }
  }, [fetchGraphData])

  // Sync from AWS - fetches latest data from AWS and updates Neo4j
  const handleSyncFromAWS = useCallback(async () => {
    setSyncing(true)
    setSyncMessage(null)
    setSyncProgress(null)

    try {
      const response = await fetch('/api/proxy/collectors/sync-all/start?days=2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.job_id) {
        console.log('[DependencyMapTab] Sync job started:', data.job_id)
        setSyncJobId(data.job_id)
        setSyncProgress({ step: 0, total: 7, message: 'Starting sync...', percent: 0 })

        // Start polling for status
        syncPollingRef.current = setInterval(() => pollSyncStatus(data.job_id), 3000)
        pollSyncStatus(data.job_id)
      } else if (data.existing_job_id) {
        // Job already running
        console.log('[DependencyMapTab] Sync job already running:', data.existing_job_id)
        setSyncJobId(data.existing_job_id)
        setSyncProgress({ step: data.current_step || 0, total: 7, message: data.message || 'Sync in progress...', percent: Math.round(((data.current_step || 0) / 7) * 100) })

        syncPollingRef.current = setInterval(() => pollSyncStatus(data.existing_job_id), 3000)
      } else {
        throw new Error(data.error || 'Failed to start sync')
      }
    } catch (error) {
      console.error('[DependencyMapTab] Sync failed:', error)
      setSyncing(false)
      setSyncMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Sync failed'
      })
      setTimeout(() => setSyncMessage(null), 5000)
    }
  }, [pollSyncStatus])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current)
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full min-h-[700px]">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between px-1 py-3 mb-4">
        <div className="flex items-center gap-3">
          {/* Main View Toggle */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setActiveView('graph')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === 'graph'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-4 h-4" />
              Graph View
            </button>
            <button
              onClick={() => setActiveView('resource')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === 'resource'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4" />
              Resource View
            </button>
          </div>

          {/* Graph engine toggle retired 2026-06-22: Full Map (the
              `comprehensive` AWSArchitectureDiagram) is dropped. System
              Map (TrafficFlowMap) is the only engine in the graph view,
              so a one-option toggle is noise. graphEngine state stays
              for backwards-compat with the defaultGraphEngine prop. */}
        </div>

        {/* Right side: Search + Description + Sync button */}
        <div className="flex items-center gap-4">
          {/* Search Box */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchQuery(searchInput)
                  }
                }}
                className="pl-9 pr-4 py-2 w-48 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setSearchQuery(searchInput)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Search
            </button>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                }}
                className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-sm text-slate-500">
            {activeView === 'graph' ? (
              <span>
                System Map • Animated data flows with real-time updates • Drag to pan, scroll to zoom
              </span>
            ) : (
              <span>Detailed dependency breakdown of a single resource</span>
            )}
          </div>

          {/* Sync from AWS button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncFromAWS}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  Sync from AWS
                </>
              )}
            </button>

            {/* Progress indicator */}
            {syncing && syncProgress && (
              <div className="flex items-center gap-2 bg-[#3b82f610] px-3 py-1.5 rounded-lg border border-[#3b82f640]">
                <div className="w-24 bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${syncProgress.percent}%` }}
                  />
                </div>
                <span className="text-xs text-[#3b82f6] font-medium whitespace-nowrap">
                  {syncProgress.step}/{syncProgress.total}
                </span>
              </div>
            )}

            {syncMessage && (
              <div className={`flex items-center gap-1.5 text-sm ${syncMessage.type === 'success' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {syncMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{syncMessage.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 h-[650px]">
        {activeView === 'graph' ? (
          // Full Map (AWSArchitectureDiagram) retired 2026-06-22 —
          // TrafficFlowMap is the sole engine inside the graph view.
          <React.Suspense fallback={
            <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-white text-sm font-medium">Loading Traffic Flow Map...</p>
                <p className="text-slate-400 text-xs mt-1">Connecting to Neo4j</p>
              </div>
            </div>
          }>
            <div className="flex flex-col h-full">
              {/* Crown Jewel Spotlight strip — renders above TFM when an
                  operator has clicked a CJ-tagged Resource node, or when
                  the URL carries ?cj=… on first load. Real-data only:
                  the strip fetches /api/proxy/attack-paths/<system>/
                  by-crown-jewel via useCrownJewelConvergence.
                  2026-06-23: picker now renders ALWAYS (above the spotlight)
                  so operators can switch CJs in 2 clicks from anywhere
                  instead of having to Reset → re-trigger picker → click.
                  The picker's dropdown highlights the current selection
                  so it doubles as a "current CJ" indicator. */}
              {(crownJewelsLoading || crownJewelsError || systemCrownJewels.length > 0) && (
                <CJPickerStrip
                  crownJewels={systemCrownJewels}
                  loading={crownJewelsLoading}
                  error={crownJewelsError}
                  onRetry={retryCrownJewels}
                  onSelect={(cj) =>
                    handleEnterSpotlight({
                      id: cj.id,
                      arn: cj.canonical_id ?? null,
                      name: cj.name,
                      type: cj.type,
                    })
                  }
                />
              )}
              {spotlightJewel && (
                <CJSpotlightStrip
                  jewel={spotlightJewel}
                  selectedPathId={spotlightPathId}
                  onSelectPath={setSpotlightPathId}
                  onReset={handleResetSpotlight}
                  data={spotlightConvergence.data}
                  loading={spotlightConvergence.loading}
                  error={spotlightConvergence.error}
                  retry={spotlightConvergence.retry}
                />
              )}
              <div className="flex-1 min-h-0">
                <TrafficFlowMap
                  systemName={systemName}
                  onCrownJewelSpotlight={handleEnterSpotlight}
                  spotlightActiveNodeIds={
                    spotlightActiveNodeIds.size > 0 ? spotlightActiveNodeIds : undefined
                  }
                  systemCrownJewelIds={
                    systemCrownJewelIds.size > 0 ? systemCrownJewelIds : undefined
                  }
                />
              </div>
            </div>
          </React.Suspense>
        ) : (
          <ResourceView
            systemName={systemName}
            selectedResource={selectedResource}
            resources={resources}
            resourcesLoading={resourcesLoading}
            onSelectResource={handleSelectResource}
            onBackToGraph={handleBackToGraph}
          />
        )}
      </div>
    </div>
  )
}
