/**
 * Resource Gap Card Template Types
 *
 * These types define the template-driven configuration for gap analysis cards
 * across different resource types (RDS, EC2, IAM, S3, etc.)
 */

// ============================================================================
// Core Template Configuration
// ============================================================================

export type ResourceType = 'RDS' | 'EC2' | 'IAM' | 'S3' | 'Lambda' | 'ECS' | 'SecurityGroup'

export type GapCategory = 'network' | 'permissions' | 'policies' | 'access'

export type ActionType = 'KEEP' | 'DELETE' | 'TIGHTEN' | 'REVIEW' | 'REPLACE'

export type StatusType = 'USED' | 'UNUSED' | 'UNOBSERVED' | 'OVERLY_BROAD' | 'UNKNOWN'

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

// ============================================================================
// Header Configuration
// ============================================================================

export interface PlaneConfig {
  id: string
  label: string
  icon?: string
  color: string
  description: string
}

export interface HeaderConfig {
  showLastSeen: boolean
  showPlaneChips: boolean
  showConfidenceLabel: boolean
  planes: PlaneConfig[]
  confidenceThresholds: {
    high: number    // >= this value shows green
    medium: number  // >= this value shows yellow
    low: number     // < medium shows red
  }
}

// ============================================================================
// Summary Box Configuration
// ============================================================================

export interface SummaryBoxConfig {
  id: string
  label: string
  valueKey: string  // Path to value in analysis data (e.g., 'summary.used_rules')
  format?: 'number' | 'percentage' | 'duration'
  color: 'green' | 'red' | 'yellow' | 'blue' | 'gray'
  icon?: string
  showWhen?: (analysis: any) => boolean
}

export interface SummaryConfig {
  boxes: SummaryBoxConfig[]
  layout: 'row' | 'grid'
  columns?: number
}

// ============================================================================
// Section Configuration
// ============================================================================

export type SectionType =
  | 'rules_list'      // List of rules with status badges
  | 'permissions_list' // List of permissions/actions
  | 'policy_list'     // List of policies
  | 'metrics_banner'  // Metrics display banner
  | 'blast_radius'    // Blast radius visualization
  | 'recommendations' // Recommendations list

export interface RuleDisplayConfig {
  showPort: boolean
  showProtocol: boolean
  showSource: boolean
  showDestination: boolean
  showConnections: boolean
  showLastUsed: boolean
  portLabel?: string        // e.g., "Port" or "Action"
  sourceLabel?: string      // e.g., "Source" or "Principal"
  connectionLabel?: string  // e.g., "Connections" or "Invocations"
}

export interface StatusBadgeConfig {
  status: StatusType
  label: string
  sublabel?: string
  bgColor: string
  textColor: string
  borderColor?: string
}

export interface SectionConfig {
  id: string
  title: string
  type: SectionType
  filterFn?: (item: any) => boolean  // Filter function for items
  statusFilter?: StatusType[]         // Filter by status types
  emptyMessage?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  showCount?: boolean
  ruleDisplay?: RuleDisplayConfig
  statusBadges?: StatusBadgeConfig[]
  icon?: string
  priority?: number  // Display order (lower = first)
}

// ============================================================================
// Metrics Banner Configuration
// ============================================================================

export interface MetricConfig {
  id: string
  label: string
  valueKey: string
  format?: 'number' | 'percentage' | 'days'
  suffix?: string
  highlight?: boolean
}

export interface MetricsBannerConfig {
  title: string
  metrics: MetricConfig[]
  bgColor?: string
  showObservationPeriod?: boolean
}

// ============================================================================
// Blast Radius Configuration
// ============================================================================

export interface BlastRadiusConfig {
  enabled: boolean
  title: string
  trackNeighborTypes: string[]
  impactMessageTemplate: string  // e.g., "{count} flows will continue to work"
  showVisualization?: boolean
}

// ============================================================================
// Recommendations Configuration
// ============================================================================

export interface ActionConfig {
  action: ActionType
  label: string
  buttonLabel: string
  color: string
  icon?: string
  confirmMessage?: string
  requiresSimulation?: boolean
}

export interface RecommendationsConfig {
  title: string
  showSimulateButton: boolean
  showRemediateButton: boolean
  actions: ActionConfig[]
  groupByAction?: boolean
  sortBySeverity?: boolean
}

// ============================================================================
// Full Template Definition
// ============================================================================

export interface ResourceGapTemplate {
  resourceType: ResourceType
  displayName: string
  description: string
  category: GapCategory

  // Data mapping - how to extract data from API response
  dataMapping: {
    rulesPath: string           // Path to rules array (e.g., 'analysis.rules')
    summaryPath: string         // Path to summary object
    recommendationsPath: string // Path to recommendations
    metricsPath?: string        // Path to gap metrics
  }

  // UI Configuration
  header: HeaderConfig
  summary: SummaryConfig
  sections: SectionConfig[]
  metricsBanner?: MetricsBannerConfig
  blastRadius?: BlastRadiusConfig
  recommendations: RecommendationsConfig

  // Resource-specific settings
  specificConfig?: {
    // RDS-specific
    databasePorts?: Record<string, number>
    unobservedPolicy?: {
      action: ActionType
      priority: SeverityLevel
    }

    // IAM-specific
    permissionCategories?: string[]

    // S3-specific
    accessPatterns?: string[]

    // Generic
    observationDays?: number
    confidenceBoost?: number
  }
}

// ============================================================================
// Component Props
// ============================================================================

export interface ResourceGapCardProps {
  resourceType: ResourceType
  resourceId: string
  analysisData?: any  // Raw analysis data from API
  onSimulate?: (resourceId: string, itemId: string, action: ActionType) => void
  onRemediate?: (resourceId: string, itemId: string, action: ActionType) => void
  onRefresh?: () => void
  customTemplate?: Partial<ResourceGapTemplate>  // Override template config
}

// ============================================================================
// Utility Types
// ============================================================================

export type TemplateRegistry = Record<ResourceType, ResourceGapTemplate>

export interface RuleItem {
  id: string
  status: StatusType
  port?: number | string
  protocol?: string
  source?: string
  destination?: string
  connections?: number
  lastUsed?: string
  recommendation?: {
    action: ActionType
    reason: string
    confidence: number
  }
  [key: string]: any  // Allow additional properties
}

export interface GapAnalysisResult {
  rules: RuleItem[]
  summary: {
    total_rules: number
    used_rules: number
    unused_rules: number
    unobserved_rules: number
    overly_broad_rules: number
    average_confidence: number
    risk_score: number
    observation_days: number
    gap_metrics?: {
      configured_ports: number
      observed_ports: number
      unobserved_ports: number
      gap_percentage: number
    }
  }
  recommendations: Array<{
    rule_id: string
    action: ActionType
    reason: string
    confidence: number
    priority?: SeverityLevel
  }>
}
