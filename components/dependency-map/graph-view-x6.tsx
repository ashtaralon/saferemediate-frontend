'use client'

import React, { useEffect, useState, useMemo } from 'react'
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

// ============================================================================
// AWS ARCHITECTURE ICONS (SVG Paths based on official AWS icons)
// Colors follow AWS Architecture Icon guidelines
// ============================================================================

const AWS_ICON_COLORS = {
  // Compute - Orange
  EC2: { bg: '#ED7100', fg: '#ffffff' },
  Lambda: { bg: '#ED7100', fg: '#ffffff' },
  ECS: { bg: '#ED7100', fg: '#ffffff' },
  Fargate: { bg: '#ED7100', fg: '#ffffff' },
  
  // Database - Blue
  RDS: { bg: '#3B48CC', fg: '#ffffff' },
  DynamoDB: { bg: '#3B48CC', fg: '#ffffff' },
  Aurora: { bg: '#3B48CC', fg: '#ffffff' },
  ElastiCache: { bg: '#3B48CC', fg: '#ffffff' },
  
  // Storage - Green
  S3: { bg: '#3F8624', fg: '#ffffff' },
  S3Bucket: { bg: '#3F8624', fg: '#ffffff' },
  EBS: { bg: '#3F8624', fg: '#ffffff' },
  EFS: { bg: '#3F8624', fg: '#ffffff' },
  
  // Networking - Purple
  VPC: { bg: '#8C4FFF', fg: '#ffffff' },
  Subnet: { bg: '#8C4FFF', fg: '#ffffff' },
  InternetGateway: { bg: '#8C4FFF', fg: '#ffffff' },
  NAT: { bg: '#8C4FFF', fg: '#ffffff' },
  ALB: { bg: '#8C4FFF', fg: '#ffffff' },
  ELB: { bg: '#8C4FFF', fg: '#ffffff' },
  CloudFront: { bg: '#8C4FFF', fg: '#ffffff' },
  Route53: { bg: '#8C4FFF', fg: '#ffffff' },
  APIGateway: { bg: '#8C4FFF', fg: '#ffffff' },
  
  // Security - Red
  SecurityGroup: { bg: '#DD344C', fg: '#ffffff' },
  WAF: { bg: '#DD344C', fg: '#ffffff' },
  Shield: { bg: '#DD344C', fg: '#ffffff' },
  
  // Identity - Green/Red
  IAMRole: { bg: '#3F8624', fg: '#ffffff' },
  IAMPolicy: { bg: '#7AA116', fg: '#ffffff' },
  IAMUser: { bg: '#3F8624', fg: '#ffffff' },
  
  // Management - Pink
  CloudWatch: { bg: '#E7157B', fg: '#ffffff' },
  CloudTrail: { bg: '#E7157B', fg: '#ffffff' },
  Config: { bg: '#E7157B', fg: '#ffffff' },
  
  // Application - Pink/Purple
  SNS: { bg: '#E7157B', fg: '#ffffff' },
  SQS: { bg: '#E7157B', fg: '#ffffff' },
  EventBridge: { bg: '#E7157B', fg: '#ffffff' },
  
  // Default
  default: { bg: '#232F3E', fg: '#ffffff' },
}

