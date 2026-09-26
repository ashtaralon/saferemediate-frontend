/**
 * LP Apply `decision_binding` (backend `unified/lp/decision_authority.py::apply_decision_admission`, step 2).
 *
 * The Apply names the receipted activation the operator planned against: the Review's decision authority
 * generation, receipt hash and publication attempt, for exactly the planned role, copied verbatim. Anything else
 * sends no binding and the backend refuses by name. Apply itself stays held -- this is the source contract only.
 *
 * The Review body is the one captured from the backend's mounted routes (fixture `_source`), not hand-written.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import full from "./fixtures/lp-review-preview-install-chain.json"
import { decisionBindingOf } from "@/lib/lp-decision-authority"
import { LP_MUTATION_APPLY_ENABLED, submitHeldLpApply } from "@/lib/lp-held-mutation"

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

describe("the LP tab's Apply carries the binding and stays held", () => {
  const tab = readFileSync(join(process.cwd(), "components/LeastPrivilegeTab.tsx"), "utf8")

  it("binds the Review's own authority to the Review's own role and sends it with both Apply bodies", () => {
    expect(tab).toContain("decisionBindingOf(data?.decision_authority, {")
    expect(tab).toContain("roleArn: data?.server_plan?.role_arn,")
    expect(tab).toContain("roleId: data?.server_plan?.role_id,")
    expect(tab.split("decision_binding: selectedResource.serverPlan?.decisionBinding ?? undefined").length - 1).toBe(2)
  })

  it("keeps Apply held: the flag is off and a held Apply never reaches the network", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(LP_MUTATION_APPLY_ENABLED).toBe(false)
    const held = await submitHeldLpApply({ plan_head: "p", decision_binding: decisionBindingOf(block, role) })
    expect(held).toEqual({ ok: false, status: 503, code: "APPLY_HELD", cloud_writes: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
