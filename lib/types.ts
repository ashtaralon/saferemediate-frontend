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

// Shape of the pipeline_agreement block returned by /api/confidence/check
// when the caller has passed pipeline_decision. The UI renders this to
// explain the verdict; it's the ONLY Agent-5 field that should drive
// copy like "AI reviewer agrees: BLOCK" or "AI reviewer subordinated".
export interface ConfidencePipelineAgreement {
  pipeline_decision_canonical: DecisionOutcomeCanonical | null
  pipeline_decision: string | null
  reviewer_verdict: "agrees" | "subordinated"
  agent5_routing: ConfidenceRouting
  final_routing: ConfidenceRouting
  caps_applied: Array<{ from: ConfidenceRouting; to: ConfidenceRouting; reason: string }>
  signals: {
    observation_days: number | null
    telemetry_coverage: number | null
    consumer_count: number | null
    shared: boolean | null
    completeness: "complete" | "partial" | "unknown" | null
    unsafe_reasons: string[]
  }
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
  // Present only when caller passed pipeline_decision. See Layer 2 in
  // backend api/remediation_confidence.py.
  pipeline_agreement?: ConfidencePipelineAgreement
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

// ============================================================================
// SIMULATE-FIX ENDPOINT TYPES (POST /api/least-privilege/simulate-fix)
// ============================================================================

export interface SimulateFixConsumer {
  type: string
  id: string
  name?: string
}

export interface SimulateFixResource {
  id: string
  type: string
  system: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  shared: boolean
  shared_confidence: "high" | "medium" | "low" | "unknown"
  consumers: SimulateFixConsumer[]
}

export interface SimulateFixProblem {
  summary: string
  gap_percent: number
  unused_count: number
  used_count: number
  top_risk_reasons: string[]
}

// Visibility signals attached to evidence. Backend sends a heterogeneous
// dict — these are the keys it currently emits (api/least_privilege.py
// `visibility_signals` block). The values are NOT booleans; rendering
// them as booleans was the bug that caused "partial" coverage to show
// as a green ✓ chip in the modal.
export interface SimulateFixVisibilitySignals {
  observation_days?: number
  signal_coverage?: "complete" | "partial" | "unknown"
  trust_graph_integrity?: "high" | "medium" | "low"
  planes_active?: string[]
  // Allow forward-compat keys without forcing boolean semantics.
  [key: string]: number | string | string[] | boolean | undefined
}

export interface SimulateFixEvidence {
  observation_window_days: number
  evidence_sources: string[]
  confidence: "high" | "medium" | "low" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  caveats: string[]
  visibility_signals: SimulateFixVisibilitySignals
}

export interface SimulateFixSimulation {
  action_type: string
  summary: string
  kept_permissions: number
  removed_permissions: number
  kept_examples: string[]
  removed_examples: string[]
}

// Projected effect fields are all nullable. The backend reports null
// when the underlying scorer (BRS v1.1) is unavailable or errored, OR
// when the field doesn't have a real implementation yet (`_after`,
// `_delta`, `resource_risk_contribution_*`). The previous shape forced
// these to `number`, which the backend used to satisfy via hardcoded
// severity multipliers; that's removed in favor of "report unavailable
// honestly" — the frontend must branch on null rather than render 0.
export interface SimulateFixProjectedEffect {
  blast_radius_score_before: number | null
  blast_radius_score_after: number | null
  blast_radius_score_delta: number | null
  family_scores_before: Record<string, number> | null
  family_scores_after: Record<string, number> | null
  resource_risk_contribution_before: number | null
  resource_risk_contribution_after: number | null
  // Explicit signals so the UI can render "unavailable" copy instead of 0.
  current_state_available?: boolean
  current_state_confidence?: "HIGH" | "MEDIUM" | "LOW" | null
  projection_available?: boolean
  approximate?: boolean
  caveats?: string[]
}

export type SimulateFixSafetyDecision = "auto_eligible" | "approval_required" | "blocked"

// Canonical DecisionOutcome from unified pipeline. Source of truth going
// forward — the legacy lowercase `decision` field is kept for backcompat
// but the UI should read `decision_canonical` when present.
export type DecisionOutcomeCanonical =
  | "AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "MANUAL_REVIEW"
  | "BLOCK"
  | "CANARY_FIRST"
  | "EXCLUDE"

export interface SimulateFixSafety {
  decision: SimulateFixSafetyDecision
  decision_canonical?: DecisionOutcomeCanonical | null
  rollback_available: boolean
  snapshot_required: boolean
  preflight_required: boolean
  unsafe_reasons: string[]
  // Exposed so the modal can render Agent 5 as an *explainer* of this
  // decision instead of an independent verdict. See backend
  // api/least_privilege.py SimulateFixSafety for field semantics.
  consumer_count?: number
  observation_days?: number | null   // effective window actually measured
  telemetry_coverage?: number | null // 0.0–1.0 over 4 planes
  shared?: boolean | null            // null = couldn't measure
  shared_confidence?: "high" | "medium" | "unknown" | null
  completeness?: "complete" | "partial" | "unknown" | null
}

export interface SimulateFixResponse {
  resource: SimulateFixResource
  problem: SimulateFixProblem
  evidence: SimulateFixEvidence
  simulation: SimulateFixSimulation
  projected_effect: SimulateFixProjectedEffect
  safety: SimulateFixSafety
}

// Legacy lowercase decision UI config — kept for any caller still
// reading `safety.decision`. New consumers should use
// CANONICAL_SAFETY_DECISION_CONFIG below.
export const SAFETY_DECISION_CONFIG: Record<SimulateFixSafetyDecision, { label: string; color: string; bgColor: string; icon: string }> = {
  auto_eligible: {
    label: "Auto-Eligible",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: "✅"
  },
  approval_required: {
    label: "Approval Required",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
    icon: "⚠️"
  },
  blocked: {
    label: "Blocked",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    icon: "🚫"
  }
}

// Canonical decision UI config — one entry per DecisionOutcome value.
// This is the source of truth going forward; the legacy 3-bucket map
// above squashes MANUAL_REVIEW + CANARY_FIRST into "approval_required"
// and EXCLUDE into "blocked", so the operator can't tell a fail-closed
// hard block from a DR/break-glass exclusion. Per
// feedback_decision_enum_convergence: KEEP≠EXCLUDE, INVESTIGATE≠
// MANUAL_REVIEW — render each canonical outcome distinctly.
export const CANONICAL_SAFETY_DECISION_CONFIG: Record<DecisionOutcomeCanonical, { label: string; description: string; color: string; bgColor: string; icon: string }> = {
  AUTO_EXECUTE: {
    label: "Auto-Execute",
    description: "Safe to apply without human approval.",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: "✅",
  },
  REQUIRE_APPROVAL: {
    label: "Approval Required",
    description: "Safe to apply after human approval.",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
    icon: "⚠️",
  },
  MANUAL_REVIEW: {
    label: "Manual Review",
    description: "Needs deeper analysis before any action (e.g. shared resource, novel pattern).",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    icon: "📋",
  },
  CANARY_FIRST: {
    label: "Canary First",
    description: "Apply to a single resource and validate before fan-out.",
    color: "#06B6D4",
    bgColor: "rgba(6, 182, 212, 0.15)",
    icon: "🐤",
  },
  BLOCK: {
    label: "Blocked",
    description: "Fail-closed: a required safety signal is missing or contradicted.",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    icon: "🚫",
  },
  EXCLUDE: {
    label: "Excluded",
    description: "DR / break-glass class — never auto-act on this resource.",
    color: "#7F1D1D",
    bgColor: "rgba(127, 29, 29, 0.25)",
    icon: "🛑",
  },
}
