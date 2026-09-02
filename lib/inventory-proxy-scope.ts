/**
 * Inventory proxies must forward tenant/account scope to the serving API.
 * Dropping these params made C1 look account-wide even when the UI sent a
 * forged or real account — the backend isolation could not see the request.
 */
export const INVENTORY_SCOPE_KEYS = [
  "customer_id",
  "tenant_id",
  "account_id",
] as const

export function applyInventoryScopeParams(
  from: URLSearchParams,
  to: URLSearchParams,
): URLSearchParams {
  for (const key of INVENTORY_SCOPE_KEYS) {
    const value = from.get(key)
    if (value) to.set(key, value)
  }
  return to
}
