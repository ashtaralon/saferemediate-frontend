/**
 * Snapshot Compute Contract — Wave D proxy timeout.
 *
 * Backend GET awaiters hard-stop at 45s; the FE proxy is tighter (5s) so
 * contract violations surface as computing/stale envelopes immediately
 * instead of being absorbed by the old 55s AbortSignal → 502 path.
 *
 * Override with SNAPSHOT_PROXY_TIMEOUT_MS for local debugging only.
 */
export const SNAPSHOT_PROXY_TIMEOUT_MS = Number(
  process.env.SNAPSHOT_PROXY_TIMEOUT_MS || 5000
)
