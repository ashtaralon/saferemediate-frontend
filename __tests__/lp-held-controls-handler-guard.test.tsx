/**
 * The held controls' OWN guard, isolated: with the release switches off (as in source), neither handler calls its
 * submitter at all -- even when the library's internal flag check is not there to catch it (the submitters are spies
 * here). Paired with lp-held-controls-send-nothing.test.tsx, which proves the library guard on its own and the whole
 * path against a network spy: each guard is tested without the other, so removing either one fails a test.
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const resolve = vi.fn()
const restore = vi.fn()
const read = vi.fn()
vi.mock("@/lib/lp-held-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lp-held-mutation")>()
  return {
    ...actual,
    fetchLpOutstanding: (...args: unknown[]) => read(...args),
    submitLpResolve: (...args: unknown[]) => resolve(...args),
    submitHeldLpRestore: (...args: unknown[]) => restore(...args),
  }
})

import { LpOutstandingPanel } from "@/components/iam-lp/LpOutstandingPanel"
import { LpRestoreControl } from "@/components/iam-lp/LpRestoreControl"
import { receiptFromApply, type LpApplyReceipt } from "@/lib/lp-held-mutation"

const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1" }
const SCOPE = { customerId: "fixture-webshop", accountId: "111111111111" }

function reactOnClick(button: HTMLElement): () => unknown {
  return (Object.entries(button).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick: () => unknown }).onClick
}

afterEach(() => {
  cleanup()
  resolve.mockReset()
  restore.mockReset()
  read.mockReset()
})

describe("the held handlers", () => {
  it("Resolve never reaches its submitter", async () => {
    read.mockResolvedValue({ operationId: "op-apply-1", state: "PARTIALLY_APPLIED", attempt: 1, resolvable: true,
                             verdict: "partial", perPolicy: {} })
    render(<LpOutstandingPanel plan={PLAN} onResolved={() => {}} />)
    const button = await screen.findByRole("button", { name: "Resolve from live state" })
    await act(async () => {
      await reactOnClick(button)()
    })
    expect(resolve).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("Resolution stays off")
  })

  it("Restore never reaches its submitter", async () => {
    const receipt = receiptFromApply(PLAN, {
      code: "VERIFIED", operation_id: "op-apply-1",
      receipt: { kind: "apply", operation_id: "op-apply-1", tenant_id: SCOPE.customerId, account_id: SCOPE.accountId,
                 role_arn: ROLE_ARN, role_id: "AROAWEBROLE", plan_head: "head-1", restores_operation_id: null },
    }) as LpApplyReceipt
    render(<LpRestoreControl receipt={receipt} plan={PLAN} scope={SCOPE} onReceiptCleared={() => {}} />)
    await act(async () => {
      await reactOnClick(screen.getByRole("button", { name: "Restore this operation" }))()
    })
    expect(restore).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("Restore stays off")
  })
})
