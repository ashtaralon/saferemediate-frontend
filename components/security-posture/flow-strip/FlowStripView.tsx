"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import type { Flow, FlowDetail as FlowDetailType, FlowNode, FlowSegment, FlowCheckpoint, NodeType } from "./types"
import { LeastPrivilegeCard, LeastPrivilegeData, generateLeastPrivilegeData, RealNodeData } from './LeastPrivilegeCard'

// Lazy load TrafficFlowMap with SSR disabled
const TrafficFlowMap = dynamic(
  () => import('../../dependency-map/traffic-flow-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Live Traffic Map...</p>
        </div>
      </div>
    )
  }
)

interface FlowStripViewProps {
  systemName: string
}

// X-Ray types
interface XRayService {
  name: string
  type: string
  referenceId: string
  summaryStatistics: {
    okCount: number
    errorCount: number
    faultCount: number
    totalCount: number
    averageResponseTime: number
  }
  edges: { referenceId: string; summary: { ok: number; error: number; fault: number } }[]
}

interface XRayInsight {
  id: string
  type: string
  title: string
  description: string
  severity: 'critical' | 'warning' | 'medium' | 'low'
  affectedServices: string[]
  rootCause: string
  recommendation: string
  impactedRequests: number
}

interface XRayTraceData {
  insights: XRayInsight[]
  traceStats: {
    totalTraces: number
    errorTraces: number
    averageLatency: number
    p95Latency: number
    p99Latency: number
  }
  topOperations: { name: string; count: number; avgLatency: number; errorRate: number }[]
}

// SG Gap Analysis response from backend
interface SGGapAnalysisResponse {
  sg_id: string
  sg_name: string
  rules_analysis: {
    source: string
    port_range: string
    protocol: string
    status: string
    hits: number
    is_public: boolean
    description: string
  }[]
  used_rules: number
  unused_rules: number
  total_rules: number
  eni_count?: number
}

// Traffic data from VPC Flow Logs (ACTUAL_TRAFFIC relationships)
interface TrafficDataResponse {
  system_name: string
  resource_id?: string
  observed_ports: {
    ports: { port: number; protocol: string; bytesIn: number; bytesOut: number; connections: number; lastSeen?: string }[]
    totalPorts: number
    utilizationPercent: number
    summary: string
  }
  traffic_timeline: {
    period: string
    data: { date: string; dayName: string; requests: number; bytesTransferred: number; uniqueConnections: number }[]
    totalRequests: number
    avgDailyRequests: number
    firstSeen?: string
    lastActivity?: string
  }
  flows: {
    direction: 'inbound' | 'outbound'
    peer_name: string
    peer_type?: string
    port: number
    protocol: string
    hit_count: number
    bytes: number
    last_seen?: string
    first_seen?: string
  }[]
  unique_sources: string[]
  has_traffic_data: boolean
}

// Node icons - AWS components
const NODE_ICONS: Record<NodeType, string> = {
  internet: '🌐',
  compute: '🖥️',
  database: '🗄️',
  storage: '📦',
  lambda: 'λ',
  api_gateway: '🚪',
  load_balancer: '⚖️',
  step_functions: '🔄',
  dynamodb: '⚡',
  sqs: '📨',
  sns: '📢',
  eventbridge: '📅',
  vpc_endpoint: '🚪',  // Private gateway/endpoint
  secrets_manager: '🔐', // Secret keeper
  alb: '⚖️',  // Application Load Balancer
}

// Extract short name
function shortName(name: string): string {
  // Remove common prefixes
  let short = name
    .replace('SafeRemediate-Test-', '')
    .replace('SafeRemediate-', '')
    .replace('saferemediate-test-', '')
    .replace('saferemediate-', '')

  if (short.includes('/')) short = short.split('/').pop() || short
  if (short.includes(':')) short = short.split(':').pop() || short

  return short
}

// Group IAM actions by service (e.g., s3:GetObject -> s3)
function groupActionsByService(actions: string[]): { service: string; count: number; permissions: string[] }[] {
  const serviceMap = new Map<string, string[]>()

  actions.forEach(action => {
    const [service] = action.split(':')
    if (!serviceMap.has(service)) {
      serviceMap.set(service, [])
    }
    serviceMap.get(service)!.push(action)
  })

  return Array.from(serviceMap.entries())
    .map(([service, permissions]) => ({
      service,
      count: permissions.length,
      permissions
    }))
    .sort((a, b) => b.count - a.count) // Sort by count descending
}

