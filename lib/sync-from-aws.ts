/** Shared client for the Neptune-safe managed AWS refresh plane. */

import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"

export const SYNC_ALL_DAYS = 7
export const DEFAULT_SYNC_TOTAL_STEPS = 2

export interface DeferredSyncSource {
  source: string
  label: string
  state: "NOT_CONNECTED" | string
  missing_env?: string[]
}

export interface SyncJobStatus {
  job_id: string
  status: "running" | "completed" | "failed" | "stale"
  current_step: number
  current_step_name: string
  total_steps: number
  message: string
  progress_percent: number
  results?: Record<string, unknown>
  deferred_sources?: DeferredSyncSource[]
  serving_store?: "neptune" | string
  error?: string
}

export interface SyncStartResult {
  success: boolean
  job_id?: string
  existing_job_id?: string
  current_step?: number
  total_steps?: number
  message?: string
  error?: string
  deferred_sources?: DeferredSyncSource[]
  serving_store?: "neptune" | string
}

export interface SyncProgress {
  step: number
  total: number
  stepName: string
  label: string
  percent: number
  message: string
}

export interface StartSyncOptions {
  days?: number
  skipFlowLogs?: boolean
  /**
   * Which data-engine lanes this round must refresh, as the backend names
   * them (`vulnerability_findings`, `inventory_reconcile`, `api_activity`,
   * `network_flow`).
   *
   * Omitting it is NOT "refresh everything" — the backend defaults to the one
   * certified Inspector lane. A screen that needs IAM or flow evidence and
   * sends nothing therefore starts an Inspector round and reports success for
   * data it never touched. Screens pass their surface's `requiredLanes`.
   */
  sources?: readonly string[]
}

export const SYNC_STEP_LABELS: Record<string, string> = {
  starting: "Starting...",
  collection_queued: "Queued for the dedicated projector",
  inspector_collection_and_projection: "Refreshing Inspector evidence in Neptune",
  neptune_projection_activated: "Neptune projection activated",
  neptune_projection_failed: "Neptune projection failed",
  resource_collectors: "Discovering AWS resources (EC2, ALB, Lambda, RDS, S3, IAM, EventBridge)",
  imdsv2: "Collecting EC2 IMDS configuration",
  tag_sync: "Syncing AWS tags",
  flow_logs: "Ingesting VPC Flow Logs",
  cloudtrail: "Ingesting CloudTrail events",
  iam_analyzer: "Analyzing IAM permissions",
  iam_permissions: "Syncing IAM role permissions",
  access_analyzer_external: "Collecting IAM Access Analyzer external access",
  iam_service_last_accessed: "Collecting IAM service last accessed (#117)",
  aws_config: "Processing AWS Config",
  xray: "Collecting X-Ray traces",
  security_groups: "Ingesting Security Groups",
  flow_log_coverage: "Computing flow log coverage",
  aws_config_history: "Ingesting AWS Config history",
  eni_attachment_history: "Ingesting ENI attachment history",
  nacls: "Ingesting Network ACLs",
  s3_access_logs: "Ingesting S3 Access Logs",
  rds_query_logs: "Ingesting RDS Query Logs",
  behavioral_sync: "Running behavioral sync (traffic + permissions)",
  visibility_signals: "Collecting visibility signals (trust policies, Access Advisor, data events)",
  auto_tagger: "Running auto-tagger",
  consumer_edges: "Building consumer-edge chains",
  resource_reconciliation: "Reconciling resources",
  subnet_visibility: "Computing subnet visibility",
  infra_relationships: "Building infrastructure relationships",
  workload_subnet_links: "Linking workloads to subnets",
  nat_gateways: "Collecting NAT Gateways",
  vpc_endpoints: "Collecting VPC Endpoints",
  internet_gateways: "Collecting Internet Gateways",
  load_balancers: "Collecting Load Balancers",
  eni_public_ips: "Collecting ENI public IPs",
  access_keys: "Collecting IAM access keys",
  kms_keys: "Collecting KMS keys",
  secrets_manager: "Collecting Secrets Manager secrets",
  s3_bucket_attributes: "Collecting S3 bucket attributes",
  rds_lambda_parallel: "Collecting RDS and Lambda attributes",
  ecs: "Collecting ECS resources",
  organizations: "Collecting AWS Organizations (SCPs)",
  identity_center: "Collecting AWS Identity Center",
  consumer_cadence: "Collecting consumer cadence",
  resource_policies: "Collecting messaging resource policies",
  ssm_sessions: "Collecting SSM sessions",
  post_ingestion_materialization: "Running post-ingestion materializers",
  classifiers: "Running classifiers (egress, ingress, initial access, AC-1)",
}

