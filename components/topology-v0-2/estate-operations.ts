export type OperationalEvidenceType = "observed" | "configured" | "inferred"

export interface OperationalConnection {
  direction: "upstream" | "downstream"
  resource_id: string
  resource_name: string
  resource_type: string
  vpc_id?: string | null
  subnet_ids?: string[]
  protocol?: string | null
  port?: string | null
  last_seen?: string | null
  evidence_type: OperationalEvidenceType
  evidence_source: string
  coverage_state: string
  activity_count?: number | null
  egress_path?: string | null
  via_vpce_id?: string | null
  via_igw?: boolean
  transport_coverage_state?: string | null
}

export interface OperationalDossier {
  resource: Record<string, unknown> & {
    id: string
    name: string
    type: string
    system_name: string
    account_id?: string | null
    region?: string | null
    vpc_id?: string | null
  }
  dependencies: {
    upstream: OperationalConnection[]
    downstream: OperationalConnection[]
    summary: {
      consumer_count: number
      observed: number
      configured: number
      inferred: number
    }
  }
  evidence: {
    window_days: number
    latest_observation?: string | null
    sources: string[]
    coverage_state: string
  }
  change_capabilities: Array<{ kind: string; available: boolean; label: string }>
}

export interface S3VpcePlan {
  readiness: "READY" | "BLOCKED"
  operation_id: string | null
  operation_state: S3PrivatePathState
  operation_version: number
  operation_persisted?: boolean
  plan_token?: string | null
  blockers: Array<{ code: string; message: string }>
  bucket_name?: string
  vpc_id?: string | null
  route_table_ids?: string[]
  all_route_table_ids?: string[]
  canary_route_table_id?: string | null
  endpoint_mode?: "CREATE_MANAGED" | "ADOPT_EXISTING" | "NO_CHANGE"
  existing_endpoint_id?: string | null
  public_route_kinds?: string[]
  consumer_summaries?: Array<{
    resource_id: string
    resource_name: string
    resource_type: string
  }>
  excluded_consumers?: Array<{
    resource_id?: string
    resource_name?: string
    resource_type?: string
    reason_code: string
    reason: string
  }>
  cohort_s3_destinations?: Array<{
    resource_id: string
    resource_name: string
    consumer_ids: string[]
    protocols: string[]
    last_seen?: string | null
  }>
  impact: {
    observed_consumers: number
    total_observed_consumers?: number
    migrating_consumers?: number
    excluded_consumers?: number
    unknown_consumers?: number
    subnets: number
    route_tables: number
    route_table_workloads: number
    s3_destinations?: number
    permission_changes: number
    resource_replacements: number
  }
}

export interface ConfigurationFixExplanation {
  kind: S3OperationKind
  journey?: "CREATE_MANAGED" | "ADOPT_EXISTING" | "NO_CHANGE" | "ENFORCE_PRIVATE_PATH" | string
  headline: string
  why_this_change: string
  current_state: string
  scope_summary: string
  steps: string[]
  verification: string
  rollback: string
  blocker_codes: string[]
  readiness: "READY" | "BLOCKED" | string
  source: "llm" | "llm_cache" | "deterministic_fallback"
  grounded: boolean
  grounding_reason: string
  evidence_hash: string
  generated_at?: string
  model?: string | null
}

export type S3PrivatePathState =
  | "BLOCKED_EVIDENCE"
  | "READY_FOR_SIMULATION"
  | "SIMULATED"
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "SNAPSHOT_VERIFIED"
  | "CANARY_APPLYING"
  | "CANARY_MONITORING"
  | "CANARY_VERIFIED"
  | "EXPANDING"
  | "TRANSPORT_VERIFIED"
  | "COMPLETE"
  | "FAILED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "ROLLBACK_FAILED"

export interface S3PrivatePathOperation {
  operation_id: string
  state: S3PrivatePathState
  version: number
  execution_plan_token?: string
  approval?: {
    requested_by?: string
    approved_by?: string | null
    requester_note?: string
    approval_note?: string
  } | null
  execution?: S3VpceExecution | null
  verification?: {
    canary?: S3VpceVerification
    last_stage?: S3VpceVerification
    full?: S3VpceVerification
    stage_verified?: boolean
    verified_route_table_ids?: string[]
  } | null
}

export interface S3VpceSimulation {
  status: string
  safe_to_apply: boolean
  errors?: string[]
  operation_state: S3PrivatePathState
  operation_version: number
  plan_hash: string
}

