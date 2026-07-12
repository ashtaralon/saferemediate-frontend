/**
 * Snapshot Compute Contract — Wave D proxy timeout.
 *
 * IAP / snapshot awaiters use a tight FE proxy budget so contract
 * violations surface as computing/stale envelopes instead of a long
 * AbortSignal → 502. Override with SNAPSHOT_PROXY_TIMEOUT_MS for local
 * debugging only.
 *
 * Topology-risk is different: cold Neo4j builds routinely take 15–90s.
 * A 5s abort returns HTTP 200 `{ system_kpis: null, status: "computing" }`
 * which Estate Map caches and renders as "No system_kpis returned" —
 * bricking the map (2026-07-12 prod). Keep topology-risk on the prior
 * 55s budget (under Vercel maxDuration 60).
 */
export const SNAPSHOT_PROXY_TIMEOUT_MS = Number(
  process.env.SNAPSHOT_PROXY_TIMEOUT_MS || 5000,
)

/** Estate Map topology-risk proxy — must outlive cold Neo4j builds. */
export const TOPOLOGY_RISK_PROXY_TIMEOUT_MS = Number(
  process.env.TOPOLOGY_RISK_PROXY_TIMEOUT_MS || 55_000,
)
