/** Snapshot Compute Contract — closed staleReason set + Wave B envelopes.

 * Mirror of backend ``unified/snapshot_contract.py`` ``STALE_REASON_VALUES``.
 * CI: ``scripts/check_stale_reason_twins_in_sync.py`` (backend repo).
 * FE must not invent strings outside this set.
 */

export type StaleReason =
  | "snapshot_recomputing"
  | "deadline_exceeded"
  | "peer_computing"
  | "post_sync_invalidation"
  | "fresh_snapshot_older_than_window"
  | "refresh_unavailable"
  | "refresh_queued"
  | "refresh_unknown"

export const STALE_REASON_VALUES: readonly StaleReason[] = [
  "snapshot_recomputing",
  "deadline_exceeded",
  "peer_computing",
  "post_sync_invalidation",
  "fresh_snapshot_older_than_window",
  "refresh_unavailable",
  "refresh_queued",
  "refresh_unknown",
] as const

/** What the REFRESH JOB is doing. Mirror of backend ``RefreshState``.
 *
 *  Separate from staleness on purpose: how old the payload is and whether
 *  anything is being done about it are two different facts. There is no
 *  "running" member because the serving process cannot prove a worker picked
 *  the job up — "unknown" is the honest answer, not a guess.
 */
export type RefreshState =
  | "fresh"
  | "queued"
  | "duplicate"
  | "unavailable"
  | "not_requested"
  | "unknown"

export const REFRESH_STATE_VALUES: readonly RefreshState[] = [
  "fresh",
  "queued",
  "duplicate",
  "unavailable",
  "not_requested",
  "unknown",
] as const

export function isRefreshState(value: unknown): value is RefreshState {
  return (
    typeof value === "string" &&
    (REFRESH_STATE_VALUES as readonly string[]).includes(value)
  )
}

/** One sentence per state, for the stale banner.
 *
 *  Every string says what is true of the REFRESH, never "backend timeout" —
 *  that was the single hardcoded reason the banner used to print for all of
 *  a refused enqueue, a peer recompute, a proxy timeout and an invalidation.
 */
export const REFRESH_STATE_MESSAGE: Record<RefreshState, string> = {
  fresh: "Computed just now.",
  queued: "A refresh is queued and has not started yet.",
  duplicate: "A refresh for this view is already in progress.",
  unavailable:
    "No refresh is running — the refresh could not be started. This view will not update until an operator runs one.",
  not_requested: "Showing the last stored view; no refresh was requested.",
  unknown: "Refresh status is unknown.",
}

/** Reasons that mean nothing is coming, so the UI must not promise an update. */
export function refreshIsStalled(state: RefreshState | null | undefined): boolean {
  return state === "unavailable" || state === "not_requested"
}

export function isStaleReason(value: unknown): value is StaleReason {
  return (
    typeof value === "string" &&
    (STALE_REASON_VALUES as readonly string[]).includes(value)
  )
}

/** Wave B — HTTP 200 while a peer/worker holds the compute lease. */
export type ComputingEnvelope = {
  status: "computing"
  system_name: string
  computing_started_at: string
  compute_deadline_at: string
  staleReason: StaleReason
}

/** Wave B — HTTP 200 after 180s deadline with no winning snapshot. */
export type ComputeFailedEnvelope = {
  status: "compute_failed"
  system_name: string
  computing_started_at: string
  failed_at: string
  reason: "deadline_exceeded"
  staleReason: "deadline_exceeded"
}

export type SnapshotComputeEnvelope = ComputingEnvelope | ComputeFailedEnvelope

export function isComputingEnvelope(
  value: unknown
): value is ComputingEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "computing"
  )
}

export function isComputeFailedEnvelope(
  value: unknown
): value is ComputeFailedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "compute_failed"
  )
}

export function isSnapshotComputeEnvelope(
  value: unknown
): value is SnapshotComputeEnvelope {
  return isComputingEnvelope(value) || isComputeFailedEnvelope(value)
}
