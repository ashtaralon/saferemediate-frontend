export type IamGapAnalysis = {
  role_name: string
  role_arn: string
  observation_days: number
  data_source: string
  confidence_mode: "observed" | "simulated" | string
  summary: {
    total_permissions: number
    used_count: number
    unused_count: number
    lp_score: number | null
    overall_risk: string
    data_confidence: "OBSERVED" | "LOW" | "UNKNOWN" | string
    cloudtrail_events: number | null
    high_risk_unused_count: number
    api_relationships: number
    traffic_relationships: number
    total_evidence: number
  }
  behavioral_authority?: {
    authoritative: boolean
    coverage_state: string | null
    projection_generation?: number | null
    parity_delta?: number | null
    limitation?: string | null
  }
  permissions_analysis: PermissionRow[]
  used_permissions: string[] | PermissionRow[]
  unused_permissions: string[] | PermissionRow[]
  high_risk_unused: string[]
  confidence: Record<string, unknown>
  confidence_groups: ConfidenceGroups
  safety_vector: Record<string, unknown> | null
  evidence_breakdown: Record<string, unknown>
  is_remediable: boolean
  remediable_reason: string
  reason: string | null
  dependency_context: {
    status: string
    system: { name?: string; criticality?: string } | null
    dependencies: DependencyRef[] | null
    has_critical_dependencies: boolean | null
  }
  service_role_analysis?: Record<string, unknown>
  timestamp: string
}

export type PermissionAction =
  | "safe_to_remove"
  | "verify_first"
  | "investigate_first"
  | "warn_before_removing"
  | "protected"
  | "reserved"

export type PermissionRow = {
  permission: string
  status?: "USED" | "UNUSED" | string
  risk_level?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string
  _action?: PermissionAction
  protected?: boolean
  reserved?: boolean
  warn?: boolean
  service_prefix?: string
  execution_confidence?: number
  evidence_confidence?: number
  explanation?: string
}

export type ConfidenceGroup = {
  group_id: string
  label: string
  action: PermissionAction
  confidence_score: number
  evidence_confidence_score?: number
  permission_count: number
  permissions: PermissionRow[]
  protected: boolean
  warn: boolean
  auto_remediable: boolean
  block_reason_code?: string | null
  block_reason_human?: string | null
  explanation?: string
  color?: string
}

export type ConfidenceGroups = {
  groups: ConfidenceGroup[]
  overall_confidence: number
  evidence_overall_confidence?: number
  summary: {
    safe_to_remove: number
    verify_first: number
    investigate_first: number
    protected: number
    warn_before_removing?: number
    reserved?: number
  }
  total_permissions: number
  total_permissions_all: number
}

export type DependencyRef = {
  name?: string
  type?: string
  criticality?: string
  [k: string]: unknown
}

export type Disposition = "auto_apply" | "needs_approval" | "protected"

export type DecisionSplit = {
  autoApplyCount: number
  needsApprovalCount: number
  protectedCount: number
  autoApplyPermissions: string[]
  needsApprovalPermissions: string[]
  protectedPermissions: string[]
}

export type ExecutionState = {
  simulation?: SimResult
  gate?: SafetyGateResult
  snapshot?: { snapshot_id: string; status: "pending" | "ready" | "failed" }
  apply?: ApplyResult
  verify?: VerifyResult
  rollback?: RollbackResult
  approval?: ApprovalRequestSummary | null
}

export type SimResult = {
  ok: boolean
  before_count: number
  after_count: number
  would_remove: string[]
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

export type ApprovalRequestStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "REJECTED"
  | "EXECUTED"

export type ApprovalRequestSummary = {
  request_id: string
  status: ApprovalRequestStatus
  role_name: string
  role_arn?: string
  system_name?: string | null
  permissions_to_remove: string[]
  permissions_count: number
  create_snapshot: boolean
  detach_managed_policies: boolean
  detach_all_managed_policies: boolean
  plan_token?: string | null
  selection_hash?: string | null
  requested_by: string
  requester_note?: string
  requested_at: string
  approved_by?: string | null
  approved_at?: string | null
  approval_note?: string
  rejected_by?: string | null
  rejected_at?: string | null
  rejection_note?: string
  executed_by?: string | null
  executed_at?: string | null
  execution_note?: string
  execution_snapshot_id?: string | null
  execution_error?: string
  summary?: Record<string, unknown> | null
}
