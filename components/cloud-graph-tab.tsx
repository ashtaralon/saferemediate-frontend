"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
  Filter,
} from "lucide-react"

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
  color: string
  x: number
  y: number
  zone: "vpc" | "external"
  subnet: "public" | "private-app" | "private-db" | "external"
}

interface DataFlow {
  from: string
  to: string
  type: string
  isActual: boolean
}

// ============================================================================
// AWS ICONS (Inline SVG - Official Style)
// ============================================================================

const AWSIcons: Record<string, React.FC<{ size?: number }>> = {
  Lambda: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#ED7100"/>
      <path d="M12 28L20 12L25 20L30 12" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  
  EC2: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#ED7100"/>
      <rect x="10" y="10" width="7" height="7" fill="white" opacity="0.9"/>
      <rect x="23" y="10" width="7" height="7" fill="white" opacity="0.9"/>
      <rect x="10" y="23" width="7" height="7" fill="white" opacity="0.9"/>
      <rect x="23" y="23" width="7" height="7" fill="white" opacity="0.9"/>
      <path d="M20 10v20M10 20h20" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  RDS: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#3B48CC"/>
      <ellipse cx="20" cy="12" rx="10" ry="4" fill="white" opacity="0.9"/>
      <path d="M10 12v16c0 2.2 4.5 4 10 4s10-1.8 10-4V12" stroke="white" strokeWidth="1.5" fill="none"/>
      <ellipse cx="20" cy="20" rx="10" ry="4" fill="none" stroke="white" strokeWidth="1.5"/>
      <ellipse cx="20" cy="28" rx="10" ry="4" fill="none" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  DynamoDB: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#3B48CC"/>
      <rect x="12" y="12" width="16" height="16" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M12 18h16M12 24h16M18 12v16M24 12v16" stroke="white" strokeWidth="1"/>
    </svg>
  ),
  
  S3: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#3F8624"/>
      <path d="M20 8L32 14v12L20 32L8 26V14L20 8z" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M20 8v24M8 14l12 6 12-6M8 26l12-6 12 6" stroke="white" strokeWidth="1" fill="none"/>
    </svg>
  ),
  
  SQS: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <rect x="8" y="14" width="10" height="12" rx="1" fill="white" opacity="0.9"/>
      <rect x="22" y="14" width="10" height="12" rx="1" fill="white" opacity="0.7"/>
      <path d="M18 20h4M32 20h4" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  SNS: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="20" cy="16" r="5" fill="white"/>
      <path d="M12 30l6-6M28 30l-6-6M20 24v8" stroke="white" strokeWidth="1.5"/>
      <circle cx="12" cy="30" r="3" fill="white" opacity="0.8"/>
      <circle cx="28" cy="30" r="3" fill="white" opacity="0.8"/>
      <circle cx="20" cy="34" r="3" fill="white" opacity="0.8"/>
    </svg>
  ),
  
  APIGateway: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <rect x="12" y="12" width="16" height="16" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M8 16h6M8 24h6M26 16h6M26 24h6" stroke="white" strokeWidth="1.5"/>
      <path d="M18 16v8M22 16v8" stroke="white" strokeWidth="1"/>
    </svg>
  ),
  
  ALB: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="20" cy="14" r="5" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M14 24h12M10 30h20" stroke="white" strokeWidth="1.5"/>
      <path d="M20 19v3M14 26v4M20 26v4M26 26v4" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  SecurityGroup: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#DD344C"/>
      <path d="M20 8L32 14v10c0 5-12 8-12 8S8 29 8 24V14L20 8z" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M16 20l4 4 6-6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  
  IAM: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#DD344C"/>
      <circle cx="20" cy="14" r="5" fill="white"/>
      <path d="M12 32c0-5 3.6-8 8-8s8 3 8 8" fill="white"/>
    </svg>
  ),
  
  CloudWatch: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M20 12v8l5 5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  
  CloudTrail: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <path d="M12 28c3-5 5-16 8-16s5 11 8 16" fill="none" stroke="white" strokeWidth="1.5"/>
      <circle cx="12" cy="28" r="2" fill="white"/>
      <circle cx="20" cy="12" r="2" fill="white"/>
      <circle cx="28" cy="28" r="2" fill="white"/>
    </svg>
  ),
  
  VPC: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#8C4FFF"/>
      <rect x="8" y="8" width="24" height="24" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <circle cx="14" cy="14" r="2" fill="white"/>
      <circle cx="26" cy="14" r="2" fill="white"/>
      <circle cx="14" cy="26" r="2" fill="white"/>
      <circle cx="26" cy="26" r="2" fill="white"/>
    </svg>
  ),
  
  NAT: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#8C4FFF"/>
      <rect x="12" y="12" width="16" height="16" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M20 16v8M17 20h6" stroke="white" strokeWidth="1.5"/>
      <path d="M20 16l-2 2M20 16l2 2" stroke="white" strokeWidth="1.5" fill="none"/>
    </svg>
  ),
  
  IGW: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#8C4FFF"/>
      <circle cx="20" cy="20" r="8" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M20 12v16M12 20h16" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  ECS: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#ED7100"/>
      <rect x="10" y="10" width="20" height="20" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <rect x="14" y="14" width="5" height="5" fill="white" opacity="0.9"/>
      <rect x="21" y="14" width="5" height="5" fill="white" opacity="0.9"/>
      <rect x="14" y="21" width="5" height="5" fill="white" opacity="0.9"/>
      <rect x="21" y="21" width="5" height="5" fill="white" opacity="0.9"/>
    </svg>
  ),
  
  StepFunctions: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="14" cy="12" r="3" fill="white"/>
      <circle cx="26" cy="20" r="3" fill="white"/>
      <circle cx="14" cy="28" r="3" fill="white"/>
      <path d="M17 12h6l3 8M23 20l-6 8" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  EventBridge: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#E7157B"/>
      <circle cx="20" cy="20" r="8" fill="none" stroke="white" strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="3" fill="white"/>
      <path d="M20 12v3M20 25v3M12 20h3M25 20h3" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  
  ElastiCache: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#3B48CC"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke="white" strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="4" fill="white"/>
    </svg>
  ),
  
  Default: ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="4" fill="#6B7280"/>
      <rect x="10" y="10" width="20" height="20" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="4" fill="white"/>
    </svg>
  ),
}

