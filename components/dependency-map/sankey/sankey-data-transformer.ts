// Transform graph data from backend API to Sankey diagram format

import { SankeyData, SankeyNode, SankeyLink, TIER_MAP, NODE_COLORS } from './sankey-types'

interface GraphNode {
  id: string
  name: string
  type: string
  category?: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  edge_type: string
  type?: string
  port?: string
  protocol?: string
  traffic_bytes?: number
  hit_count?: number
}

interface TransformOptions {
  showIAM: boolean
  minTrafficBytes?: number
  maxLinks?: number
}

// Check if a node type is IAM-related
function isIAMNode(nodeType: string): boolean {
  const iamTypes = ['IAMRole', 'IAMPolicy', 'Principal', 'IAMUser']
  return iamTypes.some(t => nodeType?.toLowerCase().includes(t.toLowerCase()))
}

// Get tier for a resource type
function getTier(nodeType: string): number {
  // Check exact match first
  if (TIER_MAP[nodeType] !== undefined) {
    return TIER_MAP[nodeType]
  }

  // Check partial matches
  const type = nodeType?.toLowerCase() || ''

  if (type.includes('internet') || type.includes('gateway') || type.includes('endpoint')) return 0
  if (type.includes('security') || type.includes('alb') || type.includes('elb') || type.includes('waf')) return 1
  if (type.includes('ec2') || type.includes('lambda') || type.includes('ecs') || type.includes('compute')) return 2
  if (type.includes('rds') || type.includes('dynamo') || type.includes('database') || type.includes('aurora')) return 3
  if (type.includes('s3') || type.includes('storage') || type.includes('efs')) return 4
  if (type.includes('iam') || type.includes('role') || type.includes('policy') || type.includes('principal')) return 5

  return 2 // Default to compute tier
}

// Get color for a resource type
function getNodeColor(nodeType: string): string {
  if (NODE_COLORS[nodeType]) {
    return NODE_COLORS[nodeType]
  }

  const type = nodeType?.toLowerCase() || ''

  if (type.includes('internet') || type.includes('external')) return NODE_COLORS.Internet
  if (type.includes('security') || type.includes('vpc') || type.includes('subnet')) return NODE_COLORS.SecurityGroup
  if (type.includes('alb') || type.includes('elb') || type.includes('cloudfront')) return NODE_COLORS.ALB
  if (type.includes('ec2') || type.includes('lambda') || type.includes('compute')) return NODE_COLORS.EC2
  if (type.includes('rds') || type.includes('dynamo') || type.includes('database')) return NODE_COLORS.RDS
  if (type.includes('s3') || type.includes('storage')) return NODE_COLORS.S3
  if (type.includes('iam') || type.includes('role') || type.includes('principal')) return NODE_COLORS.IAMRole

  return NODE_COLORS.default
}

// Truncate name for display
function truncateName(name: string, maxLength: number = 20): string {
  if (!name) return 'Unknown'
  if (name.length <= maxLength) return name
  return name.substring(0, maxLength - 3) + '...'
}

/**
 * Transform graph data from backend API to Sankey diagram format
 */
export function transformToSankey(
  graphData: { nodes: GraphNode[]; edges: GraphEdge[] },
  options: TransformOptions
): SankeyData {
  const { showIAM, minTrafficBytes = 0, maxLinks = 200 } = options

  if (!graphData?.nodes || !graphData?.edges) {
    return { nodes: [], links: [] }
  }

  // 1. Filter edges to ACTUAL_TRAFFIC and ACTUAL_API_CALL only
  const trafficEdges = graphData.edges.filter(e => {
    const edgeType = e.edge_type || e.type || ''
    return edgeType === 'ACTUAL_TRAFFIC' || edgeType === 'ACTUAL_API_CALL'
  })

  if (trafficEdges.length === 0) {
    return { nodes: [], links: [] }
  }

  // 2. Get unique node IDs from traffic edges
  const connectedNodeIds = new Set<string>()
  trafficEdges.forEach(e => {
    connectedNodeIds.add(e.source)
    connectedNodeIds.add(e.target)
  })

  // 3. Build node map from graph data
  const nodeMap = new Map<string, GraphNode>()
  graphData.nodes.forEach(n => {
    nodeMap.set(n.id, n)
  })

  // 4. Build Sankey nodes (only connected nodes)
  const sankeyNodes: SankeyNode[] = []
  const validNodeIds = new Set<string>()

  connectedNodeIds.forEach(nodeId => {
    const node = nodeMap.get(nodeId)
    const nodeType = node?.type || 'Unknown'
    const isIAM = isIAMNode(nodeType)

    // Skip IAM nodes if showIAM is false
    if (!showIAM && isIAM) {
      return
    }

    validNodeIds.add(nodeId)
    sankeyNodes.push({
      id: nodeId,
      label: truncateName(node?.name || nodeId, 18),
      tier: getTier(nodeType),
      nodeType: nodeType,
      color: getNodeColor(nodeType),
      isIAM: isIAM
    })
  })

  // 5. Build Sankey links (only between valid nodes)
  let sankeyLinks: SankeyLink[] = trafficEdges
    .filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target))
    .filter(e => (e.traffic_bytes || 0) >= minTrafficBytes)
    .map(e => ({
      source: e.source,
      target: e.target,
      value: Math.max(e.traffic_bytes || e.hit_count || 1, 1), // Minimum 1 for visibility
      port: e.port,
      protocol: e.protocol,
      edgeId: e.id
    }))

  // 6. Aggregate duplicate links (same source-target pair)
  const linkMap = new Map<string, SankeyLink>()
  sankeyLinks.forEach(link => {
    const key = `${link.source}->${link.target}`
    const existing = linkMap.get(key)
    if (existing) {
      existing.value += link.value
      // Keep the first port/protocol
    } else {
      linkMap.set(key, { ...link })
    }
  })
  sankeyLinks = Array.from(linkMap.values())

  // 7. Sort by traffic value and limit if needed
  sankeyLinks.sort((a, b) => b.value - a.value)
  if (sankeyLinks.length > maxLinks) {
    sankeyLinks = sankeyLinks.slice(0, maxLinks)

    // Update valid nodes to only include those in limited links
    const limitedNodeIds = new Set<string>()
    sankeyLinks.forEach(link => {
      limitedNodeIds.add(link.source)
      limitedNodeIds.add(link.target)
    })

    // Filter nodes
    const filteredNodes = sankeyNodes.filter(n => limitedNodeIds.has(n.id))
    return { nodes: filteredNodes, links: sankeyLinks }
  }

  return { nodes: sankeyNodes, links: sankeyLinks }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (!bytes || isNaN(bytes)) return 'N/A'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Calculate total traffic for a node
 */
export function calculateNodeTraffic(
  nodeId: string,
  links: SankeyLink[]
): number {
  return links
    .filter(l => l.source === nodeId || l.target === nodeId)
    .reduce((sum, l) => sum + l.value, 0)
}
