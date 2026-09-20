/** Shared client for the Neptune-safe managed AWS refresh plane. */

import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import type { SyncLane } from "@/lib/sync-surfaces"

export const SYNC_ALL_DAYS = 7
export const DEFAULT_SYNC_TOTAL_STEPS = 2

export interface DeferredSyncSource {
  source: string
  label: string
  state: "NOT_CONNECTED" | string
  missing_env?: string[]
}

/** Proof that a validated generation is ACTIVE for this scope.
 *
 *  Its presence is the only evidence of success this client accepts. A
 *  `completed` status without it means a worker exited, which says nothing
 *  about what the tenant is being served. */
export interface SyncActivationReceipt {
  activated?: boolean
  projection_generation?: number
  staging_run_id?: string
  source_vector_hash?: string
  projected_through?: string
  projection_receipt_hash?: string
  evidence_manifest_hash?: string
}

export interface SyncJobStatus {
  job_id: string
  /** `queued` = accepted, waiting for a sync worker to claim it. It is NOT a
   *  terminal state and NOT evidence that anything is running yet. */
  status: "queued" | "running" | "completed" | "failed" | "stale"
  /** Named state from the durable record — `collection_queued`,
   *  `inspector_collection_and_projection`, `neptune_generation_active`,
   *  `completed_without_activation_receipt`, … There is no ordering and no
   *  total: these are states, not steps. */
  state?: string
  message: string
  /** Present only on a genuinely activated run. */
  activation?: SyncActivationReceipt
  results?: Record<string, unknown>
  deferred_sources?: DeferredSyncSource[]
  serving_store?: "neptune" | string
  error?: string

  /** Legacy progress triple. OPTIONAL, and never synthesised.
   *
   *  The backend stopped sending these: `current_step`, `total_steps: 2` and
   *  `progress_percent` (5/50/100) were invented, not measured — queued work
   *  has no step number, and a 50% is a claim about remaining work nothing
   *  counted. They stay declared, and optional, so this client works against
   *  a backend that still sends them while the two deploy in order.
   *
   *  `percent` is rendered ONLY when the producer actually sent one.
   *  Computing it from an absent `current_step` yields
   *  `Math.round(undefined / 2 * 100)` = NaN, which is how a fabricated
   *  number becomes a visible one. */
  current_step?: number
  current_step_name?: string
  total_steps?: number
  progress_percent?: number
}

/** One lane's per-round outcome, as the completed payload reports it. */
export interface VulnerabilityRoundResult {
  active_findings?: number
  active_coverage?: number
  coverage_records?: number
  expected_coverage_records?: number
  observed_at?: string
  /** The receipt fields the backend also copies into `results`. */
  activated?: boolean
  projection_generation?: number
  staging_run_id?: string
  source_vector_hash?: string
  projected_through?: string
  projection_receipt_hash?: string
  evidence_manifest_hash?: string
}

/** The `results` body of a completed round. Present ONLY when activated. */
export interface SyncCompletedResults {
  /** Lanes this round actually refreshed. The ONLY evidence of refresh --
   *  `sources` means queued, which has changed nothing. */
  refreshed_sources?: SyncLane[]
  deferred_sources?: DeferredSyncSource[]
  serving_store?: "neptune" | string
  vulnerability_findings?: VulnerabilityRoundResult
}

/**
 * What `useSyncFromAWS` hands to `onComplete`: the status envelope merged
 * with its `results` body (`{...status, ...status.results}`).
 *
 * Typed against the real producer rather than `Record<string, unknown>`.
 * A bag type here is not a small shortcut: `lib/sync-surfaces.ts` reads
 * `refreshed_sources` and `completed_at` off this shape to decide whether a
 * screen may claim freshness at all, and hiding that behind an index
 * signature means a consumer can silently read a field the backend never
 * sends and get `undefined` -- which is how a freshness check quietly
 * degrades to "no receipt, so show nothing" or, worse, invites a clock.
 */
export type SyncCompletionPayload = Omit<SyncJobStatus, "results"> &
  SyncCompletedResults & {
    /** Backend completion stamp. `laneRefreshedAt` requires this or
     *  `activated_at`; the browser clock is never a fallback. */
    completed_at?: string
    activated_at?: string
    requested_at?: string
    started_at?: string
    /** Lanes the round QUEUED. Not freshness. */
    sources?: SyncLane[]
    results?: SyncCompletedResults
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
  stepName: string
  label: string
  /** `null` when the producer sent no authoritative percentage. Consumers
   *  must render nothing rather than substitute a number. */
  percent: number | null
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
  queued: "Queued — waiting for a sync worker to pick this up",
  collection_queued: "Queued for the dedicated projector",
  inspector_collection_and_projection: "Refreshing Inspector evidence in Neptune",
  neptune_generation_active: "Vulnerability generation active",
  collection_unclaimed_overdue: "Queued — no projector claim observed yet",
  lambda_collection_and_projection: "Refreshing Lambda estate in Neptune",
  completed_without_activation_receipt:
    "Finished without proof that a generation is being served",
  // Retired backend spelling, kept while both deploy in order.
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
  const stepName = status.state ?? status.current_step_name ?? ""
  return {
    stepName,
    label: getStepLabel(stepName, status.message),
    // Authoritative or absent. Never derived: deriving it from an absent
    // current_step is exactly how NaN% reached the screen.
    percent:
      typeof status.progress_percent === "number" &&
      Number.isFinite(status.progress_percent)
        ? status.progress_percent
        : null,
    message: status.message,
  }
}