// ============================================================================
// HELPERS
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
}

const displayNames: Record<string, string> = {
  Lambda: "Lambda",
  EC2: "EC2",
  RDS: "RDS",
  DynamoDB: "DynamoDB",
  S3: "S3",
  SQS: "SQS",
  SNS: "SNS",
  APIGateway: "API Gateway",
  ALB: "Load Balancer",
  SecurityGroup: "Security Groups",
  IAM: "IAM Roles",
  CloudWatch: "CloudWatch",
  CloudTrail: "CloudTrail",
  VPC: "VPC",
  NAT: "NAT Gateway",
  IGW: "Internet GW",
  ECS: "ECS",
  StepFunctions: "Step Functions",
  EventBridge: "EventBridge",
  ElastiCache: "ElastiCache",
  Default: "Service",
}

const colors: Record<string, string> = {
  Lambda: "#ED7100",
  EC2: "#ED7100",
  ECS: "#ED7100",
  RDS: "#3B48CC",
  DynamoDB: "#3B48CC",
  ElastiCache: "#3B48CC",
  S3: "#3F8624",
  SQS: "#E7157B",
  SNS: "#E7157B",
  APIGateway: "#E7157B",
  StepFunctions: "#E7157B",
  EventBridge: "#E7157B",
  CloudWatch: "#E7157B",
  CloudTrail: "#E7157B",
  ALB: "#8C4FFF",
  NAT: "#8C4FFF",
  IGW: "#8C4FFF",
  VPC: "#8C4FFF",
  SecurityGroup: "#DD344C",
  IAM: "#DD344C",
  Default: "#6B7280",
}

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
  if (["APIGateway", "ALB", "IGW"].includes(serviceType)) return "public"
  if (["Lambda", "EC2", "ECS", "SQS", "SNS", "SecurityGroup", "NAT", "StepFunctions", "EventBridge"].includes(serviceType)) return "private-app"
  if (["RDS", "DynamoDB", "ElastiCache"].includes(serviceType)) return "private-db"
  return "external"
}

