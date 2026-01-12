'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Map, Search, RefreshCw, Network, Layers, Cloud, GitBranch, Activity } from 'lucide-react'
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

// Lazy load TieredLayout (Observed-first, clustered architecture view) with SSR disabled
const TieredLayout = dynamic(
  () => import('./dependency-map/tiered-layout'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
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
  defaultGraphEngine?: 'logical' | 'architectural' | 'observed'
  onGraphEngineChange?: (engine: 'logical' | 'architectural' | 'observed') => void
  onHighlightPathClear?: () => void
}

type ViewType = 'graph' | 'resource' | 'sankey'

export default function DependencyMapTab({
  systemName,
  highlightPath,
  defaultGraphEngine = DEPENDENCY_MAP_V2_ENABLED ? 'observed' : 'architectural',
  onGraphEngineChange,
  onHighlightPathClear
}: Props) {
  const [activeView, setActiveView] = useState<ViewType>('graph')
  const [graphEngine, setGraphEngine] = useState<'logical' | 'architectural' | 'observed'>(defaultGraphEngine)
  
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
  
  const handleGraphEngineChange = (engine: 'logical' | 'architectural' | 'observed') => {
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
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch graph data
  const fetchGraphData = useCallback(async () => {
    setIsLoading(true)
    setResourcesLoading(true)
    try {
      console.log('[DependencyMapTab] Fetching graph data for system:', systemName)
      
      // Add client-side timeout to prevent infinite loading
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second client timeout
      
      const res = await fetch(`/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}`, {
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
  }, [systemName])

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

  // Sync from AWS - fetches latest data from AWS and updates Neo4j
  const handleSyncFromAWS = useCallback(async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const response = await fetch('/api/proxy/collectors/sync-all?days=7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      })

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('[DependencyMapTab] Sync complete:', data)

      setSyncMessage({
        type: 'success',
        text: `Synced: ${data.results?.flow_logs?.relationships_created || 0} traffic, ${data.results?.cloudtrail?.relationships_created || 0} API calls`
      })

      // Refresh the graph data
      setTimeout(() => {
        fetchGraphData()
      }, 1000)

    } catch (error) {
      console.error('[DependencyMapTab] Sync failed:', error)
      setSyncMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Sync failed'
      })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(null), 5000)
    }
  }, [fetchGraphData])

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
          </div>

          {/* Graph Engine Toggle (only show in graph view) */}
          {activeView === 'graph' && (
            <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
              {DEPENDENCY_MAP_V2_ENABLED && (
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
                  Observed
                </button>
              )}
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
                Architectural
              </button>
            </div>
          )}
        </div>

        {/* Right side: Description + Sync button */}
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500">
            {activeView === 'sankey' ? (
              <span>Professional traffic flow visualization • Based on actual VPC Flow Logs</span>
            ) : activeView === 'graph' ? (
              <span>
                {graphEngine === 'observed'
                  ? 'Observed-first view • Only real traffic from VPC Flow Logs • No SG/IAM nodes'
                  : graphEngine === 'architectural'
                  ? 'True containment view with VPC/Subnet boxes • Left-to-right functional lanes'
                  : 'Graph theory view with all connections • Double-click a node for details'}
              </span>
            ) : (
              <span>Detailed dependency breakdown of a single resource</span>
            )}
          </div>

          {/* Sync from AWS button */}
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

          {syncMessage && (
            <span className={`text-sm ${syncMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {syncMessage.text}
            </span>
          )}
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
          graphEngine === 'observed' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-[650px] bg-slate-900 rounded-xl">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
            }>
              <TieredLayout
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
