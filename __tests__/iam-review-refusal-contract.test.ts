/**
 * One refusal contract, three surfaces.
 *
 * The modal, the Permissions tab and its Rules panel each used to lose the
 * backend's refusal differently: "Request failed (502)", a silent null, and
 * "Failed to load IAM data: 503". They now share `lib/iam-review-refusal.ts`,
 * so this asserts that module's behaviour on the three cases that actually
 * reach it -- a permanent refusal, a retryable one, and a code it has never
 * seen -- plus the two bodies that carry no refusal at all.
 *
 * The permanent case is composed rather than hand-built: the body goes through
 * the REAL proxy route, and the route's own Response is what the parser reads.
 * The typed 503 is the producer's literal (api/iam_gap_analysis.py:1177-1189),
 * not a shape invented here.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { GET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"
import {
  MAX_REFUSAL_FIELD_CHARS,
  REVIEW_REFUSALS,
  ReviewRefusalError,
  readReviewRefusal,
  reviewRefusalLine,
} from "@/lib/iam-review-refusal"

const ROLE = "cyntro-tb-prod-web-role"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.CYNTRO_DEPLOYMENT_MODE
})

/** The proxy's own error envelope, produced by running the real route. */
async function throughTheRealProxy(status: number, detail: unknown): Promise<Response> {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status,
    text: async () => JSON.stringify({ detail }),
    json: async () => ({ detail }),
  })))
  const res = await GET(
    new NextRequest(`https://app.example/api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`, {
      headers: { "x-amzn-oidc-identity": "operator-1", "x-amzn-oidc-data": "signed" },
    }),
    { params: Promise.resolve({ roleName: ROLE }) },
  )
  return res as unknown as Response
}

function plainResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })
}

describe("IAM Review refusal contract", () => {
  it("names a PERMANENT refusal and says retrying cannot help", async () => {
    // The reproduced defect's own chain, composed through the real route.
    const res = await throughTheRealProxy(503, {
      code: "REVIEW_RUNTIME_UNAVAILABLE",
      upstream_code: "DECISION_RUNTIME_DISABLED",
      message: "Permission detail is not served by this deployment's Decision runtime.",
      request_id: "req-123",
      diagnostics: { route_prepare_ms: 3 },
    })
    expect(res.status).toBe(503)

    const refusal = await readReviewRefusal(res)
    expect(refusal).not.toBeNull()
    expect(refusal!.status).toBe(503)
    expect(refusal!.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    expect(refusal!.upstream_code).toBe("DECISION_RUNTIME_DISABLED")
    expect(refusal!.retryable).toBe(false)
    expect(refusal!.title).toBe(REVIEW_REFUSALS.REVIEW_RUNTIME_UNAVAILABLE.title)

    const line = reviewRefusalLine(refusal!)
    expect(line).toContain("REVIEW_RUNTIME_UNAVAILABLE")
    expect(line).toContain("DECISION_RUNTIME_DISABLED")
    expect(line).toContain("HTTP 503")
    expect(line).toContain("Retrying will not change this.")
    // The status is never collapsed and never dropped for a bare number.
    expect(line).not.toBe("Failed to load IAM data: 503")
  })

  it("names a RETRYABLE refusal and says trying again is worth it", async () => {
    const res = plainResponse(503, {
      detail: { code: "REVIEW_TENANT_NOT_SERVING", message: "mid-lifecycle" },
    })
    const refusal = await readReviewRefusal(res)
    expect(refusal!.retryable).toBe(true)
    expect(refusal!.title).toBe(REVIEW_REFUSALS.REVIEW_TENANT_NOT_SERVING.title)
    expect(reviewRefusalLine(refusal!)).toContain("You can try again.")
  })

  it("keeps an UNKNOWN code honest instead of dressing it up", async () => {
    const res = plainResponse(500, {
      detail: { code: "REVIEW_SOMETHING_WE_HAVE_NOT_SEEN", message: "the producer's own words" },
    })
    const refusal = await readReviewRefusal(res)
    expect(refusal!.code).toBe("REVIEW_SOMETHING_WE_HAVE_NOT_SEEN")
    // Not in the table: no invented title, and retry stays on offer because we
    // do not know that it cannot help.
    expect(refusal!.retryable).toBe(true)
    expect(refusal!.guidance).toBe("the producer's own words")
    expect(Object.keys(REVIEW_REFUSALS)).not.toContain("REVIEW_SOMETHING_WE_HAVE_NOT_SEEN")
  })

  it("reads nothing from a body that carries no code, and nothing from non-JSON", async () => {
    expect(await readReviewRefusal(plainResponse(500, { detail: { message: "no code here" } }))).toBeNull()
    expect(await readReviewRefusal(plainResponse(500, { error: "flat" }))).toBeNull()
    expect(await readReviewRefusal(
      new Response("<html>gateway</html>", { status: 502 }),
    )).toBeNull()
  })

  it("takes only the allowlisted fields, each clipped", async () => {
    const res = plainResponse(503, {
      detail: {
        code: "REVIEW_RUNTIME_UNAVAILABLE",
        message: "m".repeat(5_000),
        request_id: "req-9f2",
        diagnostics: { a: 1 },
        secret: "must not travel",
      },
    })
    const refusal = await readReviewRefusal(res)
    expect(refusal!.message).toHaveLength(MAX_REFUSAL_FIELD_CHARS)
    expect(Object.keys(refusal!).sort()).toEqual(
      ["code", "guidance", "message", "retryable", "status", "title"],
    )
    expect(JSON.stringify(refusal)).not.toContain("must not travel")
    expect(JSON.stringify(refusal)).not.toContain("req-9f2")
  })

  it("raises a refusal so a caller cannot mistake it for absent data", async () => {
    const refusal = await readReviewRefusal(
      plainResponse(503, { detail: { code: "REVIEW_RUNTIME_UNAVAILABLE" } }),
    )
    const err = new ReviewRefusalError(503, refusal)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(503)
    expect(err.refusal!.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
    expect(err.message).toContain("REVIEW_RUNTIME_UNAVAILABLE")

    // An untyped failure still raises, rather than returning null data.
    const untyped = new ReviewRefusalError(500, null)
    expect(untyped.refusal).toBeNull()
    expect(untyped.message).toContain("HTTP 500")
  })
})
