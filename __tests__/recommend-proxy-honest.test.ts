/**
 * /api/proxy/cyntro/recommend passes the Review's own numbers or null, never a synthesized default.
 *
 * It used to default a missing total to 0 (`|| 0`), count resources as max(1, <a field the Review does not carry>) --
 * always 1 -- and derive a "per-resource" reduction from that. The REAL handler runs here over a Review body captured
 * from the real backend route (fixtures/per-resource-review-for-recommend.json).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import reviewCapture from "./fixtures/per-resource-review-for-recommend.json"

afterEach(() => { vi.unstubAllGlobals() })

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
  it("states the Review's own counts, and nulls what the Review does not carry", async () => {
    const { res, body } = await recommend(new Response(JSON.stringify(reviewCapture.review), { status: 200 }))
    expect(res.status).toBe(200)
    expect(body.original_permissions).toBe(reviewCapture.review.summary.total_permissions)
    expect(body.aggregated_used).toBe(reviewCapture.review.summary.used_count)
    expect(body.aggregated_risk_reduction).toBe(50)
    expect(body.resources_attached).toBeNull()          // the Review carries no resource count; it was always 1
    expect(body.cyntro_risk_reduction).toBeNull()       // not derivable from a role-level Review
    expect(body.hold_reason).toBeNull()
    expect(body.proposed_roles[0].permissions).toEqual(["s3:GetObject"])
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
