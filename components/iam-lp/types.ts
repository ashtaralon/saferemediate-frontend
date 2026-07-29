export type PermissionAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "warn_before_removing"
  | "protected"
  | "reserved"

export type PermissionRow = {
  permission: string
  status: "USED" | "UNUSED" | string | null
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string | null
  _action: PermissionAction | null
  protected: boolean
  reserved: boolean
  warn: boolean
  service_prefix: string | null
  execution_confidence: number | null
  evidence_confidence: number | null
  explanation: string | null
}

export type PermissionRowWire =
  | string
  | {
      permission?: unknown
      status?: unknown
      risk_level?: unknown
      _action?: unknown
      protected?: unknown
      reserved?: unknown
      warn?: unknown
      service_prefix?: unknown
      execution_confidence?: unknown
      evidence_confidence?: unknown
      explanation?: unknown
    }

export type ConfidenceGroup = {
  group_id: string
  label: string
  action: PermissionAction | null
  confidence_score: number | null
  evidence_confidence_score: number | null
  permission_count: number | null
  permissions: PermissionRow[]
  protected: boolean
  warn: boolean
  auto_remediable: boolean
  block_reason_code: string | null
  block_reason_human: string | null
  explanation: string | null
  color: string | null
}

export type ConfidenceGroups = {
  groups: ConfidenceGroup[]
  overall_confidence: number | null
  evidence_overall_confidence: number | null
  summary: {
    safe_to_remove: number | null
    verify_first: number | null
    investigate_first: number | null
    protected: number | null
    warn_before_removing: number | null
    reserved: number | null
  }
  total_permissions: number | null
  total_permissions_all: number | null
}

export type DependencyRef = {
  name?: string
  type?: string
  criticality?: string
  [k: string]: unknown
}

export type IamGapSummary = {
  total_permissions: number | null
  used_count: number | null
  unused_count: number | null
  lp_score: number | null
  overall_risk: string | null
  data_confidence: "OBSERVED" | "LOW" | "UNKNOWN" | string | null
  cloudtrail_events: number | null
  high_risk_unused_count: number | null
  api_relationships: number | null
  traffic_relationships: number | null
  total_evidence: number | null
}

/**
 * Permissive API boundary. Nothing here is silently made authoritative merely
 * because a field was absent from a partial/older response.
 */
export type IamGapAnalysisWire = {
  role_name?: unknown
  role_arn?: unknown
  observation_days?: unknown
  data_source?: unknown
  confidence_mode?: unknown
  summary?: Partial<Record<keyof IamGapSummary, unknown>> | null
  behavioral_authority?: {
    authoritative?: unknown
    coverage_state?: unknown
    projection_generation?: unknown
    parity_delta?: unknown
    limitation?: unknown
  } | null
  permissions_analysis?: PermissionRowWire[] | null
  used_permissions?: PermissionRowWire[] | null
  unused_permissions?: PermissionRowWire[] | null
  high_risk_unused?: unknown
  confidence?: unknown
  confidence_groups?: unknown
  safety_vector?: unknown
  evidence_breakdown?: unknown
  is_remediable?: unknown
  remediable_reason?: unknown
  reason?: unknown
  reason_code?: unknown
  dependency_context?: unknown
  service_role_analysis?: unknown
  timestamp?: unknown
}

/** Strict, normalized domain object consumed by iam-lp components/resolvers. */
export type IamGapAnalysis = {
  role_name: string
  role_arn: string
  observation_days: number | null
  data_source: string | null
  confidence_mode: string | null
  summary: IamGapSummary
  behavioral_authority: {
    authoritative: boolean | null
    coverage_state: string | null
    projection_generation: number | null
    parity_delta: number | null
    limitation: string | null
  } | null
  permissions_analysis: PermissionRow[]
  used_permissions: PermissionRow[]
  unused_permissions: PermissionRow[]
  high_risk_unused: string[]
  confidence: Record<string, unknown>
  confidence_groups: ConfidenceGroups
  safety_vector: Record<string, unknown> | null
  evidence_breakdown: Record<string, unknown>
  is_remediable: boolean | null
  remediable_reason: string | null
  reason_code: string | null
  dependency_context: {
    status: string | null
    system: { name?: string; criticality?: string } | null
    dependencies: DependencyRef[]
    has_critical_dependencies: boolean
  }
  service_role_analysis: Record<string, unknown> | null
  timestamp: string | null
}

export type Disposition = "auto_apply" | "needs_approval" | "protected"

export type DecisionSplit = {
  autoApplyCount: number
  needsApprovalCount: number
  protectedCount: number
  unclassifiedCount: number
  identifiedUnusedCount: number
  missingPermissionIdentityCount: number
  expectedUnusedCount: number | null
  autoApplyPermissions: string[]
  needsApprovalPermissions: string[]
  protectedPermissions: string[]
  unclassifiedPermissions: string[]
  conservationError: boolean
  conservationErrors: string[]
}

export type ExecutionState = {
  simulation?: SimResult
  gate?: SafetyGateResult
  snapshot?: { snapshot_id: string; status: "pending" | "ready" | "failed" }
  apply?: ApplyResult
  verify?: VerifyResult
  rollback?: RollbackResult
}

export type SimResult = {
  ok: boolean
  plan_token?: string | null
  permissions_to_remove: string[]
  role_name?: string | null
  role_arn?: string | null
  before_count?: number | null
  after_count?: number | null
  blocked_reason?: string | null
}

export type SafetyGateResult = {
  decision: "ALLOW" | "APPROVAL_REQUIRED" | "BLOCK" | string
  reasons?: string[]
}

export type ApplyResult = {
  ok: boolean
  snapshot_id?: string
  applied_permissions?: string[]
  error?: string
}

export type VerifyResult = { ok: boolean; message?: string }

export type RollbackResult = {
  available: boolean
  snapshot_id?: string | null
  status?: "idle" | "ready" | "running" | "done" | "failed"
}