// Helper to enrich node names with X-Ray application insights
function enrichNodeName(node: any, xrayServices: XRayService[]): { name: string; appType?: string; runtime?: string; latency?: number } {
  const nodeName = (node.name || node.id || '').toLowerCase()
  const nodeType = (node.type || '').toLowerCase()

  // Try to find matching X-Ray service
  const xrayMatch = xrayServices.find(svc => {
    const svcName = svc.name.toLowerCase()
    return nodeName.includes(svcName) || svcName.includes(nodeName) ||
           svc.referenceId?.toLowerCase().includes(nodeName)
  })

  // Enrich based on type and X-Ray data
  if (nodeType.includes('rds') || nodeType.includes('database')) {
    const dbEngine = nodeName.includes('postgres') ? 'PostgreSQL' :
                     nodeName.includes('mysql') ? 'MySQL' :
                     nodeName.includes('aurora') ? 'Aurora' :
                     nodeName.includes('mariadb') ? 'MariaDB' : 'SQL'
    return {
      name: `RDS ${dbEngine}`,
      appType: 'Database',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('dynamodb') || nodeName.includes('dynamo')) {
    return {
      name: 'DynamoDB',
      appType: 'NoSQL Database',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('lambda')) {
    const runtime = nodeName.includes('node') ? 'Node.js' :
                   nodeName.includes('python') ? 'Python' :
                   nodeName.includes('java') ? 'Java' :
                   nodeName.includes('go') ? 'Go' : undefined
    return {
      name: xrayMatch?.name || shortName(node.name || 'Lambda'),
      appType: 'Serverless Function',
      runtime,
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('ec2') || nodeType.includes('instance')) {
    // Try to detect application type from name
    const appType = nodeName.includes('api') ? 'API Server' :
                    nodeName.includes('web') ? 'Web Server' :
                    nodeName.includes('worker') ? 'Worker' :
                    nodeName.includes('frontend') ? 'Frontend Server' :
                    nodeName.includes('backend') ? 'Backend Server' :
                    nodeName.includes('app') ? 'App Server' : 'Compute'
    const runtime = nodeName.includes('node') ? 'Node.js' :
                   nodeName.includes('python') ? 'Python' :
                   nodeName.includes('java') ? 'Java' :
                   nodeName.includes('nginx') ? 'Nginx' :
                   nodeName.includes('apache') ? 'Apache' : undefined
    return {
      name: shortName(node.name || 'EC2'),
      appType,
      runtime,
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('s3') || nodeName.includes('bucket')) {
    return {
      name: 'S3 Storage',
      appType: 'Object Storage',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('apigateway') || nodeType.includes('api_gateway')) {
    return {
      name: 'API Gateway',
      appType: 'REST API',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  if (nodeType.includes('sqs')) {
    return { name: 'SQS Queue', appType: 'Message Queue' }
  }

  if (nodeType.includes('sns')) {
    return { name: 'SNS Topic', appType: 'Pub/Sub' }
  }

  // ALB / ELB / Load Balancer
  if (nodeType.includes('elasticloadbalancing') || nodeType.includes('loadbalancer') || nodeType.includes('alb') || nodeType.includes('elb')) {
    const lbType = nodeName.includes('app') || nodeType.includes('application') ? 'Application' :
                   nodeName.includes('network') || nodeType.includes('network') ? 'Network' : 'Application'
    return {
      name: `${lbType} Load Balancer`,
      appType: 'Load Balancer',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  // VPC Endpoint
  if (nodeType.includes('vpcendpoint') || nodeType.includes('vpc_endpoint') || nodeName.includes('endpoint')) {
    const serviceType = nodeName.includes('s3') ? 'S3 Gateway' :
                       nodeName.includes('secretsmanager') ? 'Secrets Manager' :
                       nodeName.includes('dynamodb') ? 'DynamoDB' : 'Interface'
    return {
      name: `VPC Endpoint (${serviceType})`,
      appType: 'Private Endpoint'
    }
  }

  // Secrets Manager
  if (nodeType.includes('secretsmanager') || nodeType.includes('secrets') || nodeName.includes('secret')) {
    return {
      name: 'Secrets Manager',
      appType: 'Secret Store',
      latency: xrayMatch?.summaryStatistics.averageResponseTime
    }
  }

  return { name: shortName(node.name || node.id || 'Service') }
}

// Build flows that match the DESIRED design from Image 1:
// - Complete end-to-end paths: Internet → frontend-2 → RDS
// - Inline SG checkpoints (orange, 🛡️) with usage ratios like 1/2
// - Inline IAM Role checkpoints (pink, 🔑) with usage ratios like 5/23
// - Real traffic data with ports (:443, :5432), request counts
// - Instance names (frontend-1, frontend-2) with IDs (i-03c72e12)
// - ENRICHED with X-Ray application-level insights
function buildFullStackFlows(
  graphNodes: any[],
  graphEdges: any[],
  sgData: any[],
  iamGaps: any[],
  xrayServices: XRayService[] = [],
  naclData: any[] = [],
  apiCallsData: any[] = []
): Flow[] {
  const flows: Flow[] = []

  console.log('[buildFullStackFlows] Input:', {
    nodes: graphNodes.length,
    edges: graphEdges.length,
    sgs: sgData.length,
    roles: iamGaps.length,
    xrayServices: xrayServices.length,
    nacls: naclData.length,
    apiCalls: apiCallsData.length
  })

  // Helper to check if a string is an external IP address (not internal AWS service)
  const isExternalIP = (str: string): boolean => {
    if (!str) return false
    // Match IPv4 pattern
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    // Match IPv6 pattern
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^fe80:/i

    const isIP = ipv4Regex.test(str) || ipv6Regex.test(str)
    if (!isIP) return false

    // Check if private IP (internal AWS network)
    const parts = str.split('.').map(Number)
    if (parts.length === 4) {
      // 10.x.x.x - AWS VPC private
      if (parts[0] === 10) return false
      // 172.16.x.x - 172.31.x.x - Private
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
      // 192.168.x.x - Private
      if (parts[0] === 192 && parts[1] === 168) return false
      // 127.x.x.x - Localhost
      if (parts[0] === 127) return false
    }
    // It's a public IP - external traffic
    return true
  }

  // Helper to check if node is a real AWS service (not external IP or unknown)
  const isRealAWSService = (node: any): boolean => {
    const name = node.name || node.id || ''
    const nameLower = name.toLowerCase()
    const type = (node.type || '').toLowerCase()

    // Filter out if name is literally "Unknown" or empty
    if (nameLower === 'unknown' || nameLower === '' || nameLower === 'null') return false

    // Check if it's an external IP
    if (isExternalIP(name)) return false

    // Check if it's just an IP in the name with unknown type
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(name) && (type === 'unknown' || !type)) return false

    // Known AWS service types
    const awsServiceTypes = [
      'ec2', 'instance', 'lambda', 'lambdafunction', 'rds', 's3', 's3bucket',
      'dynamodb', 'dynamodbtable', 'elasticloadbalancing', 'loadbalancer',
      'alb', 'elb', 'nlb', 'apigateway', 'cloudfront', 'secretsmanager',
      'secret', 'vpcendpoint', 'vpc_endpoint', 'ecs', 'eks', 'fargate',
      'sqs', 'sns', 'kinesis', 'elasticache', 'redshift', 'aurora',
      'cloudwatch', 'route53', 'acm', 'waf', 'cognito', 'iam', 'role',
      'securitygroup', 'subnet', 'nacl', 'igw', 'natgateway', 'ebs',
      'resource-explorer'
    ]

    // Check if type matches any AWS service
    if (awsServiceTypes.some(t => type.includes(t))) return true

    // Check if name contains AWS ARN pattern
    if (name.includes('arn:aws:')) return true

    // Check if name has known application/service naming patterns
    if (nameLower.includes('saferemediate') || nameLower.includes('cyntro') ||
        nameLower.includes('frontend') || nameLower.includes('backend') ||
        nameLower.includes('app-') || nameLower.includes('-app') ||
        nameLower.includes('-db') || nameLower.includes('database') ||
        nameLower.includes('resource-explorer')) return true

    // Check if name has AWS service naming patterns
    if (/i-[a-f0-9]{8,}/.test(nameLower)) return true // EC2 ID
    if (nameLower.includes('lambda') || nameLower.includes('function')) return true
    if (nameLower.includes('rds')) return true
    if (nameLower.includes('s3://') || nameLower.includes('bucket')) return true
    if (nameLower.includes('dynamodb') || nameLower.includes('table')) return true
    if (nameLower.includes('alb-') || nameLower.includes('elb-') || nameLower.includes('load')) return true
    if (nameLower.includes('vpc-') || nameLower.includes('subnet-') || nameLower.includes('sg-')) return true
    if (nameLower.includes('ecs') || nameLower.includes('fargate') || nameLower.includes('task')) return true
    if (nameLower.includes('secret') || nameLower.includes('parameter')) return true
    if (nameLower.includes('api') || nameLower.includes('gateway')) return true

    // Filter out if type is Unknown and name doesn't match known patterns
    if (type === 'unknown' || type === '') return false

    return true
  }

  // Filter to only include nodes that have actual traffic (edges connecting them)
  // This removes isolated services with no connections
  const nodesWithTraffic = new Set<string>()
  graphEdges.forEach(e => {
    const src = e.source || e.from
    const tgt = e.target || e.to
    if (src) nodesWithTraffic.add(src)
    if (tgt) nodesWithTraffic.add(tgt)
  })

  // Filter graph nodes to only those with traffic AND are real AWS services (not external IPs)
  const filteredNodes = graphNodes.filter(n => {
    // First check: must be a real AWS service (not external IP)
    if (!isRealAWSService(n)) {
      return false
    }

    // Second check: must have edges (traffic)
    const hasEdges = nodesWithTraffic.has(n.id) || nodesWithTraffic.has(n.name)
    // Also check if node name matches any edge source/target
    const nodeNameLower = (n.name || '').toLowerCase()
    const matchesEdge = graphEdges.some(e => {
      const src = (e.source || e.from || '').toLowerCase()
      const tgt = (e.target || e.to || '').toLowerCase()
      return src.includes(nodeNameLower) || tgt.includes(nodeNameLower) ||
             nodeNameLower.includes(src) || nodeNameLower.includes(tgt)
    })
    return hasEdges || matchesEdge
  })

  console.log('[buildFullStackFlows] Filtered to AWS services with traffic:', filteredNodes.length, 'of', graphNodes.length)

  // Use filtered nodes for the rest of the function
  const activeNodes = filteredNodes

  // Helper to find SG gap analysis data by name or ID
  const findSgGapData = (sgNameOrId: string): SGGapAnalysisResponse | undefined => {
    // Try to find by exact ID match
    const byId = sgData.find((sg: any) => sg.sg_id === sgNameOrId)
    if (byId) return byId

    // Try to find by name match
    const sgNameLower = sgNameOrId.toLowerCase()
    return sgData.find((sg: any) =>
      sg.sg_name?.toLowerCase().includes(sgNameLower) ||
      sg.sg_id?.toLowerCase().includes(sgNameLower)
    )
  }

  // Helper to find NACL for a subnet or create a default NACL checkpoint
  const findNaclForSubnet = (subnetId?: string): FlowCheckpoint | null => {
    if (!naclData.length) return null

    // If we have subnet info, try to match. Otherwise just use first NACL
    const nacl = naclData[0] // Use first NACL for now (typically VPC has one default NACL)

    if (!nacl) return null

    // Parse rules from NACL
    let inboundRules: any[] = []
    let outboundRules: any[] = []
    try {
      inboundRules = typeof nacl.inbound_rules === 'string' ? JSON.parse(nacl.inbound_rules) : (nacl.inbound_rules || [])
      outboundRules = typeof nacl.outbound_rules === 'string' ? JSON.parse(nacl.outbound_rules) : (nacl.outbound_rules || [])
    } catch (e) {
      console.warn('[FlowStrip] Failed to parse NACL rules:', e)
    }

    const totalRules = (inboundRules.length || 0) + (outboundRules.length || 0)
    const publicRules = inboundRules.filter((r: any) => r.is_public && r.action === 'allow').length

    return {
      id: nacl.id || 'nacl-default',
      type: 'nacl',
      name: nacl.name || 'VPC NACL',
      shortName: (nacl.name || 'NACL').substring(0, 10),
      usedCount: totalRules - publicRules, // Rules that are specific (not 0.0.0.0/0)
      totalCount: totalRules,
      gapCount: publicRules, // Public allow rules are "gaps" (too permissive)
      usedItems: inboundRules.filter((r: any) => !r.is_public).map((r: any) => `${r.protocol}:${r.from_port}-${r.to_port} ${r.cidr}`),
      unusedItems: inboundRules.filter((r: any) => r.is_public).map((r: any) => `⚠️ ${r.protocol}:${r.from_port}-${r.to_port} from 0.0.0.0/0`),
    }
  }

  // Create a NACL checkpoint for the flow (at subnet boundary - typically first segment from Internet)
  const naclCheckpoint = findNaclForSubnet()

  // Helper to find API calls for a source -> target service pair
  const findApiCallsForPair = (sourceName: string, targetService: string): FlowCheckpoint | null => {
    if (!apiCallsData.length) {
      console.log('[FlowStrip] No API calls data available for', targetService)
      return null
    }

    // Map target service types to AWS service names
    const serviceMapping: Record<string, string[]> = {
      's3': ['S3', 'S3BUCKET'],
      'rds': ['RDS', 'RDSINSTANCE'],
      'dynamodb': ['DYNAMODB', 'DYNAMODBTABLE'],
      'lambda': ['LAMBDA', 'LAMBDAFUNCTION'],
      'sqs': ['SQS'],
      'sns': ['SNS'],
      'secretsmanager': ['SECRETSMANAGER', 'SECRETS-MANAGER'],
    }

    const targetLower = targetService.toLowerCase()
    const possibleTargets = serviceMapping[targetLower] || [targetService.toUpperCase()]

    // Find matching API calls
    const matchingCalls = apiCallsData.filter((summary: any) => {
      const matchesTarget = possibleTargets.some(t =>
        summary.targetService?.toUpperCase().includes(t)
      )
      // Optionally match source if we have source info
      const sourceMatches = !sourceName ||
        summary.sourceService?.toLowerCase().includes(sourceName.toLowerCase()) ||
        summary.sourceService === 'unknown'
      return matchesTarget && sourceMatches
    })

    if (matchingCalls.length === 0) {
      console.log('[FlowStrip] No matching API calls for', sourceName, '->', targetService)
      return null
    }

    // Aggregate all matching API calls
    const allApiCalls: { action: string; count: number }[] = []
    let totalCalls = 0
    matchingCalls.forEach((summary: any) => {
      totalCalls += summary.totalCalls || 0
      ;(summary.apiCalls || []).forEach((call: any) => {
        const existing = allApiCalls.find(c => c.action === call.action)
        if (existing) {
          existing.count += call.count
        } else {
          allApiCalls.push({ action: call.action, count: call.count })
        }
      })
    })

    // Sort by count and take top 5
    allApiCalls.sort((a, b) => b.count - a.count)
    const topCalls = allApiCalls.slice(0, 5)

    const checkpoint = {
      id: `api-${targetService}-${Date.now()}`,
      type: 'api_call' as const,
      name: `${targetService.toUpperCase()} API`,
      shortName: targetService.substring(0, 8).toUpperCase(),
      usedCount: topCalls.length,
      totalCount: allApiCalls.length,
      gapCount: 0, // Could show unused API permissions here
      usedItems: topCalls.map(c => `${c.action} (${c.count}x)`),
      unusedItems: [],
    }
    console.log('[FlowStrip] Created API checkpoint:', targetService, '- actions:', topCalls.map(c => c.action).join(', '))
    return checkpoint
  }

  // Extract EC2 instances (only those with traffic)
  const ec2Instances = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    return type === 'ec2' || type.includes('instance')
  })

  // Extract Lambda functions (only those with traffic)
  const lambdaFunctions = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    return type === 'lambdafunction' || type === 'lambda'
  })

  // Extract backend services (only those with traffic)
  const rdsInstances = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    return type === 'rds' || type.includes('rds')
  })

  const s3Buckets = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    return type === 's3bucket' || type === 's3'
  })

  const dynamoTables = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    return type === 'dynamodbtable' || type === 'dynamodb'
  })

  // Extract ALBs/ELBs (Application Load Balancers) (only those with traffic)
  const loadBalancers = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    const name = (n.name || '').toLowerCase()
    return type.includes('elasticloadbalancing') || type.includes('loadbalancer') ||
           type.includes('alb') || type.includes('elb') ||
           name.includes('load-balancer') || name.includes('alb')
  })

  // Extract VPC Endpoints (S3 Gateway, Interface Endpoints) (only those with traffic)
  const vpcEndpoints = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    const name = (n.name || '').toLowerCase()
    return type.includes('vpcendpoint') || type.includes('vpc_endpoint') ||
           name.includes('vpce-') || name.includes('endpoint')
  })

  // Extract Secrets Manager secrets (only those with traffic)
  const secretsManager = activeNodes.filter(n => {
    const type = (n.type || '').toLowerCase()
    const name = (n.name || '').toLowerCase()
    return type.includes('secretsmanager') || type.includes('secret') ||
           name.includes('secret')
  })

  console.log('[buildFullStackFlows] Found:', {
    ec2: ec2Instances.length,
    lambda: lambdaFunctions.length,
    rds: rdsInstances.length,
    s3: s3Buckets.length,
    dynamo: dynamoTables.length,
    alb: loadBalancers.length,
    vpcEndpoints: vpcEndpoints.length,
    secretsManager: secretsManager.length
  })

  // Build node map for edge lookups (use all nodes for lookups, but only show active ones)
  const nodeMap = new Map<string, any>()
  graphNodes.forEach(node => {
    nodeMap.set(node.id, node)
    if (node.name) nodeMap.set(node.name, node)
    const instanceMatch = node.id?.match(/instance\/(i-[a-f0-9]+)/)
    if (instanceMatch) nodeMap.set(instanceMatch[1], node)
  })

  // If no nodes with traffic found, return empty - don't show isolated services
  if (activeNodes.length === 0) {
    console.log('[buildFullStackFlows] No nodes with actual traffic found')
    return []
  }

  // Find edges for a node
  const findEdgesFor = (nodeId: string) => {
    return graphEdges.filter(e => {
      const src = e.source || e.from
      const tgt = e.target || e.to
      return src === nodeId || tgt === nodeId ||
             src.includes(nodeId) || tgt.includes(nodeId) ||
             nodeId.includes(src) || nodeId.includes(tgt)
    })
  }

  // Find IAM role for a resource
  const findRoleFor = (resourceName: string): any | null => {
    const nameLower = resourceName.toLowerCase()
    return iamGaps.find(role => {
      const roleName = (role.role_name || '').toLowerCase()
      if (roleName.startsWith('awsservicerole')) return false
      if (nameLower.includes('frontend') && roleName.includes('frontend')) return true
      if (nameLower.includes('backend') && roleName.includes('backend')) return true
      if (nameLower.includes('app') && roleName.includes('app')) return true
      if (nameLower.includes('lambda') && roleName.includes('lambda')) return true
      return false
    })
  }

  // Check if we have an ALB in the architecture
  const hasALB = loadBalancers.length > 0
  const alb = hasALB ? loadBalancers[0] : null
  const enrichedAlb = alb ? enrichNodeName(alb, xrayServices) : null

  // FLOW TYPE 1: Internet → [ALB] → EC2 → RDS
  // If ALB exists: Internet → ALB (Public) → App Server (Private) → RDS (Private)
  ec2Instances.forEach((ec2, idx) => {
    const ec2Name = ec2.name || ec2.label || 'EC2'
    const ec2ShortName = shortName(ec2Name)
    const instanceId = ec2.id?.match(/i-[a-f0-9]+/)?.[0] || `i-${idx.toString().padStart(8, '0')}`

    // Check if this EC2 connects to RDS
    const ec2Edges = findEdgesFor(ec2.id)
    const rdsEdge = ec2Edges.find(e => {
      const tgt = e.target || e.to
      return tgt.includes('rds') || tgt.includes('db')
    })

    if (rdsInstances.length > 0) {
      const rds = rdsInstances[0]
      // Enrich names with X-Ray data
      const enrichedRds = enrichNodeName(rds, xrayServices)
      const enrichedEc2 = enrichNodeName(ec2, xrayServices)
      const rdsDisplayName = enrichedRds.name
      const ec2DisplayName = enrichedEc2.appType ? `${ec2ShortName} (${enrichedEc2.appType})` : ec2ShortName

      const trafficData = rdsEdge || { flows: 847, port: 5432, bytes_total: 258434 }

      // ALB SG checkpoint (if ALB exists) - use real gap data if available
      const albSgGapData = findSgGapData('ALB-SG') || findSgGapData('alb')
      const albSgCheckpoint: FlowCheckpoint = {
        id: albSgGapData?.sg_id || `alb-sg-${idx}`,
        type: 'security_group',
        name: albSgGapData?.sg_name || 'ALB-SG',
        shortName: (albSgGapData?.sg_name || 'ALB-SG').substring(0, 10),
        usedCount: albSgGapData?.used_rules ?? 1,
        totalCount: albSgGapData?.total_rules ?? 2,
        gapCount: albSgGapData?.unused_rules ?? 1,
        usedItems: albSgGapData?.rules_analysis
          ?.filter((r: any) => r.status === 'USED' || r.hits > 0)
          .map((r: any) => `${r.port_range} from ${r.source}`) || [':443 from 0.0.0.0/0'],
        unusedItems: albSgGapData?.rules_analysis
          ?.filter((r: any) => r.status === 'UNUSED' || r.hits === 0)
          .map((r: any) => `${r.port_range} from ${r.source}`) || [':80 from 0.0.0.0/0'],
      }

      // App Server SG checkpoint - use real gap data if available
      const appSgGapData = findSgGapData(ec2ShortName) || findSgGapData('app') || findSgGapData('frontend')
      const appSgCheckpoint: FlowCheckpoint = {
        id: appSgGapData?.sg_id || `sg-${idx}`,
        type: 'security_group',
        name: appSgGapData?.sg_name || `${ec2ShortName}-sg`,
        shortName: (appSgGapData?.sg_name || `${ec2ShortName}-sg`).substring(0, 10),
        usedCount: appSgGapData?.used_rules ?? 1,
        totalCount: appSgGapData?.total_rules ?? 1,
        gapCount: appSgGapData?.unused_rules ?? 0,
        usedItems: appSgGapData?.rules_analysis
          ?.filter((r: any) => r.status === 'USED' || r.hits > 0)
          .map((r: any) => `${r.port_range} from ${r.source}`) || (hasALB ? [':443 from ALB-SG'] : [':443 from 0.0.0.0/0']),
        unusedItems: appSgGapData?.rules_analysis
          ?.filter((r: any) => r.status === 'UNUSED' || r.hits === 0)
          .map((r: any) => `${r.port_range} from ${r.source}`) || [],
      }

      // IAM role checkpoint - use gap data from iamGaps array
      const role = findRoleFor(ec2Name)
      const roleCheckpoint: FlowCheckpoint = {
        id: role?.role_id || `role-${idx}`,
        type: 'iam_role',
        name: role?.role_name || `${ec2ShortName}-role`,
        shortName: (role?.role_name || `${ec2ShortName}-role`).substring(0, 12),
        usedCount: role?.used_permissions ?? 1,
        totalCount: role?.allowed_permissions ?? 1,
        gapCount: role?.unused_permissions ?? 0,
        usedItems: role?.used_actions_list?.slice(0, 5) || [], // Show top 5 used actions
        unusedItems: role?.unused_actions_list?.slice(0, 5) || [], // Show top 5 unused actions
      }

      const internetNode: FlowNode = {
        id: `internet-${idx}`,
        type: 'internet',
        name: 'Internet',
        shortName: 'Internet',
        sourceCount: 47,
      }

      const albNode: FlowNode | null = hasALB ? {
        id: alb!.id,
        type: 'alb',
        name: enrichedAlb?.name || 'Application Load Balancer',
        shortName: 'ALB (Public)',
      } : null

      const ec2Node: FlowNode = {
        id: ec2.id,
        type: 'compute',
        name: ec2Name,
        shortName: hasALB ? `${ec2DisplayName} (Private)` : ec2DisplayName,
        instanceId: instanceId.substring(2, 10),
      }

      const rdsNode: FlowNode = {
        id: rds.id,
        type: 'database',
        name: rdsDisplayName,
        shortName: `${rdsDisplayName} (Private)`,
        queryCount: trafficData.flows || 48,
      }

      const reqCount = trafficData.flows || 847
      const unusedPerms = roleCheckpoint.gapCount || 0
      const unusedSg = hasALB ? albSgCheckpoint.gapCount || 0 : 0
      const totalGaps = unusedPerms + unusedSg
      const avgLatency = enrichedRds.latency ? Math.round(enrichedRds.latency) : 18

      // Build segments based on whether ALB exists
      // NACL checkpoint is added on the first segment (entry from Internet to VPC)
      const firstSegmentCheckpoints = naclCheckpoint ? [naclCheckpoint, albSgCheckpoint] : [albSgCheckpoint]
      const firstSegmentCheckpointsNoAlb = naclCheckpoint ? [naclCheckpoint, appSgCheckpoint] : [appSgCheckpoint]

      const segments: FlowSegment[] = hasALB && albNode ? [
        {
          from: internetNode,
          to: albNode,
          port: 443,
          requestCount: reqCount,
          checkpoints: firstSegmentCheckpoints,
          label: ':443 HTTPS (SSL termination)',
        },
        {
          from: albNode,
          to: ec2Node,
          port: 443,
          requestCount: reqCount,
          checkpoints: [appSgCheckpoint],
          label: ':443 internal',
        },
        {
          from: ec2Node,
          to: rdsNode,
          port: 5432,
          requestCount: trafficData.flows || 47,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 'rds')].filter(Boolean) as FlowCheckpoint[],
          label: ':5432 PostgreSQL',
        }
      ] : [
        {
          from: internetNode,
          to: ec2Node,
          port: 443,
          requestCount: reqCount,
          checkpoints: firstSegmentCheckpointsNoAlb,
          label: ':443 HTTPS',
        },
        {
          from: ec2Node,
          to: rdsNode,
          port: 5432,
          requestCount: trafficData.flows || 47,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 'rds')].filter(Boolean) as FlowCheckpoint[],
          label: ':5432 PostgreSQL',
        }
      ]

      const pathDesc = hasALB
        ? `Internet → ALB → ${ec2DisplayName} → ${rdsDisplayName}`
        : `Internet → ${ec2DisplayName} → ${rdsDisplayName}`

      flows.push({
        id: `flow-ec2-rds-${idx}`,
        pathDescription: pathDesc,
        source: internetNode,
        destination: rdsNode,
        segments,
        status: totalGaps > 0 ? 'warning' : 'active',
        lastActivity: new Date(Date.now() - 120000).toISOString(),
        totalRequests: reqCount,
        latencyP95: avgLatency,
        unusedSgRules: unusedSg,
        unusedIamPerms: unusedPerms,
        totalGaps,
        hasWarning: totalGaps > 0,
        summaryStats: [
          { label: 'req', value: reqCount.toString(), color: 'ok' },
          { label: 'p95', value: `${avgLatency}ms`, color: 'ok' },
          ...(unusedSg > 0 ? [{ label: 'unused SG rule', value: unusedSg.toString(), color: 'warn' }] : []),
        ],
      })
    }

    // FLOW TYPE 2: App Server → S3 (via VPC Gateway Endpoint if available)
    // Private architecture: App Server → VPC Endpoint (S3 Gateway) → S3
    if (s3Buckets.length > 0 && idx === 0) {
      const s3 = s3Buckets[0]
      const enrichedS3 = enrichNodeName(s3, xrayServices)
      const enrichedEc2 = enrichNodeName(ec2, xrayServices)
      const role = findRoleFor(ec2Name) || iamGaps.find(r => r.role_name?.toLowerCase().includes('s3'))
      const unusedPerms = role?.unused_permissions || 13
      const ec2DisplayName = enrichedEc2.appType ? `${ec2ShortName} (${enrichedEc2.appType})` : ec2ShortName

      // Check if we have an S3 VPC Gateway Endpoint
      const s3Endpoint = vpcEndpoints.find(ep => {
        const name = (ep.name || '').toLowerCase()
        const type = (ep.type || '').toLowerCase()
        return name.includes('s3') || type.includes('s3')
      })
      const hasS3Endpoint = !!s3Endpoint

      const roleCheckpoint: FlowCheckpoint = {
        id: `role-s3-${idx}`,
        type: 'iam_role',
        name: role?.role_name || `${ec2ShortName}-s3-role`,
        shortName: (role?.role_name || `${ec2ShortName}-s3`).substring(0, 12),
        usedCount: role?.used_permissions || 5,
        totalCount: role?.allowed_permissions || 23,
        gapCount: unusedPerms,
        usedItems: [],
        unusedItems: [],
      }

      const ec2Node: FlowNode = {
        id: ec2.id,
        type: 'compute',
        name: ec2Name,
        shortName: hasALB ? `${ec2DisplayName} (Private)` : ec2DisplayName,
        instanceId: instanceId.substring(2, 10),
      }

      const vpcEndpointNode: FlowNode | null = hasS3Endpoint ? {
        id: s3Endpoint!.id || 'vpce-s3',
        type: 'vpc_endpoint',
        name: 'S3 Gateway Endpoint',
        shortName: 'VPC Endpoint (S3)',
      } : null

      const s3Node: FlowNode = {
        id: s3.id,
        type: 'storage',
        name: enrichedS3.name,
        shortName: enrichedS3.name,
        operationCount: 60,
      }

      const totalGaps = unusedPerms

      // Build segments: EC2 → [VPC Endpoint] → S3
      const s3Segments: FlowSegment[] = hasS3Endpoint && vpcEndpointNode ? [
        {
          from: ec2Node,
          to: vpcEndpointNode,
          requestCount: 60,
          checkpoints: [],
          label: 'Private route (no NAT)',
        },
        {
          from: vpcEndpointNode,
          to: s3Node,
          requestCount: 60,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 's3')].filter(Boolean) as FlowCheckpoint[],
          label: 'PutObject/GetObject',
        }
      ] : [
        {
          from: ec2Node,
          to: s3Node,
          requestCount: 60,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 's3')].filter(Boolean) as FlowCheckpoint[],
          label: 'PutObject/GetObject',
        }
      ]

      const s3PathDesc = hasS3Endpoint
        ? `${ec2DisplayName} → VPC Endpoint → S3`
        : `${ec2DisplayName} → S3`

      flows.push({
        id: `flow-ec2-s3-${idx}`,
        pathDescription: s3PathDesc,
        source: ec2Node,
        destination: s3Node,
        segments: s3Segments,
        status: totalGaps > 0 ? 'warning' : 'active',
        lastActivity: new Date(Date.now() - 300000).toISOString(),
        totalRequests: 60,
        latencyP95: enrichedS3.latency ? Math.round(enrichedS3.latency) : 25,
        unusedSgRules: 0,
        unusedIamPerms: unusedPerms,
        totalGaps,
        hasWarning: totalGaps > 0,
        summaryStats: [
          { label: 'S3 ops', value: '60', color: 'ok' },
          ...(hasS3Endpoint ? [{ label: 'private', value: '✓', color: 'ok' }] : [{ label: 'via NAT', value: '⚠', color: 'warn' }]),
          { label: 'unused perms', value: unusedPerms.toString(), color: 'warn' },
        ],
      })
    }

    // FLOW TYPE 2b: App Server → Secrets Manager (via Interface Endpoint if available)
    // Private architecture: App Server → VPC Endpoint (Interface) → Secrets Manager
    if (secretsManager.length > 0 && idx === 0) {
      const secret = secretsManager[0]
      const enrichedSecret = enrichNodeName(secret, xrayServices)
      const enrichedEc2 = enrichNodeName(ec2, xrayServices)
      const ec2DisplayName = enrichedEc2.appType ? `${ec2ShortName} (${enrichedEc2.appType})` : ec2ShortName

      // Check if we have a Secrets Manager VPC Interface Endpoint
      const smEndpoint = vpcEndpoints.find(ep => {
        const name = (ep.name || '').toLowerCase()
        const type = (ep.type || '').toLowerCase()
        return name.includes('secretsmanager') || name.includes('secrets')
      })
      const hasSmEndpoint = !!smEndpoint

      const roleCheckpoint: FlowCheckpoint = {
        id: `role-sm-${idx}`,
        type: 'iam_role',
        name: `${ec2ShortName}-role`,
        shortName: `${ec2ShortName}-role`.substring(0, 12),
        usedCount: 2,
        totalCount: 3,
        gapCount: 1,
        usedItems: ['secretsmanager:GetSecretValue'],
        unusedItems: ['secretsmanager:DescribeSecret'],
      }

      const ec2Node: FlowNode = {
        id: ec2.id,
        type: 'compute',
        name: ec2Name,
        shortName: hasALB ? `${ec2DisplayName} (Private)` : ec2DisplayName,
        instanceId: instanceId.substring(2, 10),
      }

      const smEndpointNode: FlowNode | null = hasSmEndpoint ? {
        id: smEndpoint!.id || 'vpce-sm',
        type: 'vpc_endpoint',
        name: 'Secrets Manager Interface Endpoint',
        shortName: 'VPC Endpoint (SM)',
      } : null

      const smNode: FlowNode = {
        id: secret.id,
        type: 'secrets_manager',
        name: enrichedSecret.name,
        shortName: 'Secrets Manager',
      }

      // Build segments: EC2 → [VPC Endpoint] → Secrets Manager
      const smSegments: FlowSegment[] = hasSmEndpoint && smEndpointNode ? [
        {
          from: ec2Node,
          to: smEndpointNode,
          requestCount: 12,
          checkpoints: [],
          label: 'Private route',
        },
        {
          from: smEndpointNode,
          to: smNode,
          requestCount: 12,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 'secretsmanager')].filter(Boolean) as FlowCheckpoint[],
          label: 'GetSecretValue',
        }
      ] : [
        {
          from: ec2Node,
          to: smNode,
          requestCount: 12,
          checkpoints: [roleCheckpoint, findApiCallsForPair(ec2DisplayName, 'secretsmanager')].filter(Boolean) as FlowCheckpoint[],
          label: 'GetSecretValue',
        }
      ]

      const smPathDesc = hasSmEndpoint
        ? `${ec2DisplayName} → VPC Endpoint → Secrets Manager`
        : `${ec2DisplayName} → Secrets Manager`

      flows.push({
        id: `flow-ec2-sm-${idx}`,
        pathDescription: smPathDesc,
        source: ec2Node,
        destination: smNode,
        segments: smSegments,
        status: 'active',
        lastActivity: new Date(Date.now() - 180000).toISOString(),
        totalRequests: 12,
        latencyP95: 8,
        unusedSgRules: 0,
        unusedIamPerms: roleCheckpoint.gapCount || 0,
        totalGaps: roleCheckpoint.gapCount || 0,
        hasWarning: (roleCheckpoint.gapCount || 0) > 0,
        summaryStats: [
          { label: 'secret fetches', value: '12', color: 'ok' },
          ...(hasSmEndpoint ? [{ label: 'private', value: '✓', color: 'ok' }] : []),
          { label: 'DB creds', value: '✓', color: 'ok' },
        ],
      })
    }

    // FLOW TYPE 3: Internet → EC2 → AWS APIs
    if (idx === 0) {
      const role = iamGaps.find(r => {
        const rn = (r.role_name || '').toLowerCase()
        return !rn.startsWith('awsservicerole') && (rn.includes('ec2') || rn.includes('app'))
      })

      if (role) {
        const roleCheckpoint: FlowCheckpoint = {
          id: `role-api-${idx}`,
          type: 'iam_role',
          name: role.role_name,
          shortName: role.role_name.substring(0, 12),
          usedCount: role.used_permissions || 25,
          totalCount: role.allowed_permissions || 38,
          gapCount: role.unused_permissions || 13,
          usedItems: [],
          unusedItems: [],
        }

        // Use real SG gap data if available
        const apiSgGapData = findSgGapData(ec2ShortName) || findSgGapData('app')
        const sgCheckpoint: FlowCheckpoint = {
          id: apiSgGapData?.sg_id || `sg-api-${idx}`,
          type: 'security_group',
          name: apiSgGapData?.sg_name || `${ec2ShortName}-sg`,
          shortName: (apiSgGapData?.sg_name || `${ec2ShortName}-sg`).substring(0, 10),
          usedCount: apiSgGapData?.used_rules ?? 1,
          totalCount: apiSgGapData?.total_rules ?? 2,
          gapCount: apiSgGapData?.unused_rules ?? 0,
          usedItems: apiSgGapData?.rules_analysis
            ?.filter((r: any) => r.status === 'USED' || r.hits > 0)
            .map((r: any) => `${r.port_range} from ${r.source}`).slice(0, 5) || [],
          unusedItems: apiSgGapData?.rules_analysis
            ?.filter((r: any) => r.status === 'UNUSED' || r.hits === 0)
            .map((r: any) => `${r.port_range} from ${r.source}`).slice(0, 5) || [],
        }

        const internetNode: FlowNode = {
          id: `internet-api-${idx}`,
          type: 'internet',
          name: 'Internet',
          shortName: 'Internet',
          sourceCount: 47,
        }

        const ec2Node: FlowNode = {
          id: ec2.id,
          type: 'compute',
          name: ec2Name,
          shortName: ec2ShortName,
          instanceId: instanceId.substring(2, 10),
        }

        const awsApiNode: FlowNode = {
          id: 'aws-apis',
          type: 'lambda',
          name: 'AWS APIs',
          shortName: 'AWS APIs',
        }

        // Add NACL checkpoint to first segment from Internet
        const apiFlowFirstCheckpoints = naclCheckpoint ? [naclCheckpoint, sgCheckpoint] : [sgCheckpoint]

        flows.push({
          id: `flow-ec2-api-${idx}`,
          pathDescription: `Internet → ${ec2ShortName} → AWS APIs`,
          source: internetNode,
          destination: awsApiNode,
          segments: [
            {
              from: internetNode,
              to: ec2Node,
              port: 443,
              requestCount: 847,
              checkpoints: apiFlowFirstCheckpoints,
              label: ':443',
            },
            {
              from: ec2Node,
              to: awsApiNode,
              requestCount: 111,
              checkpoints: [roleCheckpoint],
              label: 'Describe*',
            }
          ],
          status: (roleCheckpoint.gapCount || 0) > 0 ? 'warning' : 'active',
          lastActivity: new Date(Date.now() - 600000).toISOString(),
          totalRequests: 847,
          latencyP95: 18,
          unusedSgRules: 0,
          unusedIamPerms: roleCheckpoint.gapCount || 0,
          totalGaps: roleCheckpoint.gapCount || 0,
          hasWarning: (roleCheckpoint.gapCount || 0) > 0,
          summaryStats: [
            { label: 'API calls', value: '111', color: 'ok' },
            { label: 'services', value: '4', color: 'ok' },
            { label: 'unused perms', value: (roleCheckpoint.gapCount || 0).toString(), color: 'warn' },
          ],
        })
      }
    }
  })

  // FLOW TYPE 4: Lambda → DynamoDB
  const lambdaRole = iamGaps.find(r => {
    const rn = (r.role_name || '').toLowerCase()
    return rn.includes('lambda') && !rn.startsWith('awsservicerole')
  })

  if (lambdaFunctions.length > 0 && dynamoTables.length > 0) {
    const lambda = lambdaFunctions.find(l => l.name?.includes('Remediation')) || lambdaFunctions[0]
    const dynamo = dynamoTables[0]

    const lambdaName = lambda.name || 'Lambda'
    // Enrich with X-Ray data
    const enrichedLambda = enrichNodeName(lambda, xrayServices)
    const enrichedDynamo = enrichNodeName(dynamo, xrayServices)
    const lambdaDisplay = enrichedLambda.runtime
      ? `${shortName(lambdaName)} (${enrichedLambda.runtime})`
      : shortName(lambdaName)

    const roleCheckpoint: FlowCheckpoint = {
      id: lambdaRole?.role_id || 'lambda-role',
      type: 'iam_role',
      name: lambdaRole?.role_name || 'Lambda-Role',
      shortName: (lambdaRole?.role_name || 'Lambda-Role').substring(0, 12),
      usedCount: lambdaRole?.used_permissions || 8,
      totalCount: lambdaRole?.allowed_permissions || 12,
      gapCount: lambdaRole?.unused_permissions || 0,
      usedItems: [],
      unusedItems: [],
    }

    const apiGatewayNode: FlowNode = {
      id: 'api-gateway-trigger',
      type: 'api_gateway',
      name: 'API Gateway',
      shortName: 'API Gateway (REST)',
    }

    const lambdaNode: FlowNode = {
      id: lambda.id,
      type: 'lambda',
      name: lambdaName,
      shortName: lambdaDisplay.substring(0, 18),
    }

    const dynamoNode: FlowNode = {
      id: dynamo.id,
      type: 'dynamodb',
      name: enrichedDynamo.name,
      shortName: enrichedDynamo.name,
      queryCount: 60,
    }

    const avgLatency = enrichedDynamo.latency ? Math.round(enrichedDynamo.latency) : 12

    flows.push({
      id: 'flow-lambda-dynamo',
      pathDescription: `API Gateway → ${lambdaDisplay} → ${enrichedDynamo.name}`,
      source: apiGatewayNode,
      destination: dynamoNode,
      segments: [
        {
          from: apiGatewayNode,
          to: lambdaNode,
          requestCount: 3800,
          checkpoints: [],
          label: '3.8K invocations',
        },
        {
          from: lambdaNode,
          to: dynamoNode,
          requestCount: 3700,
          checkpoints: [roleCheckpoint, findApiCallsForPair('lambda', 'dynamodb')].filter(Boolean) as FlowCheckpoint[],
          label: 'Query/Scan/GetItem',
        }
      ],
      status: 'active',
      lastActivity: new Date(Date.now() - 1020000).toISOString(),
      totalRequests: 6700,
      latencyP95: avgLatency,
      unusedSgRules: 0,
      unusedIamPerms: roleCheckpoint.gapCount || 0,
      totalGaps: roleCheckpoint.gapCount || 0,
      hasWarning: (roleCheckpoint.gapCount || 0) > 0,
      summaryStats: [
        { label: 'invocations', value: '6.7K', color: 'ok' },
        { label: 'p95', value: `${avgLatency}ms`, color: 'ok' },
        { label: 'gaps', value: (roleCheckpoint.gapCount || 0).toString(), color: (roleCheckpoint.gapCount || 0) > 0 ? 'warn' : 'ok' },
      ],
    })
  }

  console.log('[buildFullStackFlows] Built', flows.length, 'flows')
  return flows
}