// AWS Icon SVG Paths (simplified versions of official icons)
const AWSIconPaths: Record<string, string> = {
  // EC2 - Server with CPU
  EC2: 'M4 4h16v16H4V4zm2 2v12h12V6H6zm3 2h6v2H9V8zm0 4h6v2H9v-2z',
  
  // Lambda - Lambda symbol
  Lambda: 'M12 2L2 22h20L12 2zm0 5l6 12H6l6-12z',
  
  // RDS - Database cylinder
  RDS: 'M12 2C6.48 2 2 4.24 2 7v10c0 2.76 4.48 5 10 5s10-2.24 10-5V7c0-2.76-4.48-5-10-5zm0 13c-4.41 0-8-1.79-8-4V9.5c1.83 1.23 4.78 2 8 2s6.17-.77 8-2V11c0 2.21-3.59 4-8 4z',
  
  // DynamoDB - Table with lightning
  DynamoDB: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm4 3h6v2H9V8zm0 4h6v2H9v-2zm0 4h4v2H9v-2z',
  
  // S3 - Bucket
  S3: 'M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.5L18 8l-6 3.5L6 8l6-3.5zM5 9.5l6 3.5v6l-6-3.5v-6zm14 0v6l-6 3.5v-6l6-3.5z',
  
  // VPC - Cloud with network
  VPC: 'M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-4-4h3V9h2v4h3l-4 4z',
  
  // Subnet - Network segment
  Subnet: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6zm-3-5h2v6h-2V9z',
  
  // SecurityGroup - Shield
  SecurityGroup: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  
  // IAMRole - Person with key
  IAMRole: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm6-6h4v2h-3v3h-2v-3h-1V8h2z',
  
  // IAMPolicy - Document with checkmark
  IAMPolicy: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-2 16l-4-4 1.41-1.41L12 15.17l4.59-4.58L18 12l-6 6zm0-10V3.5L17.5 9H12z',
  
  // InternetGateway - Globe with arrows
  InternetGateway: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  
  // ALB - Load balancer
  ALB: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  
  // CloudWatch - Eye/Monitor
  CloudWatch: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  
  // Default - AWS logo simplified
  default: 'M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.5L18 8v8l-6 3-6-3V8l6-3.5z',
}

interface Props {
  systemName: string
  graphData: any
  isLoading: boolean
  onNodeClick: (id: string, type: string, name: string) => void
  onRefresh: () => void
  highlightPath?: { source: string; target: string; port?: string }
}

interface NodePosition {
  id: string
  x: number
  y: number
  width: number
  height: number
  data: any
}

