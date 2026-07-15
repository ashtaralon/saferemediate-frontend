/**
 * Snapshot Compute Contract — Wave D proxy timeout.
 *
 * IAP / snapshot awaiters use a tight FE proxy budget so contract
 * violations surface as honest 504 errors (with stale fallback when
 * available) instead of a long AbortSignal hang. Override with
 * SNAPSHOT_PROXY_TIMEOUT_MS for local debugging only.
 *
 * Topology-risk: cold Neo4j / Render sleeps routinely take 15–90s.
 * The proxy splits this budget into a short wake attempt + one retry
 * so a hung cold worker doesn't burn the whole window before the
 * DynamoDB snapshot can answer. Never invent status:"computing" on
 * abort (endless Computing… / blank map bugs).
 */
export const SNAPSHOT_PROXY_TIMEOUT_MS = Number(
  process.env.SNAPSHOT_PROXY_TIMEOUT_MS || 5000,
)

/** Estate Map topology-risk proxy — must outlive cold Neo4j builds. */
export const TOPOLOGY_RISK_PROXY_TIMEOUT_MS = Number(
  process.env.TOPOLOGY_RISK_PROXY_TIMEOUT_MS || 55_000,
)
