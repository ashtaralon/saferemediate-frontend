'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'

// AWS Icon mappings using official AWS Architecture Icons (simplified SVG representations)
const AWSIcons: Record<string, React.FC<{ className?: string }>> = {
  // Compute
  EC2: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#ED7100"/>
      <rect x="12" y="12" width="24" height="24" rx="2" fill="#fff"/>
      <rect x="16" y="16" width="16" height="16" fill="#ED7100"/>
    </svg>
  ),
  Lambda: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#ED7100"/>
      <path d="M14 34l8-20h4l8 20h-4l-6-15-6 15z" fill="#fff"/>
    </svg>
  ),
  ECS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#ED7100"/>
      <circle cx="24" cy="24" r="10" fill="#fff"/>
      <circle cx="24" cy="24" r="6" fill="#ED7100"/>
    </svg>
  ),
  EKS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#ED7100"/>
      <path d="M24 12l12 7v10l-12 7-12-7V19z" fill="#fff"/>
      <path d="M24 16l8 5v6l-8 5-8-5v-6z" fill="#ED7100"/>
    </svg>
  ),

  // Database
  RDS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#3B48CC"/>
      <ellipse cx="24" cy="16" rx="12" ry="4" fill="#fff"/>
      <path d="M12 16v16c0 2.2 5.4 4 12 4s12-1.8 12-4V16" stroke="#fff" strokeWidth="2" fill="none"/>
      <ellipse cx="24" cy="24" rx="12" ry="4" fill="none" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  Aurora: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#3B48CC"/>
      <circle cx="24" cy="24" r="12" fill="#fff"/>
      <circle cx="24" cy="24" r="8" fill="#3B48CC"/>
      <circle cx="24" cy="24" r="4" fill="#fff"/>
    </svg>
  ),
  DynamoDB: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#3B48CC"/>
      <path d="M12 20h24v8H12z" fill="#fff"/>
      <path d="M16 16h16v4H16zM16 28h16v4H16z" fill="#fff" opacity="0.7"/>
    </svg>
  ),
  ElastiCache: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#3B48CC"/>
      <rect x="14" y="14" width="20" height="20" rx="2" fill="#fff"/>
      <path d="M18 22h12M18 26h12" stroke="#3B48CC" strokeWidth="2"/>
    </svg>
  ),

  // Networking
  VPC: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <rect x="10" y="10" width="28" height="28" rx="2" fill="none" stroke="#fff" strokeWidth="2"/>
      <path d="M24 14v20M14 24h20" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  Subnet: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <rect x="12" y="12" width="24" height="24" rx="2" fill="#fff" opacity="0.3"/>
      <rect x="16" y="16" width="16" height="16" rx="1" fill="#fff"/>
    </svg>
  ),
  ALB: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="18" r="6" fill="#fff"/>
      <path d="M16 30h4v6h-4zM22 30h4v6h-4zM28 30h4v6h-4z" fill="#fff"/>
      <path d="M24 24v6M18 30l6-6M30 30l-6-6" stroke="#fff" strokeWidth="1.5"/>
    </svg>
  ),
  NLB: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="18" r="6" fill="#fff"/>
      <rect x="14" y="30" width="20" height="6" fill="#fff"/>
      <path d="M24 24v6" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  APIGateway: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <path d="M14 24h6l4-6 4 6 4-6 4 6h6" stroke="#fff" strokeWidth="2" fill="none"/>
      <circle cx="14" cy="24" r="3" fill="#fff"/>
      <circle cx="34" cy="24" r="3" fill="#fff"/>
    </svg>
  ),
  Route53: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="24" r="10" fill="none" stroke="#fff" strokeWidth="2"/>
      <text x="24" y="28" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">53</text>
    </svg>
  ),
  CloudFront: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="24" r="10" fill="#fff"/>
      <path d="M24 14a10 10 0 0 1 0 20" fill="#8C4FFF"/>
    </svg>
  ),
  NATGateway: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <rect x="14" y="18" width="20" height="12" rx="2" fill="#fff"/>
      <path d="M24 14v4M24 30v4M18 24h-4M30 24h4" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  InternetGateway: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="24" r="8" fill="#fff"/>
      <path d="M24 8v8M24 32v8M8 24h8M32 24h8" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),

  // Security
  IAM: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#DD344C"/>
      <circle cx="24" cy="18" r="6" fill="#fff"/>
      <path d="M14 36c0-6 4-10 10-10s10 4 10 10" fill="#fff"/>
    </svg>
  ),
  SecurityGroup: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#DD344C"/>
      <path d="M24 10l12 6v12c0 6-12 10-12 10S12 34 12 28V16z" fill="#fff"/>
      <path d="M20 24l4 4 8-8" stroke="#DD344C" strokeWidth="2" fill="none"/>
    </svg>
  ),
  WAF: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#DD344C"/>
      <rect x="12" y="14" width="24" height="20" rx="2" fill="#fff"/>
      <path d="M16 20h16M16 26h16M16 32h8" stroke="#DD344C" strokeWidth="2"/>
    </svg>
  ),
  KMS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#DD344C"/>
      <circle cx="20" cy="24" r="6" fill="#fff"/>
      <rect x="24" y="22" width="12" height="4" fill="#fff"/>
      <rect x="32" y="18" width="4" height="4" fill="#fff"/>
    </svg>
  ),
  SecretsManager: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#DD344C"/>
      <rect x="16" y="20" width="16" height="14" rx="2" fill="#fff"/>
      <circle cx="24" cy="18" r="4" fill="none" stroke="#fff" strokeWidth="2"/>
      <circle cx="24" cy="27" r="2" fill="#DD344C"/>
    </svg>
  ),

  // Storage
  S3: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#1B660F"/>
      <path d="M12 24l12-8 12 8-12 8z" fill="#fff"/>
      <path d="M12 20l12-8 12 8" fill="none" stroke="#fff" strokeWidth="2"/>
      <path d="M12 28l12 8 12-8" fill="none" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  EBS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#1B660F"/>
      <rect x="14" y="12" width="20" height="24" rx="2" fill="#fff"/>
      <path d="M18 18h12M18 24h12M18 30h8" stroke="#1B660F" strokeWidth="2"/>
    </svg>
  ),
  EFS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#1B660F"/>
      <rect x="12" y="16" width="10" height="16" rx="1" fill="#fff"/>
      <rect x="26" y="16" width="10" height="16" rx="1" fill="#fff"/>
      <path d="M22 24h4" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),

  // Management
  CloudWatch: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="24" cy="24" r="10" fill="#fff"/>
      <path d="M24 18v6l4 4" stroke="#E7157B" strokeWidth="2" fill="none"/>
    </svg>
  ),
  CloudTrail: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <path d="M14 32l6-8 4 4 6-10 6 14z" fill="#fff"/>
    </svg>
  ),
  CloudFormation: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <rect x="14" y="14" width="8" height="8" fill="#fff"/>
      <rect x="26" y="14" width="8" height="8" fill="#fff"/>
      <rect x="20" y="26" width="8" height="8" fill="#fff"/>
      <path d="M18 22v4h4M26 22v4h-4" stroke="#fff" strokeWidth="1.5"/>
    </svg>
  ),

  // Messaging
  SQS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <rect x="12" y="18" width="24" height="12" rx="2" fill="#fff"/>
      <path d="M16 24h4M22 24h4M28 24h4" stroke="#E7157B" strokeWidth="2"/>
    </svg>
  ),
  SNS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="24" cy="24" r="6" fill="#fff"/>
      <circle cx="14" cy="16" r="4" fill="#fff"/>
      <circle cx="34" cy="16" r="4" fill="#fff"/>
      <circle cx="14" cy="32" r="4" fill="#fff"/>
      <circle cx="34" cy="32" r="4" fill="#fff"/>
    </svg>
  ),
  EventBridge: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#E7157B"/>
      <rect x="18" y="18" width="12" height="12" fill="#fff"/>
      <path d="M12 24h6M30 24h6M24 12v6M24 30v6" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),

  // Analytics
  Kinesis: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <path d="M12 18h24M12 24h24M12 30h24" stroke="#fff" strokeWidth="3"/>
    </svg>
  ),
  Athena: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="24" cy="20" r="8" fill="#fff"/>
      <path d="M18 30l6 8 6-8z" fill="#fff"/>
    </svg>
  ),

  // Default/Generic
  Generic: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#545B64"/>
      <rect x="12" y="12" width="24" height="24" rx="2" fill="#fff"/>
      <text x="24" y="28" textAnchor="middle" fill="#545B64" fontSize="8">AWS</text>
    </svg>
  ),
}

