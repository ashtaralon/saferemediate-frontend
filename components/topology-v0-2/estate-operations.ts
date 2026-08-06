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
  plan_token?: string | null
  blockers: Array<{ code: string; message: string }>
  bucket_name?: string
  vpc_id?: string | null
  route_table_ids?: string[]
  impact: {
    observed_consumers: number
    subnets: number
    route_tables: number
    route_table_workloads: number
    permission_changes: number
    resource_replacements: number
  }
}

export interface S3VpceExecution {
  status: string
  errors?: string[]
  snapshot_id?: string | null
  endpoint_id?: string | null
  lifecycle_token?: string | null
  rollback_available?: boolean
  rollback_performed?: boolean
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
