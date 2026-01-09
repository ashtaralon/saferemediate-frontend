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
  Shield,
  Globe,
  Activity,
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

// AWS Icons as SVG data URIs (48x48)
const AWS_ICONS: Record<string, string> = {
  EC2: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#F58536" rx="6"/><rect x="10" y="10" width="8" height="8" fill="white" opacity="0.95"/><rect x="22" y="10" width="8" height="8" fill="white" opacity="0.95"/><rect x="10" y="22" width="8" height="8" fill="white" opacity="0.95"/><rect x="22" y="22" width="8" height="8" fill="white" opacity="0.95"/><path d="M20 10v28M10 20h28" stroke="white" strokeWidth="2" opacity="0.8"/></svg>`)}`,
  Lambda: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#F58536" rx="6"/><text x="24" y="34" font-family="Arial" font-size="32" font-weight="bold" fill="white" text-anchor="middle">λ</text></svg>`)}`,
  RDS: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#3F48CC" rx="6"/><ellipse cx="24" cy="14" rx="12" ry="5" fill="white" opacity="0.95"/><path d="M12 14v20c0 2.8 5.4 5 12 5s12-2.2 12-5V14" stroke="white" strokeWidth="2" fill="none"/><ellipse cx="24" cy="24" rx="12" ry="5" fill="none" stroke="white" strokeWidth="2"/><ellipse cx="24" cy="34" rx="12" ry="5" fill="none" stroke="white" strokeWidth="2"/></svg>`)}`,
  S3Bucket: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#759C3E" rx="6"/><path d="M12 18c0-2.2 2.2-4 5-4h14c2.8 0 5 1.8 5 4v2H12v-2zm0 4v10c0 2.2 2.2 4 5 4h14c2.8 0 5-1.8 5-4V22H12zm2 2h20v8c0 1.1-1.1 2-2.5 2h-15c-1.4 0-2.5-.9-2.5-2v-8z" fill="white" opacity="0.95"/></svg>`)}`,
  DynamoDB: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#3F48CC" rx="6"/><rect x="14" y="14" width="20" height="20" fill="none" stroke="white" strokeWidth="2.5"/><path d="M14 20h20M14 24h20M14 28h20M20 14v20M24 14v20M28 14v20" stroke="white" strokeWidth="1.5"/></svg>`)}`,
  SecurityGroup: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#DD344C" rx="6"/><path d="M24 10l-10 5v10c0 6 5 11 10 12 5-1 10-6 10-12V15l-10-5zm0 2.5l8 4v9c0 5-4 9-8 10-4-1-8-5-8-10v-9l8-4z" fill="white" opacity="0.95"/></svg>`)}`,
  IAMRole: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#759C3E" rx="6"/><path d="M24 12c-5 0-9 4-9 9v4h-4v8h8v-8h3v8h8v-8h-3v-4c0-5-4-9-9-9zm0 2.5c3.6 0 6.5 2.9 6.5 6.5v4h-13v-4c0-3.6 2.9-6.5 6.5-6.5z" fill="white" opacity="0.95"/></svg>`)}`,
  VPC: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#7B2FBE" rx="6"/><rect x="8" y="8" width="32" height="32" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="4 4"/><circle cx="18" cy="18" r="2" fill="white"/><circle cx="30" cy="18" r="2" fill="white"/><circle cx="18" cy="30" r="2" fill="white"/><circle cx="30" cy="30" r="2" fill="white"/></svg>`)}`,
  Subnet: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#7B2FBE" rx="6"/><rect x="10" y="10" width="28" height="28" fill="none" stroke="white" strokeWidth="2" strokeDasharray="3 3"/></svg>`)}`,
  Internet: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#EF4444" rx="6"/><circle cx="24" cy="24" r="12" fill="none" stroke="white" strokeWidth="3"/><path d="M24 12v24M12 24h24" stroke="white" strokeWidth="2.5"/></svg>`)}`,
}

