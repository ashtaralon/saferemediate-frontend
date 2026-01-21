'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Map, Search, RefreshCw, Network, Layers, Cloud, GitBranch, Activity, CheckCircle, XCircle } from 'lucide-react'
import dynamic from 'next/dynamic'
import GraphView from './dependency-map/graph-view'
import ResourceView from './dependency-map/resource-view'

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

// Lazy load AWSArchitectureDiagram (Full Map Connections with AWS icons and force-directed layout) with SSR disabled
const AWSArchitectureDiagram = dynamic(
  () => import('./dependency-map/aws-architecture-diagram'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[700px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-400">Loading AWS Architecture...</p>
        </div>
      </div>
    )
  }
)

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
  defaultGraphEngine = 'comprehensive',
  onGraphEngineChange,
  onHighlightPathClear
}: Props) {
  const [activeView, setActiveView] = useState<ViewType>('graph')
  const [graphEngine, setGraphEngine] = useState<'logical' | 'architectural' | 'observed' | 'comprehensive' | 'neo4j'>(defaultGraphEngine || 'comprehensive')
  
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

      // Build URL with optional search parameter
      let url = `/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}`
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
      // Use dependency-map endpoint to get resources (same as fetchGraphData)
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}`, {
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
    fetchGraphData()
  }, [fetchGraphData])

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
              onClick={() => setActiveView('sankey')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === 'sankey'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              Traffic Flow
            </button>
            <button
              onClick={() => setActiveView('graph')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === 'graph'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Map className="w-4 h-4" />
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
            <button
              onClick={() => setActiveView('flows')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === 'flows'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              Full Stack Flows
            </button>
          </div>

          {/* Graph Engine Toggle (only show in graph view) */}
          {activeView === 'graph' && (
            <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => handleGraphEngineChange('comprehensive')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  graphEngine === 'comprehensive'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Comprehensive 6-Tier View - EC2, Security Groups, IAM, Databases, Storage with all edge types"
              >
                <Layers className="w-4 h-4" />
                Full Map
              </button>
              <button
                onClick={() => handleGraphEngineChange('observed')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  graphEngine === 'observed'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Observed-First View - Only real traffic from VPC Flow Logs"
              >
                <Activity className="w-4 h-4" />
                Traffic
              </button>
              <button
                onClick={() => handleGraphEngineChange('logical')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  graphEngine === 'logical'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Logical View - Graph theory layout with all connections"
              >
                <Network className="w-4 h-4" />
                Logical
              </button>
              <button
                onClick={() => handleGraphEngineChange('architectural')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  graphEngine === 'architectural'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Architectural View - True containment with functional lanes"
              >
                <Layers className="w-4 h-4" />
                Arch
              </button>
              <button
                onClick={() => handleGraphEngineChange('neo4j')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  graphEngine === 'neo4j'
                    ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Neo4j Map - Real-time animated data flows from Neo4j database"
              >
                <Activity className="w-4 h-4" />
                Neo4j
              </button>
            </div>
          )}
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
                className="pl-9 pr-4 py-2 w-48 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            {activeView === 'sankey' ? (
              <span>Professional traffic flow visualization • Based on actual VPC Flow Logs</span>
            ) : activeView === 'graph' ? (
              <span>
                {graphEngine === 'comprehensive'
                  ? 'AWS Architecture Map • Force-directed layout with official AWS icons • Click nodes for details'
                  : graphEngine === 'observed'
                  ? 'Traffic-only view • Real network flows from VPC Flow Logs'
                  : graphEngine === 'architectural'
                  ? 'True containment view with VPC/Subnet boxes • Left-to-right functional lanes'
                  : graphEngine === 'neo4j'
                  ? 'Neo4j-powered visualization • Animated data flows with real-time updates • Drag to pan, scroll to zoom'
                  : 'Graph theory view with all connections • Double-click a node for details'}
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
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
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
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                <div className="w-24 bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${syncProgress.percent}%` }}
                  />
                </div>
                <span className="text-xs text-blue-700 font-medium whitespace-nowrap">
                  {syncProgress.step}/{syncProgress.total}
                </span>
              </div>
            )}

            {syncMessage && (
              <div className={`flex items-center gap-1.5 text-sm ${syncMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {syncMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span>{syncMessage.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 h-[650px]">
        {activeView === 'sankey' ? (
          <SankeyView
            graphData={graphData}
            isLoading={isLoading}
            onNodeClick={handleNodeClick}
            onRefresh={fetchGraphData}
            showIAM={false}
            height={550}
          />
        ) : activeView === 'graph' ? (
          graphEngine === 'neo4j' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
                <div className="text-center">
                  <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white text-sm font-medium">Loading Neo4j Map...</p>
                </div>
              </div>
            }>
              <Neo4jAWSMap />
            </React.Suspense>
          ) : graphEngine === 'comprehensive' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[700px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl">
                <div className="text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-slate-400">Loading AWS Architecture...</p>
                </div>
              </div>
            }>
              <AWSArchitectureDiagram
                systemName={systemName}
                onNodeClick={(node) => handleNodeClick(node.id, node.type, node.name)}
                onRefresh={fetchGraphData}
              />
            </React.Suspense>
          ) : graphEngine === 'observed' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
            }>
              <InfrastructureFlowViz
                systemName={systemName}
                onNodeClick={(node) => handleNodeClick(node.id, node.type, node.name)}
                onRefresh={fetchGraphData}
              />
            </React.Suspense>
          ) : graphEngine === 'architectural' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            }>
              <GraphViewX6
                systemName={systemName}
                graphData={graphData}
                isLoading={isLoading}
                onNodeClick={handleNodeClick}
                onRefresh={fetchGraphData}
                highlightPath={highlightPath}
              />
            </React.Suspense>
          ) : (
            <GraphView
              systemName={systemName}
              graphData={graphData}
              isLoading={isLoading}
              onNodeClick={handleNodeClick}
              onRefresh={fetchGraphData}
            />
          )
        ) : activeView === 'flows' ? (
          <React.Suspense fallback={
            <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          }>
            <FlowStripView systemName={systemName} />
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
