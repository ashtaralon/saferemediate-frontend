'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'

// Dynamic imports for browser-only libraries - loaded on component mount
let Graph: any = null
let register: any = null
let dagre: any = null
let libraryLoadAttempted = false
let libraryLoadError: string | null = null

// Load libraries when component mounts (client-side only)
const loadLibraries = (): { success: boolean; error: string | null } => {
  if (typeof window === 'undefined') return { success: false, error: 'Server-side rendering' }

  // Don't retry if we already attempted and failed
  if (libraryLoadAttempted && libraryLoadError) {
    return { success: false, error: libraryLoadError }
  }

  libraryLoadAttempted = true

  try {
    if (!Graph) {
      const x6Module = require('@antv/x6')
      Graph = x6Module.Graph
    }

    if (!register) {
      const reactShapeModule = require('@antv/x6-react-shape')
      register = reactShapeModule.register
    }

    if (!dagre) {
      dagre = require('dagre')
    }

    libraryLoadError = null
    return { success: true, error: null }
  } catch (e: any) {
    const errorMsg = e?.message || 'Failed to load graph libraries'
    console.error('[GraphViewX6] Failed to load libraries:', errorMsg)
    libraryLoadError = errorMsg
    return { success: false, error: errorMsg }
  }
}

// Import AWS icons - handle different export styles (only on client)
let AWSIconComponents: any = {}
if (typeof window !== 'undefined') {
  try {
    const awsIcons = require('react-aws-icons')
    AWSIconComponents = awsIcons.default || awsIcons
  } catch (e) {
    console.warn('react-aws-icons not available, using fallback icons')
  }
}
import {
  Shield,
  Database,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Activity,
  AlertTriangle,
  CheckCircle,
  Layers,
  Search,
  ArrowRight,
  Download,
  Play,
  Clock,
  Info,
} from 'lucide-react'

// AWS Icon mapping with fallback
const getAWSIcon = (type: string): React.ComponentType<any> | null => {
  const iconMap: Record<string, string> = {
    EC2: 'EC2',
    RDS: 'RDS',
    Lambda: 'Lambda',
    S3Bucket: 'S3',
    S3: 'S3',
    DynamoDB: 'DynamoDB',
    SecurityGroup: 'SecurityGroup',
    VPC: 'VPC',
    IAMRole: 'IAM',
    IAMPolicy: 'IAM',
  }
  
  const iconName = iconMap[type]
  if (!iconName) return null
  
  // Try to get icon from react-aws-icons
  const Icon = AWSIconComponents[iconName] || AWSIconComponents[`${iconName}Icon`]
  return Icon || null
}

// AWS Colors
const AWS_COLORS: Record<string, string> = {
  EC2: '#F58536', // Orange
  RDS: '#3F48CC', // Blue
  Lambda: '#F58536', // Orange
  S3Bucket: '#759C3E', // Green
  S3: '#759C3E',
  DynamoDB: '#3F48CC', // Blue
  SecurityGroup: '#DD344C', // Red
  VPC: '#7B2FBE', // Purple
  Subnet: '#7B2FBE',
  IAMRole: '#759C3E', // Green
  IAMPolicy: '#759C3E',
}

interface Props {
  systemName: string
  graphData: any
  isLoading: boolean
  isSlowLoading?: boolean
  onNodeClick: (nodeId: string, nodeType: string, nodeName: string) => void
  onRefresh: () => void
  highlightPath?: { source: string; target: string; port?: string }
}

