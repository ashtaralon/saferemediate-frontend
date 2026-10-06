"use client"

import { Suspense, use } from "react"
import { DeclarableAccountInventory } from "@/components/system-boundary/declarable-account-inventory"

/**
 * /accounts/{accountId}/inventory (T11b): one account's published inventory, read-only. The same panel is the account
 * page's Inventory tab (/accounts/{accountId}?tab=inventory), which Settings > Accounts links to.
 */

interface Props {
  params: Promise<{ accountId: string }>
}

export default function AccountInventoryRoute({ params }: Props) {
  const { accountId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading inventory…</div>}>
      <DeclarableAccountInventory accountId={accountId} />
    </Suspense>
  )
}
