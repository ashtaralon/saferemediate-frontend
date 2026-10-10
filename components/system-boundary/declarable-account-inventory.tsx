"use client"

/**
 * One account's inventory, with system declaration where this installation and this person allow it (Phase 2 E2b). The
 * inventory is Settings' account inventory panel (I3), handed the declaration picker's selection hook
 * (declare-from-inventory.tsx): when the authored declarations can be read and saving is active, rows the inventory marks
 * selectable can be picked as roots and declared as a System; otherwise the panel is browse-only, exactly as without this.
 * Mounted wherever the account's inventory is shown -- the direct route and the account page's Inventory tab -- so both
 * behave one way. The account census (A7 S1c) frames it: what each source answered first, the inventory itself second,
 * and what only the census names last (components/accounts/account-census-bands.tsx).
 * A page opened with ``?declare=1`` (Systems > Add System, lib/system-boundary-entry.ts) asks the picker to open its
 * declare flow; the picker decides whether it can.
 */
import { useSearchParams } from "next/navigation"
import { AccountCensusBands } from "@/components/accounts/account-census-bands"
import { AccountInventoryPanel } from "@/components/accounts/account-inventory-panel"
import { DeclareFromInventory } from "@/components/system-boundary/declare-from-inventory"
import { useAccountScope } from "@/lib/account-scope-context"
import type { ManagedAccount } from "@/lib/account-admin"
import { wantsDeclareFlow } from "@/lib/system-boundary-entry"

/** ``account``: this account's listed row, when the caller has it -- its data stage words an inventory or census that is not
 *  shown yet (lib/account-admin.ts inventoryStageText, censusStageText). Absent: each route's own answer is said. */
export function DeclarableAccountInventory({ accountId, account = null }: { accountId: string; account?: ManagedAccount | null }) {
  const scope = useAccountScope()
  const openDeclareFlow = wantsDeclareFlow(useSearchParams())
  return (
    <AccountCensusBands accountId={accountId} account={account}>
      <DeclareFromInventory
        accountId={accountId}
        customerId={scope.customerId}
        openDeclareFlow={openDeclareFlow}
        renderInventory={(selection) => <AccountInventoryPanel accountId={accountId} selection={selection} account={account} />}
      />
    </AccountCensusBands>
  )
}
