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

/** Filter names the list proxies pass on. The Decision route refuses the ones it does not support by name. */
export const INVENTORY_LIST_FILTER_KEYS = [
  "region",
  "name_contains",
  "created_before",
  "created_after",
  "availability_zone",
  "state",
  "runtime",
  "engine",
] as const

/**
 * The query both inventory list proxies forward: the resource type, page, system, scope and
 * filters, and nothing else (`envelope` is each proxy's own decision). `null` when no type.
 */
export function inventoryListParams(from: URLSearchParams): URLSearchParams | null {
  const resourceType = from.get("resource_type")
  if (!resourceType) return null
  const params = new URLSearchParams({ resource_type: resourceType, limit: from.get("limit") ?? "25" })
  for (const key of ["system", "cursor", "sort"]) {
    const value = from.get(key)
    if (value) params.set(key, value)
  }
  applyInventoryScopeParams(from, params)
  for (const key of INVENTORY_LIST_FILTER_KEYS) {
    const value = from.get(key)
    if (value) params.set(key, value)
  }
  return params
}
