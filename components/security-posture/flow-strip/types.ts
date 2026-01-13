// Flow Strip Types - Full Stack End-to-end visualization

export type FlowStatus = 'active' | 'idle' | 'warning' | 'blocked'

export type CheckpointType = 'security_group' | 'iam_role'

export type NodeType = 'internet' | 'compute' | 'database' | 'storage' | 'lambda' | 'api_gateway' | 'load_balancer' | 'step_functions' | 'dynamodb' | 'sqs' | 'sns' | 'eventbridge'

// A checkpoint (gate) on the flow - SG or IAM Role
export interface FlowCheckpoint {
  id: string
  type: CheckpointType
  name: string
  shortName?: string // e.g., "app-role" instead of full ARN

  // Usage stats
  usedCount: number
  totalCount: number
  gapCount?: number // Explicitly show gap for IAM

  // Details for expansion
  usedItems: string[]
  unusedItems: string[]

  // For IAM roles - show what permissions are used
  topUsedPermissions?: string[]
  topUnusedPermissions?: string[]
}

// A node (endpoint) in the flow
export interface FlowNode {
  id: string
  type: NodeType
  name: string
  shortName?: string // Display name
  instanceId?: string // e.g., i-03c72e12

  // Traffic stats at this node
  requestCount?: number
  queryCount?: number
  operationCount?: number
  latencyP95?: number
  lastSeen?: string

  // For internet nodes
  sourceCount?: number // Number of unique source IPs
}

// A segment connects two nodes, may have checkpoints
export interface FlowSegment {
  from: FlowNode
  to: FlowNode
  port?: number
  protocol?: string

  // Traffic on this segment
  requestCount: number
  bytesTransferred?: number

  // Checkpoints (gates) on this segment
  checkpoints: FlowCheckpoint[]

  // Label to show on the line (e.g., ":443" or "60 ops")
  label?: string
}

// Complete flow from source to destination (full stack)
export interface Flow {
  id: string

  // Full path description
  pathDescription: string // e.g., "Internet → frontend-2 → RDS"

  // Source and final destination
  source: FlowNode
  destination: FlowNode

  // All segments in the path (can have multiple hops)
  segments: FlowSegment[]

  // Overall stats
  status: FlowStatus
  lastActivity: string
  totalRequests: number
  latencyP95?: number

  // Issues summary
  unusedSgRules: number
  unusedIamPerms: number
  totalGaps: number
  hasWarning: boolean

  // For display
  summaryStats: {
    label: string
    value: string
    color?: string
  }[]
}

// Detail panel content
export interface FlowDetail {
  flow: Flow

  // What Happened - observed traffic
  whatHappened: {
    ports: number[]
    totalRequests: number
    latencyP95?: number
    bytesTransferred?: number
    lastSeen: string
    topSources?: string[]
    apiCalls?: { name: string; count: number }[]
  }

  // What Allowed It - rules/permissions that enabled the flow
  whatAllowedIt: {
    sgRules: {
      sgName: string
      rule: string
      hits: number
    }[]
    iamPermissions: {
      roleName: string
      permission: string
      usageCount: number
    }[]
  }

  // What's Unnecessary - unused items
  whatsUnnecessary: {
    unusedSgRules: {
      sgName: string
      rule: string
      confidence: number
    }[]
    unusedIamPerms: {
      roleName: string
      permission: string
      riskLevel: string
    }[]
  }

  // What Could Break - impact analysis
  whatCouldBreak: {
    item: string
    type: 'sg_rule' | 'iam_perm'
    impactDescription: string
    affectedServices: string[]
    breakageRisk: 'high' | 'medium' | 'low'
  }[]

  // Auto-generated explanation
  explanation: string
}

// Props for FlowStrip component
export interface FlowStripProps {
  flow: Flow
  selected: boolean
  onSelect: () => void
  animate?: boolean
}

// Props for FlowDetail component
export interface FlowDetailProps {
  detail: FlowDetail | null
  loading: boolean
  onClose: () => void
  onRemoveItem: (itemId: string, type: 'sg_rule' | 'iam_perm') => void
}

// Props for FlowStripList
export interface FlowStripListProps {
  flows: Flow[]
  selectedFlowId: string | null
  onSelectFlow: (flow: Flow) => void
  loading: boolean
}

// Data correlation types
export interface CorrelatedFlowData {
  // From VPC Flow Logs
  networkFlow: {
    sourceIp: string
    destIp: string
    port: number
    packets: number
    bytes: number
  }

  // From AWS Config
  compute: {
    resourceId: string
    resourceType: string
    instanceProfile?: string
    securityGroups: string[]
    eni: string
  }

  // From CloudTrail
  apiActivity: {
    roleArn: string
    eventSource: string // s3.amazonaws.com, dynamodb.amazonaws.com
    eventName: string
    count: number
  }[]

  // From IAM Analysis
  roleAnalysis: {
    roleName: string
    usedPermissions: number
    totalPermissions: number
    unusedPermissions: string[]
  }

  // From SG Analysis
  sgAnalysis: {
    sgId: string
    sgName: string
    usedRules: number
    totalRules: number
    unusedRules: string[]
  }
}
