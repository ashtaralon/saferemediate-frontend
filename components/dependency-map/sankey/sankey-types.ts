// TypeScript interfaces for Sankey diagram data structures

export interface SankeyNode {
  id: string
  label: string
  tier: number
  nodeType: string
  color: string
  isIAM: boolean
}

export interface SankeyLink {
  source: string
  target: string
  value: number
  port?: string
  protocol?: string
  edgeId: string
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

export interface SankeyViewProps {
  graphData: { nodes: any[]; edges: any[] } | null
  isLoading: boolean
  onNodeClick: (nodeId: string, nodeType: string, nodeName: string) => void
  onRefresh: () => void
  showIAM?: boolean
  height?: number | string
}

export interface SankeyTooltipData {
  type: 'node' | 'link'
  label?: string
  nodeType?: string
  totalTraffic?: number
  source?: string
  target?: string
  value?: number
  port?: string
  protocol?: string
}

// Tier mapping for resource types
export const TIER_MAP: Record<string, number> = {
  // Tier 0: Internet/External Entry Points
  'Internet': 0,
  'InternetGateway': 0,
  'External': 0,
  'NetworkEndpoint': 0,

  // Tier 1: Ingress/Load Balancers
  'ALB': 1,
  'ELB': 1,
  'NLB': 1,
  'SecurityGroup': 1,
  'WAF': 1,
  'CloudFront': 1,

  // Tier 2: Compute
  'EC2': 2,
  'Lambda': 2,
  'ECS': 2,
  'Fargate': 2,

  // Tier 3: Data Services
  'RDS': 3,
  'DynamoDB': 3,
  'Aurora': 3,
  'ElastiCache': 3,

  // Tier 4: Storage
  'S3': 4,
  'S3Bucket': 4,
  'EFS': 4,

  // Tier 5: IAM (hidden by default)
  'IAMRole': 5,
  'IAMPolicy': 5,
  'Principal': 5,
}

// AWS-style colors for resource types
export const NODE_COLORS: Record<string, string> = {
  // Internet - Red
  'Internet': '#D13212',
  'InternetGateway': '#D13212',
  'External': '#D13212',
  'NetworkEndpoint': '#64748B',

  // Security - Purple
  'SecurityGroup': '#7B2FBE',
  'WAF': '#7B2FBE',
  'VPC': '#7B2FBE',
  'Subnet': '#7B2FBE',

  // Load Balancers - Purple/Blue
  'ALB': '#7B2FBE',
  'ELB': '#7B2FBE',
  'NLB': '#7B2FBE',
  'CloudFront': '#7B2FBE',

  // Compute - Orange
  'EC2': '#F58536',
  'Lambda': '#F58536',
  'ECS': '#F58536',
  'Fargate': '#F58536',

  // Database - Blue
  'RDS': '#3F48CC',
  'DynamoDB': '#3F48CC',
  'Aurora': '#3F48CC',
  'ElastiCache': '#3F48CC',

  // Storage - Green
  'S3': '#759C3E',
  'S3Bucket': '#759C3E',
  'EFS': '#759C3E',

  // IAM - Violet
  'IAMRole': '#8B5CF6',
  'IAMPolicy': '#8B5CF6',
  'Principal': '#8B5CF6',

  // Default
  'default': '#64748B',
}

// Tier labels for legend
export const TIER_LABELS = [
  { name: 'Internet', color: '#D13212', tier: 0 },
  { name: 'Ingress', color: '#7B2FBE', tier: 1 },
  { name: 'Compute', color: '#F58536', tier: 2 },
  { name: 'Data', color: '#3F48CC', tier: 3 },
  { name: 'Storage', color: '#759C3E', tier: 4 },
]