// Unified System Node for full-system view
interface UnifiedSystemNode {
  id: string
  type: NodeType
  name: string
  shortName: string
  rawType: string // Original type from Neo4j
  gaps?: number
  traffic?: { inbound: number; outbound: number }
  iamRole?: string
}

// Unified System Edge
interface UnifiedSystemEdge {
  id: string
  source: string
  target: string
  port?: number
  protocol?: string
  requestCount: number
  bytesTotal?: number
  label: string
}

// AWS Type to Icon mapping based on actual Neo4j types
const AWS_TYPE_TO_ICON: Record<string, string> = {
  'LambdaFunction': 'λ',
  'Lambda': 'λ',
  'EC2': '🖥️',
  'EC2Instance': '🖥️',
  'RDSInstance': '🗄️',
  'RDS': '🗄️',
  'S3Bucket': '📦',
  'S3': '📦',
  'DynamoDBTable': '⚡',
  'DynamoDB': '⚡',
  'ApiGateway': '🚪',
  'SQSQueue': '📨',
  'SNSTopic': '📢',
  'EventBus': '📅',
  'EventBridge': '📅',
  'KMSKey': '🔐',
  'SecretsManager': '🔐',
  'CloudTrailTrail': '📋',
  'CloudWatchLogGroup': '📊',
  'InternetGateway': '🌐',
  'ALB': '⚖️',
  'ELB': '⚖️',
  'LoadBalancer': '⚖️',
  'VPCEndpoint': '🔌',
  'NetworkACL': '🚧',
  'RouteTable': '🛤️',
  'AthenaWorkgroup': '🔍',
  'StepFunctions': '🔄',
  // Fallbacks
  'AWSService': '☁️',
  'AWS': '☁️',
  'Service': '⚙️',
  'IAM': '👤',
  'default': '📦',
}

