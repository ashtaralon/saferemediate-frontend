// Security Posture Types - Redesigned for Allowed vs Observed Diff View

export type TimeWindow = '7d' | '30d' | '90d' | '365d'

export type EvidenceSource = 'CloudTrail' | 'FlowLogs' | 'Config' | 'IAM'

export type EvidenceStrength = 'strong' | 'medium' | 'weak'

export type ComponentType = 'iam_role' | 'iam_user' | 'security_group' | 's3_bucket' | 'lambda' | 'ec2' | 'rds' | 'dynamodb'

export type GroupingMode = 'identity' | 'workload' | 'service'

export type RecommendationAction = 'remove' | 'scope' | 'keep' | 'review'

export type RiskTag = 'admin' | 'write' | 'delete' | 'wildcard' | 'public' | 'broad_ports'

// Evidence coverage status for each data source
export interface EvidenceCoverage {
  source: EvidenceSource
  status: 'available' | 'partial' | 'unavailable'
  lastIngest?: string
  coverage?: number // percentage
}

// Confidence breakdown for transparency
export interface ConfidenceBreakdown {
  evidenceCoverage: number
  recencyFrequency: number
  dependencyRisk: number
  final: number
  explanation: string
}

// A single "gap item" - an unused permission or risky rule
export interface GapItem {
  id: string
  componentId: string
  componentName: string
  componentType: ComponentType

  // The gap details
  type: 'iam_action' | 'sg_rule' | 'resource_policy'
  identifier: string // e.g., "s3:DeleteObject" or "TCP:22 from 0.0.0.0/0"

  // Allowed vs Observed
  allowedBy: string // policy name, SG ID, etc.
  allowedByStatement?: string // statement ID for IAM
  observedCount: number
  lastSeen: string | null // null = never

  // Risk assessment
  riskTags: RiskTag[]
  riskScore: number // 0-100

  // Recommendation
  recommendation: RecommendationAction
  confidence: number
  confidenceBreakdown?: ConfidenceBreakdown
  reason: string

  // For SG rules
  exposure?: {
    cidr: string
    ports: string
    protocol: string
  }

  // Impact estimation
  impactEstimate?: string
  affectedDependencies?: string[]
}

// A component (identity, resource, etc.) with its security posture
export interface SecurityComponent {
  id: string
  name: string
  type: ComponentType

  // Grouping metadata
  workload?: string // e.g., "frontend-1", "payments-api"
  service?: string // e.g., "EC2", "Lambda", "IAM"

  // LP Score
  lpScore: number // 0-100, higher is better (more least-privilege)

  // Allowed vs Observed summary
  allowedCount: number
  observedCount: number
  unusedCount: number

  // Risk indicators
  highestRiskUnused: RiskTag | null
  hasWildcards: boolean
  hasAdminAccess: boolean
  hasInternetExposure: boolean

  // Confidence
  confidence: EvidenceStrength
  evidenceSources: EvidenceCoverage[]

  // Detailed gaps (lazy loaded on selection)
  gaps?: GapItem[]
}

// Summary diff for a selected component
export interface ComponentDiff {
  componentId: string
  componentName: string
  componentType: ComponentType

  // High-level summary
  allowed: number
  observedUsed: number
  unusedCandidates: number
  confidence: EvidenceStrength
  confidencePercent: number
  observationWindow: string

  // Breakdown by type
  iamActions?: {
    allowed: number
    used: number
    unused: number
    items: GapItem[]
  }
  networkRules?: {
    allowed: number
    used: number
    unused: number
    items: GapItem[]
  }
  resourcePolicies?: {
    allowed: number
    used: number
    unused: number
    items: GapItem[]
  }
}

// Top-level security posture summary
export interface SecurityPostureSummary {
  totalComponents: number
  totalRemovalCandidates: number
  highRiskCandidates: number
  evidenceStrength: EvidenceStrength

  // Breakdown by type
  byType: {
    type: ComponentType
    count: number
    unusedCount: number
  }[]

  // Evidence status
  evidenceCoverage: EvidenceCoverage[]
}

// Filter/sort state for the component list
export interface ComponentListState {
  groupBy: GroupingMode
  sortBy: 'lpScore' | 'unusedCount' | 'riskScore' | 'name'
  sortOrder: 'asc' | 'desc'
  filterType?: ComponentType
  filterRisk?: RiskTag
  searchQuery?: string
  minConfidence?: number // 0-100
}

// Props for the main SecurityPosture component
export interface SecurityPostureProps {
  systemName: string
  onViewOnMap?: (highlight: { source: string; target: string; port?: string }) => void
}

// Helper function types
export type RiskScoreCalculator = (item: GapItem) => number
export type ComponentSorter = (a: SecurityComponent, b: SecurityComponent, state: ComponentListState) => number
