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

export const STALE_REASON_VALUES: readonly StaleReason[] = [
  "snapshot_recomputing",
  "deadline_exceeded",
  "peer_computing",
  "post_sync_invalidation",
  "fresh_snapshot_older_than_window",
] as const

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
