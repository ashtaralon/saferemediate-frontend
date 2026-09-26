/**
 * LP Apply `decision_binding` (backend `unified/lp/decision_authority.py::apply_decision_admission`, step 2).
 *
 * The Apply names the receipted activation the operator planned against: the Review's decision authority
 * generation, receipt hash and publication attempt, for exactly the planned role, copied verbatim. Anything else
 * builds no Apply body. Apply itself stays held -- this is the source contract only. No IAM-role surface issues an Apply
 * yet (IAM roles route to IAMPermissionAnalysisModal, which has no Apply control); that caller must use lpApplyBody.
 *
 * The Review body is the one captured from the backend's mounted routes (fixture `_source`), not hand-written.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import full from "./fixtures/lp-review-preview-install-chain.json"
import { decisionBindingOf } from "@/lib/lp-decision-authority"
import { LP_MUTATION_APPLY_ENABLED, lpApplyBody, submitHeldLpApply } from "@/lib/lp-held-mutation"

const review = full.review_envelope.result as Record<string, any>
const role = { roleArn: review.server_plan.role_arn as string, roleId: review.server_plan.role_id as string }
const block = review.decision_authority as Record<string, any>

afterEach(() => vi.unstubAllGlobals())

describe("decisionBindingOf", () => {
  it("copies the captured Review's receipted activation for the planned role, verbatim", () => {
    expect(block.state).toBe("ACTIVE_POPULATED")
    expect(decisionBindingOf(block, role)).toEqual({
      projection_generation: block.receipt.projection_generation,
      projection_receipt_hash: block.receipt.projection_receipt_hash,
      publication_attempt: block.publication.attempt,
    })
  })

  it.each([
    ["an unavailable authority", { ...block, state: "UNAVAILABLE" }, role],
    ["no authority at all", undefined, role],
    ["another role's authority", block, { ...role, roleArn: "arn:aws:iam::111111111111:role/other" }],
    ["a recreated role (other RoleId)", block, { ...role, roleId: "AROARECREATED" }],
    ["a plan with no RoleId", block, { ...role, roleId: "" }],
    ["no publication attempt", { ...block, publication: { ...block.publication, attempt: null } }, role],
    ["an empty receipt hash", { ...block, receipt: { ...block.receipt, projection_receipt_hash: "" } }, role],
    ["a non-integer generation", { ...block, receipt: { ...block.receipt, projection_generation: 7.5 } }, role],
    ["a generation sent as text", { ...block, receipt: { ...block.receipt, projection_generation: "7" } }, role],
  ])("sends no binding for %s", (_label, raw, planned) => {
    expect(decisionBindingOf(raw, planned)).toBeNull()
  })
})

describe("lpApplyBody: the one Apply-body builder", () => {
  // The captured plan as a MEASURED plan for the SAME role would read (labelled test input: the capture itself is
  // UNKNOWN, which is the refusal case below). Actions use the backend server_plan row shape.
  const measured = {
    ...review.server_plan,
    issue_state: "MEASURED",
    plan_head: "fixture-plan-head",
    actions: [{ permission: "s3:DeleteObject", configured: true, coverage: "OBSERVED", observed_use_count: 0, effect: "remove" }],
  }

  it("builds the admitted body with the Review's binding for exactly that role", () => {
    const body = lpApplyBody({ server_plan: measured, decision_authority: block })
    expect(body).toEqual({
      role_arn: role.roleArn,
      role_id: role.roleId,
      plan_head: "fixture-plan-head",
      resource_family: "iam-role",
      actions: measured.actions,
      decision_binding: decisionBindingOf(block, role),
    })
    expect(JSON.parse(JSON.stringify(body)).decision_binding.projection_generation).toBe(block.receipt.projection_generation)
  })

  it.each([
    ["the captured UNKNOWN plan", { server_plan: review.server_plan, decision_authority: block }],
    ["no authority", { server_plan: measured }],
    ["an unavailable authority", { server_plan: measured, decision_authority: { ...block, state: "UNAVAILABLE" } }],
    ["another role's authority", { server_plan: measured, decision_authority: { ...block, role: { ...block.role, role_id: "AROAOTHER" } } }],
    ["no review", undefined],
  ])("builds no Apply from %s", (_label, input) => {
    expect(lpApplyBody(input)).toBeUndefined()
  })

  it("keeps Apply held: the flag is off and a built body never reaches the network", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(LP_MUTATION_APPLY_ENABLED).toBe(false)
    const held = await submitHeldLpApply(lpApplyBody({ server_plan: measured, decision_authority: block })!)
    expect(held).toEqual({ ok: false, status: 503, code: "APPLY_HELD", cloud_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
