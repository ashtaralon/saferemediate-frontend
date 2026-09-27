/**
 * /api/proxy/cyntro/recommend passes the Review's own numbers or null, never a synthesized default.
 *
 * It used to default a missing total to 0 (`|| 0`), count resources as max(1, <a field the Review does not carry>) --
 * always 1 -- and derive a "per-resource" reduction from that. The REAL handler runs here over a Review body captured
 * from the real backend route (fixtures/per-resource-review-for-recommend.json).
 *
 * A count is not a removal authority. The proxy used to propose a frontend-authored `Resource: "*"` policy whenever
 * `summary.used_count` was a number. It now proposes only when the Review's server_plan is MEASURED (measuredIamPlan,
 * the parser LP Apply uses) AND its receipted decision authority is DECISION_GRADE and clears every planned removal;
 * otherwise it holds by name with the backend's own plan state and authority state/reason.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import reviewCapture from "./fixtures/per-resource-review-for-recommend.json"
import installChain from "./fixtures/lp-review-preview-install-chain.json"

afterEach(() => { vi.unstubAllGlobals() })

const hasWildcardResource = (body: unknown) => JSON.stringify(body).includes('"Resource":"*"')

async function recommend(backend: Response) {
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return backend }))
  const { POST } = await import("@/app/api/proxy/cyntro/recommend/route")
  const res = await POST(new NextRequest("http://localhost/api/proxy/cyntro/recommend", {
    method: "POST", body: JSON.stringify({ role_name: reviewCapture.review.role_name, days: 90 }),
  }))
  return { res, calls, body: await res.json() }
}

describe("recommend proxy", () => {
  it("states the Review's own counts, and a numeric used count with no measured plan proposes nothing", async () => {
    // The capture: used_count is a number, but server_plan is UNKNOWN and decision_authority UNAVAILABLE.
    expect(reviewCapture.review.server_plan.issue_state).toBe("UNKNOWN")
    const { res, body } = await recommend(new Response(JSON.stringify(reviewCapture.review), { status: 200 }))
    expect(res.status).toBe(200)
    expect(body.original_permissions).toBe(reviewCapture.review.summary.total_permissions)
    expect(body.measured_used_count).toBe(reviewCapture.review.summary.used_count)
    expect(body.resources_attached).toBeNull()          // the Review carries no resource count; it was always 1
    expect(body.cyntro_risk_reduction).toBeNull()       // not derivable from a role-level Review
    expect(body.hold_reason).toBe("SERVER_PLAN_NOT_MEASURED")
    expect(body.plan_issue_state).toBe("UNKNOWN")
    expect(body.decision_authority).toEqual({
      state: "UNAVAILABLE", reason: "DEPLOYMENT_NOT_CUSTOMER_RESIDENT", authority: "NOT_DECISION_GRADE" })
    for (const field of ["aggregated_used", "aggregated_risk_reduction", "total_new_permissions"]) {
      expect(body[field]).toBeNull()
    }
    expect(body.proposed_roles).toEqual([])
    expect(body.policies).toEqual({})
    expect(body.unused_permissions).toEqual([])
    expect(hasWildcardResource(body)).toBe(false)
  })

  it("an answer without the counts is null and proposes nothing, never zero", async () => {
    // The captured Review with its summary counts removed: an answer that does not carry them.
    const review = JSON.parse(JSON.stringify(reviewCapture.review))
    delete review.summary.total_permissions
    delete review.summary.used_count
    const { res, body } = await recommend(new Response(JSON.stringify(review), { status: 200 }))
    expect(res.status).toBe(200)
    for (const field of ["original_permissions", "aggregated_used", "aggregated_risk_reduction", "total_new_permissions"]) {
      expect(body[field]).toBeNull()
    }
    expect(body.hold_reason).toBe("USAGE_NOT_MEASURED")
    expect(body.proposed_roles).toEqual([])
    expect(body.policies).toEqual({})
    expect(body.summary.permissions_to_remove).toBeNull()
    expect(body.summary.high_risk_removed).toBeNull()
  })

  it("a Review refusal passes through with its own status and body", async () => {
    const refusal = { detail: { code: "REVIEW_SCOPE_UNAVAILABLE", message: "not configured" } }
    const { res, body, calls } = await recommend(new Response(JSON.stringify(refusal), { status: 503 }))
    expect(res.status).toBe(503)
    expect(body).toEqual(refusal)
    expect(calls).toHaveLength(1)
  })
})

describe("recommend proxy: removal authority is the receipted decision authority, never a count", () => {
  // The install-chain capture: used_count 4 of 12, a DECISION_GRADE ACTIVE_POPULATED authority with a receipt that
  // clears NOTHING (4 in use, 8 indeterminate LAYER_UNKNOWN), and an UNKNOWN server_plan.
  const review = installChain.review_envelope.result as Record<string, any>
  const rows = review.permissions_analysis as Array<{ permission: string; status: string }>
  const removals = rows.filter((r) => r.status === "UNUSED").map((r) => r.permission)
  const keeps = rows.filter((r) => r.status === "USED").map((r) => r.permission)
  // Labelled test input, the lp-decision-binding.test.ts convention: the captured plan as a MEASURED plan for the SAME
  // role would read (backend server_plan row shape). No MEASURED plan has been captured yet.
  const measured = {
    ...review.server_plan,
    issue_state: "MEASURED",
    plan_head: "fixture-plan-head",
    actions: rows.map((r) => ({
      permission: r.permission, configured: true, coverage: "OBSERVED", observed_use_count: r.status === "USED" ? 3 : 0,
      effect: r.status === "USED" ? "keep" : "remove",
    })),
  }
  const authority = review.decision_authority as Record<string, any>
  // Labelled test input: the captured authority as it would read had it cleared every planned removal.
  const clearing: Record<string, any> = { ...authority, removal: { ...authority.removal, cleared: removals, indeterminate: [] } }
  const answer = (patch: Record<string, unknown>) =>
    recommend(new Response(JSON.stringify({ ...review, ...patch }), { status: 200 }))

  it("the captured Review (count 4 of 12, plan UNKNOWN) proposes nothing", async () => {
    expect(review.summary.used_count).toBe(4)
    expect(authority.removal.cleared).toEqual([])
    const { body } = await answer({})
    expect(body.hold_reason).toBe("SERVER_PLAN_NOT_MEASURED")
    expect(body.proposed_roles).toEqual([])
    expect(hasWildcardResource(body)).toBe(false)
  })

  it("a measured plan the decision authority does not clear proposes nothing", async () => {
    const { body } = await answer({ server_plan: measured })
    expect(body.hold_reason).toBe("DECISION_AUTHORITY_NOT_CLEARED")
    expect(body.decision_authority).toEqual({ state: "ACTIVE_POPULATED", reason: null, authority: "DECISION_GRADE" })
    expect(body.proposed_roles).toEqual([])
    expect(body.unused_permissions).toEqual([])
    expect(body.summary.permissions_to_remove).toBeNull()
  })

  it.each([
    ["not decision grade", { ...clearing, authority: "NOT_DECISION_GRADE" }],
    ["no receipt", { ...clearing, receipt: null }],
    ["one planned removal not cleared", { ...clearing, removal: { ...clearing.removal, cleared: removals.slice(1) } }],
    ["no authority reported", undefined],
    // The Review assembles server_plan.role_arn from the Review body and the authority from review_scope
    // (api/iam_gap_analysis.py _attach_measured_plan / _attach_decision_authority): the proxy binds them itself.
    ["another role's ARN", { ...clearing, role: { ...clearing.role, role_arn: "arn:aws:iam::111111111111:role/other" } }],
    ["a recreated role (other RoleId)", { ...clearing, role: { ...clearing.role, role_id: "AROARECREATED" } }],
    ["no role named", { ...clearing, role: undefined }],
  ])("an authority with %s proposes nothing", async (_label, block) => {
    const { body } = await answer({ server_plan: measured, decision_authority: block })
    expect(body.hold_reason).toBe("DECISION_AUTHORITY_NOT_CLEARED")
    expect(body.proposed_roles).toEqual([])
  })

  it("a MEASURED plan whose every removal is cleared proposes the plan's keep set, and no policy document", async () => {
    const { body } = await answer({ server_plan: measured, decision_authority: clearing })
    expect(body.hold_reason).toBeNull()
    expect(body.proposed_roles).toHaveLength(1)
    expect(body.proposed_roles[0].permissions).toEqual(keeps)
    expect(body.proposed_roles[0].resource_id).toBe(review.server_plan.role_arn)
    expect(body.unused_permissions.map((p: { permission: string }) => p.permission)).toEqual(removals)
    expect(body.aggregated_used).toBe(keeps.length)
    expect(body.aggregated_risk_reduction).toBe(Math.round((removals.length / rows.length) * 100))
    expect(body.summary.high_risk_removed).toBe(0)     // iam:PassRole is CRITICAL, not HIGH; no removal is HIGH
    expect(body.policies).toEqual({})
    expect(hasWildcardResource(body)).toBe(false)
  })

  it("a measured-empty plan proposes nothing", async () => {
    const { body } = await answer({ server_plan: { ...measured, issue_state: "MEASURED_EMPTY", actions: [] },
      decision_authority: clearing })
    expect(body.hold_reason).toBe("SERVER_PLAN_NOT_MEASURED")
    expect(body.plan_issue_state).toBe("MEASURED_EMPTY")
  })
})