// Map service types to icons
const getIconForService = (serviceType: string, serviceName: string): string => {
  const type = (serviceType || serviceName || '').toLowerCase()

  if (type.includes('ec2') || type.includes('instance')) return 'EC2'
  if (type.includes('lambda')) return 'Lambda'
  if (type.includes('ecs')) return 'ECS'
  if (type.includes('eks') || type.includes('kubernetes')) return 'EKS'
  if (type.includes('aurora')) return 'Aurora'
  if (type.includes('rds') || type.includes('database') || type.includes('mysql') || type.includes('postgres')) return 'RDS'
  if (type.includes('dynamodb') || type.includes('dynamo')) return 'DynamoDB'
  if (type.includes('elasticache') || type.includes('redis') || type.includes('memcached')) return 'ElastiCache'
  if (type.includes('vpc')) return 'VPC'
  if (type.includes('subnet')) return 'Subnet'
  if (type.includes('alb') || type.includes('application load')) return 'ALB'
  if (type.includes('nlb') || type.includes('network load')) return 'NLB'
  if (type.includes('elb') || type.includes('load') || type.includes('lb')) return 'ALB'
  if (type.includes('api') || type.includes('gateway')) return 'APIGateway'
  if (type.includes('route53') || type.includes('dns') || type.includes('route 53')) return 'Route53'
  if (type.includes('cloudfront') || type.includes('cdn')) return 'CloudFront'
  if (type.includes('nat')) return 'NATGateway'
  if (type.includes('igw') || type.includes('internet gateway')) return 'InternetGateway'
  if (type.includes('iam') || type.includes('role') || type.includes('user') || type.includes('policy')) return 'IAM'
  if (type.includes('security group') || type.includes('sg-') || type.includes('securitygroup')) return 'SecurityGroup'
  if (type.includes('waf') || type.includes('firewall')) return 'WAF'
  if (type.includes('kms') || type.includes('key')) return 'KMS'
  if (type.includes('secret')) return 'SecretsManager'
  if (type.includes('s3') || type.includes('bucket')) return 'S3'
  if (type.includes('ebs') || type.includes('volume')) return 'EBS'
  if (type.includes('efs') || type.includes('file system')) return 'EFS'
  if (type.includes('cloudwatch') || type.includes('watch') || type.includes('metric') || type.includes('alarm')) return 'CloudWatch'
  if (type.includes('cloudtrail') || type.includes('trail') || type.includes('audit')) return 'CloudTrail'
  if (type.includes('cloudformation') || type.includes('stack')) return 'CloudFormation'
  if (type.includes('sqs') || type.includes('queue')) return 'SQS'
  if (type.includes('sns') || type.includes('notification') || type.includes('topic')) return 'SNS'
  if (type.includes('eventbridge') || type.includes('event')) return 'EventBridge'
  if (type.includes('kinesis') || type.includes('stream')) return 'Kinesis'
  if (type.includes('athena')) return 'Athena'

  return 'Generic'
}

