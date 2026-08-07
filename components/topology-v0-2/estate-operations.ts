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
  endpoint_mode?: "CREATE_MANAGED" | "ADOPT_EXISTING"
  existing_endpoint_id?: string | null
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
  endpoint_id?: string | null
  lifecycle_token?: string | null
  rollback_available?: boolean
  rollback_performed?: boolean
  operation_state?: S3PrivatePathState
  operation_version?: number
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
    throw new Error(body?.detail || body?.error || `Operational API returned ${response.status}`)
  }
  return body as T
}