// AWS Icon Component
const AWSIcon = ({ type, size = 24 }: { type: string; size?: number }) => {
  const colors = AWS_ICON_COLORS[type as keyof typeof AWS_ICON_COLORS] || AWS_ICON_COLORS.default
  const path = AWSIconPaths[type] || AWSIconPaths.default
  
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill={colors.bg} />
      <path d={path} fill={colors.fg} transform="scale(0.7) translate(5, 5)" />
    </svg>
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
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Calculate node positions using improved layout
  const { nodes, edges, typeGroups } = useMemo(() => {
    if (!graphData?.nodes?.length) {
      return { nodes: [], edges: [], typeGroups: {} }
    }

    // Core infrastructure types - filter out IAMPolicy noise
    const coreTypes = ['EC2', 'RDS', 'Lambda', 'S3Bucket', 'S3', 'DynamoDB', 'VPC', 'Subnet', 'InternetGateway', 'NAT', 'ALB', 'ELB', 'ECS', 'Fargate']
    const securityTypes = ['SecurityGroup', 'IAMRole', 'WAF']
    const importantTypes = [...coreTypes, ...securityTypes]
    
    let filteredNodes = viewMode === 'grouped'
      ? graphData.nodes.filter((n: any) => importantTypes.includes(n.type) && n.type !== 'System' && n.type !== 'IAMPolicy')
      : graphData.nodes.filter((n: any) => n.type !== 'System')

    if (searchQuery) {
      filteredNodes = filteredNodes.filter((n: any) => 
        n.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.type?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Group by type for lane-based layout (left to right flow)
    const typeOrder = ['InternetGateway', 'ALB', 'ELB', 'SecurityGroup', 'EC2', 'Lambda', 'ECS', 'IAMRole', 'RDS', 'DynamoDB', 'S3', 'S3Bucket', 'VPC', 'Subnet']
    const byType: Record<string, any[]> = {}
    
    filteredNodes.forEach((n: any) => {
      const type = n.type || 'Other'
      if (!byType[type]) byType[type] = []
      byType[type].push(n)
    })

    const nodeWidth = 180
    const nodeHeight = 70
    const xGap = 220
    const yGap = 95
    const startX = 120
    const startY = 80
    const maxNodesPerColumn = 10

    const positionedNodes: NodePosition[] = []
    let columnIndex = 0

    // Sort types by the defined order for left-to-right flow
    const sortedTypes = Object.keys(byType).sort((a, b) => {
      const aIdx = typeOrder.indexOf(a)
      const bIdx = typeOrder.indexOf(b)
      return (aIdx === -1 ? 100 : aIdx) - (bIdx === -1 ? 100 : bIdx)
    })

    const typeGroupsData: Record<string, { startX: number; endX: number; color: string; count: number }> = {}

    sortedTypes.forEach((type) => {
      const typeNodes = byType[type]
      const columnsNeeded = Math.ceil(typeNodes.length / maxNodesPerColumn)
      const colors = AWS_ICON_COLORS[type as keyof typeof AWS_ICON_COLORS] || AWS_ICON_COLORS.default
      
      const groupStartX = startX + columnIndex * xGap - 20
      
      typeNodes.forEach((node, nodeIndex) => {
        const col = Math.floor(nodeIndex / maxNodesPerColumn)
        const row = nodeIndex % maxNodesPerColumn
        
        positionedNodes.push({
          id: node.id,
          x: startX + (columnIndex + col) * xGap,
          y: startY + row * yGap,
          width: nodeWidth,
          height: nodeHeight,
          data: node,
        })
      })
      
      typeGroupsData[type] = {
        startX: groupStartX,
        endX: startX + (columnIndex + columnsNeeded) * xGap + nodeWidth,
        color: colors.bg,
        count: typeNodes.length,
      }
      
      columnIndex += columnsNeeded + 0.3 // Gap between type groups
    })

    // Create edges
    const nodeIds = new Set(positionedNodes.map(n => n.id))
    const positionedEdges = (graphData.edges || [])
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: any, i: number) => ({
        ...e,
        id: e.id || `edge-${i}`,
        isActualTraffic: e.is_used !== false && (e.traffic_bytes > 0 || e.confidence > 0.5),
      }))

    return { nodes: positionedNodes, edges: positionedEdges, typeGroups: typeGroupsData }
  }, [graphData, viewMode, searchQuery])

  // Get node position by ID
  const getNodePos = (id: string) => nodes.find(n => n.id === id)

  // Mouse handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as HTMLElement).tagName === 'svg') {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.max(0.2, Math.min(3, z + delta)))
    }
  }

  const handleNodeClick = (node: NodePosition) => {
    setSelectedNode(node.data)
    setSelectedEdge(null)
    onNodeClick(node.data.id, node.data.type, node.data.name || node.data.id)
  }

  const handleEdgeClick = (edge: any) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-600">Loading architecture data...</span>
      </div>
    )
  }

  // No data state
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Architecture Data</h3>
        <p className="text-sm text-slate-500 mb-4">No resources found for {systemName}</p>
        <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border overflow-hidden">
      {/* Status Bar */}
      <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-emerald-700">✅ AWS Architecture View</span>
          <span className="text-slate-600">Nodes: <strong>{nodes.length}</strong></span>
          <span className="text-slate-600">Connections: <strong>{edges.length}</strong></span>
          <span className="text-slate-600">Zoom: {(zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span>Ctrl+Scroll to zoom</span>
          <span>•</span>
          <span>Drag to pan</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grouped' ? 'all' : 'grouped')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'grouped' 
                ? 'bg-purple-600 text-white hover:bg-purple-700' 
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            {viewMode === 'grouped' ? 'Core Resources' : 'All Resources'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="h-6 w-px bg-slate-300" />
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 hover:bg-slate-200 rounded transition-colors" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-slate-200 rounded transition-colors" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={resetView} className="p-1.5 hover:bg-slate-200 rounded transition-colors" title="Fit to View">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 flex relative overflow-hidden">
        <div 
          className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ minHeight: '500px' }}
        >
          <svg 
            width="100%" 
            height="100%" 
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Grid pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#cbd5e1" />
              </pattern>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
              <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
              </marker>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15"/>
              </filter>
            </defs>
            <rect width="4000" height="3000" fill="url(#grid)" />

            {/* Type Group Labels */}
            {Object.entries(typeGroups).map(([type, group]) => (
              <g key={`group-${type}`}>
                <text
                  x={group.startX + 10}
                  y={50}
                  fill={group.color}
                  fontSize="12"
                  fontWeight="600"
                  opacity="0.8"
                >
                  {type} ({group.count})
                </text>
                <line
                  x1={group.startX}
                  y1={60}
                  x2={group.endX - 40}
                  y2={60}
                  stroke={group.color}
                  strokeWidth="2"
                  opacity="0.3"
                />
              </g>
            ))}

            {/* Edges */}
            {edges.map((edge: any) => {
              const source = getNodePos(edge.source)
              const target = getNodePos(edge.target)
              if (!source || !target) return null

              const x1 = source.x + source.width
              const y1 = source.y + source.height / 2
              const x2 = target.x
              const y2 = target.y + target.height / 2

              // Create curved path for better visibility
              const midX = (x1 + x2) / 2
              const pathD = `M ${x1} ${y1} Q ${midX} ${y1} ${midX} ${(y1 + y2) / 2} Q ${midX} ${y2} ${x2} ${y2}`

              const isHighlighted = highlightPath && 
                highlightPath.source === edge.source && 
                highlightPath.target === edge.target

              return (
                <g key={edge.id} onClick={() => handleEdgeClick(edge)} style={{ cursor: 'pointer' }}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isHighlighted ? '#eab308' : edge.isActualTraffic ? '#10b981' : '#94a3b8'}
                    strokeWidth={isHighlighted ? 4 : edge.isActualTraffic ? 2 : 1}
                    strokeDasharray={edge.isActualTraffic ? '0' : '5 5'}
                    markerEnd={edge.isActualTraffic ? 'url(#arrowhead-green)' : 'url(#arrowhead)'}
                    opacity={edge.isActualTraffic ? 1 : 0.6}
                  />
                  {/* Invisible wider path for easier clicking */}
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="15" />
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const colors = AWS_ICON_COLORS[node.data.type as keyof typeof AWS_ICON_COLORS] || AWS_ICON_COLORS.default
              const iconPath = AWSIconPaths[node.data.type] || AWSIconPaths.default
              const isSelected = selectedNode?.id === node.data.id

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Card background with shadow */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="8"
                    fill="white"
                    stroke={isSelected ? '#3b82f6' : colors.bg}
                    strokeWidth={isSelected ? 3 : 2}
                    filter="url(#shadow)"
                  />
                  
                  {/* AWS Icon */}
                  <rect
                    x="8"
                    y="8"
                    width="32"
                    height="32"
                    rx="6"
                    fill={colors.bg}
                  />
                  <path
                    d={iconPath}
                    fill={colors.fg}
                    transform="translate(12, 12) scale(0.8)"
                  />
                  
                  {/* Type label */}
                  <text
                    x="48"
                    y="20"
                    fill={colors.bg}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {node.data.type}
                  </text>
                  
                  {/* Resource name */}
                  <text
                    x="48"
                    y="36"
                    fill="#1e293b"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {(node.data.name || node.data.id).substring(0, 18)}
                    {(node.data.name || node.data.id).length > 18 ? '...' : ''}
                  </text>
                  
                  {/* Status indicators */}
                  {node.data.is_internet_exposed && (
                    <circle cx={node.width - 16} cy="16" r="6" fill="#ef4444" />
                  )}
                  {node.data.gap_count > 0 && (
                    <g transform={`translate(${node.width - 32}, 8)`}>
                      <rect width="20" height="14" rx="3" fill="#f59e0b" />
                      <text x="10" y="11" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">
                        {node.data.gap_count}
                      </text>
                    </g>
                  )}
                  
                  {/* Bottom info bar */}
                  <rect
                    x="0"
                    y={node.height - 18}
                    width={node.width}
                    height="18"
                    rx="0"
                    ry="0"
                    fill={colors.bg}
                    opacity="0.1"
                  />
                  <text
                    x="8"
                    y={node.height - 5}
                    fill="#64748b"
                    fontSize="9"
                  >
                    {node.data.lp_score !== undefined ? `LP: ${node.data.lp_score}%` : ''}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-4 text-xs shadow-lg border">
          <div className="font-semibold mb-3 text-slate-700">Connection Types</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="32" height="4"><line x1="0" y1="2" x2="32" y2="2" stroke="#10b981" strokeWidth="2"/></svg>
              <span className="text-emerald-700 font-medium">Verified Traffic</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="32" height="4"><line x1="0" y1="2" x2="32" y2="2" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 5"/></svg>
              <span className="text-slate-600">Allowed (No Traffic)</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="font-semibold text-slate-700">Indicators</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-600">Internet Exposed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3.5 rounded bg-amber-500 flex items-center justify-center text-white text-[8px] font-bold">3</div>
              <span className="text-slate-600">Permission Gaps</span>
            </div>
          </div>
        </div>

        {/* Inspector Sidebar */}
        {(selectedNode || selectedEdge) && (
          <div className="w-[340px] bg-white border-l shadow-lg overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                {selectedNode ? 'Resource Details' : 'Connection Details'}
              </h3>
              <button
                onClick={() => { setSelectedNode(null); setSelectedEdge(null) }}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4">
              {selectedNode && (
                <div className="space-y-4">
                  {/* Header with icon */}
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: (AWS_ICON_COLORS[selectedNode.type as keyof typeof AWS_ICON_COLORS] || AWS_ICON_COLORS.default).bg }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24">
                        <path 
                          d={AWSIconPaths[selectedNode.type] || AWSIconPaths.default} 
                          fill="white"
                          transform="scale(0.9) translate(1.5, 1.5)"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{selectedNode.name || selectedNode.id}</h4>
                      <p className="text-sm text-slate-500">{selectedNode.type}</p>
                    </div>
                  </div>
                  
                  {/* Details */}
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-slate-500 block mb-1">Resource ID</span>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded block truncate">{selectedNode.id}</code>
                    </div>
                    
                    {selectedNode.arn && (
                      <div>
                        <span className="text-slate-500 block mb-1">ARN</span>
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded block break-all">{selectedNode.arn}</code>
                      </div>
                    )}
                    
                    {selectedNode.lp_score !== undefined && (
                      <div>
                        <span className="text-slate-500 block mb-1">Least Privilege Score</span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                selectedNode.lp_score >= 80 ? 'bg-emerald-500' :
                                selectedNode.lp_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${selectedNode.lp_score}%` }}
                            />
                          </div>
                          <span className="font-semibold">{selectedNode.lp_score}%</span>
                        </div>
                      </div>
                    )}
                    
                    {selectedNode.gap_count > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center gap-2 text-amber-700 font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          {selectedNode.gap_count} Permission Gap{selectedNode.gap_count > 1 ? 's' : ''} Detected
                        </div>
                      </div>
                    )}
                    
                    {selectedNode.is_internet_exposed && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2 text-red-700 font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          Internet Exposed
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div className="space-y-4">
                  {selectedEdge.isActualTraffic && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                        <span className="text-emerald-700 font-medium">Verified Traffic Flow</span>
                      </div>
                      <p className="text-xs text-emerald-600 mt-1">Observed in VPC Flow Logs</p>
                    </div>
                  )}
                  
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-slate-500">From</span>
                      <p className="font-medium truncate">{selectedEdge.source}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">To</span>
                      <p className="font-medium truncate">{selectedEdge.target}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-500">Protocol</span>
                        <p className="font-medium">{selectedEdge.protocol || 'TCP'}</p>
                      </div>
                      {selectedEdge.port && (
                        <div>
                          <span className="text-slate-500">Port</span>
                          <p className="font-medium">{selectedEdge.port}</p>
                        </div>
                      )}
                    </div>
                    {selectedEdge.traffic_bytes > 0 && (
                      <div>
                        <span className="text-slate-500">Traffic Volume</span>
                        <p className="font-medium">{(selectedEdge.traffic_bytes / 1024).toFixed(1)} KB</p>
                      </div>
                    )}
                    {selectedEdge.confidence !== undefined && (
                      <div>
                        <span className="text-slate-500">Confidence</span>
                        <p className="font-medium">{(selectedEdge.confidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
