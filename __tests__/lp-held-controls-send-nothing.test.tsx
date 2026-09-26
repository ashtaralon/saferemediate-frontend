/**
 * While held, Resolve and Restore send NOTHING: not a disabled look over a live handler.
 *
 * Both controls used to be ``aria-disabled`` only, so a click still ran the handler and only the submitter's internal
 * flag check stood between the operator and a mutating POST. Now each is a real ``disabled`` button AND its handler
 * refuses before calling the submitter. Proven here with the REAL library (no mocks), a spy on every network request,
 * a user click, and React's own onClick called directly (a disabled button drops the DOM click, so that alone would
 * prove only the attribute).
 *
 * Mounted as the Least Privilege tab mounts them (components/LeastPrivilegeTab.tsx: the panel for the selected role
 * with its server plan, and the Restore control with the Apply's receipt). The IAM Permissions modal -- the surface
 * IAM roles actually reach -- renders neither while held: lp-iam-apply-caller.test.tsx asserts that mounted modal
 * makes no apply/restore/resolve/outstanding/receipt request at all.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LpOutstandingPanel } from "@/components/iam-lp/LpOutstandingPanel"
import { LpRestoreControl } from "@/components/iam-lp/LpRestoreControl"
import {
  LP_RESOLVE_ENABLED,
  LP_RESTORE_ENABLED,
  receiptFromApply,
  submitHeldLpRestore,
  submitLpResolve,
  type LpApplyReceipt,
} from "@/lib/lp-held-mutation"

const ROLE_ARN = "arn:aws:iam::111111111111:role/cyntro-tb-prod-web-role"
const PLAN = { roleArn: ROLE_ARN, roleId: "AROAWEBROLE", planHead: "head-1" }
const SCOPE = { customerId: "fixture-webshop", accountId: "111111111111" }
// The backend's /outstanding body (api/lp_remediation_route.py lp_outstanding), for a role an Apply left held.
const HELD = {
  operation_id: "op-apply-1", state: "APPLY_OUTCOME_UNKNOWN", attempt: 1, resolvable: true,
  live: { verdict: "partial", per_policy: { CreatePolicy: "intended", ReadPolicy: "preimage" } },
}

type Call = { url: string; method: string }

function spyNetwork(): Call[] {
  const calls: Call[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? "GET").toUpperCase() })
    if (url.startsWith("/api/proxy/least-privilege/outstanding?")) {
      return { ok: true, status: 200, json: async () => HELD } as Response
    }
    return { ok: false, status: 599, json: async () => ({ detail: { code: "SPY_UNROUTED" } }) } as Response
  }))
  return calls
}

async function clickEveryWay(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
  })
  const props = Object.entries(button).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick: () => unknown }
  await act(async () => {
    await props.onClick()
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("held in source", () => {
  it("both release switches are off", () => {
    expect(LP_RESOLVE_ENABLED).toBe(false)
    expect(LP_RESTORE_ENABLED).toBe(false)
  })

  it("the submitters themselves refuse without a request (the library guard, on its own)", async () => {
    const calls = spyNetwork()
    const binding = { operationId: "op-apply-1", roleArn: ROLE_ARN, roleId: "AROAWEBROLE" }
    expect(await submitLpResolve(binding)).toMatchObject({ ok: false, status: 503, code: "RESOLVE_HELD", cloud_writes: 0 })
    expect(await submitHeldLpRestore(binding)).toMatchObject({ ok: false, status: 503, code: "RESTORE_HELD", cloud_writes: 0 })
    expect(calls).toEqual([])
  })
})

describe("Resolve, mounted as the tab mounts it", () => {
  it("shows the held operation but a click -- either way -- sends no Resolve", async () => {
    const calls = spyNetwork()
    const onResolved = vi.fn()
    render(<LpOutstandingPanel plan={PLAN} onResolved={onResolved} />)
    const button = (await screen.findByRole("button", { name: "Resolve from live state" })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/Resolution stays off/)).toBeTruthy()
    await clickEveryWay(button)
    expect(calls.filter((call) => call.method !== "GET")).toEqual([])
    expect(calls.filter((call) => call.url.includes("/least-privilege/resolve"))).toEqual([])
    expect(calls.map((call) => call.url.split("?")[0])).toEqual(["/api/proxy/least-privilege/outstanding"])
    expect(onResolved).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("Resolution stays off")
  })
})

describe("Restore, mounted as the tab mounts it", () => {
  it("offers the receipt's operation but a click -- either way -- sends no Restore", async () => {
    const calls = spyNetwork()
    const receipt = receiptFromApply(PLAN, {
      code: "VERIFIED", operation_id: "op-apply-1",
      receipt: { kind: "apply", operation_id: "op-apply-1", tenant_id: SCOPE.customerId, account_id: SCOPE.accountId,
                 role_arn: ROLE_ARN, role_id: "AROAWEBROLE", plan_head: "head-1", restores_operation_id: null },
    }) as LpApplyReceipt
    const cleared = vi.fn()
    render(<LpRestoreControl receipt={receipt} plan={PLAN} scope={SCOPE} onReceiptCleared={cleared} />)
    const button = screen.getByRole("button", { name: "Restore this operation" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/Restore stays off/)).toBeTruthy()          // the held reason is shown before any click
    await clickEveryWay(button)
    expect(calls).toEqual([])
    expect(cleared).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("Restore stays off")
  })
})