// Color coding for connection types
const getConnectionColor = (connectionType: string, port: string | number | null): string => {
  const type = (connectionType || '').toLowerCase()
  const portNum = parseInt(String(port)) || 0

  if (type.includes('https') || portNum === 443) return '#10B981'
  if (type.includes('http') || portNum === 80) return '#3B82F6'
  if (type.includes('sql') || type.includes('mysql') || portNum === 3306) return '#8B5CF6'
  if (type.includes('postgres') || portNum === 5432) return '#6366F1'
  if (type.includes('redis') || portNum === 6379) return '#EF4444'
  if (type.includes('ssh') || portNum === 22) return '#F59E0B'
  if (type.includes('dns') || portNum === 53) return '#14B8A6'
  if (type.includes('api')) return '#EC4899'
  if (type.includes('internal')) return '#6B7280'

  return '#64748B'
}

// Types
interface NodeData {
  id: string
  label: string
  name: string
  type: string
  props: Record<string, any>
  x: number
  y: number
  vx?: number
  vy?: number
  icon: string
}

interface EdgeData {
  id: string
  source: string
  target: string
  type: string
  props: Record<string, any>
  port: string | number | null
  protocol: string
}

interface RawData {
  nodeLabels: string[]
  relationshipTypes: string[]
  totalNodes: number
  totalRelationships: number
}