export function buildSyncAllStartUrl(options: StartSyncOptions = {}): string {
  // `days` / `skipFlowLogs` stay ignored on purpose: the managed refresh API
  // owns source windows, and the browser must not revive legacy sync-all
  // options. `sources` is different — it is the V2 lane selection the backend
  // reads, and dropping it silently downgrades every screen to the Inspector
  // default.
  const { sources } = options
  if (!sources || sources.length === 0) {
    return "/api/proxy/sync/start"
  }
  const query = new URLSearchParams({ sources: sources.join(",") })
  return `/api/proxy/sync/start?${query.toString()}`
}

export function getStepLabel(stepName: string | undefined, fallback?: string): string {
  if (!stepName) {
    return fallback || "Starting..."
  }
  return SYNC_STEP_LABELS[stepName] || fallback || stepName
}

export function toSyncProgress(status: SyncJobStatus): SyncProgress {
  const total = status.total_steps || DEFAULT_SYNC_TOTAL_STEPS
  return {
    step: status.current_step,
    total,
    stepName: status.current_step_name,
    label: getStepLabel(status.current_step_name, status.message),
    percent: status.progress_percent ?? Math.round((status.current_step / total) * 100),
    message: status.message,
  }
}

export function formatSyncSuccessMessage(results?: Record<string, unknown>): string {
  if (!results) {
    return "AWS evidence refreshed in Neptune"
  }

  const vulnerability = results.vulnerability_findings as Record<string, unknown> | undefined
  if (vulnerability) {
    const findings = Number(vulnerability.active_findings || 0)
    const coverage = Number(vulnerability.active_coverage || 0)
    const deferred = Array.isArray(results.deferred_sources) ? results.deferred_sources.length : 0
    const suffix = deferred
      ? ` ${deferred} additional data ${deferred === 1 ? "source is" : "sources are"} not connected yet.`
      : ""
    return `Inspector refreshed in Neptune: ${findings} active findings across ${coverage} covered resources.${suffix}`
  }

  const flowLogs = results.flow_logs as Record<string, number> | undefined
  const cloudtrail = results.cloudtrail as Record<string, number> | undefined
  const traffic = flowLogs?.relationships_created || 0
  const events =
    (cloudtrail?.advisor_relationships || 0) +
    (cloudtrail?.api_call_relationships || 0) +
    (cloudtrail?.events_processed || 0)

  return `Synced: ${traffic} traffic relationships, ${events} API events`
}

export async function startSyncAllJob(
  options: StartSyncOptions = {},
): Promise<SyncStartResult & { job_id?: string }> {
  const response = await fetch(buildSyncAllStartUrl(options), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorBody: unknown = null
    try {
      errorBody = errorText ? JSON.parse(errorText) : null
    } catch {
      errorBody = null
    }
    throw new Error(
      coerceProxyErrorMessage(errorBody, errorText || `Sync failed: ${response.status}`),
    )
  }

  const data = (await response.json()) as SyncStartResult

  if (data.success && data.job_id) {
    return data
  }

  if (data.existing_job_id) {
    return {
      ...data,
      success: true,
      job_id: data.existing_job_id,
    }
  }

  throw new Error(data.error || "Failed to start sync job")
}

export async function fetchSyncJobStatus(jobId: string): Promise<SyncJobStatus | null> {
  const response = await fetch(`/api/proxy/sync/status/${encodeURIComponent(jobId)}`, {
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as SyncJobStatus
}
