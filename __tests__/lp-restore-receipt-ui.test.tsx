/**
 * Restore is offered only for the exact operation a verified Apply recorded.
 *
 * The receipt the Tab keeps is an in-memory hint from that Apply's response
 * (backend #2137 `receipt`); the backend ledger stays the authority and
 * re-checks the operation and role on Restore (#2131). There is no scoped
 * backend receipt lookup, so nothing is persisted and a reload or logout offers
 * no Restore.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const submit = vi.fn()
vi.mock("@/lib/lp-held-mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lp-held-mutation")>()
  return { ...actual, submitHeldLpRestore: (...args: unknown[]) => submit(...args) }
})

import { receiptFromApply, receiptOffersRestore, type LpApplyReceipt } from "@/lib/lp-held-mutation"
import { LpRestoreControl } from "@/components/iam-lp/LpRestoreControl"

const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1" }
const SCOPE = { customerId: "fixture-webshop", accountId: "111111111111" }

function applyResponse(overrides: Record<string, unknown> = {}, receipt: Record<string, unknown> = {}) {
  return {
    code: "VERIFIED",
    operation_id: "op-apply-1",
    cloud_writes: 1,
    receipt: {
      kind: "apply", operation_id: "op-apply-1", tenant_id: "fixture-webshop", account_id: "111111111111",
      role_arn: ROLE_ARN, role_id: "AROAWEBROLE", plan_head: "head-1", restores_operation_id: null, ...receipt,
    },
    ...overrides,
  }
}

const RECEIPT = receiptFromApply(PLAN, applyResponse()) as LpApplyReceipt

afterEach(() => {
  submit.mockReset()
})

describe("accepting an Apply response as a receipt", () => {
  it("accepts exactly the verified binding that was sent", () => {
    expect(RECEIPT).toEqual({
      operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1",
      tenantId: "fixture-webshop", accountId: "111111111111",
    })
  })

  it.each([
    ["a refusal", applyResponse({ code: "VERIFY_RECEIPT_MISSING" })],
    ["an older backend with no receipt", { code: "VERIFIED", operation_id: "op-apply-1" }],
    ["another role", applyResponse({}, { role_arn: "arn:aws:iam::111111111111:role/other" })],
    ["a recreated role", applyResponse({}, { role_id: "AROARECREATED" })],
    ["another plan", applyResponse({}, { plan_head: "head-2" })],
    ["a receipt for another operation", applyResponse({}, { operation_id: "op-other" })],
    ["a Restore receipt", applyResponse({}, { kind: "restore", restores_operation_id: "op-0" })],
    ["no scope", applyResponse({}, { tenant_id: "" })],
  ])("rejects %s", (_label, response) => {
    expect(receiptFromApply(PLAN, response)).toBeNull()
  })
})

describe("when a retained receipt may offer Restore", () => {
  it.each([
    ["the same role, customer and account", PLAN, SCOPE, true],
    ["an all-accounts view (the role ARN pins the account)", PLAN, { ...SCOPE, accountId: "all" }, true],
    ["another role", { ...PLAN, roleArn: "arn:aws:iam::111111111111:role/other" }, SCOPE, false],
    ["the role recreated under the same ARN", { ...PLAN, roleId: "AROARECREATED" }, SCOPE, false],
    ["another account", PLAN, { ...SCOPE, accountId: "222222222222" }, false],
    ["another customer", PLAN, { ...SCOPE, customerId: "other-shop" }, false],
    ["no plan", undefined, SCOPE, false],
  ])("%s", (_label, plan, scope, offered) => {
    expect(receiptOffersRestore(RECEIPT, plan, scope)).toBe(offered)
  })
})

describe("the Restore control", () => {
  it("offers nothing without a receipt (missing, or after a reload or logout)", () => {
    const { container } = render(<LpRestoreControl receipt={null} plan={PLAN} scope={SCOPE} onReceiptCleared={() => {}} />)
    expect(container.innerHTML).toBe("")
    expect(screen.queryByText("Restore this operation")).toBeNull()
  })

  it("offers nothing after a role or account switch", () => {
    const { rerender } = render(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={SCOPE} onReceiptCleared={() => {}} />)
    expect(screen.getByText("Restore this operation")).toBeTruthy()
    rerender(<LpRestoreControl receipt={RECEIPT} plan={{ ...PLAN, roleArn: "arn:aws:iam::111111111111:role/other" }} scope={SCOPE} onReceiptCleared={() => {}} />)
    expect(screen.queryByText("Restore this operation")).toBeNull()
    rerender(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={{ ...SCOPE, accountId: "222222222222" }} onReceiptCleared={() => {}} />)
    expect(screen.queryByText("Restore this operation")).toBeNull()
  })

  it("submits exactly the receipt's operation and role binding", async () => {
    submit.mockResolvedValue({ ok: false, status: 503, code: "RESTORE_HELD", cloud_writes: 0 })
    render(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={SCOPE} onReceiptCleared={() => {}} />)

    await act(async () => {
      fireEvent.click(screen.getByText("Restore this operation"))
    })

    expect(submit).toHaveBeenCalledWith({ operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAWEBROLE" })
    expect(screen.getByRole("status").textContent).toContain("Restore stays off")
  })

  it("drops a stale receipt the server refuses, and keeps it when the server is unavailable", async () => {
    const cleared = vi.fn()
    submit.mockResolvedValueOnce({ ok: false, status: 503, body: { detail: { code: "LIFECYCLE_UNREACHABLE" } } })
    const { rerender } = render(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={SCOPE} onReceiptCleared={cleared} />)
    await act(async () => {
      fireEvent.click(screen.getByText("Restore this operation"))
    })
    expect(cleared).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("LIFECYCLE_UNREACHABLE")

    submit.mockResolvedValueOnce({ ok: false, status: 409, body: { detail: { code: "RESTORE_TRANSACTION_MISMATCH" } } })
    rerender(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={SCOPE} onReceiptCleared={cleared} />)
    await act(async () => {
      fireEvent.click(screen.getByText("Restore this operation"))
    })
    expect(cleared).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("status").textContent).toContain("RESTORE_TRANSACTION_MISMATCH")
  })

  it("clears the receipt after a verified Restore and says so", async () => {
    const cleared = vi.fn()
    submit.mockResolvedValue({ ok: true, status: 200, body: { code: "VERIFIED", operation_id: "op-restore-1" } })
    const { rerender } = render(<LpRestoreControl receipt={RECEIPT} plan={PLAN} scope={SCOPE} onReceiptCleared={cleared} />)
    await act(async () => {
      fireEvent.click(screen.getByText("Restore this operation"))
    })
    expect(cleared).toHaveBeenCalledTimes(1)
    rerender(<LpRestoreControl receipt={null} plan={PLAN} scope={SCOPE} onReceiptCleared={cleared} />)
    expect(screen.queryByText("Restore this operation")).toBeNull()
    expect(screen.getByRole("status").textContent).toContain("Restored operation op-apply-1")
  })
})

describe("the Tab keeps the receipt in memory only", () => {
  const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")
  const control = readFileSync(join(process.cwd(), "components/iam-lp/LpRestoreControl.tsx"), "utf8")
  const lib = readFileSync(join(process.cwd(), "lib/lp-held-mutation.ts"), "utf8")

  it("captures the receipt from both Apply call sites", () => {
    expect(tab.split("receiptFromApply(selectedResource.serverPlan, result)").length - 1).toBe(2)
    expect(tab).toContain("<LpRestoreControl")
  })

  it("drops the receipt on a tenant or account switch", () => {
    expect(tab).toMatch(/setLpReceipt\(null\)\s*\n\s*\}, \[accountScope\.customerId, accountScope\.accountId\]\)/)
  })

  it("never persists a receipt in browser storage", () => {
    for (const source of [control, lib]) {
      expect(source).not.toMatch(/sessionStorage|localStorage|indexedDB/)
    }
  })
})