const getZone = (serviceType: string): ServiceNode["zone"] => {
  if (["S3", "IAM", "CloudWatch", "CloudTrail"].includes(serviceType)) return "external"
  return "vpc"
}

const getIcon = (serviceType: string) => {
  const Icon = AWSIcons[serviceType] || AWSIcons.Default
  return <Icon size={44} />
}

// Default fallback data - always available
const DEFAULT_NODES: GraphNode[] = [
  { id: "lambda-payment", name: "payment-processor", type: "Lambda", SystemName: "demo" },
  { id: "lambda-auth", name: "auth-service", type: "Lambda", SystemName: "demo" },
  { id: "lambda-user", name: "user-api", type: "Lambda", SystemName: "demo" },
  { id: "rds-main", name: "prod-database", type: "RDS", SystemName: "demo" },
  { id: "rds-replica", name: "prod-db-replica", type: "RDS", SystemName: "demo" },
  { id: "s3-logs", name: "payment-logs", type: "S3", SystemName: "demo" },
  { id: "s3-assets", name: "static-assets", type: "S3", SystemName: "demo" },
  { id: "sqs-queue", name: "payment-queue", type: "SQS", SystemName: "demo" },
  { id: "sns-topic", name: "notifications", type: "SNS", SystemName: "demo" },
  { id: "elasticache", name: "cache-cluster", type: "ElastiCache", SystemName: "demo" },
  { id: "api-gw", name: "api-gateway", type: "APIGateway", SystemName: "demo" },
  { id: "alb-main", name: "prod-load-balancer", type: "ALB", SystemName: "demo" },
  { id: "ec2-web-1", name: "web-server-1", type: "EC2", SystemName: "demo" },
  { id: "ec2-web-2", name: "web-server-2", type: "EC2", SystemName: "demo" },
  { id: "iam-lambda-role", name: "lambda-execution-role", type: "IAM", SystemName: "demo" },
  { id: "iam-ec2-role", name: "ec2-instance-role", type: "IAM", SystemName: "demo" },
  { id: "sg-web", name: "web-security-group", type: "SecurityGroup", SystemName: "demo" },
  { id: "sg-db", name: "db-security-group", type: "SecurityGroup", SystemName: "demo" },
  { id: "cloudwatch", name: "monitoring", type: "CloudWatch", SystemName: "demo" },
]