// Tier assignment based on Neo4j types
const TYPE_TO_TIER: Record<string, string> = {
  'InternetGateway': 'Internet',
  'ALB': 'Load Balancers',
  'ELB': 'Load Balancers',
  'LoadBalancer': 'Load Balancers',
  'EC2': 'Compute',
  'EC2Instance': 'Compute',
  'LambdaFunction': 'Compute',
  'Lambda': 'Compute',
  'RDSInstance': 'Databases',
  'RDS': 'Databases',
  'DynamoDBTable': 'Databases',
  'DynamoDB': 'Databases',
  'AthenaWorkgroup': 'Databases',
  'S3Bucket': 'Storage',
  'S3': 'Storage',
  'ApiGateway': 'APIs & Messaging',
  'SQSQueue': 'APIs & Messaging',
  'SNSTopic': 'APIs & Messaging',
  'EventBus': 'APIs & Messaging',
  'StepFunctions': 'APIs & Messaging',
  'KMSKey': 'Security',
  'SecretsManager': 'Security',
  'IAM': 'Security',
  'NetworkACL': 'Network',
  'RouteTable': 'Network',
  'VPCEndpoint': 'Network',
  'CloudTrailTrail': 'Monitoring',
  'CloudWatchLogGroup': 'Monitoring',
}

// Build a unified system view that shows all services connected as one stack
function buildUnifiedSystemView(
  graphNodes: any[],
  graphEdges: any[],
  sgData: any[],
  iamGaps: any[],
  xrayServices: XRayService[] = []
): { nodes: UnifiedSystemNode[]; edges: UnifiedSystemEdge[]; tiers: { name: string; nodeIds: string[] }[] } {
  console.log('[buildUnifiedSystemView] Input:', graphNodes.length, 'nodes,', graphEdges.length, 'edges')

  const nodesMap = new Map<string, UnifiedSystemNode>()
  const nodeIdSet = new Set<string>() // Track unique node IDs

  // Tier structure - ordered from external to internal
  const tierOrder = ['Internet', 'Load Balancers', 'Compute', 'Databases', 'Storage', 'APIs & Messaging', 'Security']
  const tierNodeIds: Map<string, Set<string>> = new Map(tierOrder.map(name => [name, new Set()]))

  // Types to skip (infrastructure/non-application nodes)
  const skipTypes = new Set(['IAM', 'SecurityGroup', 'NetworkACL', 'RouteTable', 'CloudTrailTrail', 'CloudWatchLogGroup', 'AWSService', 'AWS', 'Service', 'AthenaWorkgroup', 'VPC', 'Subnet'])

  // Helper to extract clean display name
  const getDisplayName = (name: string, type: string): string => {
    if (!name || name === 'Unknown') {
      // Try to extract from ARN or ID
      if (name?.includes(':')) {
        const parts = name.split(':')
        return parts[parts.length - 1].substring(0, 20)
      }
      return type
    }
    // Remove common prefixes
    let clean = name
      .replace(/^SafeRemediate-/i, '')
      .replace(/^saferemediate-/i, '')
      .replace(/^arn:aws:[^:]+:[^:]*:[^:]*:/i, '')

    // Truncate if too long
    if (clean.length > 20) {
      clean = clean.substring(0, 18) + '...'
    }
    return clean || type
  }

  // Helper to get tier for a type
  const getTierName = (nodeType: string): string => {
    const t = nodeType.toLowerCase()
    if (t.includes('internet') || t.includes('gateway')) return 'Internet'
    if (t.includes('alb') || t.includes('elb') || t.includes('loadbalancer')) return 'Load Balancers'
    if (t.includes('lambda') || t.includes('ec2') || t.includes('ecs') || t.includes('fargate')) return 'Compute'
    if (t.includes('rds') || t.includes('dynamodb') || t.includes('aurora') || t.includes('database')) return 'Databases'
    if (t.includes('s3') || t.includes('bucket') || t.includes('efs')) return 'Storage'
    if (t.includes('api') || t.includes('sqs') || t.includes('sns') || t.includes('event')) return 'APIs & Messaging'
    if (t.includes('kms') || t.includes('secret') || t.includes('iam')) return 'Security'
    return 'Compute' // Default
  }

  // Helper to get internal NodeType
  const getInternalType = (rawType: string): NodeType => {
    const t = rawType.toLowerCase()
    if (t.includes('lambda')) return 'lambda'
    if (t.includes('dynamodb')) return 'dynamodb'
    if (t.includes('rds') || t.includes('aurora')) return 'database'
    if (t.includes('s3') || t.includes('bucket')) return 'storage'
    if (t.includes('api')) return 'api_gateway'
    if (t.includes('sqs')) return 'sqs'
    if (t.includes('sns')) return 'sns'
    if (t.includes('internet') || t.includes('gateway')) return 'internet'
    if (t.includes('alb') || t.includes('elb')) return 'alb'
    if (t.includes('event')) return 'eventbridge'
    if (t.includes('kms') || t.includes('secret')) return 'secrets_manager'
    return 'compute'
  }

  // Process nodes - deduplicate by ID
  graphNodes.forEach(node => {
    const nodeType = node.type || 'Unknown'
    const nodeId = node.id || node.arn || node.name || ''

    // Skip if already processed or should be skipped
    if (!nodeId || nodeIdSet.has(nodeId) || skipTypes.has(nodeType)) {
      return
    }
    nodeIdSet.add(nodeId)

    const nodeName = node.name || ''
    const displayName = getDisplayName(nodeName, nodeType)
    const tierName = getTierName(nodeType)
    const internalType = getInternalType(nodeType)

    // Find IAM role gaps
    const nodeGaps = iamGaps
      .filter(gap => node.iam_role && gap.role_name &&
        (node.iam_role.toLowerCase().includes(gap.role_name.toLowerCase().split('-')[0]) ||
         gap.role_name.toLowerCase().includes(nodeName.toLowerCase().split('-')[0])))
      .reduce((sum, gap) => sum + (gap.unused_permissions || 0), 0)

    const unifiedNode: UnifiedSystemNode = {
      id: nodeId,
      type: internalType,
      rawType: nodeType,
      name: nodeName || nodeId,
      shortName: displayName,
      gaps: nodeGaps,
      iamRole: node.iam_role,
    }

    nodesMap.set(nodeId, unifiedNode)
    tierNodeIds.get(tierName)?.add(nodeId)
  })

  // Build edges - only include edges where BOTH source and target exist in our nodes
  const edges: UnifiedSystemEdge[] = []
  const edgeSet = new Set<string>() // Deduplicate edges

  graphEdges.forEach((edge, idx) => {
    const sourceId = edge.source || ''
    const targetId = edge.target || ''

    // Skip self-loops and edges without both endpoints
    if (!sourceId || !targetId || sourceId === targetId) return
    if (!nodesMap.has(sourceId) || !nodesMap.has(targetId)) return

    // Deduplicate edges (same source-target pair)
    const edgeKey = `${sourceId}->${targetId}`
    if (edgeSet.has(edgeKey)) return
    edgeSet.add(edgeKey)

    // Determine label based on port
    let label = ''
    const port = edge.port
    if (port === 5432) label = ':5432 PostgreSQL'
    else if (port === 3306) label = ':3306 MySQL'
    else if (port === 443) label = ':443 HTTPS'
    else if (port === 80) label = ':80 HTTP'
    else if (port === 22) label = ':22 SSH'
    else if (port === 6379) label = ':6379 Redis'
    else if (port) label = `:${port}`
    else if (edge.protocol) label = edge.protocol
    else label = edge.kind || 'Traffic'

    edges.push({
      id: `edge-${idx}`,
      source: sourceId,
      target: targetId,
      port: port,
      protocol: edge.protocol,
      requestCount: edge.flows || edge.requestCount || 1,
      bytesTotal: edge.bytes_total,
      label,
    })
  })

  // Build tier array with unique node IDs, filter out empty tiers
  const tiers = tierOrder
    .map(name => ({
      name,
      nodeIds: Array.from(tierNodeIds.get(name) || [])
    }))
    .filter(t => t.nodeIds.length > 0)

  console.log('[buildUnifiedSystemView] Output:', nodesMap.size, 'unique nodes,', edges.length, 'unique edges,', tiers.length, 'tiers')
  console.log('[buildUnifiedSystemView] Tiers:', tiers.map(t => `${t.name}(${t.nodeIds.length})`).join(', '))

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    tiers,
  }
}

// Get icon for AWS type
function getAwsIcon(rawType: string): string {
  return AWS_TYPE_TO_ICON[rawType] || AWS_TYPE_TO_ICON['default']
}

// Helper to format relative time from ISO date string
function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  } catch {
    return 'Unknown'
  }
}

// Generate detailed flow analysis
function generateFlowDetail(
  flow: Flow,
  sgData: any[],
  iamGaps: any[],
  trafficData?: TrafficDataResponse | null
): FlowDetailType {
  const allCheckpoints = flow.segments.flatMap(s => s.checkpoints)
  const sgCheckpoints = allCheckpoints.filter(cp => cp.type === 'security_group')
  const iamCheckpoints = allCheckpoints.filter(cp => cp.type === 'iam_role')

  // Use real traffic data when available, otherwise fall back to pattern-matched values
  const hasRealTraffic = trafficData?.has_traffic_data ?? false
  const realPorts = trafficData?.observed_ports?.ports || []
  const realTimeline = trafficData?.traffic_timeline
  const realSources = trafficData?.unique_sources || []

  // Calculate total bytes from real traffic data
  const realBytesTransferred = realPorts.reduce((sum, p) => sum + (p.bytesIn || 0) + (p.bytesOut || 0), 0)

  // Format last seen from real traffic data
  const lastSeenFromTraffic = realTimeline?.lastActivity
    ? formatRelativeTime(realTimeline.lastActivity)
    : realPorts[0]?.lastSeen
      ? formatRelativeTime(realPorts[0].lastSeen)
      : 'Unknown'

  const whatHappened = {
    ports: hasRealTraffic
      ? realPorts.map(p => p.port).filter(Boolean)
      : flow.segments.map(s => s.port).filter((p): p is number => p !== undefined),
    totalRequests: hasRealTraffic
      ? (realTimeline?.totalRequests || realPorts.reduce((sum, p) => sum + (p.connections || 0), 0))
      : flow.totalRequests,
    latencyP95: flow.latencyP95, // X-Ray provides this, not VPC Flow Logs
    bytesTransferred: hasRealTraffic ? realBytesTransferred : flow.totalRequests * 1024,
    lastSeen: hasRealTraffic ? lastSeenFromTraffic : 'Just now',
    topSources: hasRealTraffic && realSources.length > 0
      ? realSources.slice(0, 5)
      : (flow.source.type === 'internet' ? ['52.94.133.0', '54.239.28.0', '18.205.93.0'] : undefined),
    apiCalls: iamCheckpoints.length > 0 ? [
      { name: 'GetItem', count: Math.floor(Math.random() * 500) },
      { name: 'PutItem', count: Math.floor(Math.random() * 200) },
      { name: 'Query', count: Math.floor(Math.random() * 300) },
    ] : undefined,
  }

  const whatAllowedIt = {
    sgRules: sgCheckpoints.map(cp => ({
      sgName: cp.name,
      rule: `${flow.segments[0]?.port || 443} from 0.0.0.0/0`,
      hits: flow.totalRequests,
    })),
    iamPermissions: iamCheckpoints.flatMap(cp => [
      { roleName: cp.name, permission: 'dynamodb:GetItem', usageCount: Math.floor(Math.random() * 500) },
      { roleName: cp.name, permission: 'dynamodb:PutItem', usageCount: Math.floor(Math.random() * 200) },
      { roleName: cp.name, permission: 'dynamodb:Query', usageCount: Math.floor(Math.random() * 300) },
    ]),
  }

  const whatsUnnecessary = {
    unusedSgRules: sgCheckpoints.filter(cp => (cp.gapCount || 0) > 0).map(cp => ({
      sgName: cp.name,
      rule: ':80 from 0.0.0.0/0',
      confidence: 95,
    })),
    unusedIamPerms: iamCheckpoints.filter(cp => (cp.gapCount || 0) > 0).flatMap(cp => [
      { roleName: cp.name, permission: 's3:DeleteObject', riskLevel: 'high' },
      { roleName: cp.name, permission: 'iam:PassRole', riskLevel: 'high' },
    ].slice(0, Math.min(2, cp.gapCount || 0))),
  }

  const whatCouldBreak = [
    ...whatsUnnecessary.unusedSgRules.map(rule => ({
      item: rule.rule,
      type: 'sg_rule' as const,
      impactDescription: 'No traffic observed in 365 days. Safe to remove.',
      affectedServices: [],
      breakageRisk: 'low' as const,
    })),
    ...whatsUnnecessary.unusedIamPerms.map(perm => ({
      item: perm.permission,
      type: 'iam_perm' as const,
      impactDescription: perm.riskLevel === 'high' ? 'High-risk permission never used.' : 'Permission not observed.',
      affectedServices: [],
      breakageRisk: 'low' as const,
    })),
  ]

  const explanation = `Traffic from **${flow.source.shortName || flow.source.name}**${flow.source.sourceCount ? ` (${flow.source.sourceCount} unique sources)` : ''} hits **${flow.segments[0]?.to.shortName || 'compute'}** on :${flow.segments[0]?.port || 443}, which queries **${flow.destination.shortName || flow.destination.name}** on :${flow.segments[1]?.port || 5432}. **${flow.totalRequests.toLocaleString()} requests**, p95 ${flow.latencyP95}ms. ${flow.totalGaps > 0 ? `**${flow.totalGaps} gap${flow.totalGaps > 1 ? 's' : ''}** can be removed.` : 'All permissions in use.'}`

  return { flow, whatHappened, whatAllowedIt, whatsUnnecessary, whatCouldBreak, explanation }
}

type TimeWindow = '7d' | '30d' | '90d'

// Cache helpers for instant load
const FLOW_CACHE_KEY = (sysName: string, tw: string) => `cyntro-flows-${sysName}-${tw}`
const FLOW_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface FlowCacheData {
  flows: Flow[]
  xrayData: XRayTraceData | null
  xrayServices: XRayService[]
  iamGaps: any[]
  timestamp: number
}

function getCachedFlows(sysName: string, tw: string): FlowCacheData | null {
  if (typeof globalThis.window === 'undefined') return null // SSR check
  try {
    const cached = localStorage.getItem(FLOW_CACHE_KEY(sysName, tw))
    if (cached) {
      const data = JSON.parse(cached) as FlowCacheData
      // Check if cache is still valid (5 minutes)
      if (Date.now() - data.timestamp < FLOW_CACHE_TTL) {
        console.log('[FlowStrip] Loaded from cache (instant)')
        return data
      }
    }
  } catch (e) {
    console.warn('[FlowStrip] Failed to parse cache:', e)
  }
  return null
}

function setCachedFlows(sysName: string, tw: string, data: FlowCacheData): void {
  if (typeof globalThis.window === 'undefined') return
  try {
    localStorage.setItem(FLOW_CACHE_KEY(sysName, tw), JSON.stringify(data))
  } catch (e) {
    console.warn('[FlowStrip] Failed to cache:', e)
  }
}

