'use client'

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
  Eye,
  EyeOff,
  FileJson,
  AlertCircle,
  Shield,
} from 'lucide-react'
import { useArchitectureData } from '@/hooks/useArchitectureData'

// AWS Icon mapping with fallback
let AWSIconComponents: any = {}
if (typeof window !== 'undefined') {
  try {
    const awsIcons = require('react-aws-icons')
    AWSIconComponents = awsIcons.default || awsIcons
  } catch (e) {
    console.warn('react-aws-icons not available, using fallback icons')
  }
}

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
  const iconName = iconMap[type] || type
  const Icon = AWSIconComponents[`${iconName}Icon`] || AWSIconComponents[iconName]
  return Icon || null
}

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
}

interface Props {
  systemName: string
  graphData?: any
  isLoading?: boolean
  onNodeClick: (nodeId: string, nodeType: string, nodeName: string) => void
  onRefresh?: () => void
  highlightPath?: { source: string; target: string; port?: string }
}

interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

interface SVGNode {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  parent?: string
  data: any
}

interface SVGEdge {
  id: string
  source: string
  target: string
  type: string
  port?: string
  protocol?: string
  data: any
}

// Improved layout: Left-to-right flow by resource type
function calculateLayout(nodes: SVGNode[], edges: SVGEdge[], width: number, height: number): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>()
  
  // Define functional lanes (left to right)
  const laneOrder: Record<string, number> = {
    'Internet': 0,
    'External': 0,
    'ALB': 1,
    'LoadBalancer': 1,
    'SecurityGroup': 2,
    'EC2': 3,
    'Lambda': 3,
    'ECS': 3,
    'RDS': 4,
    'DynamoDB': 4,
    'S3Bucket': 4,
    'S3': 4,
    'VPC': 0.5, // Containers in middle
    'Subnet': 0.5,
  }
  
  // Group nodes by lane
  const lanes: Record<number, SVGNode[]> = {}
  const defaultLane = 2.5 // Default for unknown types
  
  nodes.forEach(node => {
    const lane = laneOrder[node.type] ?? defaultLane
    if (!lanes[lane]) lanes[lane] = []
    lanes[lane].push(node)
  })
  
  // Calculate positions by lane
  const laneCount = Object.keys(lanes).length
  const laneWidth = (width - 200) / Math.max(laneCount, 1)
  const startX = 100
  
  Object.entries(lanes).forEach(([laneStr, laneNodes]) => {
    const lane = parseFloat(laneStr)
    const x = startX + lane * laneWidth
    const nodeHeight = 120
    const spacing = 20
    const totalHeight = laneNodes.length * (nodeHeight + spacing)
    const startY = (height - totalHeight) / 2
    
    laneNodes.forEach((node, i) => {
      // For containers (VPC/Subnet), use different sizing
      if (node.data.isContainer) {
        positions.set(node.id, {
          x: x - (node.width || 400) / 2,
          y: startY + i * (nodeHeight + spacing),
          width: node.width || 400,
          height: node.height || 300,
        })
      } else {
        positions.set(node.id, {
          x: x - (node.width || 120) / 2,
          y: startY + i * (nodeHeight + spacing),
          width: node.width || 120,
          height: node.height || 100,
        })
      }
    })
  })
  
  // Fine-tune with force-directed for better edge routing
  for (let iter = 0; iter < 50; iter++) {
    const forces = new Map<string, { x: number; y: number }>()
    nodes.forEach(node => {
      forces.set(node.id, { x: 0, y: 0 })
    })
    
    // Attraction along edges (keep connected nodes close)
    edges.forEach(edge => {
      const sourcePos = positions.get(edge.source)
      const targetPos = positions.get(edge.target)
      if (!sourcePos || !targetPos) return
      
      const dx = targetPos.x - sourcePos.x
      const dy = targetPos.y - sourcePos.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const idealDist = 200 // Ideal distance between connected nodes
      const force = (dist - idealDist) * 0.01
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      
      const fSource = forces.get(edge.source)!
      const fTarget = forces.get(edge.target)!
      fSource.x += fx
      fSource.y += fy
      fTarget.x -= fx
      fTarget.y -= fy
    })
    
    // Apply forces (light damping to preserve lane structure)
    const damping = 0.05
    nodes.forEach(node => {
      const pos = positions.get(node.id)!
      const force = forces.get(node.id)!
      pos.x += force.x * damping
      pos.y += force.y * damping
      
      // Keep within bounds
      pos.x = Math.max(50, Math.min(width - 50, pos.x))
      pos.y = Math.max(50, Math.min(height - 50, pos.y))
    })
  }
  
  return positions
}