/** The ONLY definition of success in this client.
 *
 *  Not `status === "completed"`: a completed job row says a worker exited.
 *  Not a 200 from the proxy: that says the transport worked. Not an enqueue
 *  acknowledgement: that says the request was accepted. Only a validated
 *  generation that is ACTIVE for this scope, proven by its receipt hash. */
export function isActivated(status: SyncJobStatus | null | undefined): boolean {
  if (!status || status.status !== "completed") {
    return false
  }
  return Boolean(status.activation?.projection_receipt_hash)
}

/** Reject a status that is not about the run we asked for.
 *
 *  A stale poll in flight across a restart, or a job id reused by another
 *  surface, can deliver someone else's terminal state into this run's UI.
 *  Binding on the run id is what stops one surface reporting another's
 *  activation as its own. */
export function isForRun(status: SyncJobStatus | null | undefined, jobId: string): boolean {
  return Boolean(status && status.job_id && status.job_id === jobId)
}

// There is deliberately NO module-level action label here.
//
// A single shared label is the wrong shape: it invites substituting one
// name into every screen, which is exactly the mistake that put "Refresh
// vulnerability findings" on the IAM, least-privilege, behavioral,
// dependency and inventory controls while they still ran a bare
// vulnerability_findings round. The label belongs to the SURFACE, beside
// its requiredLanes: see SYNC_SURFACES in lib/sync-surfaces.ts.

/** Completion text, scoped to what was actually proven.
 *
 *  Takes the whole status rather than just `results`, because the claim it
 *  makes depends on the activation receipt and not on the counters. Counters
 *  describe rows; the receipt is what says a generation is being served.
 */
export function formatSyncSuccessMessage(status: SyncJobStatus): string {
  const generation = status.activation?.projection_generation
  const vulnerability = status.results?.vulnerability_findings as
    | Record<string, unknown>
    | undefined

  // Counted only when present. `Number(undefined || 0)` is 0, which reads as
  // a measured zero — "no findings" — when nothing was measured at all.
  const findings = vulnerability?.active_findings
  const coverage = vulnerability?.active_coverage
  const counts =
    typeof findings === "number" && typeof coverage === "number"
      ? ` ${findings} active findings across ${coverage} covered resources.`
      : ""

  const deferred = Array.isArray(status.deferred_sources)
    ? status.deferred_sources.length
    : 0
  const suffix = deferred
    ? ` ${deferred} other data ${deferred === 1 ? "source was" : "sources were"} not refreshed by this run.`
    : ""

  const scope =
    generation === undefined
      ? "Vulnerability findings are active in Neptune."
      : `Vulnerability findings generation ${generation} is active in Neptune.`

  return `${scope}${counts}${suffix}`
}

/** Why a run that reached `completed` is still not success.
 *
 *  The backend reports `completed_without_activation_receipt` for a job row
 *  written before receipts were enforced, or by a run that activated and then
 *  lost the pointer to a concurrent projector. Either way nothing can say
 *  what the tenant is being served, so it must not render green. */
export function formatUnprovenCompletionMessage(status: SyncJobStatus): string {
  return (
    status.error ||
    status.message ||
    "This refresh finished but carries no proof that a validated generation " +
      "is being served, so it cannot be reported as successful. Re-run it."
  )
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

/** Consecutive failed status polls tolerated before the UI stops and reports.
 *  At the 3–5s poll intervals in use this is ~1 minute of a backend that is
 *  down, redeploying, or cold-starting — long enough to ride out a Render
 *  cold cycle, short enough that an operator is never left watching a
 *  spinner that can no longer resolve. */
export const MAX_CONSECUTIVE_POLL_FAILURES = 12

/** The status endpoint 404s once no store (memory, Neo4j, DynamoDB) holds the
 *  job. That is terminal — retrying cannot bring the record back. */
export class SyncJobGoneError extends Error {
  constructor(jobId: string) {
    super(
      `Sync job ${jobId} is no longer known to the backend. It was most ` +
        `likely dropped by a restart before any progress was recorded.`,
    )
    this.name = "SyncJobGoneError"
  }
}

/**
 * Poll one status tick.
 *
 * Returns the status on success, `null` when the read failed in a way that
 * may recover (backend redeploying, cold start, 5xx, timeout), and throws
 * `SyncJobGoneError` when the backend no longer knows the job at all.
 *
 * The distinction matters: the caller must keep polling through a transient
 * failure but must NOT keep polling forever. Swallowing every failure into
 * `null` is what left the button spinning indefinitely against a backend
 * that was never coming back.
 */
export async function fetchSyncJobStatus(jobId: string): Promise<SyncJobStatus | null> {
  const response = await fetch(`/api/proxy/sync/status/${encodeURIComponent(jobId)}`, {
    signal: AbortSignal.timeout(8000),
  })

  if (response.status === 404) {
    throw new SyncJobGoneError(jobId)
  }

  if (!response.ok) {
    return null
  }

  return (await response.json()) as SyncJobStatus
}
