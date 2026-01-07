'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Map, Search, RefreshCw } from 'lucide-react'
import GraphView from './dependency-map/graph-view'
import ResourceView from './dependency-map/resource-view'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Props {
  systemName: string
}

type ViewType = 'graph' | 'resource'

export default function DependencyMapTab({ systemName }: Props) {
  const [activeView, setActiveView] = useState<ViewType>('graph')
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [graphData, setGraphData] = useState<any>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resourcesLoading, setResourcesLoading] = useState(true)

  // Fetch graph data
  const fetchGraphData = useCallback(async () => {
    setIsLoading(true)
    try {
      console.log('[DependencyMapTab] Fetching graph data for system:', systemName)
      const res = await fetch(`/api/proxy/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`)
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
        setGraphData(data)
        
        // Extract resources from graph nodes
        const resourceList: Resource[] = (data.nodes || []).map((n: any) => ({
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
      }
    } catch (e) {
      console.error('[DependencyMapTab] Failed to fetch graph data:', e)
      
      // Fallback to system resources endpoint
      try {
        const fallbackRes = await fetch(`/api/proxy/system-resources/${encodeURIComponent(systemName)}`)
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
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr)
      }
    } finally {
      setIsLoading(false)
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

        {/* View description */}
        <div className="text-sm text-slate-500">
          {activeView === 'graph' ? (
            <span>Visual network graph of all resources • Double-click a node for details</span>
          ) : (
            <span>Detailed dependency breakdown of a single resource</span>
          )}
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1">
        {activeView === 'graph' ? (
          <GraphView
            systemName={systemName}
            graphData={graphData}
            isLoading={isLoading}
            onNodeClick={handleNodeClick}
            onRefresh={fetchGraphData}
          />
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
