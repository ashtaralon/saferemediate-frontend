/** Snapshot Compute Contract — closed staleReason set (Wave A).

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