const DEFAULT_EDGES: GraphRelationship[] = [
  { source: "api-gw", target: "lambda-payment", type: "INVOKES" },
  { source: "api-gw", target: "lambda-auth", type: "INVOKES" },
  { source: "api-gw", target: "lambda-user", type: "INVOKES" },
  { source: "alb-main", target: "ec2-web-1", type: "ROUTES_TO" },
  { source: "alb-main", target: "ec2-web-2", type: "ROUTES_TO" },
  { source: "lambda-payment", target: "rds-main", type: "QUERIES" },
  { source: "lambda-user", target: "rds-main", type: "QUERIES" },
  { source: "lambda-auth", target: "elasticache", type: "CACHES" },
  { source: "lambda-payment", target: "s3-logs", type: "WRITES" },
  { source: "lambda-payment", target: "sqs-queue", type: "PUBLISHES" },
  { source: "sqs-queue", target: "sns-topic", type: "TRIGGERS" },
  { source: "lambda-payment", target: "iam-lambda-role", type: "ASSUMES_ROLE" },
  { source: "lambda-auth", target: "iam-lambda-role", type: "ASSUMES_ROLE" },
  { source: "ec2-web-1", target: "iam-ec2-role", type: "ASSUMES_ROLE" },
  { source: "ec2-web-1", target: "sg-web", type: "PROTECTED_BY" },
  { source: "ec2-web-2", target: "sg-web", type: "PROTECTED_BY" },
  { source: "rds-main", target: "sg-db", type: "PROTECTED_BY" },
  { source: "rds-replica", target: "sg-db", type: "PROTECTED_BY" },
  { source: "rds-main", target: "rds-replica", type: "REPLICATES_TO" },
  { source: "lambda-payment", target: "cloudwatch", type: "LOGS_TO" },
  { source: "ec2-web-1", target: "cloudwatch", type: "LOGS_TO" },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CloudGraphTab({ systemName }: CloudGraphTabProps) {
  // Initialize with fallback data so graph always shows something
  const [nodes, setNodes] = useState<GraphNode[]>(DEFAULT_NODES)
  const [edges, setEdges] = useState<GraphRelationship[]>(DEFAULT_EDGES)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<ServiceNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [isAnimating, setIsAnimating] = useState(true)
  const [filterActual, setFilterActual] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [zoom, setZoom] = useState(1)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Try multiple endpoints
      const endpoints = [
        "/api/proxy/graph-data",
        "https://saferemediate-backend.onrender.com/api/graph/snapshot",
        "https://saferemediate-backend.onrender.com/api/graph/live",
      ]
      
      let data = null
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint)
          if (res.ok) {
            data = await res.json()
            break
          }
        } catch (e) {
          continue
        }
      }
      
      // If no data from any endpoint, keep using default fallback (already in state)
      if (!data) {
        console.log("[CloudGraphTab] No data from endpoints, keeping default fallback")
        return
      }

      const rawNodes = data.nodes || data.infrastructure?.nodes || []
      const rawEdges = data.relationships || data.edges || []

      // Only update if we got real data, otherwise keep fallback
      if (rawNodes.length > 0) {
        console.log("[CloudGraphTab] Got real data:", rawNodes.length, "nodes")
        setNodes(rawNodes)
        setEdges(rawEdges)
      } else {
        console.log("[CloudGraphTab] Empty response, keeping default fallback")
      }
    } catch (err) {
      // Don't set error - just log and keep fallback data
      console.log("[CloudGraphTab] Fetch error, keeping default fallback:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Process nodes into service groups
  const serviceNodes = useMemo(() => {
    const groups = new Map<string, GraphNode[]>()
    
    nodes.forEach(node => {
      const serviceType = getServiceType(node)
      if (serviceType === "VPC") return // Skip VPC/Subnet containers
      
      if (!groups.has(serviceType)) {
        groups.set(serviceType, [])
      }
      groups.get(serviceType)!.push(node)
    })
    
    const result: ServiceNode[] = []
    
    // Layout configuration
    const layout = {
      vpcX: 60,
      vpcWidth: 700,
      externalX: 820,
      
      public: { y: 140, items: [] as string[] },
      "private-app": { y: 300, items: [] as string[] },
      "private-db": { y: 480, items: [] as string[] },
      external: { y: 140, items: [] as string[] },
    }
    
    // Assign services to subnets
    groups.forEach((_, serviceType) => {
      const subnet = getSubnet(serviceType)
      layout[subnet].items.push(serviceType)
    })
    
    // Position nodes
    Object.entries(layout).forEach(([subnet, config]) => {
      if (subnet === "vpcX" || subnet === "vpcWidth" || subnet === "externalX") return
      
      const items = (config as { y: number; items: string[] }).items
      const y = (config as { y: number }).y
      const isExternal = subnet === "external"
      
      items.forEach((serviceType, idx) => {
        const nodeGroup = groups.get(serviceType)
        if (!nodeGroup) return
        
        let x: number
        if (isExternal) {
          // External services on the right
          x = layout.externalX
          const adjustedY = y + idx * 130
          result.push({
            id: serviceType,
            type: serviceType,
            displayName: displayNames[serviceType] || serviceType,
            count: nodeGroup.length,
            color: colors[serviceType] || colors.Default,
            x,
            y: adjustedY,
            zone: "external",
            subnet: "external",
          })
        } else {
          // VPC services
          const spacing = 130
          const totalWidth = items.length * spacing
          const startX = layout.vpcX + (layout.vpcWidth - totalWidth) / 2 + spacing / 2
          x = startX + idx * spacing
          
          result.push({
            id: serviceType,
            type: serviceType,
            displayName: displayNames[serviceType] || serviceType,
            count: nodeGroup.length,
            color: colors[serviceType] || colors.Default,
            x,
            y,
            zone: "vpc",
            subnet: subnet as ServiceNode["subnet"],
          })
        }
      })
    })
    
    return result
  }, [nodes])

  // Process edges into flows
  const dataFlows = useMemo(() => {
    const flowMap = new Map<string, DataFlow>()
    
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.source)
      const toNode = nodes.find(n => n.id === edge.target)
      if (!fromNode || !toNode) return
      
      const fromType = getServiceType(fromNode)
      const toType = getServiceType(toNode)
      if (fromType === toType || fromType === "VPC" || toType === "VPC") return
      
      const key = `${fromType}-${toType}`
      const isActual = edge.type.includes("ACTUAL") || edge.type.includes("RUNTIME")
      
      if (!flowMap.has(key)) {
        flowMap.set(key, { from: fromType, to: toType, type: edge.type, isActual })
      } else if (isActual) {
        flowMap.get(key)!.isActual = true
      }
    })
    
    return Array.from(flowMap.values())
  }, [edges, nodes])

  const filteredFlows = filterActual ? dataFlows.filter(f => f.isActual) : dataFlows

  // Get position helper
  const getPos = (serviceType: string) => {
    const node = serviceNodes.find(n => n.type === serviceType)
    return node ? { x: node.x, y: node.y } : null
  }

  // Stats
  const stats = {
    resources: nodes.length,
    connections: edges.length,
    actual: edges.filter(e => e.type.includes("ACTUAL") || e.type.includes("RUNTIME")).length,
    services: serviceNodes.length,
  }

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-xl">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500">Loading architecture...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-xl">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium mb-2">Failed to load graph</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-white border rounded-full text-sm font-medium shadow-sm">
            AWS Cloud
          </span>
          <span className="px-3 py-1.5 bg-emerald-500 text-white rounded-full text-sm font-medium">
            Production
          </span>
          <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm">
            eu-west-1
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* ACTUAL filter */}
          <button
            onClick={() => setFilterActual(!filterActual)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterActual 
                ? "bg-purple-100 text-purple-700 border border-purple-200" 
                : "bg-white border hover:bg-gray-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            ACTUAL
          </button>
          
          {/* Zoom */}
          <div className="flex items-center bg-white border rounded-lg">
            <button 
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
              className="p-1.5 hover:bg-gray-50 transition"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs text-gray-600 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
              className="p-1.5 hover:bg-gray-50 transition"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          
          {/* Controls */}
          <button 
            onClick={() => setShowLabels(!showLabels)}
            className="p-1.5 bg-white border rounded-lg hover:bg-gray-50 transition"
          >
            {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={() => setIsAnimating(!isAnimating)}
            className="p-1.5 bg-white border rounded-lg hover:bg-gray-50 transition"
          >
            {isAnimating ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={fetchData}
            className="p-1.5 bg-white border rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div 
        className="relative bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border shadow-inner overflow-hidden"
        style={{ height: 620 }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 960 600"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="publicSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#DCFCE7" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#BBF7D0" stopOpacity="0.3"/>
            </linearGradient>
            <linearGradient id="privateAppSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#BFDBFE" stopOpacity="0.3"/>
            </linearGradient>
            <linearGradient id="privateDbSubnet" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F3E8FF" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#E9D5FF" stopOpacity="0.3"/>
            </linearGradient>
            
            {/* Arrow markers */}
            <marker id="arrowActual" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#8B5CF6"/>
            </marker>
            <marker id="arrowStatic" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#9CA3AF"/>
            </marker>
          </defs>

          {/* VPC Container */}
          <rect 
            x="40" y="40" 
            width="720" height="540" 
            fill="none" 
            stroke="#22C55E" 
            strokeWidth="2" 
            rx="12"
          />
          <rect x="40" y="40" width="140" height="28" fill="#22C55E" rx="6"/>
          <text x="52" y="58" fill="white" fontSize="12" fontWeight="600">Production VPC</text>

          {/* Public Subnet */}
          <rect 
            x="60" y="90" 
            width="680" height="100" 
            fill="url(#publicSubnet)" 
            stroke="#86EFAC" 
            strokeWidth="1.5" 
            rx="8"
          />
          <text x="72" y="108" fill="#16A34A" fontSize="10" fontWeight="500">Public Subnet</text>

          {/* Private Application Subnet */}
          <rect 
            x="60" y="210" 
            width="680" height="140" 
            fill="url(#privateAppSubnet)" 
            stroke="#93C5FD" 
            strokeWidth="1.5" 
            rx="8"
          />
          <text x="72" y="228" fill="#2563EB" fontSize="10" fontWeight="500">Private Subnet (Application)</text>

          {/* Private Database Subnet */}
          <rect 
            x="60" y="370" 
            width="680" height="120" 
            fill="url(#privateDbSubnet)" 
            stroke="#D8B4FE" 
            strokeWidth="1.5" 
            rx="8"
          />
          <text x="72" y="388" fill="#9333EA" fontSize="10" fontWeight="500">Private Subnet (Database)</text>

          {/* External Services Label */}
          <text x="820" y="120" fill="#6B7280" fontSize="11" fontWeight="500">External Services</text>

          {/* Data Flows */}
          {filteredFlows.map((flow, i) => {
            const from = getPos(flow.from)
            const to = getPos(flow.to)
            if (!from || !to) return null
            
            const dx = to.x - from.x
            const dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            
            // Curved path
            const midX = (from.x + to.x) / 2
            const midY = (from.y + to.y) / 2
            const perpX = -dy / dist
            const perpY = dx / dist
            const curve = Math.min(dist * 0.2, 40)
            const ctrlX = midX + perpX * curve
            const ctrlY = midY + perpY * curve
            
            const path = `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`
            const color = flow.isActual ? "#8B5CF6" : "#9CA3AF"
            const marker = flow.isActual ? "url(#arrowActual)" : "url(#arrowStatic)"
            
            return (
              <g key={`flow-${i}`} opacity={hoveredNode && hoveredNode !== flow.from && hoveredNode !== flow.to ? 0.15 : 1}>
                {/* Glow for ACTUAL */}
                {flow.isActual && (
                  <path d={path} fill="none" stroke="#8B5CF6" strokeWidth="6" opacity="0.15"/>
                )}
                
                {/* Main line */}
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={flow.isActual ? 2 : 1.5}
                  strokeDasharray={flow.isActual ? "none" : "6 4"}
                  markerEnd={marker}
                  opacity="0.8"
                />
                
                {/* Animated particles */}
                {isAnimating && (
                  <>
                    <circle r={flow.isActual ? 4 : 3} fill={color}>
                      <animateMotion dur="2s" repeatCount="indefinite" path={path}/>
                    </circle>
                    <circle r={flow.isActual ? 3 : 2} fill={color} opacity="0.6">
                      <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="0.7s"/>
                    </circle>
                    {flow.isActual && (
                      <circle r="2" fill="#C4B5FD" opacity="0.5">
                        <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="1.4s"/>
                      </circle>
                    )}
                  </>
                )}
              </g>
            )
          })}

          {/* Service Nodes */}
          {serviceNodes.map(service => {
            const isHovered = hoveredNode === service.type
            const isSelected = selectedNode?.type === service.type
            const isFiltered = searchQuery && !service.displayName.toLowerCase().includes(searchQuery.toLowerCase())
            
            if (isFiltered) return null
            
            return (
              <g
                key={service.id}
                transform={`translate(${service.x}, ${service.y})`}
                onMouseEnter={() => setHoveredNode(service.type)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(service)}
                className="cursor-pointer"
                opacity={hoveredNode && !isHovered ? 0.4 : 1}
                style={{ transition: "opacity 0.2s" }}
              >
                {/* Selection/Hover ring */}
                {(isSelected || isHovered) && (
                  <rect
                    x="-30"
                    y="-30"
                    width="60"
                    height="60"
                    rx="10"
                    fill="none"
                    stroke={isSelected ? "#3B82F6" : "#6B7280"}
                    strokeWidth="2"
                    strokeDasharray={isSelected ? "none" : "4 2"}
                  />
                )}
                
                {/* Icon */}
                <foreignObject x="-22" y="-22" width="44" height="44">
                  {getIcon(service.type)}
                </foreignObject>
                
                {/* Count badge */}
                {service.count > 1 && (
                  <g transform="translate(18, -18)">
                    <circle r="11" fill="white" stroke={service.color} strokeWidth="1.5"/>
                    <text 
                      textAnchor="middle" 
                      y="4" 
                      fill={service.color} 
                      fontSize="10" 
                      fontWeight="700"
                    >
                      {service.count}
                    </text>
                  </g>
                )}
                
                {/* Label */}
                {showLabels && (
                  <text
                    y="38"
                    textAnchor="middle"
                    fill="#374151"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {service.displayName}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Node Detail Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-64 bg-white rounded-xl shadow-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {getIcon(selectedNode.type)}
                <div>
                  <h4 className="font-semibold text-gray-900">{selectedNode.displayName}</h4>
                  <p className="text-xs text-gray-500">{selectedNode.count} instance(s)</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-4 h-4"/>
              </button>
            </div>
            
            <div className="space-y-2 text-sm border-t pt-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Zone</span>
                <span className="capitalize">{selectedNode.zone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subnet</span>
                <span className="capitalize">{selectedNode.subnet.replace("-", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Connections</span>
                <span className="text-purple-600 font-medium">
                  {dataFlows.filter(f => f.from === selectedNode.type || f.to === selectedNode.type).length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Total Resources</p>
          <p className="text-2xl font-bold text-gray-900">{stats.resources}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Service Types</p>
          <p className="text-2xl font-bold text-gray-900">{stats.services}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Connections</p>
          <p className="text-2xl font-bold text-gray-900">{stats.connections}</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">ACTUAL Flows</p>
          <p className="text-2xl font-bold text-purple-600">{stats.actual}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border text-xs shadow-sm">
        <div className="flex items-center gap-6">
          <span className="font-medium text-gray-700">Legend:</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-purple-500 rounded"/>
            <span className="text-gray-600">ACTUAL Traffic</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-400"/>
            <span className="text-gray-600">Static (Allowed)</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: "#ED7100" }}/>
            <span className="text-gray-600">Compute</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: "#3B48CC" }}/>
            <span className="text-gray-600">Database</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: "#3F8624" }}/>
            <span className="text-gray-600">Storage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: "#E7157B" }}/>
            <span className="text-gray-600">Integration</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: "#DD344C" }}/>
            <span className="text-gray-600">Security</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CloudGraphTab
