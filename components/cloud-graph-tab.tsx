"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Search,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Filter,
  Info,
} from "lucide-react"
import { getAWSIcon, AWS_COLORS } from "./aws-icons"

// ============================================================================
// TYPES
// ============================================================================

interface CloudGraphTabProps {
  systemName?: string
}

interface GraphNode {
  id: string
  name: string
  type: string
  labels?: string[]
  arn?: string
  SystemName?: string
}

interface GraphRelationship {
  source: string
  target: string
  type: string
}

interface ServiceNode {
  id: string
  type: string
  displayName: string
  count: number
  instances: GraphNode[]
  color: string
  x: number
  y: number
  zone: "vpc" | "external" | "internet"
  subnet: "public" | "private-app" | "private-db" | "external"
}

interface DataFlow {
  from: string
  to: string
  type: string
  isActual: boolean
}

// ============================================================================
// AWS SERVICE TYPE MAPPING
// ============================================================================

const typeMapping: Record<string, string> = {
  LambdaFunction: "Lambda",
  Lambda: "Lambda",
  EC2Instance: "EC2",
  EC2: "EC2",
  RDSInstance: "RDS",
  RDS: "RDS",
  DynamoDBTable: "DynamoDB",
  DynamoDB: "DynamoDB",
  S3Bucket: "S3",
  S3: "S3",
  SQSQueue: "SQS",
  SQS: "SQS",
  SNSTopic: "SNS",
  SNS: "SNS",
  APIGateway: "APIGateway",
  ApiGateway: "APIGateway",
  LoadBalancer: "ALB",
  ALB: "ALB",
  NLB: "ALB",
  ELB: "ALB",
  SecurityGroup: "SecurityGroup",
  SG: "SecurityGroup",
  IAMRole: "IAM",
  IAM: "IAM",
  IAMPolicy: "IAM",
  CloudWatch: "CloudWatch",
  CloudTrail: "CloudTrail",
  VPC: "VPC",
  Subnet: "VPC",
  NATGateway: "NAT",
  NAT: "NAT",
  InternetGateway: "IGW",
  IGW: "IGW",
  ECSService: "ECS",
  ECS: "ECS",
  StepFunction: "StepFunctions",
  StepFunctions: "StepFunctions",
  EventBridgeRule: "EventBridge",
  EventBridge: "EventBridge",
  ElastiCache: "ElastiCache",
  Redis: "ElastiCache",
  KMS: "KMS",
  SecretsManager: "SecretsManager",
  WAF: "WAF",
  CloudFront: "CloudFront",
  Route53: "Route53",
}

const displayNames: Record<string, string> = {
  Lambda: "AWS Lambda",
  EC2: "Amazon EC2",
  RDS: "Amazon RDS",
  DynamoDB: "Amazon DynamoDB",
  S3: "Amazon S3",
  SQS: "Amazon SQS",
  SNS: "Amazon SNS",
  APIGateway: "API Gateway",
  ALB: "Elastic Load Balancing",
  SecurityGroup: "Security Groups",
  IAM: "IAM",
  CloudWatch: "CloudWatch",
  CloudTrail: "CloudTrail",
  VPC: "Amazon VPC",
  NAT: "NAT Gateway",
  IGW: "Internet Gateway",
  ECS: "Amazon ECS",
  StepFunctions: "Step Functions",
  EventBridge: "EventBridge",
  ElastiCache: "ElastiCache",
  KMS: "AWS KMS",
  SecretsManager: "Secrets Manager",
  WAF: "AWS WAF",
  CloudFront: "CloudFront",
  Route53: "Route 53",
  Default: "AWS Service",
}

