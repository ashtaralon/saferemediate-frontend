/**
 * Pending-tag decision proxies (lib/server/pending-tag-decision-proxy.ts).
 *
 *  - customer-resident: the ALB-signed x-amzn-oidc-data reaches the backend, which verifies it and
 *    attributes the decision to that person (and refuses one without it, by name);
 *  - the backend's status and body are relayed as they are (202 accepted, named refusals);
 *  - the capability and a request's status are read through, the pending id path-encoded.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { POST as approvePOST } from "@/app/api/proxy/auto-tagger/pending/approve/route"
import { POST as rejectPOST } from "@/app/api/proxy/auto-tagger/pending/reject/route"
import { GET as capabilityGET } from "@/app/api/proxy/auto-tagger/pending/decisions/capability/route"
import { GET as statusGET } from "@/app/api/proxy/auto-tagger/pending/decisions/[pendingId]/route"

const PENDING_ID = "pending_tag:3f1c0d6e9a8b7c6d5e4f3a2b1c0d9e8f"
const BODY = { pending_id: PENDING_ID, account_id: "111111111111", region: "global",
               resource_uid: "aws://aws/111111111111/global/iam/role/app", system_key: "payments", customer_id: "acme" }

function sentHeaders(upstream: { mock: { calls: unknown[][] } }, call = 0): Record<string, string> {
  return (upstream.mock.calls[call][1] as RequestInit).headers as Record<string, string>
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  vi.restoreAllMocks()
})

describe("pending-tag decision proxy", () => {
  it("forwards the ALB-signed operator header on a customer-resident install and relays the 202", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: true, request: { state: "queued", pending_id: PENDING_ID } }), {
        status: 202, headers: { "content-type": "application/json" },
      }),
    )
    const response = await approvePOST(new NextRequest("https://app.example/api/proxy/auto-tagger/pending/approve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-amzn-oidc-data": "  signed-alb-claims  ",
                 "x-amzn-oidc-identity": "spoofable", authorization: "Bearer not-forwarded" },
      body: JSON.stringify(BODY),
    }))
    expect(response.status).toBe(202)
    expect((await response.json()).request.state).toBe("queued")
    expect(String(upstream.mock.calls[0][0])).toBe("https://customer-backend.example/api/auto-tagger/pending/approve")
    const headers = sentHeaders(upstream)
    expect(headers["X-Amzn-Oidc-Data"]).toBe("signed-alb-claims")
    const names = Object.keys(headers).map((name) => name.toLowerCase())
    expect(names).not.toContain("x-amzn-oidc-identity")
    expect(names).not.toContain("authorization")
    expect(JSON.parse(String((upstream.mock.calls[0][1] as RequestInit).body))).toEqual(BODY)
  })

  it("relays a named refusal with its status", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, code: "PENDING_TAG_DECISIONS_NOT_AVAILABLE_HERE" }), {
        status: 503, headers: { "content-type": "application/json" },
      }),
    )
    const response = await rejectPOST(new NextRequest("https://app.example/api/proxy/auto-tagger/pending/reject", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(BODY),
    }))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe("PENDING_TAG_DECISIONS_NOT_AVAILABLE_HERE")
  })

  it("forwards no operator header outside a customer-resident install", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ success: true }))
    await approvePOST(new NextRequest("https://app.example/api/proxy/auto-tagger/pending/approve", {
      method: "POST", headers: { "content-type": "application/json", "x-amzn-oidc-data": "signed-alb-claims" },
      body: JSON.stringify(BODY),
    }))
    expect(Object.keys(sentHeaders(upstream)).map((name) => name.toLowerCase())).not.toContain("x-amzn-oidc-data")
  })

  it("reads the capability and a request's status through, the pending id encoded", async () => {
    const upstream = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ mode: "request", available: false, reason: "EXECUTOR_NOT_SEEN" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: "PENDING_TAG_DECISION_NOT_FOUND" }), {
        status: 404, headers: { "content-type": "application/json" } }))
    const capability = await capabilityGET()
    expect((await capability.json()).reason).toBe("EXECUTOR_NOT_SEEN")
    const status = await statusGET(new NextRequest("https://app.example/x"), { params: Promise.resolve({ pendingId: PENDING_ID }) })
    expect(status.status).toBe(404)
    expect(String(upstream.mock.calls[0][0])).toBe("https://customer-backend.example/api/auto-tagger/pending/decisions/capability")
    expect(String(upstream.mock.calls[1][0])).toBe(
      `https://customer-backend.example/api/auto-tagger/pending/decisions/${encodeURIComponent(PENDING_ID)}`)
  })

  it("answers a named 502 when the backend cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
    const response = await capabilityGET()
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe("PENDING_TAG_DECISION_PROXY_UNAVAILABLE")
  })
})