// React Node Component
const ReactNodeComponent: React.FC<{ data: any }> = ({ data }) => {
  const IconComponent = getAWSIcon(data.type)
  const Icon = IconComponent || Layers
  const color = AWS_COLORS[data.type] || '#6B7280'
  const isContainer = data.isContainer || false

  if (isContainer) {
    // Color-code subnets: green for public, blue for private
    let containerBg = `${color}15`
    let containerBorder = color
    if (data.type === 'Subnet') {
      if (data.subnetType === 'public') {
        containerBg = '#f0fff4' // Light green
        containerBorder = '#22c55e'
      } else if (data.subnetType === 'private') {
        containerBg = '#ebf8ff' // Light blue
        containerBorder = '#3b82f6'
      } else if (data.subnetType === 'database') {
        containerBg = '#e0f2fe' // Light blue
        containerBorder = '#0ea5e9'
      }
    }

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `3px dashed ${containerBorder}`,
          borderRadius: '8px',
          backgroundColor: containerBg,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          position: 'relative',
        }}
      >
        {/* Label at top-left with z-index to stay on top */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            fontWeight: 'bold',
            fontSize: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '4px 8px',
            borderRadius: '4px',
            zIndex: 1000,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {data.name || data.id}
        </div>
        <div
          style={{
            position: 'absolute',
            top: '36px',
            left: '10px',
            fontSize: '12px',
            color: '#666',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '2px 8px',
            borderRadius: '4px',
            zIndex: 1000,
          }}
        >
          {data.type}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        border: `2px solid ${color}`,
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {IconComponent ? (
        <Icon size={32} color={color} />
      ) : (
        <Layers size={32} color={color} />
      )}
      <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
        {data.name || data.id}
      </div>
      <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
        {data.type}
      </div>
    </div>
  )
}

// Register React Shape will be done in useEffect after libraries load

