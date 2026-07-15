/**
 * Snapshot Compute Contract — Wave D proxy timeout.
 *
 * IAP / snapshot awaiters use a tight FE proxy budget so contract
 * violations surface as honest 504 errors (with stale fallback when
 * available) instead of a long AbortSignal → opaque hang. Override with
 * SNAPSHOT_PROXY_TIMEOUT_MS for local debugging only.
 *
 * Topology-risk is different: cold Neo4j builds routinely take 15–90s.
 * Do NOT invent HTTP 200 `{ status: "computing" }` on abort — that lied
 * to Estate Map and caused endless "Computing estate map…" (2026-07-12 /
 * 2026-07-15). Prefer last-good stale, else honest 504. Keep topology-risk
 * on the 55s budget (under Vercel maxDuration 60).
 */
export const SNAPSHOT_PROXY_TIMEOUT_MS = Number(
  process.env.SNAPSHOT_PROXY_TIMEOUT_MS || 5000,
)

/** Estate Map topology-risk proxy — must outlive cold Neo4j builds. */
export const TOPOLOGY_RISK_PROXY_TIMEOUT_MS = Number(
  process.env.TOPOLOGY_RISK_PROXY_TIMEOUT_MS || 55_000,
)
