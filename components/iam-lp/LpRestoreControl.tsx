"use client"

import { useState } from "react"

import {
  LP_RESTORE_ENABLED,
  receiptOffersRestore,
  submitHeldLpRestore,
  type LpApplyReceipt,
} from "@/lib/lp-held-mutation"

type Plan = { roleArn: string; roleId: string; planHead: string } | undefined
type Scope = { customerId?: string | null; accountId?: string | null }
type Outcome = { text: string } | null

/**
 * Restore for exactly the operation a verified Apply recorded on this role.
 *
 * `receipt` is the in-memory hint the Tab kept from that Apply's response; it
 * is not proof. Restore submits its exact operation and role binding and the
 * backend re-checks both against its ledger. The control renders only while the
 * selected role, role incarnation, customer and account still match the
 * receipt. A refusal (4xx) means the server does not hold this receipt as
 * restorable, so the hint is dropped; an unavailable backend (5xx) keeps it.
 */
export function LpRestoreControl({
  receipt,
  plan,
  scope,
  onReceiptCleared,
}: {
  receipt: LpApplyReceipt | null
  plan: Plan
  scope: Scope
  onReceiptCleared: () => void
}) {
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [busy, setBusy] = useState(false)

  if (!receipt || !receiptOffersRestore(receipt, plan, scope)) {
    return outcome ? <div role="status" className="text-sm">{outcome.text}</div> : null
  }
  const bound = receipt

  async function restore() {
    setBusy(true)
    try {
      const result = await submitHeldLpRestore({
        operationId: bound.operationId,
        roleArn: bound.roleArn,
        roleId: bound.roleId,
      })
      const body = "body" in result ? (result.body as Record<string, unknown> | null) : null
      const detail = (body?.detail as Record<string, unknown> | undefined) ?? body ?? undefined
      if (result.ok && body?.code === "VERIFIED") {
        setOutcome({ text: `Restored operation ${bound.operationId}.` })
        onReceiptCleared()
        return
      }
      const code = ("code" in result ? result.code : undefined) ?? (detail?.code as string | undefined)
      if (code === "RESTORE_HELD") {
        setOutcome({ text: "Restore stays off until the installed ledger, IAM writer and verified readback are proven." })
        return
      }
      setOutcome({ text: `Restore was refused (${String(code ?? `HTTP ${result.status}`)}). Nothing was written.` })
      if (result.status >= 400 && result.status < 500) onReceiptCleared()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="lp-restore-control" className="rounded-lg border border-slate-300 p-3 text-sm">
      <div className="font-medium">Last verified Apply on this role</div>
      <div className="text-slate-600">Operation {bound.operationId}</div>
      <button
        type="button"
        className="mt-2 rounded border px-3 py-1"
        onClick={restore}
        aria-busy={busy}
        aria-disabled={!LP_RESTORE_ENABLED}
      >
        Restore this operation
      </button>
      {outcome && (
        <div role="status" className="mt-2">
          {outcome.text}
        </div>
      )}
    </div>
  )
}
