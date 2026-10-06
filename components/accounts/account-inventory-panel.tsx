"use client"

/**
 * One account's published inventory (T11b), with its URL-carried resource-type filter -- shared by the direct route
 * /accounts/{accountId}/inventory and the account page's Inventory tab, so both read and filter it one way.
 *
 * The PATH account is authoritative: it is never healed or replaced by the global account scope. The roster only names it
 * (loading / unavailable are not refusals; only the backend refuses). The URL carries the account and the filter, never a
 * cursor, so a reload or bookmark always starts at the first page of the then-current publication.
 */
import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AccountInventoryView, type RosterState } from "@/components/accounts/account-inventory-view"
import type { InventorySelection } from "@/lib/account-inventory"
import { useAccountScope } from "@/lib/account-scope-context"

/** ``selection``: the caller's picks when declaring a system from this inventory (absent: browse only). */
export function AccountInventoryPanel({ accountId, selection }: { accountId: string; selection?: InventorySelection }) {
  const scope = useAccountScope()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filter = searchParams.get("resource_type")
  const resourceType = filter && filter.trim() ? filter : null

  let roster: RosterState
  if (scope.options !== null) {
    const entry = scope.options.accounts.find((account) => account.account_id === accountId)
    roster = { status: "ready", displayName: entry?.display_name ?? null }
  } else {
    roster = scope.loading ? { status: "loading" } : { status: "unavailable" }
  }

  const onResourceTypeChange = useCallback((next: string | null) => {
    const query = new URLSearchParams(searchParams.toString())
    if (next === null) query.delete("resource_type")
    else query.set("resource_type", next)
    const suffix = query.toString()
    router.replace(suffix ? `${pathname}?${suffix}` : pathname)
  }, [router, pathname, searchParams])

  return (
    <AccountInventoryView
      accountId={accountId}
      customerId={scope.customerId}
      region={scope.region}
      resourceType={resourceType}
      roster={roster}
      onResourceTypeChange={onResourceTypeChange}
      selection={selection}
    />
  )
}
