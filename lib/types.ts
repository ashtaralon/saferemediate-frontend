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

// ============================================================================
// AGENT 5 — CONFIDENCE SCORE (remediation_confidence.py)
// ============================================================================

export type ConfidenceRouting =
  | "auto_execute"
  | "human_approval"
  | "manual_review"
  | "blocked"

export interface ConfidenceGateFailure {
  gate: string
  severity: "hard_block" | "warn"
  detail: string
}

export interface ConfidenceSignals {
  control_plane_telemetry: boolean
  data_plane_telemetry: boolean
  usage_telemetry: boolean
  runtime_telemetry: boolean
  execution_triggers: boolean
  trust_graph: boolean
  resource_metadata: boolean
}

export interface RoleTags {
  environment: string
  owner: string
  system: string
  cost_center: string
  compliance: string
}

export type LLMReviewVerdict = "agree" | "escalate" | "block"

export interface LLMReview {
  verdict: LLMReviewVerdict
  reason: string
}

export interface ConfidenceScore {
  confidence: number // 0-100
  routing: ConfidenceRouting // final routing (may be bumped by LLM reviewer)
  resource_type?: "iam_role" | "security_group" | "s3_bucket"
  resource_id?: string
  // Below fields are only populated when the resource exists and scoring completes.
  // Error/early-exit responses (resource_not_found, no_neo4j) omit them.
  routing_deterministic?: ConfidenceRouting // routing the deterministic scorer chose
  visibility_integrity?: number // 0.0-1.0
  visibility_reasons?: string[]
  gates_failed?: ConfidenceGateFailure[]
  can_auto_execute?: boolean
  needs_human_approval?: boolean
  signals_available?: Partial<ConfidenceSignals> & Record<string, boolean>
  data_plane_enabled_domains?: string[]
  external_principals?: unknown[]
  llm_review?: LLMReview | null
  llm_explanation?: string | null
  role_tags?: RoleTags | null
  resource_tags?: RoleTags | null
}

// ============================================================================
// BLAST RADIUS SYSTEM SCORE (BRSS v1) — system-level posture primitive
// ============================================================================

export interface BrssFactorBreakdown {
  severity_weight: number
  data_criticality: number
  reachability: number
  privilege_capability: number
  likelihood: number
  base_risk: number
  usage_confidence: number                 // ∈ [0.55, 1.0]
  exposure_uncertainty_penalty: number     // ∈ [0, EXPOSURE_PENALTY_MAX]
  adjusted_risk: number
  rank: number
  rank_weight: number
  final_contribution: number
}

export interface BrssDriver {
  resource_id: string
  resource_type: string
  resource_name: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  family: "iam" | "network" | "data" | "secrets" | "compute" | "other"
  factors: BrssFactorBreakdown
  lift_if_fixed: number              // score gain if this resource were fully remediated
}

export interface BrssCoverage {
  ratio: number                    // 0.0–1.0, feeds score ceiling
  scanned_types: string[]
  excluded_types: string[]
  scanned_instance_count: number
  known_instance_count: number
  registry_total: number
}

export interface BrssDelta {
  score_delta: number
  state_change: number
  scope_expansion: number
  resources_added: string[]
  resources_removed: string[]
  resources_changed: Array<{
    resource_id: string
    prev_adjusted_risk: number
    curr_adjusted_risk: number
    delta_adjusted_risk: number
    prev_rank: number
    curr_rank: number
  }>
  previous_score: number | null
  current_score: number
  previous_timestamp: string | null
}

export interface BlastRadiusScore {
  score: number                        // coverage-bounded final
  score_raw: number                    // before coverage ceiling
  coverage_ceiling: number
  coverage_ratio: number
  coverage_excluded_types: string[]
  total_contribution: number
  scaled_contribution: number
  tail_contribution: number
  resource_count: number
  per_family: Partial<Record<BrssDriver["family"], number>>
  top_drivers: BrssDriver[]
  coverage: BrssCoverage
  delta: BrssDelta
  snapshot_persisted: boolean
  version: "brss-v1"
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
