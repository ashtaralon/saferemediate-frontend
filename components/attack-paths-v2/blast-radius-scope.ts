export interface BlastRadiusScope {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
}

/**
 * Serving-graph blast-radius reads require an explicit Estate scope
 * (customer / account / region). The backend fails closed on graph inference
 * — an unscoped GET returns 503 rather than a cross-tenant answer. Both the
 * proxy URL and the client cache key must carry the same scope so a switch
 * across accounts/regions cannot serve another tenant's cached compose.
 */

const ACCOUNT_ID_RE = /^\d{12}$/
const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d+$/

/**
 * Normalize a scope from `useAccountScope` (where "all" means unscoped).
 * The context uses "all" sentinels for group/account/region while the
 * blast-radius contract wants absent params — never a literal "all".
 */
export function normalizeBlastRadiusScope(
  raw: {
    customerId?: string | null
    accountId?: string | null
    region?: string | null
  } | null | undefined,
): BlastRadiusScope {
  if (!raw) return {}
  const accountId =
    raw.accountId && raw.accountId !== "all" && ACCOUNT_ID_RE.test(raw.accountId)
      ? raw.accountId
      : null
  const region =
    raw.region && raw.region !== "all" && REGION_RE.test(raw.region)
      ? raw.region
      : null
  return {
    customerId: raw.customerId ?? null,
    accountId,
    region,
  }
}

export function buildBlastRadiusUrl(systemName: string, scope: BlastRadiusScope): string | null {
  if (!systemName) return null
  const params = new URLSearchParams()
  if (scope.customerId) params.set("customer_id", scope.customerId)
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  const query = params.toString()
  const base = `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
  return query ? `${base}?${query}` : base
}

/**
 * SWR/localStorage cache key that is distinct across tenant, account and
 * region. Without this the browser would paint a cached testbed compose on
 * an alon-prod session (or vice-versa) whenever the operator switched scope
 * within the same tab — see the P0.3 incident 2026-09-15.
 */
export function buildBlastRadiusCacheKey(
  systemName: string,
  scope: BlastRadiusScope,
): string {
  return [
    "blast-radius",
    scope.customerId ?? "",
    scope.accountId ?? "",
    scope.region ?? "",
    systemName,
  ].join(":")
}
