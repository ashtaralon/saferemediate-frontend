"use client"

import { Suspense, use } from "react"
import { AccountInventoryEntry } from "@/components/accounts/account-inventory-gate"

/**
 * /accounts/{accountId}/inventory (T11b): one account's published inventory, read-only. The same view as the account page's
 * Inventory tab (/accounts/{accountId}?tab=inventory), through the same AccountInventoryGate (r41): an account whose
 * registration is not activated yet says collection has not started and reads nothing; a removed account says so.
 */

interface Props {
  params: Promise<{ accountId: string }>
}

export default function AccountInventoryRoute({ params }: Props) {
  const { accountId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading inventory…</div>}>
      <AccountInventoryEntry accountId={accountId} />
    </Suspense>
  )
}