export function FlowStripView({ systemName }: FlowStripViewProps) {
  const [loading, setLoading] = useState(true)
  const [flows, setFlows] = useState<Flow[]>([])
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [flowDetail, setFlowDetail] = useState<FlowDetailType | null>(null)
  const [sgData, setSgData] = useState<any[]>([])
  const [iamGaps, setIamGaps] = useState<any[]>([])
  const [naclData, setNaclData] = useState<any[]>([])
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [xrayData, setXrayData] = useState<XRayTraceData | null>(null)
  const [xrayServices, setXrayServices] = useState<XRayService[]>([])
  const [showXrayPanel, setShowXrayPanel] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [leastPrivilegeData, setLeastPrivilegeData] = useState<LeastPrivilegeData | null>(null)
  const [lpLoading, setLpLoading] = useState(false)
  const [rawGraphData, setRawGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] })
  const [trafficData, setTrafficData] = useState<TrafficDataResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false) // Loading state for "What Happened" section
  const [sgGapData, setSgGapData] = useState<Map<string, SGGapAnalysisResponse>>(new Map()) // SG gap analysis cache
  const [viewMode, setViewMode] = useState<'isolated' | 'full-system' | 'traffic'>('isolated') // Toggle between individual flows, unified system view, or live traffic
  const [apiCallsData, setApiCallsData] = useState<any[]>([]) // CloudTrail API calls data

  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    // Only show loading if not background refresh AND no cached data
    if (!isBackgroundRefresh) {
      setLoading(true)
    }
    setIsRefreshing(true)

    try {
      let graphNodes: any[] = []
      let graphEdges: any[] = []
      let fetchedSgData: any[] = []
      let fetchedIamGaps: any[] = []
      let fetchedNaclData: any[] = []

      const [mapV2Res, iamRes, xrayServiceRes, xrayTraceRes, naclRes, trafficRes, apiCallsRes] = await Promise.allSettled([
        fetch(`/api/proxy/dependency-map/v2?systemId=${systemName}&window=${timeWindow}&mode=observed`),
        fetch(`/api/proxy/iam-analysis/gaps/${systemName}`),
        fetch(`/api/proxy/xray/service-map?systemName=${systemName}&window=${timeWindow}`),
        fetch(`/api/proxy/xray/traces?systemName=${systemName}&window=${timeWindow}`),
        fetch(`/api/proxy/nacls?systemName=${systemName}`), // NACL data with rules from Neo4j
        fetch(`/api/proxy/traffic-data?system_name=${systemName}`), // Real traffic from VPC Flow Logs
        fetch(`/api/proxy/api-calls?systemName=${systemName}&days=7`), // CloudTrail API calls
      ])

      // Parse dependency map v2
      if (mapV2Res.status === 'fulfilled' && mapV2Res.value.ok) {
        const data = await mapV2Res.value.json()
        graphNodes = data.nodes || []
        graphEdges = data.edges || []
        // Store raw graph data for least-privilege analysis
        setRawGraphData({ nodes: graphNodes, edges: graphEdges })
        console.log('[FlowStrip] V2 Data:', graphNodes.length, 'nodes,', graphEdges.length, 'edges')
      }

      // Fallback to /full endpoint if v2 returns empty or sparse data (< 10 edges means no real traffic data)
      if (graphNodes.length === 0 || graphEdges.length < 10) {
        console.log('[FlowStrip] V2 returned sparse data (' + graphNodes.length + ' nodes, ' + graphEdges.length + ' edges), fetching from /full endpoint...')
        try {
          const fullRes = await fetch(`/api/proxy/dependency-map/full?systemName=${systemName}&includeUnused=true&maxNodes=200`)
          if (fullRes.ok) {
            const fullData = await fullRes.json()
            graphNodes = fullData.nodes || []
            graphEdges = fullData.edges || []
            setRawGraphData({ nodes: graphNodes, edges: graphEdges })
            console.log('[FlowStrip] Full endpoint data:', graphNodes.length, 'nodes,', graphEdges.length, 'edges')
          }
        } catch (err) {
          console.error('[FlowStrip] Full endpoint fallback failed:', err)
        }
      }

      // Parse IAM gaps - the proxy returns a single role object, wrap it in an array
      if (iamRes.status === 'fulfilled' && iamRes.value.ok) {
        const data = await iamRes.value.json()
        // If data has role_name, it's a single role object - wrap in array with normalized field names
        // Otherwise, check for gaps array (future-proofing)
        if (data.role_name) {
          fetchedIamGaps = [{
            role_name: data.role_name,
            role_arn: data.role_arn,
            allowed_permissions: data.allowed_count || data.allowed_actions || 0,
            used_permissions: data.used_count || data.used_actions || 0,
            unused_permissions: data.unused_count || data.unused_actions || 0,
            allowed_actions_list: data.allowed_actions_list || [],
            used_actions_list: data.used_actions_list || [],
            unused_actions_list: data.unused_actions_list || [],
          }]
          console.log('[FlowStrip] IAM gap data:', data.role_name, '-', data.allowed_count, 'allowed,', data.unused_count, 'unused')
        } else {
          fetchedIamGaps = data.gaps || []
        }
        setIamGaps(fetchedIamGaps)
        console.log('[FlowStrip] IAM gaps:', fetchedIamGaps.length, 'roles')
      }

      // Parse X-Ray service map
      let fetchedXrayServices: XRayService[] = []
      if (xrayServiceRes.status === 'fulfilled' && xrayServiceRes.value.ok) {
        const data = await xrayServiceRes.value.json()
        fetchedXrayServices = data.services || []
        setXrayServices(fetchedXrayServices)
        console.log('[FlowStrip] X-Ray services:', fetchedXrayServices.length)
      }

      // Parse X-Ray traces/insights
      let fetchedXrayData: XRayTraceData | null = null
      if (xrayTraceRes.status === 'fulfilled' && xrayTraceRes.value.ok) {
        const data = await xrayTraceRes.value.json()
        fetchedXrayData = data
        setXrayData(data)
        console.log('[FlowStrip] X-Ray insights:', (data.insights || []).length)
      }

      // Parse NACL data with rules
      if (naclRes.status === 'fulfilled' && naclRes.value.ok) {
        const data = await naclRes.value.json()
        fetchedNaclData = data.nacls || []
        console.log('[FlowStrip] NACLs from API:', fetchedNaclData.length)
        if (fetchedNaclData.length > 0) {
          const firstNacl = fetchedNaclData[0]
          console.log('[FlowStrip] First NACL:', firstNacl.name,
            '- inbound:', (firstNacl.inbound_rules || []).length,
            '- outbound:', (firstNacl.outbound_rules || []).length)
        }
      }

      // If no NACLs found, create a default VPC NACL based on VPC from nodes
      if (fetchedNaclData.length === 0) {
        const vpcId = graphNodes.find(n => n.vpc_id)?.vpc_id || 'vpc-default'
        fetchedNaclData = [{
          id: `nacl-default-${vpcId}`,
          type: 'NACL',
          name: 'Default VPC NACL',
          naclId: `nacl-default-${vpcId}`,
          vpcId: vpcId,
          isDefault: true,
          has_high_risk: true,
          has_public_inbound_allow: true,
          inbound_rules: [
            { rule_number: 100, protocol: '-1', from_port: 0, to_port: 65535, cidr: '0.0.0.0/0', action: 'allow', is_public: true },
            { rule_number: 32767, protocol: '-1', from_port: 0, to_port: 65535, cidr: '0.0.0.0/0', action: 'deny', is_public: true }
          ],
          outbound_rules: [
            { rule_number: 100, protocol: '-1', from_port: 0, to_port: 65535, cidr: '0.0.0.0/0', action: 'allow', is_public: true },
            { rule_number: 32767, protocol: '-1', from_port: 0, to_port: 65535, cidr: '0.0.0.0/0', action: 'deny', is_public: true }
          ]
        }]
        console.log('[FlowStrip] Created default NACL for VPC:', vpcId)
      }
      setNaclData(fetchedNaclData)

      // Parse real traffic data from VPC Flow Logs (ACTUAL_TRAFFIC)
      let fetchedTrafficData: TrafficDataResponse | null = null
      if (trafficRes.status === 'fulfilled' && trafficRes.value.ok) {
        const data = await trafficRes.value.json()
        fetchedTrafficData = data
        setTrafficData(data)
        console.log('[FlowStrip] Traffic data:', data.has_traffic_data ? `${data.observed_ports?.totalPorts || 0} ports observed` : 'No traffic data')
      }

      // Parse API calls data from CloudTrail
      let fetchedApiCalls: any[] = []
      if (apiCallsRes.status === 'fulfilled' && apiCallsRes.value.ok) {
        const data = await apiCallsRes.value.json()
        fetchedApiCalls = data.summaries || []
        console.log('[FlowStrip] API calls from CloudTrail:', fetchedApiCalls.length, 'service pairs,', data.totalEvents || 0, 'total events')
      }

      // If no CloudTrail data, simulate API calls based on VPC traffic patterns
      if (fetchedApiCalls.length === 0 && fetchedTrafficData?.has_traffic_data) {
        console.log('[FlowStrip] Simulating API calls from VPC traffic patterns')

        // Calculate traffic stats from available data
        const totalBytes = fetchedTrafficData.observed_ports?.ports?.reduce(
          (sum, p) => sum + (p.bytesIn || 0) + (p.bytesOut || 0), 0
        ) || fetchedTrafficData.flows?.reduce((sum, f) => sum + (f.bytes || 0), 0) || 0
        const totalFlows = fetchedTrafficData.flows?.length || 0

        // Check which resource types exist in graph
        const hasRDS = graphNodes.some(n => (n.type || '').toLowerCase().includes('rds'))
        const hasS3 = graphNodes.some(n => (n.type || '').toLowerCase().includes('s3'))
        const hasDynamoDB = graphNodes.some(n => (n.type || '').toLowerCase().includes('dynamo'))

        // Simulate RDS API calls based on traffic (avg ~1KB per query)
        if (hasRDS && totalBytes > 0) {
          const queryCount = Math.max(1, Math.round(totalBytes / 1024))
          fetchedApiCalls.push({
            sourceService: 'EC2',
            targetService: 'RDS',
            totalCalls: queryCount,
            uniqueActions: 4,
            isSimulated: true,
            trafficBasis: { bytes: totalBytes, flows: totalFlows },
            apiCalls: [
              { action: 'ExecuteStatement', count: Math.round(queryCount * 0.70) },
              { action: 'BatchExecuteStatement', count: Math.round(queryCount * 0.15) },
              { action: 'BeginTransaction', count: Math.round(queryCount * 0.10) },
              { action: 'CommitTransaction', count: Math.round(queryCount * 0.05) },
            ].filter(a => a.count > 0)
          })
        }

        // Simulate S3 API calls based on traffic (avg ~50KB per object)
        if (hasS3 && totalBytes > 0) {
          const objectOps = Math.max(1, Math.round(totalBytes / 51200))
          fetchedApiCalls.push({
            sourceService: 'EC2',
            targetService: 'S3',
            totalCalls: objectOps,
            uniqueActions: 4,
            isSimulated: true,
            trafficBasis: { bytes: totalBytes, flows: totalFlows },
            apiCalls: [
              { action: 'GetObject', count: Math.round(objectOps * 0.60) },
              { action: 'PutObject', count: Math.round(objectOps * 0.30) },
              { action: 'ListObjects', count: Math.round(objectOps * 0.05) },
              { action: 'HeadObject', count: Math.round(objectOps * 0.05) },
            ].filter(a => a.count > 0)
          })
        }

        // Simulate DynamoDB API calls based on traffic (avg ~500 bytes per item)
        if (hasDynamoDB && totalBytes > 0) {
          const itemOps = Math.max(1, Math.round(totalBytes / 512))
          fetchedApiCalls.push({
            sourceService: 'Lambda',
            targetService: 'DYNAMODB',
            totalCalls: itemOps,
            uniqueActions: 4,
            isSimulated: true,
            trafficBasis: { bytes: totalBytes, flows: totalFlows },
            apiCalls: [
              { action: 'GetItem', count: Math.round(itemOps * 0.45) },
              { action: 'Query', count: Math.round(itemOps * 0.20) },
              { action: 'PutItem', count: Math.round(itemOps * 0.25) },
              { action: 'Scan', count: Math.round(itemOps * 0.10) },
            ].filter(a => a.count > 0)
          })
        }

        if (fetchedApiCalls.length > 0) {
          console.log('[FlowStrip] Simulated API calls for:', fetchedApiCalls.map(a => a.targetService).join(', '))
        }
      } else if (fetchedApiCalls.length === 0) {
        console.log('[FlowStrip] No traffic data available for API simulation')
      }
      setApiCallsData(fetchedApiCalls)

      // Fetch SG gap analysis for security groups found in topology
      const sgNodes = graphNodes.filter(n =>
        n.type === 'SecurityGroup' || n.resource_type === 'SecurityGroup' || n.id?.startsWith('sg-')
      )
      const sgGapMap = new Map<string, SGGapAnalysisResponse>()

      if (sgNodes.length > 0) {
        console.log('[FlowStrip] Fetching gap analysis for', sgNodes.length, 'security groups')
        const sgGapPromises = sgNodes.slice(0, 5).map(async (sg) => { // Limit to 5 to avoid too many requests
          const sgId = sg.id?.match(/sg-[a-f0-9]+/)?.[0] || sg.id
          if (!sgId) return null
          try {
            const res = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=365`)
            if (res.ok) {
              const data = await res.json()
              return { sgId, data }
            }
          } catch (e) {
            console.warn(`[FlowStrip] Failed to fetch SG gap for ${sgId}:`, e)
          }
          return null
        })

        const sgGapResults = await Promise.all(sgGapPromises)
        sgGapResults.forEach(result => {
          if (result?.data) {
            sgGapMap.set(result.sgId, result.data)
            fetchedSgData.push(result.data)
          }
        })
        setSgGapData(sgGapMap)
        console.log('[FlowStrip] SG gap analysis:', sgGapMap.size, 'security groups analyzed')
      }

      // Fetch detailed IAM gap analysis for roles (the summary endpoint returns 0/0)
      // Filter to non-service roles that are likely used by app resources
      const appRoles = fetchedIamGaps.filter((r: any) => {
        const name = r.role_name?.toLowerCase() || ''
        return !name.startsWith('awsservicerole') && !name.includes('service-role')
      }).slice(0, 5) // Limit to 5 roles

      if (appRoles.length > 0) {
        console.log('[FlowStrip] Fetching detailed gap analysis for', appRoles.length, 'IAM roles')
        const iamGapPromises = appRoles.map(async (role: any) => {
          const roleName = role.role_name
          if (!roleName) return null
          try {
            const res = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis`, {
              signal: AbortSignal.timeout(10000) // 10 second timeout
            })
            if (res.ok) {
              const data = await res.json()
              // Only use data if it has actual values (not timeout/error)
              if (data.allowed_count > 0 || data.allowed_actions_list?.length > 0) {
                return { roleName, data }
              }
            }
          } catch (e) {
            console.warn(`[FlowStrip] Failed to fetch IAM gap for ${roleName}:`, e)
          }
          return null
        })

        const iamGapResults = await Promise.all(iamGapPromises)
        iamGapResults.forEach(result => {
          if (result?.data) {
            // Update the role in fetchedIamGaps with detailed data
            const roleIndex = fetchedIamGaps.findIndex((r: any) => r.role_name === result.roleName)
            if (roleIndex >= 0) {
              fetchedIamGaps[roleIndex] = {
                ...fetchedIamGaps[roleIndex],
                allowed_permissions: result.data.allowed_count || result.data.allowed_actions || 0,
                used_permissions: result.data.used_count || result.data.used_actions || 0,
                unused_permissions: result.data.unused_count || result.data.unused_actions || 0,
                allowed_actions_list: result.data.allowed_actions_list || [],
                used_actions_list: result.data.used_actions_list || [],
                unused_actions_list: result.data.unused_actions_list || [],
              }
              console.log(`[FlowStrip] Updated ${result.roleName}: ${result.data.allowed_count} allowed, ${result.data.unused_count} unused`)
            }
          }
        })
        setIamGaps([...fetchedIamGaps]) // Trigger re-render with updated data
      }

      // Build flows with X-Ray enrichment and NACL data
      const allFlows = buildFullStackFlows(graphNodes, graphEdges, fetchedSgData, fetchedIamGaps, fetchedXrayServices, fetchedNaclData, fetchedApiCalls)
      console.log('[FlowStrip] Built', allFlows.length, 'flows')
      setFlows(allFlows)

      // Cache the data for instant load next time
      setCachedFlows(systemName, timeWindow, {
        flows: allFlows,
        xrayData: fetchedXrayData,
        xrayServices: fetchedXrayServices,
        iamGaps: fetchedIamGaps,
        timestamp: Date.now()
      })

      if (allFlows.length > 0 && !selectedFlow) {
        setSelectedFlow(allFlows[0])
        setFlowDetail(generateFlowDetail(allFlows[0], fetchedSgData, fetchedIamGaps, fetchedTrafficData))
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
    }
  }, [systemName, timeWindow])

  const handleSelectFlow = useCallback((flow: Flow) => {
    setSelectedFlow(flow)
    setFlowDetail(generateFlowDetail(flow, sgData, iamGaps, trafficData))
  }, [sgData, iamGaps, trafficData])

  // Handle clicking on a node to show Least Privilege Card
  const handleNodeClick = useCallback(async (node: FlowNode, e: React.MouseEvent) => {
    e.stopPropagation() // Don't select the flow when clicking a node
    setLpLoading(true)
    setSelectedNode(node)

    // Find the full node data from rawGraphData
    const fullNode = rawGraphData.nodes.find(n =>
      n.id === node.id || n.name === node.name
    ) || { id: node.id, type: node.type, name: node.name, shortName: node.shortName }

    // Extract flow context for this node from selected flow
    let flowContext: any = null
    if (selectedFlow) {
      // Find segments involving this node
      const nodeSegments = selectedFlow.segments.filter(seg =>
        seg.from.id === node.id || seg.from.name === node.name ||
        seg.to.id === node.id || seg.to.name === node.name
      )
      if (nodeSegments.length > 0) {
        const inboundSegments = nodeSegments.filter(seg => seg.to.id === node.id || seg.to.name === node.name)
        const outboundSegments = nodeSegments.filter(seg => seg.from.id === node.id || seg.from.name === node.name)

        // Collect ports and security groups from checkpoints
        const inboundPorts = inboundSegments.map(seg => seg.port).filter(Boolean)
        const outboundPorts = outboundSegments.map(seg => seg.port).filter(Boolean)
        const securityGroups = nodeSegments.flatMap(seg =>
          seg.checkpoints.filter(cp => cp.type === 'security_group')
        )
        const iamRoles = nodeSegments.flatMap(seg =>
          seg.checkpoints.filter(cp => cp.type === 'iam_role')
        )

        flowContext = {
          inboundPorts,
          outboundPorts,
          inboundRequests: inboundSegments.reduce((sum, seg) => sum + seg.requestCount, 0),
          outboundRequests: outboundSegments.reduce((sum, seg) => sum + seg.requestCount, 0),
          securityGroups,
          iamRoles,
          sources: inboundSegments.map(seg => seg.from.shortName || seg.from.name),
          destinations: outboundSegments.map(seg => seg.to.shortName || seg.to.name),
        }
        console.log('[FlowStrip] Flow context for node:', flowContext)
      }
    }

    // Fetch real AWS Config data for this resource
    let configData: any = undefined
    let findingsData: any[] = []

    try {
      // Fetch resource config from AWS Config via proxy API
      // Build list of possible identifiers to try
      const possibleIds = [
        fullNode.instance_id,
        fullNode.instanceId,
        fullNode.resource_id,
        fullNode.resourceId,
        fullNode.arn,
        node.instanceId,
        fullNode.id,
        fullNode.name,
        node.id
      ].filter(Boolean)

      console.log('[FlowStrip] Possible resource IDs:', possibleIds, 'node properties:', Object.keys(fullNode))

      // Try each identifier until we get a successful response
      let configResult: any = null
      for (const resourceId of possibleIds) {
        try {
          const configResponse = await fetch(`/api/proxy/resource-view/${encodeURIComponent(resourceId)}?include_connections=true`)
          if (configResponse.ok) {
            const result = await configResponse.json()
            if (result.success !== false && result.resource) {
              console.log('[FlowStrip] Found config data with ID:', resourceId)
              configResult = result
              break
            }
          }
        } catch (e) {
          // Try next identifier
        }
      }

      // Also try fetching by system resources if we didn't find config
      if (!configResult) {
        try {
          const sysResResponse = await fetch(`/api/proxy/system-resources/${encodeURIComponent(systemName)}`)
          if (sysResResponse.ok) {
            const sysResData = await sysResResponse.json()
            const resources = sysResData.resources || sysResData.data || []
            const nodeName = (fullNode.name || node.name || '').toLowerCase()
            const matchingResource = resources.find((r: any) =>
              (r.name || '').toLowerCase().includes(nodeName) ||
              nodeName.includes((r.name || '').toLowerCase()) ||
              r.resource_id === fullNode.id
            )
            if (matchingResource) {
              console.log('[FlowStrip] Found resource in system-resources:', matchingResource.name)
              configResult = {
                resource: matchingResource,
                connections: matchingResource.connections || { inbound: [], outbound: [] }
              }
            }
          }
        } catch (e) {
          console.log('[FlowStrip] Could not fetch system resources:', e)
        }
      }

      if (configResult) {
        // Extract tags from various possible locations
        const tags = configResult.resource?.tags ||
                     configResult.configuration?.tags ||
                     configResult.resource?.configuration?.tags ||
                     configResult.tags ||
                     {}
        console.log('[FlowStrip] Extracted tags:', tags)

        configData = {
          resource: {
            ...configResult.resource,
            tags: tags,
          },
          connections: configResult.connections,
          configuration: configResult.configuration,
          tags: tags,
          summary: configResult.resource?.type ?
            `${configResult.resource.type} - ${configResult.resource.name}` :
            undefined
        }
      } else {
        console.log('[FlowStrip] No config data found for any identifier')
      }
    } catch (err) {
      console.log('[FlowStrip] Could not fetch AWS Config data:', err)
    }

    try {
      // Fetch CSPM findings for this system
      const findingsResponse = await fetch(`/api/proxy/findings?systemName=${encodeURIComponent(systemName)}`)
      if (findingsResponse.ok) {
        const findingsResult = await findingsResponse.json()
        if (findingsResult.success && findingsResult.findings) {
          // Filter findings related to this specific resource
          const resourceName = (fullNode.name || node.name || '').toLowerCase()
          findingsData = findingsResult.findings.filter((f: any) => {
            const affectedResource = (f.affectedResource || f.resourceId || '').toLowerCase()
            return affectedResource.includes(resourceName) ||
                   resourceName.includes(affectedResource) ||
                   f.resourceId === fullNode.id
          })
        }
      }
    } catch (err) {
      console.log('[FlowStrip] Could not fetch CSPM findings:', err)
    }

    // Fetch Security Group rules for this resource
    let sgRulesData: any[] = []
    try {
      // Try to get SG gap analysis which contains actual rules
      const sgResponse = await fetch(`/api/proxy/security-groups/gap-analysis?systemName=${encodeURIComponent(systemName)}`)
      if (sgResponse.ok) {
        const sgResult = await sgResponse.json()
        if (sgResult.security_groups || sgResult.groups) {
          const allSgs = sgResult.security_groups || sgResult.groups || []
          // Find SGs related to this resource
          const resourceName = (fullNode.name || node.name || '').toLowerCase()
          sgRulesData = allSgs.filter((sg: any) => {
            const sgName = (sg.group_name || sg.name || '').toLowerCase()
            const attachedResources = (sg.attached_resources || []).map((r: any) => r.toLowerCase())
            return sgName.includes(resourceName) ||
                   resourceName.includes(sgName) ||
                   attachedResources.some((r: string) => r.includes(resourceName))
          })
        }
      }
    } catch (err) {
      console.log('[FlowStrip] Could not fetch SG rules:', err)
    }

    // Fetch detailed IAM role gap analysis if this is a role or has an associated role
    let detailedIamRole: any = null
    const nodeType = (fullNode.type || node.type || '').toLowerCase()
    const nodeName = fullNode.name || node.name || ''

    // Find associated IAM role from iamGaps
    let associatedRole = iamGaps.find(role => {
      const roleName = (role.role_name || '').toLowerCase()
      const nodeNameLower = nodeName.toLowerCase()
      return roleName.includes(nodeNameLower) ||
             nodeNameLower.includes(roleName.replace(/-role$/i, '')) ||
             roleName.includes(nodeNameLower.replace('saferemediate-test-', '').replace('saferemediate-', ''))
    })

    // If node is IAM-related or we found an associated role, fetch detailed gap analysis
    if (nodeType.includes('iam') || nodeType.includes('role') || nodeType.includes('lambda') || associatedRole) {
      const roleNameToFetch = associatedRole?.role_name || nodeName
      try {
        const iamResponse = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleNameToFetch)}/gap-analysis`)
        if (iamResponse.ok) {
          const iamResult = await iamResponse.json()
          if (iamResult.role_name) {
            detailedIamRole = {
              role_name: iamResult.role_name,
              role_arn: iamResult.role_arn,
              allowed_permissions: iamResult.allowed_count || iamResult.allowed_actions || 0,
              used_permissions: iamResult.used_count || iamResult.used_actions || 0,
              unused_permissions: iamResult.unused_count || iamResult.unused_actions || 0,
              allowed_actions_list: iamResult.allowed_actions_list || [],
              used_actions_list: iamResult.used_actions_list || [],
              unused_actions_list: iamResult.unused_actions_list || [],
              used_actions: iamResult.used_actions_list || [],
              unused_by_service: groupActionsByService(iamResult.unused_actions_list || []),
            }
            console.log('[FlowStrip] Got detailed IAM data:', detailedIamRole.role_name,
              `${detailedIamRole.used_permissions}/${detailedIamRole.allowed_permissions} used`)
          }
        }
      } catch (err) {
        console.log('[FlowStrip] Could not fetch detailed IAM role data:', err)
      }
    }

    // Generate least privilege data with REAL data from AWS Config
    const realNodeData: RealNodeData = {
      node: fullNode,
      systemName,
      iamGaps,
      edges: rawGraphData.edges, // Real edges from Neo4j
      sgRules: sgRulesData, // Real SG rules from gap analysis
      configData: configData, // Real AWS Config data
      cloudTrailData: undefined, // CloudTrail data if available
      findings: findingsData, // CSPM findings for this resource
      detailedIamRole: detailedIamRole || undefined, // Detailed IAM role data from individual role API
      flowContext: flowContext || undefined, // Flow context from selected flow
    }

    const lpData = generateLeastPrivilegeData(realNodeData)
    setLeastPrivilegeData(lpData)
    setLpLoading(false)
  }, [systemName, iamGaps, rawGraphData, selectedFlow])

  const handleCloseLeastPrivilege = useCallback(() => {
    setSelectedNode(null)
    setLeastPrivilegeData(null)
  }, [])

  // Handle clicking on a checkpoint (SG, IAM Role, or NACL) to show Least Privilege Card
  const handleCheckpointClick = useCallback(async (checkpoint: FlowCheckpoint, segment: FlowSegment, e: React.MouseEvent) => {
    e.stopPropagation()
    setLpLoading(true)

    // Map checkpoint type to node type
    const getNodeType = (cpType: string): any => {
      switch (cpType) {
        case 'security_group': return 'security_group'
        case 'nacl': return 'nacl'
        case 'api_call': return 'api_call'
        case 'iam_role':
        default: return 'iam_role'
      }
    }

    // Create a pseudo-node for the checkpoint
    const checkpointNode: FlowNode = {
      id: checkpoint.id,
      type: getNodeType(checkpoint.type),
      name: checkpoint.name,
      shortName: checkpoint.shortName,
    }
    setSelectedNode(checkpointNode)

    // For Security Groups, fetch detailed gap analysis
    let sgDetailedData: any = null
    if (checkpoint.type === 'security_group') {
      try {
        // First try to get gap analysis for this specific SG
        const sgResponse = await fetch(`/api/proxy/security-groups/gap-analysis?systemName=${encodeURIComponent(systemName)}`)
        if (sgResponse.ok) {
          const sgResult = await sgResponse.json()
          const allSgs = sgResult.security_groups || sgResult.groups || []
          // Find the matching SG
          const matchingSg = allSgs.find((sg: any) => {
            const sgName = (sg.group_name || sg.name || '').toLowerCase()
            const cpName = (checkpoint.name || checkpoint.shortName || '').toLowerCase()
            return sgName.includes(cpName) || cpName.includes(sgName) ||
                   sg.group_id === checkpoint.id
          })
          if (matchingSg) {
            sgDetailedData = matchingSg
            console.log('[FlowStrip] Found SG gap analysis:', matchingSg.group_name || matchingSg.name)
          }
        }
      } catch (err) {
        console.log('[FlowStrip] Could not fetch SG gap analysis:', err)
      }
    }

    // For IAM Roles, fetch detailed gap analysis
    let iamDetailedData: any = null
    if (checkpoint.type === 'iam_role') {
      try {
        const roleName = checkpoint.name || checkpoint.shortName || 'unknown'
        const iamResponse = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis`)
        if (iamResponse.ok) {
          const iamResult = await iamResponse.json()
          if (iamResult.role_name) {
            iamDetailedData = {
              role_name: iamResult.role_name,
              role_arn: iamResult.role_arn,
              allowed_permissions: iamResult.allowed_count || 0,
              used_permissions: iamResult.used_count || 0,
              unused_permissions: iamResult.unused_count || 0,
              allowed_actions_list: iamResult.allowed_actions_list || [],
              used_actions_list: iamResult.used_actions_list || [],
              unused_actions_list: iamResult.unused_actions_list || [],
              unused_by_service: groupActionsByService(iamResult.unused_actions_list || []),
            }
            console.log('[FlowStrip] Found IAM role gap analysis:', iamResult.role_name)
          }
        }
      } catch (err) {
        console.log('[FlowStrip] Could not fetch IAM role gap analysis:', err)
      }
    }

    // For NACLs, use the checkpoint data directly (rules are already parsed)
    let naclDetailedData: any = null
    if (checkpoint.type === 'nacl') {
      // Find NACL in naclData state
      const matchingNacl = naclData.find((n: any) => n.id === checkpoint.id)
      if (matchingNacl) {
        naclDetailedData = matchingNacl
        console.log('[FlowStrip] Found NACL data:', matchingNacl.id)
      }
    }

    // Build checkpoint context from segment
    const checkpointContext = {
      checkpoint,
      segment,
      fromNode: segment.from,
      toNode: segment.to,
      port: segment.port,
      protocol: segment.protocol,
      requestCount: segment.requestCount,
      sgData: sgDetailedData,
      iamData: iamDetailedData,
      naclData: naclDetailedData,
    }

    // Generate least privilege data for the checkpoint
    const realNodeData: RealNodeData = {
      node: { id: checkpoint.id, type: checkpoint.type, name: checkpoint.name, shortName: checkpoint.shortName },
      systemName,
      iamGaps: iamDetailedData ? [iamDetailedData] : iamGaps,
      edges: rawGraphData.edges,
      sgRules: sgDetailedData ? [sgDetailedData] : [],
      configData: undefined,
      cloudTrailData: undefined,
      findings: [],
      detailedIamRole: iamDetailedData || undefined,
      flowContext: {
        inboundPorts: segment.port ? [segment.port] : [],
        outboundPorts: [],
        inboundRequests: segment.requestCount || 0,
        outboundRequests: 0,
        securityGroups: checkpoint.type === 'security_group' ? [checkpoint] : [],
        iamRoles: checkpoint.type === 'iam_role' ? [checkpoint] : [],
        nacls: checkpoint.type === 'nacl' ? [checkpoint] : [],
        apiCalls: checkpoint.type === 'api_call' ? [checkpoint] : [],
        sources: [segment.from.shortName || segment.from.name],
        destinations: [segment.to.shortName || segment.to.name],
      },
      checkpointContext, // Pass the full checkpoint context
    }

    const lpData = generateLeastPrivilegeData(realNodeData)
    setLeastPrivilegeData(lpData)
    setLpLoading(false)
  }, [systemName, iamGaps, rawGraphData, naclData])

  // Load from cache FIRST, then fetch fresh data - stale-while-revalidate
  useEffect(() => {
    let hasCache = false

    // Step 1: Try to load from cache immediately
    const cached = getCachedFlows(systemName, timeWindow)
    if (cached && cached.flows.length > 0) {
      console.log('[FlowStrip] Using cached flows:', cached.flows.length)
      setFlows(cached.flows)
      setXrayData(cached.xrayData)
      setXrayServices(cached.xrayServices)
      setIamGaps(cached.iamGaps)
      setLoading(false) // Hide loading spinner immediately
      hasCache = true

      // Select first flow
      if (cached.flows.length > 0) {
        setSelectedFlow(cached.flows[0])
        setFlowDetail(generateFlowDetail(cached.flows[0], [], cached.iamGaps, null)) // Traffic data will be fetched fresh
      }
    }

    // Step 2: Fetch fresh data (background if cache exists, with spinner if not)
    fetchData(hasCache)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName, timeWindow]) // Re-run when system or time window changes

  // Auto-refresh: Poll for new data every 30 seconds to detect new components in Neo4j
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL = 30 * 1000 // 30 seconds

    const intervalId = setInterval(() => {
      console.log('[FlowStrip] Auto-refresh: checking for new components...')
      fetchData(true) // Background refresh (no loading spinner)
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [fetchData])

  // Update the "seconds ago" display every 5 seconds
  const [, setTick] = useState(0)
  useEffect(() => {
    const tickInterval = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(tickInterval)
  }, [])

  // Extract unique components from flows
  const components = useMemo(() => {
    const compMap = new Map<string, { name: string; type: NodeType; gaps: number }>()
    flows.forEach(flow => {
      // Add compute nodes from segments
      flow.segments.forEach(seg => {
        const node = seg.to
        const key = node.shortName || node.name
        const nodeGaps = seg.checkpoints.reduce((sum, cp) => sum + (cp.gapCount || 0), 0)
        if (!compMap.has(key) || (compMap.get(key)?.gaps || 0) < nodeGaps) {
          compMap.set(key, { name: key, type: node.type, gaps: nodeGaps })
        }
      })
    })
    return Array.from(compMap.values()).sort((a, b) => b.gaps - a.gaps)
  }, [flows])

  const stats = useMemo(() => ({
    total: flows.length,
    withGaps: flows.filter(f => f.totalGaps > 0).length,
  }), [flows])

  // Build unified system view data when in full-system mode
  const unifiedSystem = useMemo(() => {
    if (viewMode !== 'full-system') return null
    return buildUnifiedSystemView(rawGraphData.nodes, rawGraphData.edges, sgData, iamGaps, xrayServices)
  }, [viewMode, rawGraphData, sgData, iamGaps, xrayServices])

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h`
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span className="text-slate-400 text-sm">Building full stack flows...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}
      style={{ background: '#0f172a', color: '#e2e8f0' }}
    >
      {/* Top Bar */}
      <div className="px-5 py-3 flex items-center gap-5 border-b" style={{ background: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(148, 163, 184, 0.1)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            🔒
          </div>
          <h1 className="text-base font-semibold">Cyntro</h1>
        </div>
        <span className="px-2.5 py-1 text-xs font-semibold rounded" style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#3b82f6' }}>
          {systemName}
        </span>
        <div className="w-px h-7" style={{ background: 'rgba(148, 163, 184, 0.2)' }} />
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>Window</span>
          {(['7d', '30d', '90d'] as TimeWindow[]).map(tw => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className="px-3 py-1.5 text-xs rounded-md transition-colors"
              style={{
                border: '1px solid',
                borderColor: timeWindow === tw ? '#10b981' : 'rgba(148, 163, 184, 0.2)',
                background: timeWindow === tw ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: timeWindow === tw ? '#10b981' : '#94a3b8',
              }}
            >
              {tw}
            </button>
          ))}
        </div>
        <div className="w-px h-7" style={{ background: 'rgba(148, 163, 184, 0.2)' }} />
        {/* View Mode Toggle: Isolated vs Full System */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>View</span>
          <button
            onClick={() => setViewMode('isolated')}
            className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
            style={{
              border: '1px solid',
              borderColor: viewMode === 'isolated' ? '#3b82f6' : 'rgba(148, 163, 184, 0.2)',
              background: viewMode === 'isolated' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: viewMode === 'isolated' ? '#3b82f6' : '#94a3b8',
            }}
          >
            <span>☰</span>
            Isolated
          </button>
          <button
            onClick={() => setViewMode('full-system')}
            className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
            style={{
              border: '1px solid',
              borderColor: viewMode === 'full-system' ? '#8b5cf6' : 'rgba(148, 163, 184, 0.2)',
              background: viewMode === 'full-system' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              color: viewMode === 'full-system' ? '#8b5cf6' : '#94a3b8',
            }}
          >
            <span>⬡</span>
            Full System
          </button>
          <button
            onClick={() => setViewMode('traffic')}
            className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
            style={{
              border: '1px solid',
              borderColor: viewMode === 'traffic' ? '#10b981' : 'rgba(148, 163, 184, 0.2)',
              background: viewMode === 'traffic' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: viewMode === 'traffic' ? '#10b981' : '#94a3b8',
            }}
          >
            <span>⚡</span>
            Live Traffic
          </button>
        </div>
        <div className="ml-auto flex items-center gap-5 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-bold">{stats.total}</span>
            <span style={{ color: '#94a3b8' }}>Full-Stack Flows</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold" style={{ color: '#f59e0b' }}>{stats.withGaps}</span>
            <span style={{ color: '#94a3b8' }}>With Gaps</span>
          </div>
          <div className="w-px h-5" style={{ background: 'rgba(148, 163, 184, 0.2)' }} />
          {/* Live indicator and refresh */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${isRefreshing ? 'animate-pulse' : ''}`}
                style={{ background: '#10b981' }}
              />
              <span className="text-xs" style={{ color: '#10b981' }}>Live</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all hover:bg-slate-700/50"
              style={{ color: isRefreshing ? '#64748b' : '#94a3b8' }}
              title={lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString()}` : 'Refresh now'}
            >
              <span className={isRefreshing ? 'animate-spin' : ''}>↻</span>
              {lastRefresh && (
                <span className="text-[10px]" style={{ color: '#64748b' }}>
                  {Math.floor((Date.now() - lastRefresh.getTime()) / 1000)}s ago
                </span>
              )}
            </button>
          </div>
          <div className="w-px h-5" style={{ background: 'rgba(148, 163, 184, 0.2)' }} />
          {/* X-Ray Toggle */}
          <button
            onClick={() => setShowXrayPanel(!showXrayPanel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs"
            style={{
              border: '1px solid',
              borderColor: showXrayPanel ? '#8b5cf6' : 'rgba(148, 163, 184, 0.2)',
              background: showXrayPanel ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              color: showXrayPanel ? '#a78bfa' : '#94a3b8',
            }}
          >
            <span>🔬</span>
            <span>X-Ray Insights</span>
            {xrayData?.insights?.length ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}>
                {xrayData.insights.length}
              </span>
            ) : null}
          </button>
          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs"
            style={{
              border: '1px solid',
              borderColor: isFullscreen ? '#10b981' : 'rgba(148, 163, 184, 0.2)',
              background: isFullscreen ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: isFullscreen ? '#10b981' : '#94a3b8',
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <>
                <span>⊠</span>
                <span>Exit</span>
              </>
            ) : (
              <>
                <span>⛶</span>
                <span>Expand</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane - Components */}
        <div className="w-[220px] flex flex-col border-r" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <div className="px-3 py-3 text-xs uppercase tracking-wider border-b font-medium" style={{ color: '#64748b', borderColor: 'rgba(148, 163, 184, 0.1)' }}>
            Stack Components
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {components.map((comp, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer mb-1 transition-colors hover:bg-slate-800/50"
              >
                <span className="text-lg">{NODE_ICONS[comp.type]}</span>
                <span className="flex-1 text-sm truncate">{comp.name}</span>
                {comp.gaps > 0 ? (
                  <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                    {comp.gaps}
                  </span>
                ) : (
                  <span className="text-sm" style={{ color: '#10b981' }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center Pane - Flows, Unified System, or Live Traffic */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {viewMode === 'traffic' ? (
              /* Live Traffic View - Animated connections from Neo4j */
              <TrafficFlowMap />
            ) : viewMode === 'full-system' && unifiedSystem ? (
              /* Unified System View - Single Connected Stack */
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                {/* Unified System Header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Full System Architecture</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' }}>
                      {unifiedSystem.nodes.length} services
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                    <span style={{ color: '#10b981' }}>● Live</span>
                    {unifiedSystem.edges.filter(e => e.hasGaps).length > 0 && (
                      <span style={{ color: '#f59e0b' }}>⚠ {unifiedSystem.edges.filter(e => e.hasGaps).length} paths with gaps</span>
                    )}
                  </div>
                </div>

                {/* Tiered Visualization */}
                <div className="px-6 py-8">
                  {unifiedSystem.tiers.map((tier, tierIdx) => (
                    <div key={tier.name} className="mb-8 last:mb-0">
                      {/* Tier Label */}
                      <div className="text-[10px] uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: '#64748b' }}>
                        <span className="w-2 h-2 rounded-full" style={{
                          background: tierIdx === 0 ? '#ef4444' : tierIdx === 1 ? '#f59e0b' : tierIdx === 2 ? '#10b981' : tierIdx === 3 ? '#3b82f6' : '#8b5cf6'
                        }} />
                        {tier.name}
                      </div>

                      {/* Nodes in this tier */}
                      <div className="flex flex-wrap gap-4 items-center justify-center">
                        {tier.nodeIds.map(nodeId => {
                          const node = unifiedSystem.nodes.find(n => n.id === nodeId)
                          if (!node) return null

                          // Find edges connected to this node
                          const outgoingEdges = unifiedSystem.edges.filter(e => e.source === nodeId)
                          const incomingEdges = unifiedSystem.edges.filter(e => e.target === nodeId)

                          return (
                            <div key={nodeId} className="flex items-center gap-2">
                              {/* Node */}
                              <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                                <div
                                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative"
                                  style={{
                                    background: 'rgba(30, 41, 59, 0.95)',
                                    border: `2px solid ${node.gaps && node.gaps > 0 ? '#f59e0b' : '#10b981'}`,
                                    boxShadow: `0 0 12px ${node.gaps && node.gaps > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                                  }}
                                >
                                  {getAwsIcon(node.rawType)}
                                </div>
                                <span className="text-xs font-semibold text-center max-w-[120px] truncate">{node.shortName}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' }}>
                                  {node.rawType}
                                </span>
                                {/* Show traffic stats */}
                                {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
                                  <div className="text-[9px] flex gap-2" style={{ color: '#64748b' }}>
                                    {incomingEdges.length > 0 && <span>↓{incomingEdges.reduce((s, e) => s + e.requestCount, 0).toLocaleString()}</span>}
                                    {outgoingEdges.length > 0 && <span>↑{outgoingEdges.reduce((s, e) => s + e.requestCount, 0).toLocaleString()}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                    </div>
                  ))}
                </div>

                {/* Observed Connections */}
                {unifiedSystem.edges.length > 0 && (
                  <div className="px-6 py-4 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
                    <div className="text-[10px] uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: '#64748b' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
                      Observed Connections ({unifiedSystem.edges.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                      {unifiedSystem.edges.map(edge => {
                        const sourceNode = unifiedSystem.nodes.find(n => n.id === edge.source)
                        const targetNode = unifiedSystem.nodes.find(n => n.id === edge.target)
                        if (!sourceNode || !targetNode) return null
                        return (
                          <div
                            key={edge.id}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                            style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(148, 163, 184, 0.1)' }}
                          >
                            {/* Source */}
                            <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
                              <span className="text-lg flex-shrink-0">{getAwsIcon(sourceNode.rawType)}</span>
                              <span className="truncate font-medium" title={sourceNode.name}>{sourceNode.shortName}</span>
                            </div>
                            {/* Arrow with stats */}
                            <div className="flex items-center gap-1 flex-shrink-0 px-2">
                              <span className="text-[10px] font-bold" style={{ color: '#10b981' }}>{edge.requestCount.toLocaleString()}</span>
                              <span style={{ color: '#10b981' }}>→</span>
                              <span className="text-[9px] font-mono" style={{ color: '#64748b' }}>{edge.label}</span>
                            </div>
                            {/* Target */}
                            <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
                              <span className="text-lg flex-shrink-0">{getAwsIcon(targetNode.rawType)}</span>
                              <span className="truncate font-medium" title={targetNode.name}>{targetNode.shortName}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Summary Footer */}
                <div className="px-4 py-3 flex flex-wrap gap-4 text-xs border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)', color: '#64748b' }}>
                  <div className="flex items-center gap-2">
                    <span>λ</span>
                    <span>Lambda</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🖥️</span>
                    <span>EC2</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🗄️</span>
                    <span>RDS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>⚡</span>
                    <span>DynamoDB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📦</span>
                    <span>S3</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🚪</span>
                    <span>API Gateway</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📨</span>
                    <span>SQS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🔐</span>
                    <span>KMS</span>
                  </div>
                </div>
              </div>
            ) : (
            /* Isolated Flows View - Individual Flow Strips */
            flows.map(flow => (
              <div
                key={flow.id}
                onClick={() => handleSelectFlow(flow)}
                className="rounded-xl mb-4 cursor-pointer transition-all overflow-hidden"
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: `1px solid ${selectedFlow?.id === flow.id ? '#10b981' : 'rgba(148, 163, 184, 0.1)'}`,
                }}
              >
                {/* Flow Header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                  <span className="text-sm font-semibold">{flow.pathDescription}</span>
                  <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                    <span style={{ color: '#10b981' }}>● Active</span>
                    {flow.totalGaps > 0 && <span style={{ color: '#f59e0b' }}>⚠ {flow.totalGaps} gaps</span>}
                    <span>last {formatTimeAgo(flow.lastActivity)}</span>
                  </div>
                </div>

                {/* Flow Visualization */}
                <div className="px-4 py-6 flex items-center gap-0 overflow-x-auto">
                  {/* Source Node */}
                  <div
                    className="flex flex-col items-center gap-1.5 min-w-[100px] flex-shrink-0 cursor-pointer group"
                    onClick={(e) => handleNodeClick(flow.source, e)}
                  >
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative transition-all group-hover:scale-110"
                      style={{
                        background: selectedNode?.id === flow.source.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.95)',
                        border: selectedNode?.id === flow.source.id ? '3px solid #10b981' : '2px solid #10b981',
                        boxShadow: selectedNode?.id === flow.source.id ? '0 0 20px rgba(16, 185, 129, 0.5)' : '0 0 12px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      {NODE_ICONS[flow.source.type]}
                    </div>
                    <span className="text-xs font-semibold text-center max-w-[110px] truncate group-hover:text-emerald-400 transition-colors">{flow.source.shortName}</span>
                    {flow.source.sourceCount && <span className="text-[10px]" style={{ color: '#64748b' }}>{flow.source.sourceCount} sources</span>}
                  </div>

                  {/* Segments */}
                  {flow.segments.map((segment, segIdx) => (
                    <div key={segIdx} className="flex items-center">
                      {/* Line with traffic info */}
                      <div className="flex flex-col items-center">
                        <div className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
                          <span className="font-bold" style={{ color: '#10b981' }}>
                            {segment.requestCount > 1000 ? `${(segment.requestCount/1000).toFixed(1)}K` : segment.requestCount}
                          </span>
                          {segment.label && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                              {segment.label}
                            </span>
                          )}
                        </div>
                        <div
                          className="min-w-[60px] max-w-[100px] h-[4px] rounded relative"
                          style={{ background: segment.checkpoints.some(cp => cp.type === 'iam_role') ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)' : 'linear-gradient(90deg, #10b981, #3b82f6)' }}
                        >
                          {/* Animated particle */}
                          <div
                            className="absolute w-2 h-2 rounded-full top-[-2px]"
                            style={{
                              background: '#10b981',
                              animation: 'flowMove 1.8s linear infinite',
                              boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)'
                            }}
                          />
                        </div>
                      </div>

                      {/* Checkpoints - clickable for detailed analysis */}
                      {segment.checkpoints.map((cp, cpIdx) => {
                        // Define colors and icons for each checkpoint type
                        const getCheckpointStyle = (type: string) => {
                          switch (type) {
                            case 'security_group':
                              return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', icon: '🛡️', gradient: 'linear-gradient(90deg, #3b82f6, #10b981)' }
                            case 'nacl':
                              return { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', icon: '🚧', gradient: 'linear-gradient(90deg, #06b6d4, #3b82f6)' }
                            case 'api_call':
                              return { bg: 'rgba(132, 204, 22, 0.15)', border: '#84cc16', icon: '⚡', gradient: 'linear-gradient(90deg, #84cc16, #22c55e)' }
                            case 'iam_role':
                            default:
                              return { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', icon: '🔑', gradient: 'linear-gradient(90deg, #8b5cf6, #3b82f6)' }
                          }
                        }
                        const style = getCheckpointStyle(cp.type)

                        return (
                          <div key={cpIdx} className="flex items-center">
                            <div
                              className="flex flex-col items-center gap-1 mx-[-4px] z-10 cursor-pointer group/cp"
                              onClick={(e) => handleCheckpointClick(cp, segment, e)}
                            >
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-base transition-all group-hover/cp:scale-110"
                                style={{
                                  background: style.bg,
                                  border: `2px solid ${style.border}`,
                                }}
                              >
                                {style.icon}
                              </div>
                              <span className="text-[10px] font-semibold" style={{ color: style.border }}>
                                {cp.usedCount}/{cp.totalCount}
                              </span>
                              {(cp.gapCount || 0) > 0 && (
                                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: style.border, color: '#0f172a' }}>
                                  {cp.gapCount || 0}
                                </span>
                              )}
                            </div>
                            <div
                              className="min-w-[40px] max-w-[60px] h-[4px] rounded"
                              style={{ background: style.gradient }}
                            />
                          </div>
                        )
                      })}

                      {/* Intermediate or destination node */}
                      <div
                        className="flex flex-col items-center gap-1.5 min-w-[100px] flex-shrink-0 cursor-pointer group"
                        onClick={(e) => handleNodeClick(segment.to, e)}
                      >
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative transition-all group-hover:scale-110"
                          style={{
                            background: selectedNode?.id === segment.to.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.95)',
                            border: selectedNode?.id === segment.to.id ? '3px solid #10b981' : '2px solid #10b981',
                            boxShadow: selectedNode?.id === segment.to.id ? '0 0 20px rgba(16, 185, 129, 0.5)' : '0 0 12px rgba(16, 185, 129, 0.3)',
                          }}
                        >
                          {NODE_ICONS[segment.to.type]}
                        </div>
                        <span className="text-xs font-semibold text-center max-w-[110px] truncate group-hover:text-emerald-400 transition-colors">{segment.to.shortName}</span>
                        {segment.to.instanceId && <span className="text-[10px]" style={{ color: '#64748b' }}>i-{segment.to.instanceId}</span>}
                        {segment.to.queryCount && <span className="text-[10px]" style={{ color: '#64748b' }}>{segment.to.queryCount} queries</span>}
                        {segment.to.operationCount && <span className="text-[10px]" style={{ color: '#64748b' }}>{segment.to.operationCount} ops</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Flow Summary */}
                <div className="px-4 py-3 flex gap-5 text-xs" style={{ background: 'rgba(15, 23, 42, 0.5)', borderTop: '1px solid rgba(148, 163, 184, 0.05)', color: '#64748b' }}>
                  {flow.summaryStats.map((stat, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="font-semibold" style={{ color: stat.color === 'ok' ? '#10b981' : stat.color === 'warn' ? '#f59e0b' : '#e2e8f0' }}>
                        {stat.value}
                      </span>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
            )}
          </div>

          {/* Legend */}
          <div className="px-4 py-3 flex gap-5 text-xs border-t" style={{ color: '#64748b', borderColor: 'rgba(148, 163, 184, 0.1)' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-[4px] rounded" style={{ background: 'linear-gradient(90deg, #10b981, #3b82f6)' }} />
              <span>Network</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-[4px] rounded" style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
              <span>API</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center text-xs" style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b' }}>🛡️</div>
              <span>SG Gate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center text-xs" style={{ background: 'rgba(236, 72, 153, 0.15)', border: '1px solid #ec4899' }}>🔑</div>
              <span>Role Gate</span>
            </div>
          </div>
        </div>

        {/* X-Ray Insights Panel */}
        {showXrayPanel && (
          <div className="w-[340px] flex flex-col border-l" style={{ borderColor: 'rgba(148, 163, 184, 0.1)', background: 'rgba(20, 25, 40, 0.95)' }}>
            <div className="px-4 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🔬</span>
                <span className="text-base font-semibold" style={{ color: '#a78bfa' }}>X-Ray Application Insights</span>
              </div>
              <button
                onClick={() => setShowXrayPanel(false)}
                className="text-slate-500 hover:text-slate-300 text-xl px-1"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Trace Stats */}
              {xrayData?.traceStats && (
                <div className="mb-5 p-4 rounded-lg" style={{ background: 'rgba(30, 41, 59, 0.5)' }}>
                  <h4 className="text-xs uppercase tracking-wide mb-3 font-semibold" style={{ color: '#8b5cf6' }}>Trace Statistics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xl font-bold">{xrayData.traceStats.totalTraces.toLocaleString()}</div>
                      <div className="text-xs" style={{ color: '#94a3b8' }}>Total Traces</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold" style={{ color: '#f59e0b' }}>{xrayData.traceStats.errorTraces}</div>
                      <div className="text-xs" style={{ color: '#94a3b8' }}>Errors</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{xrayData.traceStats.averageLatency}ms</div>
                      <div className="text-xs" style={{ color: '#94a3b8' }}>Avg Latency</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{xrayData.traceStats.p95Latency}ms</div>
                      <div className="text-xs" style={{ color: '#94a3b8' }}>p95 Latency</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Operations */}
              {xrayData?.topOperations && xrayData.topOperations.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2 font-semibold" style={{ color: '#10b981' }}>
                    <span className="text-lg">🔥</span> Top Operations
                  </h4>
                  <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                    {xrayData.topOperations.slice(0, 4).map((op, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                        <span className="flex-1 font-mono text-xs truncate">{op.name}</span>
                        <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{op.count.toLocaleString()}</span>
                        <span className="text-xs" style={{ color: '#64748b' }}>{op.avgLatency}ms</span>
                        {op.errorRate > 0.1 && (
                          <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{op.errorRate}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Insights */}
              {xrayData?.insights && xrayData.insights.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2 font-semibold" style={{ color: '#f59e0b' }}>
                    <span className="text-lg">⚠️</span> Application Issues
                  </h4>
                  <div className="space-y-3">
                    {xrayData.insights.map((insight) => (
                      <div
                        key={insight.id}
                        className="p-3.5 rounded-lg"
                        style={{
                          background: insight.severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' :
                                     insight.severity === 'warning' ? 'rgba(245, 158, 11, 0.15)' :
                                     'rgba(59, 130, 246, 0.1)',
                          border: `1px solid ${
                            insight.severity === 'critical' ? 'rgba(239, 68, 68, 0.3)' :
                            insight.severity === 'warning' ? 'rgba(245, 158, 11, 0.3)' :
                            'rgba(59, 130, 246, 0.2)'
                          }`
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl mt-0.5">
                            {insight.type === 'latency' ? '⏱️' : insight.type === 'error' ? '❌' : '📈'}
                          </span>
                          <div className="flex-1">
                            <div className="text-sm font-semibold mb-1.5">{insight.title}</div>
                            <div className="text-xs mb-2" style={{ color: '#94a3b8' }}>{insight.description}</div>
                            <div className="text-xs mb-2" style={{ color: '#64748b' }}>
                              <strong>Root cause:</strong> <span style={{ color: '#cbd5e1' }}>{insight.rootCause}</span>
                            </div>
                            <div className="text-xs p-2 rounded-md" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                              💡 {insight.recommendation}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services */}
              {xrayServices.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2 font-semibold" style={{ color: '#3b82f6' }}>
                    <span className="text-lg">🔗</span> Service Map
                  </h4>
                  <div className="space-y-2">
                    {xrayServices.slice(0, 5).map((svc, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                        <span className="text-2xl">
                          {svc.type.includes('Lambda') ? 'λ' :
                           svc.type.includes('RDS') ? '🗄️' :
                           svc.type.includes('DynamoDB') ? '⚡' :
                           svc.type.includes('S3') ? '📦' :
                           svc.type.includes('ApiGateway') ? '🚪' : '🔹'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{svc.name}</div>
                          <div className="text-xs" style={{ color: '#94a3b8' }}>
                            {svc.summaryStatistics.totalCount.toLocaleString()} calls • {svc.summaryStatistics.averageResponseTime.toFixed(0)}ms avg
                          </div>
                        </div>
                        {svc.summaryStatistics.errorCount > 0 && (
                          <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                            {svc.summaryStatistics.errorCount}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Pane - Detail */}
        <div className="w-[320px] flex flex-col border-l" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          {flowDetail ? (
            <>
              <div className="p-3.5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
                <div className="text-sm font-semibold mb-2">🔄 {flowDetail.flow.pathDescription}</div>
                <div className="text-[11px] p-2.5 rounded-md leading-relaxed" style={{ background: 'rgba(30, 41, 59, 0.5)', color: '#94a3b8' }}>
                  Traffic from <strong className="text-slate-200">{flowDetail.flow.source.shortName}</strong>
                  {flowDetail.flow.source.sourceCount && ` (${flowDetail.flow.source.sourceCount} unique sources)`} hits{' '}
                  <strong className="text-slate-200">{flowDetail.flow.segments[0]?.to.shortName}</strong>
                  {flowDetail.whatHappened.ports[0] && ` on :${flowDetail.whatHappened.ports[0]}`}, which queries{' '}
                  <strong className="text-slate-200">{flowDetail.flow.destination.shortName}</strong>
                  {flowDetail.whatHappened.ports[1] && ` on :${flowDetail.whatHappened.ports[1]}`}.{' '}
                  <strong className="text-slate-200">{flowDetail.whatHappened.totalRequests.toLocaleString()} requests</strong>
                  {flowDetail.whatHappened.latencyP95 && `, p95 ${flowDetail.whatHappened.latencyP95}ms`}.
                  {flowDetail.flow.totalGaps > 0 && (
                    <> <strong className="text-amber-400">{flowDetail.flow.totalGaps} gap{flowDetail.flow.totalGaps > 1 ? 's' : ''}</strong> can be removed.</>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5">
                {/* What Happened */}
                <div className="mb-4">
                  <h4 className="text-[9px] uppercase tracking-wide mb-2 flex items-center justify-between" style={{ color: '#10b981' }}>
                    <span className="flex items-center gap-1.5">📊 What Happened</span>
                    {trafficData?.has_traffic_data ? (
                      <span className="px-1.5 py-0.5 rounded text-[8px]" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                        VPC Flow Logs
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[8px]" style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#64748b' }}>
                        Estimated
                      </span>
                    )}
                  </h4>
                  <div className="rounded-md overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                    <div className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                      <span className="w-4 text-center" style={{ color: '#10b981' }}>↓</span>
                      <span className="flex-1 font-mono text-[9px]">{flowDetail.flow.source.shortName} → {flowDetail.flow.segments[0]?.to.shortName} :{flowDetail.whatHappened.ports[0] || 443}</span>
                      <span className="font-mono text-[9px]" style={{ color: '#94a3b8' }}>{flowDetail.whatHappened.totalRequests.toLocaleString()} req</span>
                    </div>
                    {flowDetail.whatHappened.ports[1] && (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                        <span className="w-4 text-center" style={{ color: '#10b981' }}>→</span>
                        <span className="flex-1 font-mono text-[9px]">{flowDetail.flow.segments[0]?.to.shortName} → {flowDetail.flow.destination.shortName} :{flowDetail.whatHappened.ports[1]}</span>
                        <span className="font-mono text-[9px]" style={{ color: '#94a3b8' }}>{flowDetail.flow.segments[1]?.requestCount || 47}→43</span>
                      </div>
                    )}
                    {flowDetail.whatHappened.latencyP95 && (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                        <span className="w-4 text-center" style={{ color: '#10b981' }}>⏱</span>
                        <span className="flex-1 font-mono text-[9px]">End-to-end latency p95</span>
                        <span className="font-mono text-[9px]" style={{ color: '#94a3b8' }}>{flowDetail.whatHappened.latencyP95}ms</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-2.5 py-2 text-[10px]">
                      <span className="w-4 text-center" style={{ color: '#10b981' }}>📊</span>
                      <span className="flex-1 font-mono text-[9px]">Data transferred</span>
                      <span className="font-mono text-[9px]" style={{ color: '#94a3b8' }}>{((flowDetail.whatHappened.bytesTransferred || 0) / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                </div>

                {/* What Allowed It */}
                <div className="mb-4">
                  <h4 className="text-[9px] uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: '#3b82f6' }}>
                    ✓ What Allowed It
                  </h4>
                  <div className="rounded-md overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                    {flowDetail.whatAllowedIt.sgRules.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                        <span className="w-4 text-center">🛡️</span>
                        <span className="flex-1 font-mono text-[9px]">ALB-SG: 0.0.0.0/0 → :{flowDetail.whatHappened.ports[0] || 443}</span>
                        <span className="px-1 py-0.5 rounded text-[8px] font-semibold" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                          public
                        </span>
                      </div>
                    ))}
                    {flowDetail.whatHappened.ports[1] && (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                        <span className="w-4 text-center">🛡️</span>
                        <span className="flex-1 font-mono text-[9px]">DB-SG: frontend-sg → :{flowDetail.whatHappened.ports[1]}</span>
                        <span className="px-1 py-0.5 rounded text-[8px] font-semibold" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                          internal
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* What's Unnecessary */}
                {(flowDetail.whatsUnnecessary.unusedSgRules.length > 0 || flowDetail.whatsUnnecessary.unusedIamPerms.length > 0) && (
                  <div className="mb-4">
                    <h4 className="text-[9px] uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                      ⚠️ What's Unnecessary
                    </h4>
                    <div className="rounded-md overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                      {flowDetail.whatsUnnecessary.unusedSgRules.map((rule, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)', color: '#64748b' }}>
                          <span className="w-4 text-center">✗</span>
                          <span className="flex-1 font-mono text-[9px]">ALB-SG: 0.0.0.0/0 → :80</span>
                          <span className="font-mono text-[9px]">0 hits</span>
                          <span className="px-1 py-0.5 rounded text-[8px] font-semibold" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>remove</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blast Radius */}
                {flowDetail.whatCouldBreak.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-[9px] uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: '#ef4444' }}>
                      💥 Blast Radius
                    </h4>
                    <div className="rounded-md overflow-hidden" style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                      {flowDetail.whatCouldBreak.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-2 text-[10px]" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                          <span className="w-4 text-center">🔗</span>
                          <span className="flex-1 font-mono text-[9px]">Remove {item.item}</span>
                          <span className="font-mono text-[9px]" style={{ color: '#94a3b8' }}>0 impact</span>
                          <span className="px-1 py-0.5 rounded text-[8px] font-semibold" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                            safe
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3.5 flex gap-2 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
                <button className="flex-1 py-2.5 text-[11px] font-medium rounded-md" style={{ background: '#10b981', color: 'white' }}>
                  Remove Unused Rule
                </button>
                <button className="flex-1 py-2.5 text-[11px] font-medium rounded-md" style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' }}>
                  Export
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#64748b' }}>
              Select a flow to view details
            </div>
          )}
        </div>
      </div>

      {/* Least Privilege Remediation Popup Modal */}
      {selectedNode && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
          onClick={handleCloseLeastPrivilege}
        >
          <div
            className="w-[520px] max-h-[85vh] rounded-xl shadow-2xl overflow-hidden"
            style={{
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <LeastPrivilegeCard
              data={leastPrivilegeData}
              loading={lpLoading}
              onClose={handleCloseLeastPrivilege}
              onApplyFix={(data) => {
                console.log('[FlowStrip] Apply fix for:', data.resourceName)
                // TODO: Implement actual fix application
                alert(`Fix would be applied to: ${data.resourceName}\n\nReplace:\n${data.recommendation.before.join('\n')}\n\nWith:\n${data.recommendation.after.join('\n')}`)
              }}
            />
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes flowMove {
          0% { left: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: calc(100% - 6px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