const colors: Record<string, string> = {
  Lambda: AWS_COLORS.compute,
  EC2: AWS_COLORS.compute,
  ECS: AWS_COLORS.compute,
  RDS: AWS_COLORS.database,
  DynamoDB: AWS_COLORS.database,
  ElastiCache: AWS_COLORS.database,
  S3: AWS_COLORS.storage,
  SQS: AWS_COLORS.integration,
  SNS: AWS_COLORS.integration,
  APIGateway: AWS_COLORS.integration,
  StepFunctions: AWS_COLORS.integration,
  EventBridge: AWS_COLORS.integration,
  CloudWatch: AWS_COLORS.management,
  CloudTrail: AWS_COLORS.management,
  ALB: AWS_COLORS.networking,
  NAT: AWS_COLORS.networking,
  IGW: AWS_COLORS.networking,
  VPC: AWS_COLORS.networking,
  CloudFront: AWS_COLORS.networking,
  Route53: AWS_COLORS.networking,
  SecurityGroup: AWS_COLORS.security,
  IAM: AWS_COLORS.security,
  KMS: AWS_COLORS.security,
  WAF: AWS_COLORS.security,
  SecretsManager: AWS_COLORS.security,
  Default: "#6B7280",
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getServiceType = (node: GraphNode): string => {
  if (node.type && typeMapping[node.type]) {
    return typeMapping[node.type]
  }

  // Check ARN
  if (node.arn) {
    const service = node.arn.split(":")[2]
    const arnMap: Record<string, string> = {
      lambda: "Lambda",
      ec2: "EC2",
      rds: "RDS",
      dynamodb: "DynamoDB",
      s3: "S3",
      sqs: "SQS",
      sns: "SNS",
      "execute-api": "APIGateway",
      elasticloadbalancing: "ALB",
      iam: "IAM",
      logs: "CloudWatch",
      cloudtrail: "CloudTrail",
      ecs: "ECS",
      states: "StepFunctions",
      events: "EventBridge",
      elasticache: "ElastiCache",
      kms: "KMS",
      secretsmanager: "SecretsManager",
      waf: "WAF",
      cloudfront: "CloudFront",
      route53: "Route53",
    }
    if (arnMap[service]) return arnMap[service]
  }

  // Check ID prefix
  const id = node.id || ""
  if (id.startsWith("sg-")) return "SecurityGroup"
  if (id.startsWith("vpc-")) return "VPC"
  if (id.startsWith("subnet-")) return "VPC"
  if (id.startsWith("i-")) return "EC2"
  if (id.startsWith("nat-")) return "NAT"
  if (id.startsWith("igw-")) return "IGW"

  return "Default"
}

const getSubnet = (serviceType: string): ServiceNode["subnet"] => {
  if (["APIGateway", "ALB", "IGW", "CloudFront", "Route53", "WAF"].includes(serviceType)) return "public"
  if (["Lambda", "EC2", "ECS", "SQS", "SNS", "NAT", "StepFunctions", "EventBridge"].includes(serviceType))
    return "private-app"
  if (["RDS", "DynamoDB", "ElastiCache"].includes(serviceType)) return "private-db"
  return "external"
}

const getZone = (serviceType: string): ServiceNode["zone"] => {
  if (["S3", "IAM", "CloudWatch", "CloudTrail", "KMS", "SecretsManager", "Route53"].includes(serviceType))
    return "external"
  return "vpc"
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CloudGraphTab({ systemName }: CloudGraphTabProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphRelationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<ServiceNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [isAnimating, setIsAnimating] = useState(true)
  const [filterActual, setFilterActual] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [zoom, setZoom] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Fetch data from backend
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const endpoints = [
        "/api/proxy/graph-data",
        "https://saferemediate-backend.onrender.com/api/graph/snapshot",
        "https://saferemediate-backend.onrender.com/api/graph/live",
      ]

      let data = null
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            headers: { "Content-Type": "application/json" },
          })
          if (res.ok) {
            data = await res.json()
            if (data.nodes?.length > 0 || data.infrastructure?.nodes?.length > 0) {
              break
            }
          }
        } catch {
          continue
        }
      }

      if (!data) throw new Error("Failed to fetch graph data from all endpoints")

      const rawNodes = data.nodes || data.infrastructure?.nodes || []
      const rawEdges = data.relationships || data.edges || []

      setNodes(rawNodes)
      setEdges(rawEdges)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Process nodes into service groups with AWS-style positioning
  const serviceNodes = useMemo(() => {
    const groups = new Map<string, GraphNode[]>()

    nodes.forEach((node) => {
      const serviceType = getServiceType(node)
      if (serviceType === "VPC") return

      if (!groups.has(serviceType)) {
        groups.set(serviceType, [])
      }
      groups.get(serviceType)!.push(node)
    })

    const result: ServiceNode[] = []

    // AWS Architecture Diagram Layout
    const layout = {
      canvasWidth: 1200,
      canvasHeight: 800,
      vpcX: 80,
      vpcY: 120,
      vpcWidth: 900,
      vpcHeight: 580,
      externalX: 1020,
      subnetMargin: 20,

      public: { y: 160, height: 140, items: [] as string[] },
      "private-app": { y: 320, height: 160, items: [] as string[] },
      "private-db": { y: 500, height: 140, items: [] as string[] },
      external: { y: 160, items: [] as string[] },
    }

    // Categorize services by subnet
    groups.forEach((_, serviceType) => {
      const zone = getZone(serviceType)
      if (zone === "external") {
        layout.external.items.push(serviceType)
      } else {
        const subnet = getSubnet(serviceType)
        if (layout[subnet]) {
          layout[subnet].items.push(serviceType)
        }
      }
    })

    // Position VPC services
    const vpcSubnets = ["public", "private-app", "private-db"] as const
    vpcSubnets.forEach((subnet) => {
      const config = layout[subnet]
      const items = config.items
      if (items.length === 0) return

      const spacing = Math.min(140, (layout.vpcWidth - 80) / items.length)
      const startX = layout.vpcX + 60 + (layout.vpcWidth - 80 - spacing * items.length) / 2

      items.forEach((serviceType, idx) => {
        const nodeGroup = groups.get(serviceType)
        if (!nodeGroup) return

        result.push({
          id: serviceType,
          type: serviceType,
          displayName: displayNames[serviceType] || serviceType,
          count: nodeGroup.length,
          instances: nodeGroup,
          color: colors[serviceType] || colors.Default,
          x: startX + idx * spacing + spacing / 2,
          y: config.y + config.height / 2,
          zone: "vpc",
          subnet,
        })
      })
    })

    // Position external services
    const externalItems = layout.external.items
    externalItems.forEach((serviceType, idx) => {
      const nodeGroup = groups.get(serviceType)
      if (!nodeGroup) return

      result.push({
        id: serviceType,
        type: serviceType,
        displayName: displayNames[serviceType] || serviceType,
        count: nodeGroup.length,
        instances: nodeGroup,
        color: colors[serviceType] || colors.Default,
        x: layout.externalX + 60,
        y: layout.external.y + idx * 100 + 40,
        zone: "external",
        subnet: "external",
      })
    })

    return result
  }, [nodes])

  // Process edges into data flows
  const dataFlows = useMemo(() => {
    const flowMap = new Map<string, DataFlow>()

    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.source)
      const toNode = nodes.find((n) => n.id === edge.target)
      if (!fromNode || !toNode) return

      const fromType = getServiceType(fromNode)
      const toType = getServiceType(toNode)
      if (fromType === toType || fromType === "VPC" || toType === "VPC") return

      const key = `${fromType}-${toType}`
      const isActual = edge.type.includes("ACTUAL") || edge.type.includes("RUNTIME") || edge.type.includes("INVOKES")

      if (!flowMap.has(key)) {
        flowMap.set(key, { from: fromType, to: toType, type: edge.type, isActual })
      } else if (isActual) {
        flowMap.get(key)!.isActual = true
      }
    })

    return Array.from(flowMap.values())
  }, [edges, nodes])

  const filteredFlows = filterActual ? dataFlows.filter((f) => f.isActual) : dataFlows

  // Get position helper
  const getPos = (serviceType: string) => {
    const node = serviceNodes.find((n) => n.type === serviceType)
    return node ? { x: node.x, y: node.y } : null
  }

  // Stats
  const stats = {
    resources: nodes.length,
    connections: edges.length,
    actual: edges.filter((e) => e.type.includes("ACTUAL") || e.type.includes("RUNTIME") || e.type.includes("INVOKES"))
      .length,
    services: serviceNodes.length,
  }

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x
      const dy = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setZoom((prev) => Math.min(2, Math.max(0.5, prev + delta)))
  }

  const resetView = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  // Loading state
  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-[#F8F9FA] rounded-xl border border-gray-200">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-[#FF9900] rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">Loading AWS Architecture...</p>
          <p className="text-gray-400 text-sm mt-1">Fetching infrastructure data</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-[#F8F9FA] rounded-xl border border-gray-200">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Unable to Load Architecture</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-5 py-2.5 bg-[#FF9900] text-white rounded-lg hover:bg-[#EC7211] transition font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${isFullscreen ? "fixed inset-0 z-50 bg-white p-4" : ""}`}>
      {/* AWS-style Header */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M14 2L26 8V20L14 26L2 20V8L14 2Z"
                fill="#FF9900"
                stroke="#EC7211"
                strokeWidth="1"
              />
              <path d="M14 10L20 13V19L14 22L8 19V13L14 10Z" fill="white" />
            </svg>
            <span className="font-semibold text-[#232F3E]">AWS Architecture</span>
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <span className="px-2.5 py-1 bg-[#232F3E] text-white rounded text-xs font-medium">Production</span>
          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-xs">eu-west-1</span>
          {systemName && (
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">{systemName}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-[#FF9900] focus:border-transparent"
            />
          </div>

          {/* Filter */}
          <button
            onClick={() => setFilterActual(!filterActual)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterActual
                ? "bg-[#FF9900] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Active Only
          </button>

          <div className="h-6 w-px bg-gray-200" />

          {/* Zoom */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg">
            <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="p-1.5 hover:bg-gray-50 transition">
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={resetView} className="px-2 text-xs text-gray-600 hover:text-gray-900 min-w-[45px]">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="p-1.5 hover:bg-gray-50 transition">
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Toggle buttons */}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-1.5 rounded-lg transition ${showLabels ? "bg-gray-100" : "hover:bg-gray-50"}`}
            title={showLabels ? "Hide labels" : "Show labels"}
          >
            {showLabels ? <Eye className="w-4 h-4 text-gray-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
          </button>

          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className={`p-1.5 rounded-lg transition ${isAnimating ? "bg-gray-100" : "hover:bg-gray-50"}`}
            title={isAnimating ? "Pause animation" : "Play animation"}
          >
            {isAnimating ? (
              <PauseCircle className="w-4 h-4 text-gray-600" />
            ) : (
              <PlayCircle className="w-4 h-4 text-gray-400" />
            )}
          </button>

          <button onClick={fetchData} className="p-1.5 hover:bg-gray-50 rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-gray-50 rounded-lg transition"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-600" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* AWS Architecture Canvas */}
      <div
        className="relative bg-[#F8F9FA] rounded-xl border border-gray-200 overflow-hidden"
        style={{ height: isFullscreen ? "calc(100vh - 180px)" : 700 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 1200 800"
          style={{
            transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: "center center",
            cursor: isPanning ? "grabbing" : "grab",
          }}
        >
          <defs>
            {/* AWS Gradient backgrounds */}
            <linearGradient id="awsVpcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8F4FD" />
              <stop offset="100%" stopColor="#D4E8F7" />
            </linearGradient>

            <linearGradient id="awsPublicSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#D4EDDA" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#C3E6CB" stopOpacity="0.6" />
            </linearGradient>

            <linearGradient id="awsPrivateSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#CCE5FF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#B8DAFF" stopOpacity="0.6" />
            </linearGradient>

            <linearGradient id="awsDbSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E2D5F1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#D4C4E8" stopOpacity="0.6" />
            </linearGradient>

            {/* Grid pattern */}
            <pattern id="awsGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
            </pattern>

            {/* Arrow markers */}
            <marker id="arrowActive" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <polygon points="0 0, 10 4, 0 8" fill="#FF9900" />
            </marker>
            <marker id="arrowStatic" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <polygon points="0 0, 10 4, 0 8" fill="#6B7280" />
            </marker>

            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background grid */}
          <rect width="100%" height="100%" fill="url(#awsGrid)" />

          {/* AWS Cloud container */}
          <g>
            {/* Cloud background */}
            <rect x="20" y="20" width="1160" height="760" rx="12" fill="#FAFBFC" stroke="#E5E7EB" strokeWidth="1" />

            {/* AWS Cloud label */}
            <g transform="translate(40, 40)">
              <rect width="120" height="28" rx="4" fill="#232F3E" />
              <text x="12" y="18" fill="white" fontSize="11" fontWeight="600">
                AWS Cloud
              </text>
            </g>
          </g>

          {/* VPC Container */}
          <g>
            <rect
              x="80"
              y="120"
              width="900"
              height="580"
              rx="8"
              fill="url(#awsVpcGradient)"
              stroke="#8C4FFF"
              strokeWidth="2"
              strokeDasharray="none"
            />

            {/* VPC Label */}
            <g transform="translate(100, 130)">
              <rect width="180" height="26" rx="4" fill="#8C4FFF" />
              <text x="10" y="17" fill="white" fontSize="11" fontWeight="600">
                VPC (10.0.0.0/16)
              </text>
            </g>

            {/* Availability Zone indicator */}
            <g transform="translate(920, 130)">
              <rect width="50" height="20" rx="3" fill="#5C6BC0" fillOpacity="0.2" stroke="#5C6BC0" strokeWidth="1" />
              <text x="8" y="14" fill="#5C6BC0" fontSize="9" fontWeight="500">
                AZ-1
              </text>
            </g>
          </g>

          {/* Public Subnet */}
          <g>
            <rect
              x="100"
              y="160"
              width="860"
              height="140"
              rx="6"
              fill="url(#awsPublicSubnet)"
              stroke="#28A745"
              strokeWidth="1.5"
            />
            <g transform="translate(110, 168)">
              <rect width="150" height="22" rx="3" fill="#28A745" />
              <text x="8" y="15" fill="white" fontSize="10" fontWeight="500">
                Public Subnet (10.0.1.0/24)
              </text>
            </g>
          </g>

          {/* Private Application Subnet */}
          <g>
            <rect
              x="100"
              y="320"
              width="860"
              height="160"
              rx="6"
              fill="url(#awsPrivateSubnet)"
              stroke="#007BFF"
              strokeWidth="1.5"
            />
            <g transform="translate(110, 328)">
              <rect width="180" height="22" rx="3" fill="#007BFF" />
              <text x="8" y="15" fill="white" fontSize="10" fontWeight="500">
                Private Subnet - App (10.0.2.0/24)
              </text>
            </g>
          </g>

          {/* Private Database Subnet */}
          <g>
            <rect
              x="100"
              y="500"
              width="860"
              height="140"
              rx="6"
              fill="url(#awsDbSubnet)"
              stroke="#6F42C1"
              strokeWidth="1.5"
            />
            <g transform="translate(110, 508)">
              <rect width="170" height="22" rx="3" fill="#6F42C1" />
              <text x="8" y="15" fill="white" fontSize="10" fontWeight="500">
                Private Subnet - DB (10.0.3.0/24)
              </text>
            </g>
          </g>

          {/* External Services Area */}
          <g>
            <rect
              x="1000"
              y="120"
              width="160"
              height="580"
              rx="6"
              fill="#FFF3E0"
              fillOpacity="0.5"
              stroke="#FF9900"
              strokeWidth="1"
              strokeDasharray="6 4"
            />
            <text x="1020" y="145" fill="#FF9900" fontSize="11" fontWeight="600">
              Global Services
            </text>
          </g>

          {/* Data Flows / Connections */}
          {filteredFlows.map((flow, i) => {
            const from = getPos(flow.from)
            const to = getPos(flow.to)
            if (!from || !to) return null

            const dx = to.x - from.x
            const dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            // Calculate curved path
            const midX = (from.x + to.x) / 2
            const midY = (from.y + to.y) / 2
            const perpX = -dy / dist
            const perpY = dx / dist
            const curve = Math.min(dist * 0.15, 50)
            const ctrlX = midX + perpX * curve * (i % 2 === 0 ? 1 : -1)
            const ctrlY = midY + perpY * curve * (i % 2 === 0 ? 1 : -1)

            const path = `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`
            const isActive = flow.isActual
            const color = isActive ? "#FF9900" : "#9CA3AF"
            const marker = isActive ? "url(#arrowActive)" : "url(#arrowStatic)"

            return (
              <g
                key={`flow-${i}`}
                opacity={hoveredNode && hoveredNode !== flow.from && hoveredNode !== flow.to ? 0.15 : 1}
                style={{ transition: "opacity 0.2s" }}
              >
                {/* Glow for active connections */}
                {isActive && <path d={path} fill="none" stroke="#FF9900" strokeWidth="8" opacity="0.15" />}

                {/* Connection line */}
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeDasharray={isActive ? "none" : "8 4"}
                  markerEnd={marker}
                  opacity={isActive ? 0.9 : 0.6}
                />

                {/* Animated particles for active flows */}
                {isAnimating && isActive && (
                  <>
                    <circle r="4" fill="#FF9900">
                      <animateMotion dur="2.5s" repeatCount="indefinite" path={path} />
                    </circle>
                    <circle r="3" fill="#FFB84D" opacity="0.7">
                      <animateMotion dur="2.5s" repeatCount="indefinite" path={path} begin="0.8s" />
                    </circle>
                    <circle r="2" fill="#FFD699" opacity="0.5">
                      <animateMotion dur="2.5s" repeatCount="indefinite" path={path} begin="1.6s" />
                    </circle>
                  </>
                )}
              </g>
            )
          })}

          {/* Service Nodes */}
          {serviceNodes.map((service) => {
            const isHovered = hoveredNode === service.type
            const isSelected = selectedNode?.type === service.type
            const isFiltered =
              searchQuery && !service.displayName.toLowerCase().includes(searchQuery.toLowerCase())

            if (isFiltered) return null

            return (
              <g
                key={service.id}
                transform={`translate(${service.x}, ${service.y})`}
                onMouseEnter={() => setHoveredNode(service.type)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(service)}
                className="cursor-pointer"
                opacity={hoveredNode && !isHovered ? 0.5 : 1}
                style={{ transition: "opacity 0.2s, transform 0.2s" }}
              >
                {/* Selection/Hover effect */}
                {(isSelected || isHovered) && (
                  <rect
                    x="-32"
                    y="-32"
                    width="64"
                    height="64"
                    rx="12"
                    fill="none"
                    stroke={isSelected ? "#FF9900" : "#6B7280"}
                    strokeWidth="2"
                    strokeDasharray={isSelected ? "none" : "4 2"}
                    filter={isSelected ? "url(#glow)" : "none"}
                  />
                )}

                {/* AWS Icon */}
                <foreignObject x="-24" y="-24" width="48" height="48">
                  <div className="w-full h-full flex items-center justify-center">{getAWSIcon(service.type, 48)}</div>
                </foreignObject>

                {/* Instance count badge */}
                {service.count > 1 && (
                  <g transform="translate(20, -20)">
                    <circle r="12" fill="white" stroke={service.color} strokeWidth="2" />
                    <text textAnchor="middle" y="4" fill={service.color} fontSize="11" fontWeight="700">
                      {service.count}
                    </text>
                  </g>
                )}

                {/* Service label */}
                {showLabels && (
                  <g transform="translate(0, 38)">
                    <rect
                      x={-(service.displayName.length * 3.5 + 8)}
                      y="-10"
                      width={service.displayName.length * 7 + 16}
                      height="20"
                      rx="4"
                      fill="white"
                      fillOpacity="0.95"
                      stroke="#E5E7EB"
                      strokeWidth="1"
                    />
                    <text textAnchor="middle" y="4" fill="#374151" fontSize="11" fontWeight="500">
                      {service.displayName}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Internet indicator */}
          <g transform="translate(40, 400)">
            <circle r="30" fill="#232F3E" />
            <text textAnchor="middle" y="-8" fill="white" fontSize="20">
              🌐
            </text>
            <text textAnchor="middle" y="12" fill="white" fontSize="9" fontWeight="500">
              Internet
            </text>
          </g>
        </svg>

        {/* Node Detail Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${selectedNode.color}15, ${selectedNode.color}05)` }}
            >
              <div className="flex items-center gap-3">
                {getAWSIcon(selectedNode.type, 40)}
                <div>
                  <h4 className="font-semibold text-gray-900">{selectedNode.displayName}</h4>
                  <p className="text-xs text-gray-500">{selectedNode.count} instance(s)</p>
                </div>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details */}
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500 mb-0.5">Zone</p>
                  <p className="font-medium text-gray-900 capitalize">{selectedNode.zone}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500 mb-0.5">Subnet</p>
                  <p className="font-medium text-gray-900 capitalize">{selectedNode.subnet.replace(/-/g, " ")}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500 mb-1">Connections</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {dataFlows.filter((f) => f.from === selectedNode.type || f.to === selectedNode.type).length}
                  </span>
                  <span className="text-xs text-gray-500">total</span>
                  <span className="text-xs px-1.5 py-0.5 bg-[#FF9900] text-white rounded ml-auto">
                    {
                      dataFlows.filter(
                        (f) => (f.from === selectedNode.type || f.to === selectedNode.type) && f.isActual
                      ).length
                    }{" "}
                    active
                  </span>
                </div>
              </div>

              {/* Instance list */}
              {selectedNode.instances.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Instances</p>
                  <div className="max-h-32 overflow-y-auto space-y-1.5">
                    {selectedNode.instances.slice(0, 5).map((instance, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-gray-700 truncate flex-1">{instance.name || instance.id}</span>
                      </div>
                    ))}
                    {selectedNode.instances.length > 5 && (
                      <p className="text-xs text-gray-400 text-center py-1">
                        +{selectedNode.instances.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Minimap (optional enhancement indicator) */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-gray-500 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg border">
          <Info className="w-3.5 h-3.5" />
          <span>Scroll to zoom • Drag to pan • Click node for details</span>
        </div>
      </div>

      {/* Stats Bar - AWS Style */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#FF9900] transition">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Resources</p>
            <div className="w-8 h-8 rounded-lg bg-[#FF9900]/10 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#FF9900">
                <path d="M10 2L2 7v6l8 5 8-5V7l-8-5z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.resources}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#007BFF] transition">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Service Types</p>
            <div className="w-8 h-8 rounded-lg bg-[#007BFF]/10 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#007BFF">
                <rect x="2" y="2" width="6" height="6" rx="1" />
                <rect x="12" y="2" width="6" height="6" rx="1" />
                <rect x="2" y="12" width="6" height="6" rx="1" />
                <rect x="12" y="12" width="6" height="6" rx="1" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.services}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#6F42C1] transition">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Connections</p>
            <div className="w-8 h-8 rounded-lg bg-[#6F42C1]/10 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#6F42C1">
                <path d="M10 2a2 2 0 100 4 2 2 0 000-4zM4 8a2 2 0 100 4 2 2 0 000-4zM16 8a2 2 0 100 4 2 2 0 000-4zM10 14a2 2 0 100 4 2 2 0 000-4zM10 6v2M8 10H6M14 10h-2M10 12v2" stroke="#6F42C1" strokeWidth="2" fill="none"/>
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.connections}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#28A745] transition">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active Flows</p>
            <div className="w-8 h-8 rounded-lg bg-[#28A745]/10 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="#28A745">
                <path d="M2 10h4l2-4 4 8 2-4h4" stroke="#28A745" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-[#28A745]">{stats.actual}</p>
        </div>
      </div>

      {/* Legend - AWS Style */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Legend</span>

            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-[#FF9900] rounded" />
              <span className="text-xs text-gray-600">Active Traffic</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-400" />
              <span className="text-xs text-gray-600">Allowed (Static)</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.compute }} />
              <span className="text-xs text-gray-600">Compute</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.database }} />
              <span className="text-xs text-gray-600">Database</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.storage }} />
              <span className="text-xs text-gray-600">Storage</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.networking }} />
              <span className="text-xs text-gray-600">Networking</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.integration }} />
              <span className="text-xs text-gray-600">Integration</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded" style={{ background: AWS_COLORS.security }} />
              <span className="text-xs text-gray-600">Security</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CloudGraphTab
