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

/** One lane's serving proof, read off the authoritative graph pointer.
 *
 *  `projection_receipt_hash` is the validated receipt the activation CAS
 *  wrote in the same statement as the generation, so a receipt naming a
 *  generation always names the receipt that authorised it. It is never
 *  optional on a real receipt: the backend refuses rather than emit a null.
 *
 *  `heads_record_agrees` is CORROBORATION ONLY. The producers activate the
 *  graph pointer first and treat a conflict on the bookkeeping head as
 *  non-fatal, so `false` means the head is behind — not that nothing is
 *  served. Rendering it as a failure would report a served generation as a
 *  failed sync. */
export interface SyncLaneActivationReceipt {
  active_generation: number
  projection_receipt_hash: string
  active_staging_run_id?: string
  projected_through?: string
  source_vector_hash?: string | null
  activated_at?: string | null
  /** Absent for lanes activated through the generic pointer CAS, which does
   *  not write it. Absence is not a defect. */
  activation_attempt_id?: string | null
  heads_record_agrees?: boolean | null
  scope_tenant_id?: string
  scope_account_id?: string
  scope_projection?: string
  lifecycle_stage?: "SERVING_ACTIVE_GENERATION"
  asserts_staged_projection?: boolean
  asserts_validated?: boolean
  asserts_serving?: boolean
  is_terminal?: boolean
}

/** Proof that a validated generation is ACTIVE for this scope.
 *
 *  Its presence is the only evidence of success this client accepts. A
 *  `completed` status without it means a worker exited, which says nothing
 *  about what the tenant is being served.
 *
 *  A round can refresh SEVERAL lanes, and each carries its own receipt. The
 *  scalar `projection_receipt_hash` is therefore populated only when the
 *  round produced exactly one distinct hash; on a multi-lane round it is
 *  `null` and the set lives in `projection_receipt_hashes`. Electing one
 *  lane's hash to stand for the round would be a claim about the others.
 *  Any consumer reading only the scalar must treat `null` as "several", not
 *  as "none" — see `isActivated`. */
export interface SyncActivationReceipt {
  activated?: boolean
  lifecycle_stage?: "SERVING_ACTIVE_GENERATION"
  /** Lanes that produced a serving receipt in this round. */
  lanes?: SyncLane[]
  /** Populated only for a single-lane round. `null` means several. */
  projection_receipt_hash?: string | null
  /** Every distinct validated receipt hash this round activated. */
  projection_receipt_hashes?: string[]
  /** Active generation per lane. Lanes do not share a generation counter. */
  active_generations?: Record<string, number | null>
  per_lane?: Record<string, SyncLaneActivationReceipt>
  asserts_serving?: boolean

  /** Single-lane spellings the managed Inspector payload still uses. */
  projection_generation?: number
  staging_run_id?: string
  source_vector_hash?: string
  projected_through?: string
  evidence_manifest_hash?: string
}

/** Where one lane has reached in the durable lifecycle.
 *
 *    acquire -> EVIDENCE_COMMITTED -> staged -> validated -> CAS activate
 *            -> SERVING_ACTIVE_GENERATION
 *
 *  Only the last is terminal. EVIDENCE_COMMITTED is the FIRST stage, not a
 *  near-miss of the last, and must never render as success. */
export type SyncLaneState =
  | "SERVING_ACTIVE_GENERATION"
  | "EVIDENCE_COMMITTED"
  | "UNCONFIRMED"
  | "NOT_CONNECTED"

export interface SyncLaneStatus {
  state: SyncLaneState | string
  lifecycle_stage?: SyncLaneState | null
  /** The receipt this lane can produce, or `"none"`. */
  receipt?: string
  evidence?: Array<Record<string, unknown>>
  unconfirmed?: Array<{ run_id?: string; code?: string; detail?: string }>
  activation?: SyncLaneActivationReceipt
  is_terminal?: boolean
  /** Typed code naming what is missing. Never a free-text excuse. */
  reason?: string
  detail?: string
  /** Lifecycle stages this lane has not reached yet. */
  awaiting?: string[]
  work_items_enqueued?: number
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
  /** Per-lane lifecycle state for a v2 round. A lane missing from here was
   *  not part of the round; a lane present with `state` other than
   *  SERVING_ACTIVE_GENERATION has NOT completed, whatever the round says. */
  lanes?: Record<string, SyncLaneStatus>
  /** The exact tenant/account/region the round is bound to. */
  scope?: { tenant_id?: string; account_id?: string; region?: string }
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
  const activation = status.activation
  if (!activation) {
    return false
  }
  // A multi-lane round leaves the scalar null ON PURPOSE and puts the set in
  // `projection_receipt_hashes`. Reading only the scalar reported every
  // multi-lane activation as unproven -- a false negative that renders a
  // served estate as a failed sync, which is worse than a refusal because the
  // customer re-runs work that already succeeded.
  const hashes = activation.projection_receipt_hashes
  if (Array.isArray(hashes)) {
    // Every entry must be a real hash. One empty string among them means a
    // lane activated without a validated receipt, and the round cannot be
    // reported as proven on the strength of its siblings.
    return hashes.length > 0 && hashes.every((hash) => Boolean(hash && hash.trim()))
  }
  return Boolean(activation.projection_receipt_hash)
}

