export interface InfrastructureResource {
  id: string
  name: string
  type: string
  provider: string
  region: string
  status: "running" | "stopped" | "terminated" | "pending"
  healthScore: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  complianceScore: number
  tags: Record<string, string>
  lastScanned: string
  owner?: string
}

export interface InfrastructureStats {
  avgHealthScore: number
  healthTrend: number
  needsAttention: number
  totalIssues: number
  criticalIssues: number
  avgScore: number
  scoreTrend: number
  lastScanTime: string
}

export interface InfrastructureSummary {
  containerClusters: number
  kubernetesWorkloads: number
  vms: number
  vmScalingGroups: number
  databases: number
  blockStorage: number
  fileStorage: number
  objectStorage: number
}

export interface ComplianceIssue {
  systemName: string
  systemId: string
  criticalGaps: number
  totalControls: number
  owner: string
  complianceScore: number
}

export interface SecurityFinding {
  id: string
  finding_id?: string // Real finding ID from backend
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  title: string
  resource: string
  resourceType: string
  resourceId?: string
  description: string
  remediation?: string
  category: string
  discoveredAt: string
  status: "open" | "simulated" | "approved" | "executing" | "remediated" | "failed" | "rolled_back" | "resolved" | "suppressed"
  // Backend fields for simulation
  role_name?: string
  unused_actions?: string[]
  unused_actions_count?: number
  allowed_actions?: string[]
  allowed_actions_count?: number
  used_actions?: string[]
  used_actions_count?: number
  confidence?: number
  observation_days?: number
  [key: string]: any // Allow additional fields from backend
}

export interface SecurityData {
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  findings: SecurityFinding[]
}

export interface InfrastructureData {
  stats: InfrastructureStats
  summary: InfrastructureSummary
  resources: InfrastructureResource[]
  complianceIssues: ComplianceIssue[]
  securityIssues: {
    critical: number
    high: number
    medium: number
    low: number
  }
  securityFindings?: SecurityFinding[]
  trendsData: {
    newIssues: Array<{ date: string; count: number }>
    resolvedIssues: Array<{ date: string; count: number }>
    openIssues: Array<{ date: string; count: number }>
  }
}

// ============================================================================
// REMEDIATION DECISION ENGINE TYPES
// ============================================================================

export type RemediationAction = "AUTO_REMEDIATE" | "CANARY" | "REQUIRE_APPROVAL" | "BLOCK"

export interface DecisionBreakdown {
  simulation: number
  usage: number
  data: number
  dependency: number
  historical: number
}

export interface RemediationDecision {
  confidence: number
  safety: number
  action: RemediationAction
  auto_allowed: boolean
  reasons: string[]
  breakdown: DecisionBreakdown
  warnings: string[]
}

export interface ResourceChange {
  resource_id: string
  resource_type: string
  change_type: string
  before: string
  after: string
}

export interface TemporalInfo {
  start_time: string
  estimated_completion: string
}

export interface SimulationResponse {
  success: boolean
  confidence: number // Legacy 0-100 scale
  before_state: string
  after_state: string
  estimated_time: string
  temporal_info: TemporalInfo
  warnings: string[]
  resource_changes: ResourceChange[]
  impact_summary: string
  decision?: RemediationDecision
}

// Action colors and labels for UI
export const REMEDIATION_ACTION_CONFIG: Record<RemediationAction, { label: string; color: string; bgColor: string; icon: string }> = {
  AUTO_REMEDIATE: {
    label: "Auto-Remediate",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: "✅"
  },
  CANARY: {
    label: "Canary Deploy",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    icon: "🐤"
  },
  REQUIRE_APPROVAL: {
    label: "Requires Approval",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
    icon: "⚠️"
  },
  BLOCK: {
    label: "Blocked",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    icon: "🚫"
  }
}

// Score breakdown labels for UI
export const SCORE_BREAKDOWN_LABELS: Record<keyof DecisionBreakdown, { label: string; description: string }> = {
  simulation: {
    label: "Simulation",
    description: "Results from dry-run simulation"
  },
  usage: {
    label: "Usage",
    description: "Permission usage patterns"
  },
  data: {
    label: "Data Quality",
    description: "Observation coverage & sources"
  },
  dependency: {
    label: "Dependencies",
    description: "Resource graph analysis"
  },
  historical: {
    label: "Historical",
    description: "Past remediation success rate"
  }
}
