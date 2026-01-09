'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  AlertTriangle,
  CheckCircle,
  Layers,
  Search,
} from 'lucide-react'

// AWS Colors
const AWS_COLORS: Record<string, string> = {
  EC2: '#F58536',
  RDS: '#3F48CC',
  Lambda: '#F58536',
  S3Bucket: '#759C3E',
  S3: '#759C3E',
  DynamoDB: '#3F48CC',
  SecurityGroup: '#DD344C',
  VPC: '#7B2FBE',
  Subnet: '#7B2FBE',
  IAMRole: '#759C3E',
  IAMPolicy: '#759C3E',
  Internet: '#EF4444',
  default: '#64748B',
}

interface Props {
  systemName: string
  graphData: any
  isLoading: boolean
  onNodeClick: (id: string, type: string, name: string) => void
  onRefresh: () => void
  highlightPath?: { source: string; target: string; port?: string }
}

function GraphViewX6Component({
  systemName,
  graphData,
  isLoading,
  onNodeClick,
  onRefresh,
  highlightPath,
}: Props) {
  const [isClient, setIsClient] = useState(false)
  const [librariesLoaded, setLibrariesLoaded] = useState(false)
  const [libLoadError, setLibLoadError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const graphClassRef = useRef<any>(null)
  const dagreRef = useRef<any>(null)
  
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')

  // Load libraries using dynamic import (async)
  useEffect(() => {
    setIsClient(true)
    
    const loadLibraries = async () => {
      try {
        setLoadingStatus('Loading @antv/x6...')
        console.log('[GraphViewX6] Starting dynamic import of @antv/x6...')
        
        // Use dynamic import instead of require
        const x6Module = await import('@antv/x6')
        console.log('[GraphViewX6] x6Module loaded, keys:', Object.keys(x6Module))
        
        const GraphClass = x6Module.Graph
        if (!GraphClass) {
          throw new Error('Graph class not found in @antv/x6 module')
        }
        
        graphClassRef.current = GraphClass
        console.log('[GraphViewX6] Graph class stored in ref')
        
        setLoadingStatus('Loading dagre...')
        try {
          const dagreModule = await import('dagre')
          dagreRef.current = dagreModule.default || dagreModule
          console.log('[GraphViewX6] dagre loaded')
        } catch (dagreErr) {
          console.warn('[GraphViewX6] dagre failed to load (non-fatal):', dagreErr)
        }
        
        setLibrariesLoaded(true)
        setLoadingStatus('Libraries loaded!')
        console.log('[GraphViewX6] All libraries loaded successfully')
        
      } catch (err: any) {
        console.error('[GraphViewX6] Failed to load libraries:', err)
        setLibLoadError(err.message || 'Unknown error loading libraries')
        setLoadingStatus('Failed to load libraries')
      }
    }
    
    loadLibraries()
  }, [])

  // Initialize graph after libraries are loaded and container is ready
  useEffect(() => {
    if (!librariesLoaded || !graphClassRef.current || !containerRef.current) {
      console.log('[GraphViewX6] Graph init skipped:', {
        librariesLoaded,
        hasGraphClass: !!graphClassRef.current,
        hasContainer: !!containerRef.current
      })
      return
    }
    
    if (graphRef.current) {
      console.log('[GraphViewX6] Graph already initialized')
      return
    }

    try {
      console.log('[GraphViewX6] Creating graph instance...')
      const Graph = graphClassRef.current
      
      const graph = new Graph({
        container: containerRef.current,
        width: containerRef.current.offsetWidth || 800,
        height: containerRef.current.offsetHeight || 600,
        background: { color: '#f8fafc' },
        grid: {
          visible: true,
          type: 'dot',
          args: { color: '#e2e8f0', thickness: 1 },
        },
        panning: {
          enabled: true,
          eventTypes: ['leftMouseDown', 'mouseWheel'],
        },
        mousewheel: {
          enabled: true,
          zoomAtMousePosition: true,
          modifiers: 'ctrl',
          minScale: 0.2,
          maxScale: 4,
        },
        connecting: {
          router: { name: 'manhattan', args: { padding: 1 } },
          connector: { name: 'rounded', args: { radius: 8 } },
          anchor: 'center',
          connectionPoint: 'anchor',
        },
      })

      graphRef.current = graph
      console.log('[GraphViewX6] Graph instance created')

      // Event handlers
      graph.on('node:click', ({ node }: any) => {
        const data = node.getData()
        setSelectedNode(data)
        setSelectedEdge(null)
        if (data) onNodeClick(data.id, data.type, data.name || data.id)
      })

      graph.on('edge:click', ({ edge }: any) => {
        setSelectedEdge(edge.getData())
        setSelectedNode(null)
      })

      graph.on('blank:click', () => {
        setSelectedNode(null)
        setSelectedEdge(null)
      })

      return () => {
        try {
          graph.dispose()
        } catch (e) {
          console.warn('[GraphViewX6] Error disposing graph:', e)
        }
      }
    } catch (err: any) {
      console.error('[GraphViewX6] Error creating graph:', err)
      setLibLoadError('Failed to create graph: ' + err.message)
    }
  }, [librariesLoaded, onNodeClick])

  // Update graph data
  useEffect(() => {
    if (!graphRef.current || !librariesLoaded || isLoading) {
      return
    }

    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      console.log('[GraphViewX6] No data to render')
      graphRef.current?.clearCells()
      return
    }

    console.log('[GraphViewX6] Rendering', graphData.nodes.length, 'nodes')

    try {
      const graph = graphRef.current
      graph.clearCells()

      // Filter nodes
      const importantTypes = ['EC2', 'RDS', 'Lambda', 'SecurityGroup', 'VPC', 'Subnet', 'S3Bucket', 'S3', 'DynamoDB']
      const filteredNodes = viewMode === 'grouped'
        ? graphData.nodes.filter((n: any) => importantTypes.includes(n.type) && n.type !== 'System')
        : graphData.nodes.filter((n: any) => n.type !== 'System')

      // Build maps
      const vpcMap = new Map<string, any>()
      const subnetMap = new Map<string, any>()

      filteredNodes.forEach((n: any) => {
        if (n.type === 'VPC') vpcMap.set(n.id, n)
        else if (n.type === 'Subnet') subnetMap.set(n.id, n)
      })

      const nodes: any[] = []
      const edges: any[] = []

      // Create VPC containers
      vpcMap.forEach((vpc, vpcId) => {
        nodes.push({
          id: `vpc-${vpcId}`,
          x: 50,
          y: 50,
          width: 600,
          height: 400,
          shape: 'rect',
          attrs: {
            body: {
              fill: 'rgba(34, 197, 94, 0.1)',
              stroke: '#22c55e',
              strokeWidth: 2,
              strokeDasharray: '5 5',
              rx: 8,
              ry: 8,
            },
            label: {
              text: vpc.name || vpcId,
              fill: '#166534',
              fontSize: 14,
              fontWeight: 'bold',
              refX: 10,
              refY: 10,
              textAnchor: 'start',
              textVerticalAnchor: 'top',
            },
          },
          data: { ...vpc, isContainer: true },
        })
      })

      // Create resource nodes
      let nodeIndex = 0
      filteredNodes.forEach((n: any) => {
        if (n.type === 'VPC' || n.type === 'Subnet') return
        if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return

        const color = AWS_COLORS[n.type] || AWS_COLORS.default
        const col = nodeIndex % 4
        const row = Math.floor(nodeIndex / 4)

        nodes.push({
          id: n.id,
          x: 100 + col * 180,
          y: 100 + row * 120,
          width: 140,
          height: 80,
          shape: 'rect',
          attrs: {
            body: {
              fill: '#ffffff',
              stroke: color,
              strokeWidth: 2,
              rx: 8,
              ry: 8,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
            },
            label: {
              text: (n.name || n.id).substring(0, 20),
              fill: '#1e293b',
              fontSize: 11,
              fontWeight: '500',
            },
          },
          data: n,
        })
        nodeIndex++
      })

      // Create edges
      const nodeIds = new Set(nodes.map(n => n.id))
      ;(graphData.edges || []).forEach((e: any, index: number) => {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return

        const isActualTraffic = e.is_used !== false && (e.traffic_bytes > 0 || e.confidence > 0.5)

        edges.push({
          id: e.id || `edge-${index}`,
          source: e.source,
          target: e.target,
          attrs: {
            line: {
              stroke: isActualTraffic ? '#10b981' : '#8b5cf6',
              strokeWidth: isActualTraffic ? 2 : 1,
              strokeDasharray: isActualTraffic ? '0' : '5 5',
              targetMarker: { name: 'block', width: 8, height: 6 },
            },
          },
          data: { ...e, isActualTraffic },
        })
      })

      console.log('[GraphViewX6] Adding', nodes.length, 'nodes and', edges.length, 'edges')
      graph.addNodes(nodes)
      graph.addEdges(edges)

      // Apply layout if dagre is available
      if (dagreRef.current && nodes.length > 0) {
        try {
          const dagreGraph = new dagreRef.current.graphlib.Graph()
          dagreGraph.setDefaultEdgeLabel(() => ({}))
          dagreGraph.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 60 })

          nodes.forEach(node => {
            dagreGraph.setNode(node.id, { width: node.width, height: node.height })
          })
          edges.forEach(edge => {
            dagreGraph.setEdge(edge.source, edge.target)
          })

          dagreRef.current.layout(dagreGraph)

          dagreGraph.nodes().forEach((nodeId: string) => {
            const dagreNode = dagreGraph.node(nodeId)
            const graphNode = graph.getCellById(nodeId)
            if (graphNode && dagreNode) {
              graphNode.position(dagreNode.x - dagreNode.width / 2, dagreNode.y - dagreNode.height / 2)
            }
          })
        } catch (layoutErr) {
          console.warn('[GraphViewX6] Layout error:', layoutErr)
        }
      }

      setTimeout(() => graph.centerContent({ padding: 50 }), 100)

    } catch (err: any) {
      console.error('[GraphViewX6] Error rendering graph:', err)
    }
  }, [graphData, librariesLoaded, isLoading, searchQuery, viewMode])

  // Zoom controls
  const zoom = (delta: number) => {
    if (graphRef.current) {
      const current = graphRef.current.zoom()
      graphRef.current.zoom(current + delta)
    }
  }

  const fit = () => graphRef.current?.centerContent({ padding: 50 })

  // Debug panel
  const DebugPanel = () => (
    <div className="bg-yellow-100 border-2 border-yellow-500 p-3 rounded-lg mb-2 text-xs font-mono">
      <div className="font-bold text-yellow-800 mb-1">🔍 DEBUG</div>
      <div className="flex flex-wrap gap-3">
        <span>isClient: {isClient ? '✅' : '❌'}</span>
        <span>librariesLoaded: {librariesLoaded ? '✅' : '❌'}</span>
        <span>graphClass: {graphClassRef.current ? '✅' : '❌'}</span>
        <span>graphRef: {graphRef.current ? '✅' : '❌'}</span>
        <span>isLoading: {isLoading ? '⏳' : '✅'}</span>
        <span>nodes: {graphData?.nodes?.length ?? 'N/A'}</span>
      </div>
      {libLoadError && (
        <div className="mt-2 text-red-600 bg-red-50 p-2 rounded">{libLoadError}</div>
      )}
      <div className="mt-1 text-yellow-700">{loadingStatus}</div>
    </div>
  )

  // Loading state - libraries not ready
  if (!isClient || !librariesLoaded) {
    return (
      <div className="flex flex-col h-[600px] p-4">
        <DebugPanel />
        <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-xl">
          {libLoadError ? (
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Graph</h3>
              <p className="text-sm text-red-600 mb-4 max-w-md">{libLoadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Reload Page
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="ml-3 text-slate-600">{loadingStatus}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Data loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-[600px] p-4">
        <DebugPanel />
        <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-xl">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="ml-3 text-slate-600">Loading graph data...</span>
        </div>
      </div>
    )
  }

  // No data
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col h-[600px] p-4">
        <DebugPanel />
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No Graph Data</h3>
          <p className="text-sm text-slate-500 mb-4">No dependency data available for {systemName}</p>
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      <DebugPanel />
      
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grouped' ? 'all' : 'grouped')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
              viewMode === 'grouped' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            {viewMode === 'grouped' ? 'Grouped' : 'All'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-40"
            />
          </div>
          <button onClick={() => zoom(-0.1)} className="p-1.5 hover:bg-slate-200 rounded">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => zoom(0.1)} className="p-1.5 hover:bg-slate-200 rounded">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={fit} className="p-1.5 hover:bg-slate-200 rounded">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" style={{ minHeight: '500px' }} />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow-lg border">
          <div className="font-medium mb-2 text-slate-700">Connection Types</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500" />
              <span className="text-green-700">Verified Traffic</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500" style={{ borderStyle: 'dashed' }} />
              <span className="text-slate-600">Allowed</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[320px] bg-white border-l p-4 overflow-y-auto">
            <button
              onClick={() => { setSelectedNode(null); setSelectedEdge(null) }}
              className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
            {selectedNode && (
              <div>
                <h3 className="font-semibold text-lg mb-3">{selectedNode.name || selectedNode.id}</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-500">Type:</span> {selectedNode.type}</div>
                  {selectedNode.arn && <div className="text-xs font-mono break-all">{selectedNode.arn}</div>}
                </div>
              </div>
            )}
            {selectedEdge && (
              <div>
                <h3 className="font-semibold text-lg mb-3">Connection</h3>
                {selectedEdge.isActualTraffic && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded mb-3">
                    <CheckCircle className="w-4 h-4 text-green-500 inline mr-2" />
                    <span className="text-green-700 text-sm font-medium">Verified Traffic</span>
                  </div>
                )}
                <div className="text-sm">
                  <div><span className="text-slate-500">Protocol:</span> {selectedEdge.protocol || 'TCP'}</div>
                  {selectedEdge.port && <div><span className="text-slate-500">Port:</span> {selectedEdge.port}</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Export with error boundary
export default function GraphViewX6(props: Props) {
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setHasError(false)
    setError(null)
  }, [props.graphData, props.systemName])

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl p-8">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Graph View Error</h3>
        <p className="text-sm text-slate-600 mb-4">{error?.message || 'Unknown error'}</p>
        <button
          onClick={() => { setHasError(false); setError(null) }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    )
  }

  try {
    return <GraphViewX6Component {...props} />
  } catch (err) {
    console.error('[GraphViewX6] Error:', err)
    setHasError(true)
    setError(err instanceof Error ? err : new Error('Unknown error'))
    return null
  }
}