/** The lane the MANAGED Inspector refresh plane serves.
 *
 *  Mirrors `NEPTUNE_MANAGED_SOURCE` in api/v2_sync.py. That payload predates
 *  multi-lane rounds: it reports a scalar `activation.projection_generation`
 *  and carries no `lanes` array, because there has only ever been one lane it
 *  can serve. Naming it here is reading the producer's own constant, not
 *  guessing a default -- and it is the ONE lane that may be assumed, which is
 *  why it is a named constant rather than a fallback inside the formatter. */
export const MANAGED_SYNC_LANE = "vulnerability_findings"

/** Lanes this round proved it is SERVING, in order. Never the queued set.
 *
 *  `sources` on a round means "asked for", which has changed nothing. */
export function activatedLanes(status: SyncJobStatus | null | undefined): string[] {
  if (!isActivated(status)) {
    return []
  }
  const named = status?.activation?.lanes
  if (Array.isArray(named) && named.length > 0) {
    return [...named].map(String).sort()
  }
  const lanes = status?.lanes
  if (lanes) {
    const serving = Object.keys(lanes)
      .filter((name) => lanes[name]?.state === "SERVING_ACTIVE_GENERATION")
      .sort()
    if (serving.length > 0) {
      return serving
    }
  }
  // The managed Inspector shape: a scalar generation and no lane map at all.
  // Returning [] here would make the success copy fall back to an anonymous
  // subject for the one round whose lane is never in doubt.
  if (typeof status?.activation?.projection_generation === "number") {
    return [MANAGED_SYNC_LANE]
  }
  return []
}

/** Lanes that are in the round but NOT serving, with the typed reason why.
 *
 *  Rendered so a partial round names what is still missing instead of
 *  presenting itself as a whole-estate refresh. */
export function unservedLanes(
  status: SyncJobStatus | null | undefined,
): Array<{ lane: string; state: string; reason?: string; detail?: string }> {
  const lanes = status?.lanes
  if (!lanes) {
    return []
  }
  return Object.keys(lanes)
    .filter((name) => lanes[name]?.state !== "SERVING_ACTIVE_GENERATION")
    .sort()
    .map((lane) => ({
      lane,
      state: String(lanes[lane]?.state ?? "UNKNOWN"),
      reason: lanes[lane]?.reason,
      detail: lanes[lane]?.detail,
    }))
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
  const activation = status.activation
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
  const deferredSuffix = deferred
    ? ` ${deferred} other data ${deferred === 1 ? "source was" : "sources were"} not refreshed by this run.`
    : ""

  // A round that did not serve every lane it requested says so. Presenting a
  // partial round as a whole-estate refresh is the same lie as a green tick
  // on an evidence commit, one level up.
  const unserved = unservedLanes(status)
  const unservedSuffix = unserved.length
    ? ` ${unserved.length} requested ${unserved.length === 1 ? "lane is" : "lanes are"} ` +
      `not being served yet: ${unserved.map((row) => `${row.lane} (${row.reason || row.state})`).join(", ")}.`
    : ""

  const lanes = activatedLanes(status)
  const generations = activation?.active_generations

  // MULTI-LANE. Each lane has its own generation counter, so there is no
  // single "generation N" to name for the round.
  if (lanes.length > 1) {
    const perLane = generations
      ? lanes
          .filter((lane) => typeof generations[lane] === "number")
          .map((lane) => `${lane} generation ${generations[lane]}`)
      : []
    const scope = perLane.length
      ? `${perLane.join(", ")} ${perLane.length === 1 ? "is" : "are"} active in Neptune.`
      : `${lanes.length} lanes are active in Neptune: ${lanes.join(", ")}.`
    return `${scope}${counts}${deferredSuffix}${unservedSuffix}`
  }

  // SINGLE LANE. Name the lane rather than assuming vulnerabilities: this
  // copy is reached from the IAM, least-privilege, behavioral, dependency and
  // inventory controls too, and naming findings on those was a claim about
  // data the round never touched.
  const lane = lanes[0]
  const generation =
    (lane && generations && typeof generations[lane] === "number"
      ? generations[lane]
      : undefined) ?? activation?.projection_generation

  const subject = lane ? laneSubject(lane) : "This refresh"
  const scope =
    generation === undefined
      ? `${subject} ${lane ? "is" : "is"} active in Neptune.`
      : `${subject} generation ${generation} is active in Neptune.`

  return `${scope}${counts}${deferredSuffix}${unservedSuffix}`
}

/** Human subject for one lane. Unknown lanes are named, never renamed.
 *
 *  A default of "Vulnerability findings" is how every control on every screen
 *  came to claim a vulnerability refresh it had not run. An unrecognised lane
 *  gets its own identifier, which is accurate and obviously unpolished,
 *  rather than a confident wrong noun. */
export function laneSubject(lane: string): string {
  const known: Record<string, string> = {
    vulnerability_findings: "Vulnerability findings",
    inventory_reconcile: "AWS inventory",
    network_flow: "VPC network flow",
    api_activity: "CloudTrail API activity",
  }
  return known[lane] ?? lane
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
