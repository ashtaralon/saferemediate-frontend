"use client"

import React, { useCallback, useEffect, useState, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'
import { RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// AWS Service Icons (simplified SVG paths)
const AWS_ICONS: Record<string, string> = {
  lambda: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  dynamodb: "M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2m0 2a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8",
  s3: "M4 4h16v16H4V4m2 2v12h12V6H6z",
  iam: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z",
  sg: "M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z",
  ec2: "M4 4h16v16H4V4m2 2v12h12V6H6z",
  rds: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  sns: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  sqs: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  kms: "M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.22 0 4.15-1.2 5.18-3h2.79l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5L22 12l-2-2h-7.35zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  vpc: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
  unknown: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z",
}

// Custom AWS Node component
const AWSNode = ({ data }: { data: any }) => {
  const iconPath = AWS_ICONS[data.icon] || AWS_ICONS.unknown
  
  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border-2 shadow-lg
        bg-white hover:shadow-xl transition-shadow
        min-w-[140px] text-center
        ${data.isSeed ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
      `}
      style={{ borderColor: data.color }}
    >
      {/* Handles for connections */}
      <Handle type="target" position={Position.Left} className="w-3 h-3" style={{ background: data.color }} />
      <Handle type="source" position={Position.Right} className="w-3 h-3" style={{ background: data.color }} />
      
      {/* Icon */}
      <div 
        className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${data.color}20` }}
      >
        <svg 
          viewBox="0 0 24 24" 
          className="w-6 h-6" 
          fill="none" 
          stroke={data.color} 
          strokeWidth="2"
        >
          <path d={iconPath} />
        </svg>
      </div>
      
      {/* Label */}
      <div className="font-medium text-sm text-gray-800 truncate max-w-[120px]" title={data.fullName}>
        {data.label}
      </div>
      
      {/* Type badge */}
      <div 
        className="text-xs mt-1 px-2 py-0.5 rounded-full inline-block"
        style={{ backgroundColor: `${data.color}20`, color: data.color }}
      >
        {data.resourceType}
      </div>
      
      {/* Seed indicator */}
      {data.isSeed && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
          SEED
        </div>
      )}
    </div>
  )
}

const nodeTypes = {
  awsNode: AWSNode,
}

// Dagre layout helper
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  const nodeWidth = 160
  const nodeHeight = 100
  
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 150 })
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })
  
  dagre.layout(dagreGraph)
  
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }
  })
  
  return { nodes, edges }
}

interface TopologyMapProps {
  systemName?: string
}

export function AWSTopologyMap({ systemName = 'alon-prod' }: TopologyMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)

  const fetchTopology = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/proxy/topology/${encodeURIComponent(systemName)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch topology: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.nodes || data.nodes.length === 0) {
        setError("No resources found. Tag some resources first.")
        setNodes([])
        setEdges([])
        return
      }
      
      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        data.nodes,
        data.edges || []
      )
      
      setNodes(layoutedNodes)
      setEdges(layoutedEdges)
      setStats({
        nodeCount: data.node_count,
        edgeCount: data.edge_count,
        categories: data.categories
      })
      
    } catch (err: any) {
      console.error('Failed to fetch topology:', err)
      setError(err.message || 'Failed to fetch topology')
    } finally {
      setLoading(false)
    }
  }, [systemName, setNodes, setEdges])

  useEffect(() => {
    fetchTopology()
  }, [fetchTopology])

  // Category legend
  const categoryColors = useMemo(() => ({
    compute: { name: 'Compute', color: '#FF9900' },
    database: { name: 'Database', color: '#4053D6' },
    storage: { name: 'Storage', color: '#569A31' },
    security: { name: 'Security', color: '#DD344C' },
    messaging: { name: 'Messaging', color: '#FF4F8B' },
    network: { name: 'Network', color: '#8C4FFF' },
    monitoring: { name: 'Monitoring', color: '#759C3E' },
  }), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-gray-50 rounded-lg">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-600">Loading topology...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="h-[600px]">
        <CardContent className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-lg mb-4">⚠️ {error}</div>
          <Button onClick={fetchTopology} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-[700px]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span>AWS Topology Map</span>
            <span className="text-sm font-normal text-gray-500">
              ({stats?.nodeCount || 0} resources, {stats?.edgeCount || 0} connections)
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchTopology}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2">
          {Object.entries(categoryColors).map(([key, { name, color }]) => (
            <div key={key} className="flex items-center gap-1 text-xs">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-600">{name}</span>
              {stats?.categories?.[key] && (
                <span className="text-gray-400">({stats.categories[key]})</span>
              )}
            </div>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="h-[calc(100%-120px)] p-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          className="bg-gray-50"
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap 
            nodeColor={(node) => node.data?.color || '#888'}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </CardContent>
    </Card>
  )
}

export default AWSTopologyMap