export interface S3VpceExecution {
  status: string
  errors?: string[]
  snapshot_id?: string | null
  snapshot_mirror?: SnapshotMirrorOutcome | null
  endpoint_id?: string | null
  lifecycle_token?: string | null
  lifecycle_expires_at?: string | null
  rollback_available?: boolean
  rollback_performed?: boolean
  operation_state?: S3PrivatePathState
  operation_version?: number
}

// Which staged change a shared-ledger operation drives. Both kinds run on the
// same S3PrivatePathState lifecycle; the kind selects which wizard resumes it
// and which /{...}/ endpoint family it talks to. Legacy documents with no
// stored kind are the original transport migration.
export type S3OperationKind = "S3_PRIVATE_PATH" | "S3_BUCKET_POLICY_ENFORCEMENT"

// Token-free projection returned by GET .../s3-vpce/operations — the server
// truth for the Fixes tab's resume list. Bearer material is never present
// (the backend serializes summaries through an explicit allowlist).
export interface S3VpceOperationSummary {
  operation_id: string
  kind?: S3OperationKind
  state: S3PrivatePathState
  version?: number
  system_name?: string | null
  bucket_name?: string | null
  resource_id?: string | null
  vpc_id?: string | null
  region?: string | null
  endpoint_id?: string | null
  snapshot_id?: string | null
  requested_by?: string | null
  approved_by?: string | null
  rollback_expires_at?: string | null
  verified_route_table_ids?: string[]
  blocker_count?: number
  created_at?: string | null
  updated_at?: string | null
}

export interface S3VpceOperationList {
  system_name: string
  count: number
  operations: S3VpceOperationSummary[]
}

// ---------------------------------------------------------------------------
// S3 bucket-policy private-path enforcement (the second staged change type).
// Endpoints live under /{system}/s3-bucket-policy/*; the lifecycle states and
// the operations-list / rollback-token endpoints are shared with the transport
// flow above. These shapes cover only the fields the enforcement wizard reads.
// ---------------------------------------------------------------------------

export interface S3EnforcementBlocker {
  code: string
  message: string
}

export interface S3EnforcementImpact {
  observed_consumers: number
  protected_consumers: number
  public_consumers: number
  unknown_consumers: number
  exempt_principals: number
  vpc_endpoints: number
  policy_statements_added: number
}

export interface S3EnforcementCallerSummary {
  resource_id: string
  resource_name: string
  resource_type: string
  path_status: "PRIVATE_VPCE" | "PUBLIC_PATH" | "OUTSIDE_VPC" | "UNKNOWN_PATH"
  vpc_id?: string | null
  vpce_id?: string | null
  principal_arns: string[]
  observed_actions: string[]
  last_observed_at?: string | null
}

export interface S3EnforcementPlan {
  readiness: "READY" | "BLOCKED"
  operation_id?: string
  operation_state?: S3PrivatePathState
  bucket_name: string
  // Display/audit only — enforcement is bucket-global, never VPC-scoped.
  vpc_id?: string | null
  vpc_ids?: string[]
  region?: string | null
  vpce_ids: string[]
  consumer_summaries?: Array<{
    resource_id: string
    resource_name: string
    resource_type: string
  }>
  caller_summaries?: S3EnforcementCallerSummary[]
  enforcement_mode: "SINGLE_STAGE" | "PRINCIPAL_CANARY"
  exempt_principal_arns: string[]
  canary_principal_arns: string[]
  // Suggested exemptions are the resolved aws:PrincipalArn (assumed-role) ARNs
  // S3 actually evaluates — not the workload resource ARN.
  out_of_vpc_principals?: string[]
  established_by_operation_ids?: string[]
  // The exact bucket-policy documents the approver reviews — full always
  // present when READY; canary present only in PRINCIPAL_CANARY mode.
  full_policy?: Record<string, unknown> | null
  canary_policy?: Record<string, unknown> | null
  existing_policy?: Record<string, unknown> | null
  blockers: S3EnforcementBlocker[]
  impact: S3EnforcementImpact
  plan_token?: string | null
  baseline_hash?: string
  expires_in_seconds?: number | null
}

export interface S3EnforcementSimulation {
  status: string
  safe_to_apply: boolean
  errors?: string[]
  plan_hash: string
  operation_state: S3PrivatePathState
  operation_version: number
  checks?: {
    validator?: string
    enforcement_mode?: string
    policy_drift?: boolean
  }
}

// Outcome of the write-only copy of the pre-remediation snapshot into the
// customer's own S3 bucket (backend: unified/snapshot/snapshot_mirror.py).
// Recorded on the operation document as execution.snapshot_mirror.
export interface SnapshotMirrorOutcome {
  status: "disabled" | "written" | "exists" | "failed" | string
  uri?: string | null
  sha256?: string | null
  mode?: string | null
  error?: string | null
}

