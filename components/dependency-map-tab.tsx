'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Map, Search, RefreshCw, Network, Layers } from 'lucide-react'
import dynamic from 'next/dynamic'
import GraphView from './dependency-map/graph-view'
import ResourceView from './dependency-map/resource-view'

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

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Props {
  systemName: string
  highlightPath?: { source: string; target: string; port?: string }
  defaultGraphEngine?: 'logical' | 'architectural'
  onGraphEngineChange?: (engine: 'logical' | 'architectural') => void
  onHighlightPathClear?: () => void
}

type ViewType = 'graph' | 'resource'

export default function DependencyMapTab({ 
  systemName, 
  highlightPath,
  defaultGraphEngine = 'architectural',
  onGraphEngineChange,
  onHighlightPathClear
}: Props) {
  const [activeView, setActiveView] = useState<ViewType>('graph')
  const [graphEngine, setGraphEngine] = useState<'logical' | 'architectural'>(defaultGraphEngine)
  
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
  
  const handleGraphEngineChange = (engine: 'logical' | 'architectural') => {
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
        
        // Extract resources from graph nodes
        const resourceList: Resource[] = (validData.nodes || []).map((n: any) => ({
          id: n.id,
          name: n.name || n.id,
          type: n.type,
          arn: n.arn
        }))
        console.log('[DependencyMapTab] Extracted resources:', resourceList.length)
        setResources(resourceList)
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
      
      // Fallback to system resources endpoint
      try {
        const fallbackController = new AbortController()
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10000) // 10s for fallback
        
        const fallbackRes = await fetch(`/api/proxy/system-resources/${encodeURIComponent(systemName)}`, {
          signal: fallbackController.signal,
        })
        
        clearTimeout(fallbackTimeout)
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json()
          
          // Convert to graph format
          const nodes: any[] = []
          const edges: any[] = []
          
          ;(fallbackData.resources || []).forEach((r: any) => {
            nodes.push({
              id: r.resource_id || r.arn || r.name,
              name: r.name || r.resource_id,
              type: r.resource_type || r.type,
              arn: r.arn
            })
          })
          
          setGraphData({ nodes, edges })
          setResources(nodes.map(n => ({
            id: n.id,
            name: n.name,
            type: n.type,
            arn: n.arn
          })))
          setResourcesLoading(false)
        } else {
          // Fallback also failed - set empty data
          setGraphData({ nodes: [], edges: [] })
          setResources([])
          setResourcesLoading(false)
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr)
        // Set empty data structure to prevent infinite loading
        setGraphData({ nodes: [], edges: [] })
        setResources([])
        setResourcesLoading(false)
      }
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
      const res = await fetch(`/api/proxy/system-resources/${encodeURIComponent(systemName)}`)
      if (res.ok) {
        const data = await res.json()
        const resourceList: Resource[] = (data.resources || []).map((r: any) => ({
          id: r.resource_id || r.arn || r.name,
          name: r.name || r.resource_id,
          type: r.resource_type || r.type,
          arn: r.arn
        }))
        setResources(resourceList)
      }
    } catch (e) {
      console.error('Failed to fetch resources:', e)
    } finally {
      setResourcesLoading(false)
    }
  }, [systemName, resources.length])

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

        {/* View description */}
        <div className="text-sm text-slate-500">
          {activeView === 'graph' ? (
            <span>
              {graphEngine === 'architectural' 
                ? 'True containment view with VPC/Subnet boxes • Left-to-right functional lanes'
                : 'Graph theory view with all connections • Double-click a node for details'}
            </span>
          ) : (
            <span>Detailed dependency breakdown of a single resource</span>
          )}
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1">
        {activeView === 'graph' ? (
          graphEngine === 'architectural' ? (
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
