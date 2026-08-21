"use client"

import { useMemo } from "react"
import { useAccountScope } from "@/lib/account-scope-context"
import { withAccountScope, type ProductScope } from "@/lib/account-scope"

export function productScopeKey(
  scope: Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">,
): string {
  return [
    scope.customerId || "no-customer",
    scope.groupId || "all",
    scope.accountId || "all",
    scope.region || "all",
  ].map(encodeURIComponent).join("|")
}

export function scopedStorageKey(base: string, scopeKey: string): string {
  return `${base}:${scopeKey}`
}

export function catalogSystemName(
  requested: string | null | undefined,
  available: readonly string[],
): string | null {
  const wanted = String(requested || "").trim().toLocaleLowerCase()
  if (!wanted) return null
  return available.find((name) => name.trim().toLocaleLowerCase() === wanted) ?? null
}

/**
 * The only client-side entry point for the systems catalog.
 *
 * `ready=false` prevents an initial unscoped request while the organization
 * roster is still resolving. `available=false` is the honest empty-organization
 * state: callers must render no systems rather than falling back to an estate
 * reading without tenant scope.
 */
export function useScopedSystemCatalog(
  endpoint = "/api/proxy/systems",
): {
  url: string | null
  scopeKey: string
  ready: boolean
  available: boolean
} {
  const scope = useAccountScope()
  const scopeKey = useMemo(
    () => productScopeKey(scope),
    [scope.customerId, scope.groupId, scope.accountId, scope.region],
  )
  const ready = !scope.loading
  const available = ready && Boolean(scope.customerId)
  const url = useMemo(
    () => available ? withAccountScope(endpoint, scope) : null,
    [available, endpoint, scope.customerId, scope.groupId, scope.accountId, scope.region],
  )
  return { url, scopeKey, ready, available }
}
