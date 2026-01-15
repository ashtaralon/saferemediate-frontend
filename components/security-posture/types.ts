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

// ============================================================================
// Plane Pulse Types - 4-Plane Model for Security Posture
// ============================================================================

export type PlaneType = 'configured' | 'observed' | 'authorized' | 'changed'

export type PlaneAvailability = 'available' | 'limited' | 'missing'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'

// Observed plane has additional breakdown by source
export interface ObservedBreakdown {
  flow_logs: number      // coverage percentage
  cloudtrail_usage: number
  xray: number
}

// Individual plane status
export interface PlaneStatus {
  available: boolean
  coverage_pct: number
  last_updated: string
  // Only for observed plane
  confidence?: ConfidenceLevel
  breakdown?: ObservedBreakdown
}

// All 4 planes together
export interface PlanePulseData {
  window_days: number
  planes: {
    configured: PlaneStatus
    observed: PlaneStatus
    authorized: PlaneStatus
    changed: PlaneStatus
  }
}

// Coverage issues for trust banner
export interface CoverageIssue {
  source: string
  issue: string
  fixAction?: string
  fixLink?: string
}

// Props for PlanePulse component
export interface PlanePulseProps {
  data: PlanePulseData
  timeWindow: TimeWindow
  onTimeWindowChange: (window: TimeWindow) => void
  coverageIssues?: CoverageIssue[]
  onFixCoverage?: () => void
}

// ============================================================================
// Command Queues Types - 3 Actionable Queues
// ============================================================================

export type QueueType = 'high_confidence_gaps' | 'architectural_risks' | 'blast_radius_warnings'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type RiskFlag =
  | 'world_open'           // 0.0.0.0/0 exposure
  | 'admin_policy'         // Admin/PowerUser attached
  | 'wildcard_resource'    // Resource: * in policy
  | 'wildcard_action'      // Action: * in policy
  | 'public_bucket'        // S3 public access
  | 'sensitive_ports'      // SSH/RDP/DB ports exposed
  | 'cross_account'        // Cross-account trust
  | 'no_mfa'               // No MFA requirement
  | 'overly_permissive'    // General over-permission

export type RiskCategory =
  | 'over_privileged'
  | 'public_exposure'
  | 'sensitive_action_wildcard'
  | 'trust_boundary_violation'

export type BlastRadiusRisk = 'risky' | 'safe' | 'unknown'

export type CTAType =
  | 'view_impact_report'
  | 'enable_telemetry'
  | 'investigate_activity'
  | 'review_manually'
  | 'view_change_diff'

// A/U/G metric with state (value vs unknown vs zero)
export type MetricState = 'value' | 'unknown' | 'zero'

export interface AUGMetric {
  value: number | null
  state: MetricState
}

// Recent change information
export interface WhyNow {
  recent_change: boolean
  changed_at?: string
  actor?: string
  change_type?: 'created' | 'modified' | 'deleted'
  change_summary?: string
}

// Blast radius assessment
export interface BlastRadius {
  neighbors: number
  critical_paths: number
  risk: BlastRadiusRisk
  impacted_services?: string[]
}

// Recommended action
export interface RecommendedAction {
  cta: CTAType
  cta_label: string
  reason: string
  link?: string
}

// Single queue card item
export interface QueueCardItem {
  id: string
  resource_type: ComponentType
  resource_name: string
  resource_arn?: string

  // Severity and confidence
  severity: Severity
  confidence: ConfidenceLevel

  // Why this is flagged now
  why_now?: WhyNow

  // A/U/G metrics
  A_authorized_breadth: AUGMetric
  U_observed_usage: AUGMetric
  G_gap: AUGMetric

  // Risk assessment
  risk_flags: RiskFlag[]
  risk_category?: RiskCategory
  risk_description?: string

  // Blast radius
  blast_radius: BlastRadius

  // Recommended action
  recommended_action: RecommendedAction

  // Evidence
  evidence_window_days?: number
  last_seen?: string | null
  observation_count?: number
}

// All 3 queues together
export interface CommandQueuesData {
  high_confidence_gaps: QueueCardItem[]
  architectural_risks: QueueCardItem[]
  blast_radius_warnings: QueueCardItem[]
}

// Props for CommandQueues component
export interface CommandQueuesProps {
  data: CommandQueuesData
  minConfidence: ConfidenceLevel
  onMinConfidenceChange: (level: ConfidenceLevel) => void
  onCardClick?: (item: QueueCardItem, queue: QueueType) => void
  onCTAClick?: (item: QueueCardItem, queue: QueueType) => void
  onGeneratePolicy?: (item: QueueCardItem, queue: QueueType) => void
  onSimulate?: (item: QueueCardItem, queue: QueueType) => void
  onRemediate?: (item: QueueCardItem, queue: QueueType) => void
}
