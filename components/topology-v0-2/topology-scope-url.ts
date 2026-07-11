/** Build topology-risk proxy URLs and client cache keys — must match BE scope. */

export interface TopologyScopeParams {
  accountId?: string | null
  region?: string | null
  vpcId?: string | null
}

export function buildTopologyRiskProxyUrl(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  const params = new URLSearchParams()
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  if (scope.vpcId) params.set("vpc_id", scope.vpcId)
  const qs = params.toString()
  const base = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  return qs ? `${base}?${qs}` : base
}

/** Client-side useCachedFetch key.
 *  v6 added account + region dimensions.
 *  v7 (2026-07) one-shot-clears localStorage entries poisoned with the
 *  pre-#407 phantom `RDS·3306` edge / missing exposure fields — bumping the
 *  schema token means every browser abandons its stale v6 entry on this
 *  deploy and re-fetches fresh. (Durable, per-render protection is the
 *  engine/port sanitize in lib/use-cached-fetch.ts; this bump just flushes
 *  the currently-poisoned caches.) A continuous data-freshness bust would
 *  need a backend snapshot-generation id in the key — tracked follow-up,
 *  since a backend-only fix like #407 never changes the FE build. */
export function buildTopologyRiskCacheKey(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  return `topology-risk:${systemName}:v7:${scope.accountId ?? ""}:${scope.region ?? ""}:${scope.vpcId ?? "all"}`
}

/** Proxy server cache key — mirrors BE {system}::{account}::{region}::{vpc}. */
export function buildTopologyRiskServerCacheKey(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  const account = scope.accountId ?? ""
  const region = scope.region ?? ""
  const vpc = scope.vpcId ?? ""
  if (!account && !region && !vpc) return `topology-risk:${systemName}`
  return `topology-risk:${systemName}:${account}:${region}:${vpc}`
}