function GraphViewX6Component({
  systemName,
  graphData,
  isLoading,
  isSlowLoading,
  onNodeClick,
  onRefresh,
  highlightPath,
}: Props) {
  const [isClient, setIsClient] = useState(false)
  const [librariesReady, setLibrariesReady] = useState(false)
  const [libError, setLibError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')

  // Only render on client and load libraries
  useEffect(() => {
    setIsClient(true)
    const result = loadLibraries()

    if (result.success) {
      setLibrariesReady(true)
      setLibError(null)
      // Register React Shape after libraries are loaded
      if (register && Graph) {
        try {
          register({
            shape: 'react-node',
            component: ReactNodeComponent,
            width: 120,
            height: 100,
          })
        } catch (e) {
          console.error('[GraphViewX6] Failed to register React shape:', e)
        }
      }
    } else {
      setLibrariesReady(false)
      setLibError(result.error)
    }
  }, [])

  // Initialize graph
  useEffect(() => {
    if (!containerRef.current || !isClient || !librariesReady || !Graph) {
      console.warn('[GraphViewX6] Skipping graph init - not ready:', {
        hasContainer: !!containerRef.current,
        isClient,
        librariesReady,
        hasGraph: !!Graph
      })
      return
    }

    try {
      const graph = new Graph({
      container: containerRef.current,
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
      background: {
        color: '#f5f5f5',
      },
      grid: {
        visible: true,
        type: 'dot',
        args: {
          color: '#e0e0e0',
          thickness: 1,
        },
      },
      // Enable embedding for containers
      embedding: {
        enabled: true,
        findParent: ({ node }) => {
          const parentId = node.getData()?.parent
          return parentId ? graph.getCellById(parentId) : null
        },
      },
      // Panning and zooming
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
      // Connection rules
      connecting: {
        router: {
          name: 'manhattan',
          args: {
            padding: 1,
          },
        },
        connector: {
          name: 'rounded',
          args: {
            radius: 8,
          },
        },
        anchor: 'center',
        connectionPoint: 'anchor',
        allowBlank: false,
        allowLoop: false,
        highlight: true,
        snap: {
          radius: 20,
        },
      },
    })

    graphRef.current = graph

    // Handle node click
    graph.on('node:click', ({ node }) => {
      const data = node.getData()
      setSelectedNode(data)
      setSelectedEdge(null)
      onNodeClick(data.id, data.type, data.name || data.id)
    })

    // Handle edge click
    graph.on('edge:click', ({ edge }) => {
      const data = edge.getData()
      setSelectedEdge(data)
      setSelectedNode(null)
    })

    // Handle blank click
    graph.on('blank:click', () => {
      setSelectedNode(null)
      setSelectedEdge(null)
    })

      return () => {
        if (graph) {
          try {
            graph.dispose()
          } catch (e) {
            console.warn('[GraphViewX6] Error disposing graph:', e)
          }
        }
      }
    } catch (error) {
      console.error('[GraphViewX6] Error initializing graph:', error)
    }
  }, [onNodeClick, isClient, librariesReady])

  // Update graph data
  useEffect(() => {
    if (!isClient || !librariesReady) return

    // Don't render if still loading or no graph instance
    if (isLoading || !Graph || !graphRef.current) {
      console.log('[GraphViewX6] Skipping graph update - not ready:', {
        hasGraph: !!graphRef.current,
        hasData: !!graphData,
        isLoading,
        isClient,
        librariesReady,
        hasGraphClass: !!Graph
      })
      return
    }

    // Handle empty or null graphData gracefully
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      console.log('[GraphViewX6] No graph data available, clearing graph')
      try {
        if (graphRef.current) {
          graphRef.current.clearCells()
        }
      } catch (e) {
        console.warn('[GraphViewX6] Error clearing empty graph:', e)
      }
      return
    }

    let highlightTimer: NodeJS.Timeout | null = null

    try {
      const graph = graphRef.current
      graph.clearCells()

      // Important resource types for grouped mode
      const importantTypes = ['EC2', 'RDS', 'Lambda', 'SecurityGroup', 'VPC', 'Subnet', 'S3Bucket', 'S3', 'DynamoDB']
      const filteredNodes = viewMode === 'grouped'
        ? (graphData.nodes || []).filter((n: any) => 
            importantTypes.includes(n.type) && n.type !== 'System' // Hide System nodes in Architectural view
          )
        : (graphData.nodes || []).filter((n: any) => n.type !== 'System') // Always hide System nodes

      // Build VPC and Subnet maps
      const vpcMap = new Map<string, any>()
      const subnetMap = new Map<string, any>()
      const vpcToSubnets = new Map<string, Set<string>>()

      filteredNodes.forEach((n: any) => {
        if (n.type === 'VPC') {
          vpcMap.set(n.id, n)
          vpcToSubnets.set(n.id, new Set())
        } else if (n.type === 'Subnet') {
          subnetMap.set(n.id, n)
          const vpcId = n.vpc_id || n.vpcId
          if (vpcId && vpcMap.has(vpcId)) {
            vpcToSubnets.get(vpcId)?.add(n.id)
          }
        }
      })

      const nodes: any[] = []
      const edges: any[] = []

      // Create VPC container nodes
      vpcMap.forEach((vpc, vpcId) => {
        const subnetCount = vpcToSubnets.get(vpcId)?.size || 0
        nodes.push({
          id: `vpc-${vpcId}`,
          shape: 'react-node',
          x: 0,
          y: 0,
          width: 500,
          height: 400,
          data: {
            id: vpcId,
            name: vpc.name || vpcId,
            type: 'VPC',
            isContainer: true,
            ...vpc,
          },
          attrs: {
            body: {
              stroke: '#22c55e',
              strokeWidth: 3,
              strokeDasharray: '5 5',
              fill: 'rgba(34, 197, 94, 0.15)',
            },
          },
        })
      })

      // Create Subnet container nodes (nested in VPCs) - Color-coded
      subnetMap.forEach((subnet, subnetId) => {
        const vpcId = subnet.vpc_id || subnet.vpcId
        const parentVpcId = vpcId ? `vpc-${vpcId}` : null
        const isPublic = subnet.public !== false
        const subnetType = subnet.type || (isPublic ? 'public' : 'private')

        // Color-code subnets: green for public, blue for private
        let subnetColor = '#3b82f6'
        let subnetFill = '#ebf8ff' // Light blue default
        if (subnetType === 'public') {
          subnetColor = '#22c55e'
          subnetFill = '#f0fff4' // Light green
        } else if (subnetType === 'database') {
          subnetColor = '#0ea5e9'
          subnetFill = '#e0f2fe' // Light blue
        }

        nodes.push({
          id: `subnet-${subnetId}`,
          shape: 'react-node',
          x: 0,
          y: 0,
          width: 350,
          height: 250,
          parent: parentVpcId,
          data: {
            id: subnetId,
            name: subnet.name || subnetId,
            type: 'Subnet',
            isContainer: true,
            subnetType,
            ...subnet,
          },
          attrs: {
            body: {
              stroke: subnetColor,
              strokeWidth: 3,
              strokeDasharray: '5 5',
              fill: subnetFill,
            },
          },
        })
      })

      // Create resource nodes
      filteredNodes.forEach((n: any) => {
        if (n.type === 'VPC' || n.type === 'Subnet') return // Already created as containers

        if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return

        let parent: string | undefined = undefined
        if (n.subnet_id || n.subnetId) {
          const subnetId = n.subnet_id || n.subnetId
          if (subnetMap.has(subnetId)) {
            parent = `subnet-${subnetId}`
          }
        } else if (n.vpc_id || n.vpcId) {
          const vpcId = n.vpc_id || n.vpcId
          if (vpcMap.has(vpcId)) {
            parent = `vpc-${vpcId}`
          }
        }

        // Categorize by functional lane
        let functionalLane: 'inbound' | 'compute' | 'data' = 'compute'
        if (n.type === 'EC2' || n.type === 'Lambda' || n.type === 'ECS') {
          functionalLane = 'compute'
        } else if (n.type === 'RDS' || n.type === 'DynamoDB' || n.type === 'S3Bucket' || n.type === 'S3') {
          functionalLane = 'data'
        } else if (n.type === 'SecurityGroup' || n.type === 'ALB' || n.type === 'LoadBalancer') {
          functionalLane = 'inbound'
        }

        nodes.push({
          id: n.id,
          shape: 'react-node',
          x: 0,
          y: 0,
          width: 120,
          height: 100,
          parent: parent,
          data: {
            ...n,
            functionalLane,
          },
        })
      })

      // Create edges
      ;(graphData.edges || []).forEach((e: any, i: number) => {
        const sourceId = vpcMap.has(e.source) ? `vpc-${e.source}` : 
                        subnetMap.has(e.source) ? `subnet-${e.source}` : e.source
        const targetId = vpcMap.has(e.target) ? `vpc-${e.target}` : 
                        subnetMap.has(e.target) ? `subnet-${e.target}` : e.target

        // Skip edges to/from hidden nodes in grouped mode
        if (viewMode === 'grouped') {
          const sourceNode = filteredNodes.find((n: any) => n.id === e.source)
          const targetNode = filteredNodes.find((n: any) => n.id === e.target)
          if (!sourceNode || !targetNode) return
        }

        const edgeType = e.type || e.edge_type || e.relationship_type || 'default'
        const isActualTraffic = edgeType === 'ACTUAL_TRAFFIC'
        const isHighlighted = highlightPath && (
          (sourceId === highlightPath.source && targetId === highlightPath.target) ||
          (sourceId === highlightPath.target && targetId === highlightPath.source)
        ) && (!highlightPath.port || e.port === highlightPath.port)

        edges.push({
          id: e.id || `e-${i}`,
          source: sourceId,
          target: targetId,
          shape: 'edge',
          data: {
            ...e,
            edgeType,
            isActualTraffic,
            isHighlighted,
          },
          attrs: {
            line: {
              stroke: isHighlighted 
                ? '#fbbf24'
                : isActualTraffic 
                ? '#10b981'
                : '#94a3b8',
              strokeWidth: isHighlighted ? 6 : isActualTraffic ? 4 : 2,
              strokeDasharray: isActualTraffic ? '0' : '5 5',
              style: {
                animation: isActualTraffic ? 'flowing 2s linear infinite' : undefined,
              },
            },
            targetMarker: {
              name: 'classic',
              size: 8,
              fill: isHighlighted 
                ? '#fbbf24'
                : isActualTraffic 
                ? '#10b981'
                : '#94a3b8',
            },
          },
          labels: e.port ? [
            {
              attrs: {
                text: {
                  text: `${e.protocol || 'TCP'}/${e.port}`,
                  fill: '#333',
                  fontSize: 10,
                },
              },
              position: {
                distance: 0.5,
              },
            },
          ] : [],
        })
      })

      // Add nodes and edges to graph
      graph.addNodes(nodes)
      graph.addEdges(edges)

      // Apply Dagre layout for left-to-right flow
      if (viewMode === 'grouped' && dagre) {
        const g = new dagre.graphlib.Graph()
        g.setDefaultEdgeLabel(() => ({}))
        g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 200, align: 'UL' })

        // Add nodes to dagre
        nodes.forEach((node) => {
          g.setNode(node.id, {
            width: node.width || 120,
            height: node.height || 100,
          })
        })

        // Add edges to dagre
        edges.forEach((edge) => {
          g.setEdge(edge.source, edge.target)
        })

        dagre.layout(g)

        // Update node positions
        g.nodes().forEach((nodeId) => {
          const node = graph.getCellById(nodeId) as any
          if (node) {
            const dagreNode = g.node(nodeId)
            node.setPosition(dagreNode.x - (node.width || 120) / 2, dagreNode.y - (node.height || 100) / 2)
          }
        })
      } else {
        // Use force-directed layout for "All" mode
        graph.layout({
          type: 'force',
          preventOverlap: true,
          nodeSize: 120,
          nodeSpacing: 100,
          edgeLength: 150,
        })
      }

      // Highlight path if provided
      if (highlightPath) {
        highlightTimer = setTimeout(() => {
          try {
            const sourceNode = graph.getCellById(highlightPath.source)
            const targetNode = graph.getCellById(highlightPath.target)
            if (sourceNode && targetNode) {
              const edge = graph.getEdges().find((e: any) => 
                (e.getSourceCell().id === highlightPath.source && e.getTargetCell().id === highlightPath.target) ||
                (e.getSourceCell().id === highlightPath.target && e.getTargetCell().id === highlightPath.source)
              )
              if (edge) {
                graph.centerContent({ padding: 100 })
                sourceNode.setAttrByPath('body/stroke', '#fbbf24')
                sourceNode.setAttrByPath('body/strokeWidth', 4)
                targetNode.setAttrByPath('body/stroke', '#fbbf24')
                targetNode.setAttrByPath('body/strokeWidth', 4)
              }
            }
          } catch (err) {
            console.warn('[GraphViewX6] Error highlighting path:', err)
          }
        }, 500)
      }
    } catch (error) {
      console.error('[GraphViewX6] Error updating graph:', error)
    }

    // Return cleanup function to clear timeout (always returned, outside try/catch)
    return () => {
      if (highlightTimer) {
        clearTimeout(highlightTimer)
      }
    }
  }, [graphData, isLoading, searchQuery, viewMode, highlightPath, isClient, librariesReady])

  // Add CSS animation for flowing traffic
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes flowing {
        0% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: 20; }
      }
      .x6-edge path {
        stroke-dasharray: 10 5;
      }
      .x6-edge[data-traffic="actual"] path {
        stroke-dasharray: 0;
        animation: flowing 2s linear infinite;
      }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  const zoom = (delta: number) => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom + delta)
    }
  }

  const fit = () => {
    graphRef.current?.centerContent({ padding: 50 })
  }

  // Don't render on server - show brief loading only during initial client hydration
  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // Show error state if libraries failed to load
  if (libError || (!librariesReady && !Graph)) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Graph Libraries Unavailable</h3>
        <p className="text-sm text-slate-500 mb-4">
          {libError || 'Unable to load graph visualization libraries'}
        </p>
        <p className="text-xs text-slate-400 mb-4">Try switching to the "Logical" view instead</p>
        <button
          onClick={() => {
            // Reset library loading state and retry
            libraryLoadAttempted = false
            libraryLoadError = null
            const result = loadLibraries()
            if (result.success) {
              setLibrariesReady(true)
              setLibError(null)
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" /> Retry Loading Libraries
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        {isSlowLoading && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-600 font-medium">Loading is taking longer than expected...</p>
            <p className="text-xs text-slate-500 mt-1">The backend may be slow or waking up from sleep</p>
            <button
              onClick={onRefresh}
              className="mt-3 px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
            >
              Cancel and Retry
            </button>
          </div>
        )}
      </div>
    )
  }

  // Show empty state if no data
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Graph Data Available</h3>
        <p className="text-sm text-slate-500 mb-4">Unable to load dependency map data for {systemName}</p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grouped' ? 'all' : 'grouped')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
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

      {/* Graph Canvas + Sidebar */}
      <div className="flex-1 flex relative">
        <div ref={containerRef} className="flex-1 bg-slate-50" style={{ minHeight: '500px' }} />
        
        {/* Active Traffic Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow-lg border">
          <div className="font-medium mb-2 text-slate-700">Connection Types</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-green-500 rounded" style={{ 
                background: 'linear-gradient(90deg, #10b981 0%, #10b981 50%, transparent 50%)',
                backgroundSize: '10px 2px',
                animation: 'flowing 2s linear infinite'
              }} />
              <span className="text-green-700 font-medium">Verified Traffic</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-purple-500" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8b5cf6' }} />
              <span className="text-slate-600">Allowed/Configured</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-yellow-500 rounded" />
              <span className="text-slate-600">Highlighted Path</span>
            </div>
          </div>
        </div>

        {/* Inspector Sidebar */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[380px] bg-white border-l p-4 overflow-y-auto">
            <button
              onClick={() => {
                setSelectedNode(null)
                setSelectedEdge(null)
              }}
              className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>

            {selectedNode && (
              <div>
                <h3 className="font-semibold text-lg mb-4">{selectedNode.name || selectedNode.id}</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-slate-500">Type:</span>
                    <p className="font-medium">{selectedNode.type}</p>
                  </div>
                  {selectedNode.arn && (
                    <div>
                      <span className="text-sm text-slate-500">ARN:</span>
                      <p className="text-xs font-mono break-all">{selectedNode.arn}</p>
                    </div>
                  )}
                  {selectedNode.lpScore !== undefined && (
                    <div>
                      <span className="text-sm text-slate-500">LP Score:</span>
                      <p className="font-medium">{selectedNode.lpScore}%</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedEdge && (
              <div>
                <h3 className="font-semibold text-lg mb-4">Connection</h3>
                <div className="space-y-3">
                  {selectedEdge.isActualTraffic && (
                    <div className="p-3 rounded-lg border-2 bg-green-50 border-green-300">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-bold uppercase text-sm text-green-700">VERIFIED TRAFFIC</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        This connection was observed in VPC Flow Logs - real traffic between these resources.
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-slate-500">Protocol:</span>
                    <p className="font-medium">{selectedEdge.protocol || 'TCP'}</p>
                  </div>
                  {selectedEdge.port && (
                    <div>
                      <span className="text-sm text-slate-500">Port:</span>
                      <p className="font-medium">{selectedEdge.port}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Export with error boundary to prevent app crashes
export default function GraphViewX6(props: Props) {
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Reset error state when props change
    setHasError(false)
    setError(null)
  }, [props.graphData, props.systemName])

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl p-8">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Graph View Error</h3>
        <p className="text-sm text-slate-600 mb-4">
          {error?.message || 'Failed to load graph view. Please try the Logical view instead.'}
        </p>
        <button
          onClick={() => {
            setHasError(false)
            setError(null)
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  try {
    return <GraphViewX6Component {...props} />
  } catch (err) {
    console.error('[GraphViewX6] Component error:', err)
    setHasError(true)
    setError(err instanceof Error ? err : new Error('Unknown error'))
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl p-8">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Graph View Error</h3>
        <p className="text-sm text-slate-600 mb-4">
          {err instanceof Error ? err.message : 'Failed to load graph view. Please try the Logical view instead.'}
        </p>
        <button
          onClick={() => {
            setHasError(false)
            setError(null)
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }
}