function GraphViewX6Component({
  systemName,
  graphData: propGraphData,
  isLoading: propIsLoading,
  onNodeClick,
  onRefresh: propOnRefresh,
  highlightPath,
}: Props) {
  const [isClient, setIsClient] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped')
  const [showAllowedPaths, setShowAllowedPaths] = useState(true)
  const [showEmptyState, setShowEmptyState] = useState(false)
  const [showRiskPanel, setShowRiskPanel] = useState(false)
  const [riskAnalysis, setRiskAnalysis] = useState<any>(null)
  
  // Pan and zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  
  // Fetch data
  const shouldUseHook = !propGraphData
  const { data: architectureData, isLoading: hookIsLoading, error, refetch, dataSources } = useArchitectureData(
    shouldUseHook ? systemName : ''
  )
  
  const graphData = propGraphData || architectureData
  const isLoading = propIsLoading !== undefined ? propIsLoading : (shouldUseHook ? hookIsLoading : false)
  const onRefresh = propOnRefresh || refetch

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Grace period for empty state
  useEffect(() => {
    if (isLoading) {
      setShowEmptyState(false)
      return
    }
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      const timer = setTimeout(() => setShowEmptyState(true), 2000)
      return () => clearTimeout(timer)
    } else {
      setShowEmptyState(false)
    }
  }, [graphData, isLoading])

  // Process nodes and edges
  const { svgNodes, svgEdges, nodePositions } = useMemo(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) {
      return { svgNodes: [], svgEdges: [], nodePositions: new Map() }
    }

    const width = containerRef.current?.offsetWidth || 1200
    const height = containerRef.current?.offsetHeight || 800

    // Filter nodes: Remove IAMPolicy noise, keep only important resources
    const filteredNodes = (graphData.nodes || []).filter((n: any) => {
      // Filter out IAMPolicy nodes (too noisy, show only IAMRole)
      if (n.type === 'IAMPolicy') return false
      
      // Filter by search query
      if (searchQuery && !n.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      
      return true
    })

    // Build VPC and Subnet maps
    const vpcMap = new Map<string, any>()
    const subnetMap = new Map<string, any>()
    
    filteredNodes.forEach((n: any) => {
      if (n.type === 'VPC') {
        vpcMap.set(n.id, n)
      } else if (n.type === 'Subnet') {
        subnetMap.set(n.id, n)
      }
    })

    // Create SVG nodes
    const nodes: SVGNode[] = []
    
    // Add VPC containers
    vpcMap.forEach((vpc, vpcId) => {
      nodes.push({
        id: `vpc-${vpcId}`,
        name: vpc.name || vpcId,
        type: 'VPC',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        data: { ...vpc, isContainer: true },
      })
    })

    // Add Subnet containers
    subnetMap.forEach((subnet, subnetId) => {
      const vpcId = subnet.vpc_id || subnet.vpcId
      const parentVpcId = vpcId ? `vpc-${vpcId}` : undefined
      const subnetType = subnet.subnet_type || subnet.subnetType || 'private'
      
      nodes.push({
        id: `subnet-${subnetId}`,
        name: subnet.name || subnetId,
        type: 'Subnet',
        x: 0,
        y: 0,
        width: 350,
        height: 250,
        parent: parentVpcId,
        data: { ...subnet, isContainer: true, subnetType },
      })
    })

    // Add resource nodes
    filteredNodes.forEach((n: any) => {
      if (n.type === 'VPC' || n.type === 'Subnet') return
      
      const subnetId = n.subnet_id || n.subnetId
      const vpcId = n.vpc_id || n.vpcId
      let parent: string | undefined = undefined
      
      if (subnetId && subnetMap.has(subnetId)) {
        parent = `subnet-${subnetId}`
      } else if (vpcId && vpcMap.has(vpcId)) {
        parent = `vpc-${vpcId}`
      }

      nodes.push({
        id: n.id,
        name: n.name || n.id,
        type: n.type,
        x: 0,
        y: 0,
        width: 120,
        height: 100,
        parent,
        data: n,
      })
    })

    // Create edges
    const edges: SVGEdge[] = []
    ;(graphData.edges || []).forEach((e: any) => {
      const edgeType = e.type || e.edge_type || e.relationship_type || 'default'
      
      if (edgeType === 'ALLOWED' && !showAllowedPaths) return
      if (edgeType === 'IN_VPC' || edgeType === 'IN_SUBNET') return // Handled by containment
      
      const sourceId = vpcMap.has(e.source) ? `vpc-${e.source}` :
                      subnetMap.has(e.source) ? `subnet-${e.source}` : e.source
      const targetId = vpcMap.has(e.target) ? `vpc-${e.target}` :
                      subnetMap.has(e.target) ? `subnet-${e.target}` : e.target

      edges.push({
        id: e.id || `e-${e.source}-${e.target}`,
        source: sourceId,
        target: targetId,
        type: edgeType,
        port: e.port,
        protocol: e.protocol,
        data: e,
      })
    })

    // Calculate layout
    const positions = calculateLayout(nodes, edges, width, height)

    return { svgNodes: nodes, svgEdges: edges, nodePositions: positions }
  }, [graphData, searchQuery, showAllowedPaths])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left mouse button
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    })
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.2, Math.min(4, prev * delta)))
  }, [])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(4, prev * 1.2))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(0.2, prev / 1.2))
  }, [])

  const handleFit = useCallback(() => {
    if (!containerRef.current) return
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }, [])

  // Export graph to JSON for Cynto analysis
  const handleExportJSON = useCallback(() => {
    if (!graphData) return
    
    const exportData = {
      systemName,
      timestamp: new Date().toISOString(),
      nodes: graphData.nodes || [],
      edges: graphData.edges || [],
      stats: {
        totalNodes: graphData.nodes?.length || 0,
        totalEdges: graphData.edges?.length || 0,
        nodeTypes: (graphData.nodes || []).reduce((acc: Record<string, number>, n: any) => {
          acc[n.type] = (acc[n.type] || 0) + 1
          return acc
        }, {}),
        edgeTypes: (graphData.edges || []).reduce((acc: Record<string, number>, e: any) => {
          const type = e.type || e.edge_type || 'unknown'
          acc[type] = (acc[type] || 0) + 1
          return acc
        }, {}),
      },
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cynto-graph-${systemName}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [graphData, systemName])

  // Analyze risks in the graph
  const analyzeRisks = useCallback(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) return null

    const risks: any[] = []
    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    // Risk 1: Internet → EC2 → FullAccess → S3
    const internetNodes = nodes.filter((n: any) => n.type === 'Internet' || n.name?.toLowerCase().includes('internet'))
    const ec2Nodes = nodes.filter((n: any) => n.type === 'EC2')
    const s3Nodes = nodes.filter((n: any) => n.type === 'S3Bucket' || n.type === 'S3')
    
    internetNodes.forEach((internet: any) => {
      edges.forEach((e: any) => {
        if (e.source === internet.id && ec2Nodes.some((ec2: any) => ec2.id === e.target)) {
          const ec2 = ec2Nodes.find((ec2: any) => ec2.id === e.target)
          edges.forEach((e2: any) => {
            if (e2.source === ec2.id && s3Nodes.some((s3: any) => s3.id === e2.target)) {
              const s3 = s3Nodes.find((s3: any) => s3.id === e2.target)
              risks.push({
                type: 'internet_to_s3',
                severity: 'high',
                path: [internet.name || internet.id, ec2.name || ec2.id, s3.name || s3.id],
                description: `Internet → EC2 → S3: Public access to S3 bucket via EC2 instance`,
                remediation: 'Move EC2 to private subnet, restrict S3 bucket policy',
              })
            }
          })
        }
      })
    })

    // Risk 2: Public subnets with sensitive resources
    const publicSubnets = nodes.filter((n: any) => 
      n.type === 'Subnet' && (n.subnet_type === 'public' || n.subnetType === 'public')
    )
    publicSubnets.forEach((subnet: any) => {
      const resourcesInSubnet = nodes.filter((n: any) => 
        (n.subnet_id === subnet.id || n.subnetId === subnet.id) && 
        (n.type === 'RDS' || n.type === 'DynamoDB')
      )
      if (resourcesInSubnet.length > 0) {
        risks.push({
          type: 'public_subnet_sensitive',
          severity: 'high',
          path: [subnet.name || subnet.id, ...resourcesInSubnet.map((r: any) => r.name || r.id)],
          description: `Sensitive resources (${resourcesInSubnet.map((r: any) => r.type).join(', ')}) in public subnet`,
          remediation: 'Move resources to private subnet',
        })
      }
    })

    // Risk 3: IAM roles with wildcard permissions
    const iamRoles = nodes.filter((n: any) => n.type === 'IAMRole')
    iamRoles.forEach((role: any) => {
      if (role.data?.policy?.includes('*') || role.name?.toLowerCase().includes('fullaccess')) {
        risks.push({
          type: 'wildcard_permissions',
          severity: 'medium',
          path: [role.name || role.id],
          description: `IAM Role with wildcard permissions: ${role.name || role.id}`,
          remediation: 'Apply least-privilege policy based on CloudTrail usage',
        })
      }
    })

    // Risk 4: Security Groups with open ports
    const securityGroups = nodes.filter((n: any) => n.type === 'SecurityGroup')
    securityGroups.forEach((sg: any) => {
      const openPorts = edges.filter((e: any) => 
        (e.source === sg.id || e.target === sg.id) && 
        e.type === 'ALLOWED' && 
        (e.port === '0.0.0.0/0' || e.port === '*')
      )
      if (openPorts.length > 0) {
        risks.push({
          type: 'open_security_group',
          severity: 'medium',
          path: [sg.name || sg.id],
          description: `Security Group with open ports: ${sg.name || sg.id}`,
          remediation: 'Restrict to specific IPs/CIDRs based on ACTUAL_TRAFFIC',
        })
      }
    })

    return {
      totalRisks: risks.length,
      highSeverity: risks.filter((r: any) => r.severity === 'high').length,
      mediumSeverity: risks.filter((r: any) => r.severity === 'medium').length,
      risks: risks.slice(0, 10), // Top 10 risks
    }
  }, [graphData])

  // Calculate risk analysis when graph data changes
  useEffect(() => {
    if (graphData && showRiskPanel) {
      const analysis = analyzeRisks()
      setRiskAnalysis(analysis)
    }
  }, [graphData, showRiskPanel, analyzeRisks])

  // Render node
  const renderNode = useCallback((node: SVGNode) => {
    const pos = nodePositions.get(node.id)
    if (!pos) return null

    const x = (pos.x + pan.x) * zoom
    const y = (pos.y + pan.y) * zoom
    const width = pos.width * zoom
    const height = pos.height * zoom
    const isSelected = selectedNode === node.id
    const IconComponent = getAWSIcon(node.type)
    const Icon = IconComponent || Layers
    const color = AWS_COLORS[node.type] || '#6B7280'

    if (node.data.isContainer) {
      const isSubnet = node.type === 'Subnet'
      const subnetType = node.data.subnetType || 'private'
      let containerBg = `${color}15`
      let containerBorder = color
      
      if (isSubnet) {
        if (subnetType === 'public') {
          containerBg = '#f0fff4'
          containerBorder = '#22c55e'
        } else if (subnetType === 'private') {
          containerBg = '#ebf8ff'
          containerBorder = '#3b82f6'
        } else if (subnetType === 'database') {
          containerBg = '#e0f2fe'
          containerBorder = '#0ea5e9'
        }
      }

      return (
        <g key={node.id}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={containerBg}
            stroke={containerBorder}
            strokeWidth={3 * zoom}
            strokeDasharray={`${5 * zoom} ${5 * zoom}`}
            rx={8 * zoom}
            onClick={() => setSelectedNode(node.id)}
            style={{ cursor: 'pointer' }}
          />
          <text
            x={x + 10 * zoom}
            y={y + 20 * zoom}
            fontSize={14 * zoom}
            fontWeight="bold"
            fill="#333"
          >
            {node.name}
          </text>
          <text
            x={x + 10 * zoom}
            y={y + 40 * zoom}
            fontSize={12 * zoom}
            fill="#666"
          >
            {node.type}
          </text>
        </g>
      )
    }

    return (
      <g key={node.id} onClick={() => onNodeClick(node.id, node.type, node.name)} style={{ cursor: 'pointer' }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="#ffffff"
          stroke={isSelected ? '#fbbf24' : color}
          strokeWidth={(isSelected ? 4 : 2) * zoom}
          rx={8 * zoom}
        />
        <foreignObject x={x} y={y} width={width} height={height}>
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
          }}>
            {IconComponent ? (
              <Icon size={32} color={color} />
            ) : (
              <Layers size={32} color={color} />
            )}
            <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
              {node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name}
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
              {node.type}
            </div>
          </div>
        </foreignObject>
      </g>
    )
  }, [nodePositions, pan, zoom, selectedNode, onNodeClick])

  // Render edge
  const renderEdge = useCallback((edge: SVGEdge) => {
    const sourcePos = nodePositions.get(edge.source)
    const targetPos = nodePositions.get(edge.target)
    if (!sourcePos || !targetPos) return null

    const x1 = (sourcePos.x + sourcePos.width / 2 + pan.x) * zoom
    const y1 = (sourcePos.y + sourcePos.height / 2 + pan.y) * zoom
    const x2 = (targetPos.x + targetPos.width / 2 + pan.x) * zoom
    const y2 = (targetPos.y + targetPos.height / 2 + pan.y) * zoom

    const isActualTraffic = edge.type === 'ACTUAL_TRAFFIC'
    const isHighlighted = highlightPath && (
      (edge.source === highlightPath.source && edge.target === highlightPath.target) ||
      (edge.source === highlightPath.target && edge.target === highlightPath.source)
    ) && (!highlightPath.port || edge.port === highlightPath.port)

    const strokeColor = isHighlighted ? '#fbbf24' :
                        isActualTraffic ? '#10b981' : '#94a3b8'
    const strokeWidth = (isHighlighted ? 6 : isActualTraffic ? 4 : 2) * zoom
    const strokeDasharray = isActualTraffic ? '0' : `${5 * zoom} ${5 * zoom}`
    const markerId = `arrowhead-${strokeColor.replace('#', '')}`

    return (
      <g key={edge.id}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          markerEnd={`url(#${markerId})`}
          style={isActualTraffic ? {
            animation: 'flowing 2s linear infinite',
          } : undefined}
        />
        {edge.port && (
          <text
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2 - 5 * zoom}
            fontSize={10 * zoom}
            fill="#333"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {edge.protocol || 'TCP'}/{edge.port}
          </text>
        )}
      </g>
    )
  }, [nodePositions, pan, zoom, highlightPath])

  if (!isClient) {
    return <div className="flex items-center justify-center h-full">Loading...</div>
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-500 mb-4" />
        <p className="text-gray-600">Loading real infrastructure data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-8 w-8 text-red-500 mb-4" />
        <p className="text-red-600 mb-2">Failed to Load Data</p>
        <p className="text-gray-600 text-sm mb-4">{error}</p>
        <button
          onClick={() => onRefresh?.()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    )
  }

  if (showEmptyState || !graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Info className="h-8 w-8 text-gray-400 mb-4" />
        <p className="text-gray-600">No Resources Found</p>
        <p className="text-gray-500 text-sm mt-2">No infrastructure data available for this system.</p>
      </div>
    )
  }

  const width = containerRef.current?.offsetWidth || 1200
  const height = containerRef.current?.offsetHeight || 800

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          />
          <button
            onClick={() => setShowAllowedPaths(!showAllowedPaths)}
            className={`px-3 py-1 text-sm rounded ${showAllowedPaths ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            {showAllowedPaths ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showAllowedPaths ? ' Hide Allowed' : ' Show Allowed'}
          </button>
          <button
            onClick={handleExportJSON}
            className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600 flex items-center gap-2"
            title="Export graph to JSON for Cynto analysis"
          >
            <FileJson className="w-4 h-4" />
            Export JSON
          </button>
          <button
            onClick={() => setShowRiskPanel(!showRiskPanel)}
            className={`px-3 py-1 text-sm rounded flex items-center gap-2 ${
              showRiskPanel ? 'bg-red-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Show risk analysis panel"
          >
            <Shield className="w-4 h-4" />
            Risk Analysis
            {riskAnalysis && riskAnalysis.totalRisks > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-600 rounded-full text-xs">
                {riskAnalysis.totalRisks}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleFit} className="p-2 hover:bg-gray-100 rounded">
            <Maximize2 className="w-4 h-4" />
          </button>
          {onRefresh && (
            <button onClick={() => onRefresh()} className="p-2 hover:bg-gray-100 rounded">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Risk Analysis Panel */}
      {showRiskPanel && (
        <div className="absolute top-20 right-4 w-96 max-h-[600px] bg-white border border-gray-300 rounded-lg shadow-xl z-50 overflow-y-auto">
          <div className="p-4 border-b bg-red-50">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                Risk Analysis
              </h3>
              <button
                onClick={() => setShowRiskPanel(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {riskAnalysis && (
              <div className="mt-2 text-sm">
                <div className="flex gap-4">
                  <span className="text-red-600 font-semibold">
                    {riskAnalysis.highSeverity} High
                  </span>
                  <span className="text-yellow-600 font-semibold">
                    {riskAnalysis.mediumSeverity} Medium
                  </span>
                  <span className="text-gray-600">
                    {riskAnalysis.totalRisks} Total
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="p-4">
            {riskAnalysis && riskAnalysis.risks && riskAnalysis.risks.length > 0 ? (
              <div className="space-y-3">
                {riskAnalysis.risks.map((risk: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border-l-4 ${
                      risk.severity === 'high'
                        ? 'bg-red-50 border-red-500'
                        : 'bg-yellow-50 border-yellow-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle
                            className={`w-4 h-4 ${
                              risk.severity === 'high' ? 'text-red-600' : 'text-yellow-600'
                            }`}
                          />
                          <span
                            className={`text-xs font-semibold uppercase ${
                              risk.severity === 'high' ? 'text-red-600' : 'text-yellow-600'
                            }`}
                          >
                            {risk.severity}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mb-1">
                          {risk.description}
                        </p>
                        <div className="text-xs text-gray-600 mb-2">
                          <span className="font-semibold">Path:</span>{' '}
                          {risk.path.join(' → ')}
                        </div>
                        <div className="text-xs bg-blue-50 p-2 rounded">
                          <span className="font-semibold text-blue-800">Remediation:</span>
                          <p className="text-blue-700 mt-1">{risk.remediation}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>No risks detected</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Graph Area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-50"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
          <defs>
            {/* Arrow markers for different edge colors */}
            <marker
              id="arrowhead-fbbf24"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#fbbf24" />
            </marker>
            <marker
              id="arrowhead-10b981"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
            </marker>
            <marker
              id="arrowhead-94a3b8"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
            </marker>
            <style>{`
              @keyframes flowing {
                0% { stroke-dashoffset: 0; }
                100% { stroke-dashoffset: 20; }
              }
            `}</style>
          </defs>
          
          {/* Render edges first (behind nodes) */}
          {svgEdges.map(renderEdge)}
          
          {/* Render nodes */}
          {svgNodes.map(renderNode)}
        </svg>

        {/* Debug Panel */}
        <div className="absolute top-4 left-4 bg-yellow-100 border border-yellow-400 rounded p-3 text-xs font-mono z-50">
          <div className="font-bold mb-2">✅ SVG Graph View</div>
          <div>Nodes: {svgNodes.length}</div>
          <div>Edges: {svgEdges.length}</div>
          <div>Zoom: {Math.round(zoom * 100)}%</div>
          <div>Pan: ({Math.round(pan.x)}, {Math.round(pan.y)})</div>
        </div>
      </div>
    </div>
  )
}

export default GraphViewX6Component
