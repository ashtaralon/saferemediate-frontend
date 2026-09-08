/** Build topology-risk proxy URLs and client cache keys — must match BE scope. */

export interface TopologyScopeParams {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
  vpcId?: string | null
}

/**
 * First topology-risk fetch must carry the product-bar / URL account and
 * region. Map-local localStorage is empty on a cold browser; waiting for
 * the post-paint sync fired an unscoped GET, which on C1 either 503s or
 * starts a Neptune imply/compute and leaves Estate on "Preparing…".
 */
export function scopeFromSearch(search: string): TopologyScopeParams {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""))
  const accountId = q.get("account_id")
  const region = q.get("region")
  const customerId = q.get("customer_id")
  const vpcId = q.get("vpc_id")
  return {
    customerId: customerId || null,
    accountId: accountId && /^\d{12}$/.test(accountId) ? accountId : null,
    region: region && /^[a-z]{2}(-gov)?-[a-z]+-\d+$/.test(region) ? region : null,
    vpcId: vpcId && vpcId.startsWith("vpc-") ? vpcId : null,
  }
}

export function resolveTopologyScopeParams(
  selected: { accountId: string | null; regionId: string | null; vpcId: string | null },
  product: { customerId?: string | null; accountId: string; region: string },
  urlScope: TopologyScopeParams = {},
): TopologyScopeParams {
  const productAccount = product.accountId !== "all" ? product.accountId : null
  const productRegion = product.region !== "all" ? product.region : null
  return {
    customerId: product.customerId ?? urlScope.customerId ?? null,
    accountId: selected.accountId ?? urlScope.accountId ?? productAccount,
    region: selected.regionId ?? urlScope.region ?? productRegion,
    vpcId: selected.vpcId ?? urlScope.vpcId ?? null,
  }
}

export function buildTopologyRiskProxyUrl(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  const params = new URLSearchParams()
  if (scope.customerId) params.set("customer_id", scope.customerId)
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  if (scope.vpcId) params.set("vpc_id", scope.vpcId)
  const qs = params.toString()
  const base = `/api/proxy/topology-risk/${encodeURIComponent(systemName)}`
  return qs ? `${base}?${qs}` : base
}

/** Client-side useCachedFetch key — v10 busts poisoned empty computing caches. */
export function buildTopologyRiskCacheKey(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  return `topology-risk:${scope.customerId ?? ""}:${systemName}:v11:${scope.accountId ?? ""}:${scope.region ?? ""}:${scope.vpcId ?? "all"}`
}

/** Proxy server cache key — mirrors BE {system}::{account}::{region}::{vpc}.
 * Schema suffix busts Vercel/in-memory poison after Wave-D empty envelopes. */
const TOPOLOGY_RISK_SERVER_CACHE_SCHEMA = "2026-08-22:tenant-scoped-neptune"

export function buildTopologyRiskServerCacheKey(
  systemName: string,
  scope: TopologyScopeParams = {},
): string {
  const account = scope.accountId ?? ""
  const region = scope.region ?? ""
  const vpc = scope.vpcId ?? ""
  const tenant = scope.customerId ?? ""
  const base =
    !account && !region && !vpc
      ? `topology-risk:${tenant}:${systemName}`
      : `topology-risk:${tenant}:${systemName}:${account}:${region}:${vpc}`
  return `${base}:${TOPOLOGY_RISK_SERVER_CACHE_SCHEMA}`
}
