export interface BlastRadiusScope {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
}

/**
 * Serving-graph blast-radius reads require an explicit Estate scope
 * (customer / account / region). The backend fails closed on graph
 * inference — an unscoped or partial GET returns 503, and cached responses
 * across scope are cross-tenant paints. Both the proxy URL and the client
 * cache key must carry the same normalized scope so a switch across
 * accounts/regions cannot serve another tenant's cached compose.
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

/** True only when every part the backend contract requires is present. */
export function isBlastRadiusScopeComplete(scope: BlastRadiusScope): scope is {
  customerId: string
  accountId: string
  region: string
} {
  if (!scope.customerId || scope.customerId === "all") return false
  if (!scope.accountId || !ACCOUNT_ID_RE.test(scope.accountId)) return false
  if (!scope.region || !REGION_RE.test(scope.region)) return false
  return true
}

/**
 * Build the scoped proxy URL, or null when the operator's scope is not yet
 * complete enough to hit the backend safely. The composer refuses to infer
 * scope — sending a partial GET just guarantees a 503 and wastes the round
 * trip. Callers pass `null` to `useCachedFetch` to wait honestly instead
 * of painting an error over an empty scope-bar.
 */
export function buildBlastRadiusUrl(
  systemName: string,
  scope: BlastRadiusScope,
): string | null {
  if (!systemName) return null
  if (!isBlastRadiusScopeComplete(scope)) return null
  const params = new URLSearchParams({
    customer_id: scope.customerId,
    account_id: scope.accountId,
    region: scope.region,
  })
  return `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius?${params.toString()}`
}

/**
 * SWR/localStorage cache key that is distinct across tenant, account and
 * region so a switch across accounts/regions cannot paint another tenant's
 * cached compose. Callers may pass any (possibly incomplete) scope: the key
 * still varies, which is what SWR needs to segregate cached entries.
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
