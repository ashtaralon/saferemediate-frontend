"use client"

/**
 * (Wizard on discovery; D47) An account whose registration has a basic-discovery run shows its BASIC inventory -- and the
 * System wizard declares from it, exactly as DeclarableAccountInventory does from the published inventory: the same picker
 * (declare-from-inventory.tsx), the same form, the same saved declarations. A row the backend named a System root for can be
 * picked; the save's basic resolver judges every pick again against the current registration, run and stored row.
 *
 * Browsing never waits on Systems: the inventory renders at once (browse only), and the picker's own reads -- declarations,
 * grant, capability -- add the declare toolbar only when they answer and saving is active; a failed read is said in the
 * toolbar's place. ``?declare=1`` (Systems > Add System) asks for the declare flow here too; before D47 it was silently ignored.
 */
import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { DeclareFromInventory } from "@/components/system-boundary/declare-from-inventory"
import type { InventorySelection } from "@/lib/account-inventory"
import { useOptionalAccountScope } from "@/lib/account-scope-context"
import { wantsDeclareFlow } from "@/lib/system-boundary-entry"

export function DeclarableBasicInventory({ accountId, renderInventory }: {
  accountId: string
  renderInventory: (selection: InventorySelection | undefined) => ReactNode
}) {
  // The account page provides the scope; without one the picker is keyed by the account alone (never a fabricated customer).
  const scope = useOptionalAccountScope()
  const openDeclareFlow = wantsDeclareFlow(useSearchParams())
  return (
    <DeclareFromInventory accountId={accountId} customerId={scope?.customerId ?? null} openDeclareFlow={openDeclareFlow}
      renderInventory={renderInventory} />
  )
}
