'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Graph } from '@antv/x6'
import { ReactShape } from '@antv/x6-react-shape'
import dagre from 'dagre'
// Import AWS icons - handle different export styles
let AWSIconComponents: any = {}
try {
  const awsIcons = require('react-aws-icons')
  // Try different import styles
  AWSIconComponents = awsIcons.default || awsIcons
} catch (e) {
  console.warn('react-aws-icons not available, using fallback icons')
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

// Register React Shape
Graph.registerReactComponent('react-node', ReactShape, true)

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
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `3px dashed ${color}`,
          borderRadius: '8px',
          backgroundColor: `${color}15`,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
          {data.name || data.id}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
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

export default function GraphViewX6({
  systemName,
  graphData,
  isLoading,
  onNodeClick,
  onRefresh,
  highlightPath,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')

  // Initialize graph
  useEffect(() => {
    if (!containerRef.current) return

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
      graph.dispose()
    }
  }, [onNodeClick])

  // Update graph data
  useEffect(() => {
    if (!graphRef.current || !graphData || isLoading) return

    const graph = graphRef.current
    graph.clearCells()

    // Important resource types for grouped mode
    const importantTypes = ['EC2', 'RDS', 'Lambda', 'SecurityGroup', 'VPC', 'Subnet', 'S3Bucket', 'S3', 'DynamoDB']
    const filteredNodes = viewMode === 'grouped'
      ? (graphData.nodes || []).filter((n: any) => importantTypes.includes(n.type))
      : (graphData.nodes || [])

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

    // Create Subnet container nodes (nested in VPCs)
    subnetMap.forEach((subnet, subnetId) => {
      const vpcId = subnet.vpc_id || subnet.vpcId
      const parentVpcId = vpcId ? `vpc-${vpcId}` : null
      const isPublic = subnet.public !== false
      const subnetType = subnet.type || (isPublic ? 'public' : 'private')

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
            stroke: '#3b82f6',
            strokeWidth: 3,
            strokeDasharray: '5 5',
            fill: subnetType === 'public' 
              ? 'rgba(34, 197, 94, 0.2)'
              : subnetType === 'database'
              ? 'rgba(59, 130, 246, 0.2)'
              : 'rgba(234, 179, 8, 0.2)',
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
    if (viewMode === 'grouped') {
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
      setTimeout(() => {
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
      }, 500)
    }
  }, [graphData, isLoading, searchQuery, viewMode, highlightPath])

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
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