interface Props {
  systemName: string
  onNodeClick?: (node: NodeData) => void
  onRefresh?: () => void
}

// Use environment variable for backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

const AWSArchitectureDiagram: React.FC<Props> = ({ systemName, onNodeClick, onRefresh }) => {
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [edges, setEdges] = useState<EdgeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<EdgeData | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [rawData, setRawData] = useState<RawData>({ nodeLabels: [], relationshipTypes: [], totalNodes: 0, totalRelationships: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Fetch data from backend proxy (which connects to Neo4j)
  const fetchFromBackend = async (endpoint: string) => {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Backend HTTP error: ${response.status}`)
    }

    return response.json()
  }

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch dependency map data from backend
      const data = await fetchFromBackend(`/api/dependency-map/full?systemName=${encodeURIComponent(systemName)}`)

      const graphNodes = data.nodes || []
      const graphEdges = data.edges || []

      // Get unique labels and relationship types
      const labels = [...new Set(graphNodes.map((n: any) => n.type || 'Unknown'))] as string[]
      const relTypes = [...new Set(graphEdges.map((e: any) => e.type || e.label || 'CONNECTED'))] as string[]

      setRawData({
        nodeLabels: labels,
        relationshipTypes: relTypes,
        totalNodes: graphNodes.length,
        totalRelationships: graphEdges.length
      })

      // Process nodes
      const processedNodes: NodeData[] = []
      const cols = Math.ceil(Math.sqrt(graphNodes.length))

      graphNodes.forEach((node: any, index: number) => {
        const primaryLabel = node.type || 'Unknown'
        const name = node.name || node.id

        // Calculate position in a grid layout initially
        const x = 150 + (index % cols) * 200
        const y = 150 + Math.floor(index / cols) * 180

        processedNodes.push({
          id: node.id,
          label: primaryLabel,
          name: name,
          type: primaryLabel,
          props: node.props || node.properties || {},
          x: x,
          y: y,
          icon: getIconForService(primaryLabel, name)
        })
      })

      // Process edges
      const processedEdges: EdgeData[] = []

      graphEdges.forEach((edge: any, index: number) => {
        const edgeType = edge.type || edge.label || 'CONNECTED'
        const props = edge.props || edge.properties || {}

        processedEdges.push({
          id: edge.id || `edge-${index}`,
          source: edge.source,
          target: edge.target,
          type: edgeType,
          props: props,
          port: props.port || props.Port || null,
          protocol: props.protocol || props.Protocol || edgeType
        })
      })

      // Apply force-directed layout
      const layoutedNodes = applyForceLayout(processedNodes, processedEdges)

      setNodes(layoutedNodes)
      setEdges(processedEdges)
      setLoading(false)

    } catch (err: any) {
      console.error('Data fetch error:', err)
      setError(err.message)
      setLoading(false)
    }
  }, [systemName])

  // Simple force-directed layout
  const applyForceLayout = (nodes: NodeData[], edges: EdgeData[]): NodeData[] => {
    if (nodes.length === 0) return nodes

    const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]))
    const iterations = 100
    const repulsion = 5000
    const attraction = 0.01
    const damping = 0.9

    for (let i = 0; i < iterations; i++) {
      // Apply repulsion between all nodes
      nodes.forEach((n1, idx1) => {
        const node1 = nodeMap.get(n1.id)
        if (!node1) return
        let fx = 0, fy = 0

        nodes.forEach((n2, idx2) => {
          if (idx1 === idx2) return
          const node2 = nodeMap.get(n2.id)
          if (!node2) return
          const dx = node1.x - node2.x
          const dy = node1.y - node2.y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = repulsion / (dist * dist)
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        })

        node1.vx = (node1.vx || 0) * damping + fx * 0.1
        node1.vy = (node1.vy || 0) * damping + fy * 0.1
      })

      // Apply attraction along edges
      edges.forEach(edge => {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) return

        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist === 0) return
        const force = dist * attraction

        source.vx = (source.vx || 0) + (dx / dist) * force
        source.vy = (source.vy || 0) + (dy / dist) * force
        target.vx = (target.vx || 0) - (dx / dist) * force
        target.vy = (target.vy || 0) - (dy / dist) * force
      })

      // Update positions
      nodeMap.forEach(node => {
        node.x += node.vx || 0
        node.y += node.vy || 0
        // Keep within bounds
        node.x = Math.max(100, Math.min(2400, node.x))
        node.y = Math.max(100, Math.min(1600, node.y))
      })
    }

    return Array.from(nodeMap.values())
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter nodes and edges
  const filteredNodes = nodes.filter(node => {
    const matchesFilter = filter === 'all' || node.label.toLowerCase().includes(filter.toLowerCase())
    const matchesSearch = !searchTerm ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(node.props).toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
  const filteredEdges = edges.filter(e =>
    filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  )

  // Mouse handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (e.target === svgRef.current || target.classList?.contains('bg-layer')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.2, Math.min(3, z * delta)))
  }

  // Get unique labels for filter
  const uniqueLabels = [...new Set(nodes.map(n => n.label))].sort()

  // Render edge path with arrow
  const renderEdge = (edge: EdgeData) => {
    const source = filteredNodes.find(n => n.id === edge.source)
    const target = filteredNodes.find(n => n.id === edge.target)
    if (!source || !target) return null

    const dx = target.x - source.x
    const dy = target.y - source.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return null
    const offset = 35

    const startX = source.x + (dx / dist) * offset
    const startY = source.y + (dy / dist) * offset
    const endX = target.x - (dx / dist) * offset
    const endY = target.y - (dy / dist) * offset

    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2

    const color = getConnectionColor(edge.type, edge.port)
    const isSelected = selectedEdge?.id === edge.id

    return (
      <g key={edge.id} onClick={() => setSelectedEdge(edge)} style={{ cursor: 'pointer' }}>
        <defs>
          <marker
            id={`arrow-${edge.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
          </marker>
        </defs>
        <line
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          stroke={color}
          strokeWidth={isSelected ? 3 : 1.5}
          strokeOpacity={isSelected ? 1 : 0.7}
          markerEnd={`url(#arrow-${edge.id})`}
        />
        {(edge.port || edge.type) && (
          <g transform={`translate(${midX}, ${midY})`}>
            <rect
              x="-25"
              y="-10"
              width="50"
              height="20"
              rx="4"
              fill="white"
              stroke={color}
              strokeWidth="1"
              opacity="0.95"
            />
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill={color}
              fontWeight="500"
            >
              {edge.port || edge.type}
            </text>
          </g>
        )}
      </g>
    )
  }

  // Render node
  const renderNode = (node: NodeData) => {
    const IconComponent = AWSIcons[node.icon] || AWSIcons.Generic
    const isSelected = selectedNode?.id === node.id

    return (
      <g
        key={node.id}
        transform={`translate(${node.x}, ${node.y})`}
        onClick={() => {
          setSelectedNode(node)
          if (onNodeClick) {
            onNodeClick(node)
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x="-40"
          y="-40"
          width="80"
          height="80"
          rx="8"
          fill="white"
          stroke={isSelected ? '#3B82F6' : '#E5E7EB'}
          strokeWidth={isSelected ? 3 : 1}
          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
        />
        <foreignObject x="-24" y="-28" width="48" height="48">
          <IconComponent className="w-12 h-12" />
        </foreignObject>
        <text
          y="30"
          textAnchor="middle"
          fontSize="10"
          fill="#374151"
          fontWeight="500"
        >
          {node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name}
        </text>
      </g>
    )
  }

  if (loading) {
    return (
      <div className="h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center rounded-xl">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
            <div className="absolute inset-3 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Loading Infrastructure</h2>
          <p className="text-slate-400">Fetching AWS resources from Neo4j...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8 rounded-xl">
        <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-8 max-w-lg">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-400 mb-4">Connection Error</h2>
          <p className="text-slate-300 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col rounded-xl overflow-hidden" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">☁️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">AWS Infrastructure Map</h1>
              <p className="text-xs text-slate-500">Real-time behavioral graph from Neo4j</p>
            </div>
          </div>

          <div className="flex gap-2 ml-6">
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
              {rawData.totalNodes} Nodes
            </span>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {rawData.totalRelationships} Connections
            </span>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
              {rawData.nodeLabels.length} Types
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 w-64"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            <option value="all">All Types ({nodes.length})</option>
            {uniqueLabels.map(label => (
              <option key={label} value={label}>
                {label} ({nodes.filter(n => n.label === label).length})
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              loadData()
              if (onRefresh) onRefresh()
            }}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="0.5"/>
              </pattern>
            </defs>

            <rect className="bg-layer" width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {filteredEdges.map(renderEdge)}

              {/* Nodes */}
              {filteredNodes.map(renderNode)}
            </g>
          </svg>

          {/* Zoom Controls */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white rounded-xl shadow-lg p-2">
            <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="w-10 h-10 hover:bg-slate-100 rounded-lg flex items-center justify-center text-lg">+</button>
            <div className="text-center text-xs text-slate-500 py-1">{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} className="w-10 h-10 hover:bg-slate-100 rounded-lg flex items-center justify-center text-lg">-</button>
            <div className="border-t border-slate-200 my-1"></div>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-10 h-10 hover:bg-slate-100 rounded-lg flex items-center justify-center text-sm">⟲</button>
          </div>
        </div>

        {/* Details Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800">
                  {selectedNode ? 'Node Details' : 'Connection Details'}
                </h3>
                <button
                  onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
                  className="text-slate-400 hover:text-slate-600 text-xl"
                >
                  ×
                </button>
              </div>

              {selectedNode && (
                <>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16">
                      {React.createElement(AWSIcons[selectedNode.icon] || AWSIcons.Generic, { className: 'w-16 h-16' })}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-800">{selectedNode.name}</h4>
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-sm">
                        {selectedNode.label}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h5 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Properties</h5>
                      <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        {Object.entries(selectedNode.props).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-start text-sm">
                            <span className="text-slate-500 font-medium">{key}</span>
                            <span className="text-slate-800 text-right max-w-[60%] break-all">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                        {Object.keys(selectedNode.props).length === 0 && (
                          <p className="text-slate-400 text-sm italic">No properties</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Connections</h5>
                      <div className="space-y-2">
                        {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map(edge => {
                          const isOutgoing = edge.source === selectedNode.id
                          const otherNodeId = isOutgoing ? edge.target : edge.source
                          const otherNode = nodes.find(n => n.id === otherNodeId)
                          return (
                            <div key={edge.id} className="bg-slate-50 rounded-lg p-3 flex items-center gap-2 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${isOutgoing ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {isOutgoing ? 'OUT' : 'IN'}
                              </span>
                              <span className="text-slate-600">{edge.type}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-slate-800 font-medium">{otherNode?.name || otherNodeId}</span>
                              {edge.port && (
                                <span className="ml-auto px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                  :{edge.port}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {selectedEdge && (
                <>
                  <div className="mb-6">
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-2">
                      <span>{nodes.find(n => n.id === selectedEdge.source)?.name || selectedEdge.source}</span>
                      <span className="text-orange-500">→</span>
                      <span>{nodes.find(n => n.id === selectedEdge.target)?.name || selectedEdge.target}</span>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-sm">
                      {selectedEdge.type}
                    </span>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Properties</h5>
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                      {selectedEdge.port && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Port</span>
                          <span className="text-slate-800">{selectedEdge.port}</span>
                        </div>
                      )}
                      {selectedEdge.protocol && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Protocol</span>
                          <span className="text-slate-800">{selectedEdge.protocol}</span>
                        </div>
                      )}
                      {Object.entries(selectedEdge.props || {}).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start text-sm">
                          <span className="text-slate-500 font-medium">{key}</span>
                          <span className="text-slate-800 text-right max-w-[60%] break-all">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                      {Object.keys(selectedEdge.props || {}).length === 0 && !selectedEdge.port && (
                        <p className="text-slate-400 text-sm italic">No properties</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white border-t border-slate-200 px-6 py-3">
        <div className="flex items-center gap-6 text-xs">
          <span className="text-slate-500 font-medium">Connection Types:</span>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#10B981]"></div><span>HTTPS/443</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#3B82F6]"></div><span>HTTP/80</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div><span>MySQL/3306</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#EF4444]"></div><span>Redis/6379</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#EC4899]"></div><span>API</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#64748B]"></div><span>Other</span></div>
        </div>
      </div>
    </div>
  )
}

export default AWSArchitectureDiagram
