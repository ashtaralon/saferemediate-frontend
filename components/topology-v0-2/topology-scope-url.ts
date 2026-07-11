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

/** Client-side useCachedFetch key — v8 busts payloads missing node ownership stamps. */
export function buildTopologyRiskCacheKey(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  return `topology-risk:${systemName}:v8:${scope.accountId ?? ""}:${scope.region ?? ""}:${scope.vpcId ?? "all"}`
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
