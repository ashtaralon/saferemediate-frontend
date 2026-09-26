/**
 * The IAM-role LP Apply caller in the Permissions modal (the only surface IAM roles reach, lib/lp-review-routing.ts).
 *
 * Driven through the rendered control: the click builds the request from the backend-authoritative Review
 * (server_plan + exact decision_binding), refusals render by name, a verified receipt hands off to Restore, stale
 * Review state is dropped, and while held nothing is requested at all. The Review is the body captured from the
 * backend's mounted routes (fixture `_source`); where a MEASURED plan is needed it is that capture with a measured
 * plan for the SAME role (labelled test input), because the capture itself is UNKNOWN.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import full from "./fixtures/lp-review-preview-install-chain.json"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { LpIamApplyPanel, lpIamApplyPanelKey, lpReviewIsForThisRole } from "@/components/iam-lp/LpIamApplyPanel"
import { lpApplyBody } from "@/lib/lp-held-mutation"

const captured = full.review_envelope.result as Record<string, any>
const measured = {
  ...captured,
  server_plan: {
    ...captured.server_plan,
    issue_state: "MEASURED",
    plan_head: "fixture-plan-head",
    actions: [
      { permission: "s3:DeleteObject", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" },
      { permission: "s3:GetObject", configured: true, coverage: "OBSERVED", observed_use_count: 12, effect: "keep" },
    ],
  },
}
const scope = { customerId: captured.server_plan.tenant_id, accountId: captured.server_plan.account_id }

function verified(operationId = "op-1") {
  return {
    ok: true,
    status: 200,
    body: {
      code: "VERIFIED",
      operation_id: operationId,
      receipt: {
        kind: "apply", restores_operation_id: null, operation_id: operationId,
        role_arn: measured.server_plan.role_arn, role_id: measured.server_plan.role_id, plan_head: "fixture-plan-head",
        tenant_id: scope.customerId, account_id: scope.accountId,
      },
    },
  }
}

function button() {
  return screen.getByRole("button", { name: "Apply this plan" }) as HTMLButtonElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("LpIamApplyPanel", () => {
  it("is held by default: disabled, and neither Apply nor a ledger lookup reaches the network", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const submitApply = vi.fn()
    render(<LpIamApplyPanel review={measured} scope={scope} submitApply={submitApply} />)
    expect(button().disabled).toBe(true)
    expect(screen.getByRole("note").textContent).toContain("held")
    // A disabled control drops onClick in the DOM; call React's own handler to prove the guard, not the attribute.
    const props = Object.entries(button()).find(([key]) => key.startsWith("__reactProps"))?.[1] as { onClick: () => void }
    await act(async () => props.onClick())
    expect(submitApply).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends exactly the backend-authoritative body, once", async () => {
    const submitApply = vi.fn(async () => verified())
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    fireEvent.click(button())
    await screen.findByText(/Applied and verified: operation op-1/)
    expect(submitApply).toHaveBeenCalledTimes(1)
    expect(submitApply).toHaveBeenCalledWith(lpApplyBody(measured))
    const sent = (submitApply.mock.calls[0] as unknown[])[0] as Record<string, any>
    expect(sent.decision_binding).toEqual({
      projection_generation: captured.decision_authority.receipt.projection_generation,
      projection_receipt_hash: captured.decision_authority.receipt.projection_receipt_hash,
      publication_attempt: captured.decision_authority.publication.attempt,
    })
    expect(Object.keys(sent)).not.toContain("actor")        // identity is sealed server-side, never sent from the UI
    expect(Object.keys(sent)).not.toContain("tenant_id")
    expect(screen.getByTestId("lp-restore-control").textContent).toContain("op-1")   // the verified receipt offers Restore
    expect(button().disabled).toBe(true)                    // the applied plan is never re-sent from this Review
  })

  it("a moved generation is refused by name and asks for a fresh Review instead of re-sending the plan", async () => {
    const onReviewStale = vi.fn()
    const submitApply = vi.fn(async () => ({ ok: false, status: 409, body: { detail: { code: "DECISION_GENERATION_MOVED", cloud_writes: 0 } } }))
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} onReviewStale={onReviewStale} />)
    fireEvent.click(button())
    const status = await screen.findByRole("status")
    expect(status.textContent).toContain("newer decision generation")
    expect(status.textContent).toContain("Nothing was written.")
    expect(onReviewStale).toHaveBeenCalledTimes(1)
    expect(button().disabled).toBe(true)          // no in-place retry: the replay guards would refuse the same plan
    expect(submitApply).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("lp-restore-control")).toBeNull()
  })

  it.each([
    ["OPERATOR_SCOPE_MISMATCH", 403, "not scoped to this customer and account", " Nothing was written."],
    ["OPERATOR_PROOF_NOT_FORWARDABLE", 401, "Sign in again", " Nothing was written."],
    ["OPERATOR_IDENTITY_REQUIRED", 401, "was not presented", " Nothing was written."],
    ["IAM_APPLY_AUTHORITY_ABSENT", 403, "no authority to forward", " Nothing was written."],
    ["LIFECYCLE_DESTINATION_UNAVAILABLE", 503, "no remediation writer", " Nothing was written."],
  ])("%s is shown by name and writes nothing", async (code, status, text, writes) => {
    const submitApply = vi.fn(async () => ({ ok: false, status, body: { detail: { code, cloud_writes: 0 } } }))
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    const out = await screen.findByRole("status")
    expect(out.textContent).toContain(text)
    expect(out.textContent?.endsWith(writes)).toBe(true)
  })

  it("a 5xx without a zero-write statement is unconfirmed, never 'nothing written'", async () => {
    const submitApply = vi.fn(async () => ({ ok: false, status: 502, body: null }))
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    const out = await screen.findByRole("status")
    expect(out.textContent).toContain("unconfirmed")
    expect(out.textContent).not.toContain("Nothing was written")
  })

  it("a 2xx that is not a verified receipt for THIS plan is unconfirmed and offers no Restore", async () => {
    const other = verified("op-2")
    other.body.receipt.plan_head = "another-plan"
    const submitApply = vi.fn(async () => other)
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    expect((await screen.findByRole("status")).textContent).toContain("unconfirmed")
    expect(screen.queryByTestId("lp-restore-control")).toBeNull()
  })

  it("a stale plan head asks for a fresh Review", async () => {
    const onReviewStale = vi.fn()
    const submitApply = vi.fn(async () => ({ ok: false, status: 409, body: { detail: { code: "STALE_PLAN_HEAD", cloud_writes: 0 } } }))
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} onReviewStale={onReviewStale} />)
    fireEvent.click(button())
    expect((await screen.findByRole("status")).textContent).toContain("plan changed")
    expect(onReviewStale).toHaveBeenCalledTimes(1)
  })

  it("an outcome-unknown refusal is unconfirmed even when its body says zero writes", async () => {
    const submitApply = vi.fn(async () => ({ ok: false, status: 503, body: { detail: { code: "APPLY_OUTCOME_UNKNOWN", cloud_writes: 0 } } }))
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    const out = await screen.findByRole("status")
    expect(out.textContent).toContain("unconfirmed")
    expect(out.textContent).not.toContain("Nothing was written")
  })

  it("a rejected submit renders an unconfirmed outcome, never silence", async () => {
    const submitApply = vi.fn(async () => { throw new TypeError("network down") })
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled submitApply={submitApply} lookupReceipt={async () => null} />)
    fireEvent.click(button())
    const out = await screen.findByRole("status")
    expect(out.textContent).toContain("could not be confirmed")
    expect(out.textContent).not.toContain("Nothing was written")
  })

  it("the modal's own hold outranks the flag and says why", () => {
    render(<LpIamApplyPanel review={measured} scope={scope} applyEnabled={false} holdReason="Execution authority is not ready." />)
    expect(button().disabled).toBe(true)
    expect(screen.getByRole("note").textContent).toBe("Execution authority is not ready.")
  })

  it.each([
    ["the captured UNKNOWN plan", captured, "No measured removal plan (UNKNOWN)"],
    ["no decision authority for this role", { ...measured, decision_authority: { state: "UNAVAILABLE", reason: "NOT_RESIDENT" } }, "No receipted decision authority for this role (NOT_RESIDENT)"],
    ["a MEASURED_EMPTY plan", { ...measured, server_plan: { ...measured.server_plan, issue_state: "MEASURED_EMPTY", actions: [] } }, "Nothing to remove"],
    ["an IDENTITY_UNAVAILABLE plan", { ...measured, server_plan: { ...measured.server_plan, issue_state: "IDENTITY_UNAVAILABLE" } }, "No measured removal plan (IDENTITY_UNAVAILABLE)"],
    ["a MEASURED plan that removes nothing", { ...measured, server_plan: { ...measured.server_plan, actions: [measured.server_plan.actions[1]] } }, "Nothing to remove in this plan"],
  ])("offers no Apply for %s", (_label, review, text) => {
    render(<LpIamApplyPanel review={review} scope={scope} applyEnabled />)
    expect(screen.queryByRole("button", { name: "Apply this plan" })).toBeNull()
    expect(screen.getByRole("status").textContent).toContain(text)
  })

  it("remounts (drops results) whenever role, generation, attempt or plan head change", () => {
    const base = lpIamApplyPanelKey(measured)
    const moved = (patch: (r: any) => void) => {
      const copy = JSON.parse(JSON.stringify(measured))
      patch(copy)
      return lpIamApplyPanelKey(copy)
    }
    expect(moved((r) => { r.decision_authority.receipt.projection_generation += 1 })).not.toBe(base)
    expect(moved((r) => { r.decision_authority.publication.attempt = "other" })).not.toBe(base)
    expect(moved((r) => { r.server_plan.role_id = "AROARECREATED" })).not.toBe(base)
    expect(moved((r) => { r.server_plan.plan_head = "other" })).not.toBe(base)
  })
})

describe("lpReviewIsForThisRole", () => {
  it("matches by role ARN when the modal has one, else by role name", () => {
    expect(lpReviewIsForThisRole(measured, "anything", measured.server_plan.role_arn)).toBe(true)
    expect(lpReviewIsForThisRole(measured, measured.role_name, "arn:aws:iam::111111111111:role/other")).toBe(false)
    expect(lpReviewIsForThisRole(measured, measured.role_name, null)).toBe(true)
    expect(lpReviewIsForThisRole(measured, "other-role", null)).toBe(false)
    expect(lpReviewIsForThisRole(null, measured.role_name, null)).toBe(false)
  })
})

describe("the mounted Permissions modal carries the caller", () => {
  function reply(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response
  }

  it("renders the held caller from the captured Review and makes no mutation request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/gap-analysis")) return reply(200, full.review_envelope)
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(
      <IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName="fixture-web-role"
        roleArn="arn:aws:iam::111111111111:role/fixture-web-role" systemName="fixture-webshop" applyDisabled />,
    )
    const panel = await screen.findByTestId("lp-iam-apply-panel")
    expect(panel.textContent).toContain("No measured removal plan (UNKNOWN)")    // the capture is UNKNOWN: no Apply
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0))
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.filter((url) => /least-privilege\/(apply|restore|resolve)|lp-lifecycle|\/receipt/.test(url))).toEqual([])
  })

  function modal(roleName: string) {
    return (
      <IAMPermissionAnalysisModal isOpen onClose={() => {}} roleName={roleName}
        roleArn={`arn:aws:iam::111111111111:role/${roleName}`} systemName="fixture-webshop" applyDisabled />
    )
  }

  it("a role switch drops the old Review's caller until the new Review arrives, and a refused read shows none", async () => {
    const measuredEnvelope = { ...full.review_envelope, result: measured }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/iam-roles/fixture-web-role/gap-analysis")) return reply(200, measuredEnvelope)
      if (url.includes("/gap-analysis")) return reply(503, { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } })
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    }))
    const view = render(modal("fixture-web-role"))
    await screen.findByRole("button", { name: "Apply this plan" })
    view.rerender(modal("fixture-other-role"))
    await waitFor(() => expect(document.body.textContent).toContain("This view is held on this deployment"))
    expect(screen.queryByTestId("lp-iam-apply-panel")).toBeNull()
  })

  it("while the next role's Review is still loading, the previous role's caller is gone", async () => {
    const measuredEnvelope = { ...full.review_envelope, result: measured }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/iam-roles/fixture-web-role/gap-analysis")) return reply(200, measuredEnvelope)
      if (url.includes("/gap-analysis")) return new Promise<Response>(() => {})          // never answers
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    }))
    const view = render(modal("fixture-web-role"))
    await screen.findByRole("button", { name: "Apply this plan" })
    view.rerender(modal("fixture-pending-role"))
    await waitFor(() => expect(screen.queryByTestId("lp-iam-apply-panel")).toBeNull())
  })

  it("a same-role re-read hides the old Review's caller until the new Review arrives", async () => {
    const measuredEnvelope = { ...full.review_envelope, result: measured }
    let reads = 0
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/gap-analysis")) {
        reads += 1
        return reads === 1 ? reply(200, measuredEnvelope) : new Promise<Response>(() => {})   // the re-read hangs
      }
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    }))
    render(modal("fixture-web-role"))
    await screen.findByRole("button", { name: "Apply this plan" })
    fireEvent.click(screen.getByTitle("Refresh data"))
    await waitFor(() => expect(screen.queryByTestId("lp-iam-apply-panel")).toBeNull())
    expect(reads).toBe(2)
  })

  it("A loaded, B and C pending, B resolves late: no caller is shown while C is open", async () => {
    let releaseB: (value: Response) => void = () => {}
    const b = new Promise<Response>((resolve) => { releaseB = resolve })
    const measuredEnvelope = { ...full.review_envelope, result: measured }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/iam-roles/fixture-web-role/gap-analysis")) return reply(200, measuredEnvelope)
      if (url.includes("/iam-roles/fixture-b-role/gap-analysis")) return b
      if (url.includes("/gap-analysis")) return new Promise<Response>(() => {})          // C never answers
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    }))
    const view = render(modal("fixture-web-role"))
    await screen.findByRole("button", { name: "Apply this plan" })
    view.rerender(modal("fixture-b-role"))
    view.rerender(modal("fixture-c-role"))
    await act(async () => { releaseB(reply(200, measuredEnvelope)) })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByTestId("lp-iam-apply-panel")).toBeNull()
    expect(screen.queryByRole("button", { name: "Apply this plan" })).toBeNull()
  })

  it("an out-of-order Review for the previous role never replaces the current role's caller", async () => {
    let releaseFirst: (value: Response) => void = () => {}
    const first = new Promise<Response>((resolve) => { releaseFirst = resolve })
    const measuredEnvelope = { ...full.review_envelope, result: measured }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/iam-roles/fixture-slow-role/gap-analysis")) return first
      if (url.includes("/gap-analysis")) return reply(200, full.review_envelope)      // current role: UNKNOWN plan
      if (url.includes("/simulate-fix")) return reply(200, full.preview)
      return reply(404, { detail: { code: "FIXTURE_UNROUTED" } })
    }))
    const view = render(modal("fixture-slow-role"))
    view.rerender(modal("fixture-web-role"))
    await screen.findByText(/No measured removal plan \(UNKNOWN\)/)
    await act(async () => { releaseFirst(reply(200, measuredEnvelope)) })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole("button", { name: "Apply this plan" })).toBeNull()
    expect(screen.getByTestId("lp-iam-apply-panel").textContent).toContain("No measured removal plan (UNKNOWN)")
  })
})