// Helper: Format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Helper: Truncate text with ellipsis
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
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
  const [showAllowedPaths, setShowAllowedPaths] = useState(true)

  // Load libraries using dynamic import (async)
  useEffect(() => {
    setIsClient(true)
    
    const loadLibraries = async () => {
      try {
        setLoadingStatus('Loading @antv/x6...')
        console.log('[GraphViewX6] Starting dynamic import of @antv/x6...')
        
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
      return
    }
    
    if (graphRef.current) {
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

      // Create resource nodes with professional styling
      let nodeIndex = 0
      filteredNodes.forEach((n: any) => {
        if (n.type === 'VPC' || n.type === 'Subnet') return
        if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return

        const color = AWS_COLORS[n.type] || AWS_COLORS.default
        const iconUrl = AWS_ICONS[n.type] || AWS_ICONS.default || ''
        const col = nodeIndex % 4
        const row = Math.floor(nodeIndex / 4)

        // Get node metrics
        const lpScore = n.lp_score || 0
        const gapCount = n.gap_count || 0
        const permissionGaps = n.permission_gaps || 0
        const isInternetExposed = n.is_internet_exposed || false
        const nodeName = n.name || n.id
        const truncatedName = truncateText(nodeName, 18)

        // Calculate gradient based on LP score
        const lpPercent = Math.round(lpScore * 100)
        const lpColor = lpPercent >= 80 ? '#10b981' : lpPercent >= 50 ? '#f59e0b' : '#ef4444'

        nodes.push({
          id: n.id,
          x: 100 + col * 180,
          y: 100 + row * 120,
          width: 180,
          height: 120,
          shape: 'html',
          html: `
            <div style="
              width: 180px;
              height: 120px;
              background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
              border: 2px solid ${color};
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06);
              padding: 8px;
              position: relative;
              cursor: pointer;
              transition: all 0.2s;
            " onmouseover="this.style.boxShadow='0 10px 15px rgba(0,0,0,0.15), 0 4px 6px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)'">
              <!-- Icon -->
              <div style="text-align: center; margin-bottom: 4px;">
                <img src="${iconUrl}" width="48" height="48" style="border-radius: 4px;" />
              </div>
              
              <!-- Name with tooltip -->
              <div style="
                font-size: 11px;
                font-weight: 600;
                color: #1e293b;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 4px;
              " title="${nodeName}">${truncatedName}</div>
              
              <!-- LP Score Badge -->
              ${lpScore > 0 ? `
                <div style="
                  background: ${lpColor}15;
                  border: 1px solid ${lpColor};
                  border-radius: 6px;
                  padding: 2px 6px;
                  margin: 2px auto;
                  width: fit-content;
                  font-size: 9px;
                  font-weight: 600;
                  color: ${lpColor};
                ">
                  LP: ${lpPercent}%
                </div>
                <div style="
                  width: 90%;
                  height: 3px;
                  background: #e2e8f0;
                  border-radius: 2px;
                  margin: 2px auto;
                  overflow: hidden;
                ">
                  <div style="
                    width: ${lpPercent}%;
                    height: 100%;
                    background: ${lpColor};
                    transition: width 0.3s;
                  "></div>
                </div>
              ` : ''}
              
              <!-- Indicators -->
              <div style="display: flex; justify-content: center; gap: 4px; margin-top: 2px;">
                ${isInternetExposed ? '<span style="color: #ef4444; font-size: 10px;" title="Internet Exposed">🌐</span>' : ''}
                ${gapCount > 0 ? `<span style="color: #f59e0b; font-size: 10px;" title="${gapCount} gaps">⚠️</span>` : ''}
                ${permissionGaps > 0 ? `<span style="color: #ef4444; font-size: 10px;" title="${permissionGaps} permission gaps">🔒</span>` : ''}
              </div>
            </div>
          `,
          data: n,
        })
        nodeIndex++
      })

      // Create edges with animated traffic
      const nodeIds = new Set(nodes.map(n => n.id))
      ;(graphData.edges || []).forEach((e: any, index: number) => {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return

        const isActualTraffic = e.is_used !== false && (e.traffic_bytes > 0 || e.confidence > 0.5)
        
        // Skip ALLOWED edges if toggle is off
        if (!isActualTraffic && !showAllowedPaths) return

        const trafficBytes = e.traffic_bytes || 0
        const strokeWidth = isActualTraffic ? Math.max(2, Math.min(5, 2 + (trafficBytes / 1000000))) : 1
        const strokeColor = isActualTraffic ? '#10b981' : '#8b5cf6'

        edges.push({
          id: e.id || `edge-${index}`,
          source: e.source,
          target: e.target,
          attrs: {
            line: {
              stroke: strokeColor,
              strokeWidth: strokeWidth,
              strokeDasharray: isActualTraffic ? '0' : '5 5',
              targetMarker: { name: 'block', width: 8, height: 6 },
              ...(isActualTraffic && trafficBytes > 0 ? {
                style: {
                  filter: 'drop-shadow(0 0 3px rgba(16, 185, 129, 0.5))',
                  animation: 'pulse 2s ease-in-out infinite',
                }
              } : {}),
            },
          },
          data: { ...e, isActualTraffic, trafficBytes },
        })
      })

      // Add CSS animation for traffic glow
      if (!document.getElementById('graph-animations')) {
        const style = document.createElement('style')
        style.id = 'graph-animations'
        style.textContent = `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `
        document.head.appendChild(style)
      }

      console.log('[GraphViewX6] Adding', nodes.length, 'nodes and', edges.length, 'edges')
      graph.addNodes(nodes)
      graph.addEdges(edges)

      // Apply layout if dagre is available
      if (dagreRef.current && nodes.length > 0) {
        try {
          const dagreGraph = new dagreRef.current.graphlib.Graph()
          dagreGraph.setDefaultEdgeLabel(() => ({}))
          dagreGraph.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 80 })

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
  }, [graphData, librariesLoaded, isLoading, searchQuery, viewMode, showAllowedPaths])

  // Zoom controls
  const zoom = (delta: number) => {
    if (graphRef.current) {
      const current = graphRef.current.zoom()
      graphRef.current.zoom(current + delta)
    }
  }

  const fit = () => graphRef.current?.centerContent({ padding: 50 })

  // Loading state - libraries not ready
  if (!isClient || !librariesLoaded) {
    return (
      <div className="flex flex-col h-[600px] p-4">
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

  // Statistics
  const stats = {
    nodes: graphData.nodes?.length || 0,
    edges: graphData.edges?.length || 0,
    actualTraffic: graphData.edges?.filter((e: any) => e.is_used && e.traffic_bytes > 0).length || 0,
    allowedPaths: graphData.edges?.filter((e: any) => !e.is_used || e.traffic_bytes === 0).length || 0,
  }

  // Main render
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grouped' ? 'all' : 'grouped')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
              viewMode === 'grouped' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            {viewMode === 'grouped' ? 'Grouped' : 'All'}
          </button>
          <button
            onClick={() => setShowAllowedPaths(!showAllowedPaths)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
              showAllowedPaths ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700'
            }`}
          >
            <Activity className="w-4 h-4" />
            {showAllowedPaths ? 'Show Allowed' : 'Hide Allowed'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-600">
            <span className="font-semibold">Nodes:</span> {stats.nodes} | 
            <span className="font-semibold"> Connections:</span> {stats.edges} | 
            <span className="text-green-700 font-semibold"> Live:</span> {stats.actualTraffic}
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
            <button onClick={() => zoom(-0.1)} className="p-1.5 hover:bg-slate-200 rounded transition">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => zoom(0.1)} className="p-1.5 hover:bg-slate-200 rounded transition">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={fit} className="p-1.5 hover:bg-slate-200 rounded transition">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" style={{ minHeight: '500px' }} />
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg p-3 text-xs shadow-lg border">
          <div className="font-medium mb-2 text-slate-700">Connection Types</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500" />
              <span className="text-green-700 font-medium">Verified Traffic</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500 border-dashed border-t-2" />
              <span className="text-slate-600">Allowed</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[320px] bg-white border-l p-4 overflow-y-auto shadow-lg">
            <button
              onClick={() => { setSelectedNode(null); setSelectedEdge(null) }}
              className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded transition"
            >
              <X className="w-4 h-4" />
            </button>
            {selectedNode && (
              <div>
                <h3 className="font-semibold text-lg mb-3">{selectedNode.name || selectedNode.id}</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-500">Type:</span> {selectedNode.type}</div>
                  {selectedNode.lp_score !== undefined && (
                    <div>
                      <span className="text-slate-500">LP Score:</span> {Math.round(selectedNode.lp_score * 100)}%
                      <div className="w-full bg-slate-200 rounded-full h-2 mt-1">
                        <div 
                          className={`h-2 rounded-full ${
                            selectedNode.lp_score >= 0.8 ? 'bg-green-500' : 
                            selectedNode.lp_score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${selectedNode.lp_score * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {selectedNode.gap_count > 0 && (
                    <div><span className="text-slate-500">Gaps:</span> {selectedNode.gap_count}</div>
                  )}
                  {selectedNode.permission_gaps > 0 && (
                    <div><span className="text-slate-500">Permission Gaps:</span> {selectedNode.permission_gaps}</div>
                  )}
                  {selectedNode.is_internet_exposed && (
                    <div className="flex items-center gap-2 text-red-600">
                      <Globe className="w-4 h-4" />
                      <span>Internet Exposed</span>
                    </div>
                  )}
                  {selectedNode.arn && <div className="text-xs font-mono break-all text-slate-400">{selectedNode.arn}</div>}
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
                    {selectedEdge.trafficBytes > 0 && (
                      <div className="text-xs text-green-600 mt-1">
                        {formatBytes(selectedEdge.trafficBytes)}
                      </div>
                    )}
                  </div>
                )}
                <div className="text-sm space-y-1">
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