// One-line operator summary of where the off-Cyntro restore copy landed.
// Returns null when there is nothing worth showing (no outcome recorded).
export function snapshotMirrorSummary(
  mirror: SnapshotMirrorOutcome | null | undefined,
): { tone: "ok" | "muted" | "warn"; text: string } | null {
  if (!mirror || !mirror.status) return null
  switch (mirror.status) {
    case "written":
    case "exists":
      return {
        tone: "ok",
        text: mirror.uri
          ? `Off-Cyntro restore copy: ${mirror.uri}`
          : "Off-Cyntro restore copy written",
      }
    case "failed":
      return {
        tone: "warn",
        text: `Off-Cyntro restore copy not written${mirror.error ? ` — ${mirror.error}` : ""} (primary snapshot still guards rollback)`,
      }
    case "disabled":
      return { tone: "muted", text: "Customer-account mirror not configured" }
    default:
      return { tone: "muted", text: `Customer-account mirror: ${mirror.status}` }
  }
}

export interface S3EnforcementExecution {
  status: string
  errors?: string[]
  snapshot_id?: string | null
  snapshot_mirror?: SnapshotMirrorOutcome | null
  endpoint_id?: string | null
  lifecycle_token?: string | null
  applied_stage?: "CANARY" | "FULL"
  enforcement_mode?: "SINGLE_STAGE" | "PRINCIPAL_CANARY"
  rollback_available?: boolean
  rollback_performed?: boolean
  rollback_succeeded?: boolean
  operation_state?: S3PrivatePathState
  operation_version?: number
}

export interface S3EnforcementVerification {
  state: "VERIFIED" | "PENDING_EVIDENCE"
  applied_stage?: "CANARY" | "FULL"
  policy_intact?: boolean
  expected_s3_flows?: number
  fresh_private_s3_flows?: number
  expected_s3_actions?: number
  fresh_private_s3_actions?: number
  endpoint_denial_rows?: number | null
  denied_principals?: Array<{ principal_arn: string; denials: number }>
  message?: string
  operation_state?: S3PrivatePathState
  operation_version?: number
  more_routes_pending?: boolean
}

// POST .../s3-vpce/operations/{id}/rollback-token — re-mints the one-time
// rollback token for the operation's requester/approver, inheriting the
// original 72h expiry (never a fresh window).
export interface S3VpceRollbackTokenReissue {
  operation_id: string
  snapshot_id: string
  endpoint_id: string
  lifecycle_token: string
  rollback_expires_at: string
  rollback_expires_in_seconds: number
}

export interface S3VpceVerification {
  state: "VERIFIED" | "PENDING_EVIDENCE" | "ROLLED_BACK"
  operation_state?: S3PrivatePathState
  operation_version?: number
  endpoint_state?: string
  expected_consumers?: number
  private_path_consumers?: number
  expected_s3_flows?: number
  fresh_private_s3_flows?: number
  expected_s3_actions?: number
  fresh_private_s3_actions?: number
  action_scope_verified?: boolean
  endpoint_denial_rows?: number
  evidence_refresh?: {
    success?: boolean
    error?: string
    exact_endpoint_rows?: number
    projected_edges?: number
  }
  evidence_not_before?: string
  stage_route_table_id?: string
  expected_route_tables?: string[]
  associated_route_tables?: string[]
  route_scope_verified?: boolean
  more_routes_pending?: boolean
  remaining_route_table_ids?: string[]
  message?: string
}

export interface EstateOperatorNarration {
  operator_summary: string
  why_it_matters: string
  recommended_next_check: string
  evidence_ids: string[]
  source: "llm" | "llm_cache" | "deterministic_fallback"
  grounded: boolean
  grounding_reason: string
  evidence_hash: string
  generated_at?: string
  model?: string | null
}

export async function operationalRequest<T>(
  systemName: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `/api/proxy/operational-map/${encodeURIComponent(systemName)}/${path}`,
    { cache: "no-store", ...init },
  )
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // FastAPI error `detail` can be a structured object (e.g. rollback
    // failures return {error, state}); stringify so operators never see
    // "[object Object]".
    const detail = body?.detail ?? body?.error
    const message = typeof detail === "string"
      ? detail
      : detail
        ? JSON.stringify(detail)
        : `Operational API returned ${response.status}`
    throw new Error(message)
  }
  return body as T
}
