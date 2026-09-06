import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://customer-backend.example",
}))

import { GET, POST } from "@/app/api/proxy/analyst/query/route"

const OIDC_HEADERS = {
  "content-type": "application/json",
  "x-amzn-oidc-identity": "user-123",
  "x-amzn-oidc-data": "signed-alb-claims",
}

function enableCustomerScope() {
  process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
  process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
}

function post(body: unknown, headers: Record<string, string> = OIDC_HEADERS) {
  return new NextRequest("https://app.example/api/proxy/analyst/query", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS
  vi.restoreAllMocks()
})

describe("Analyst customer-resident BFF", () => {
  it("fails closed in the hosted deployment without contacting a backend", async () => {
    process.env.CYNTRO_ANALYST_ALLOWED_SYSTEMS = "payments"
    const upstream = vi.spyOn(globalThis, "fetch")

    const response = await POST(post({ question: "count crown jewels", systemName: "payments" }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      reason_code: "ANALYST_DEPLOYMENT_MODE_UNSUPPORTED",
    })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("requires the ALB authenticated headers", async () => {
    enableCustomerScope()
    const upstream = vi.spyOn(globalThis, "fetch")

    const response = await POST(
      post(
        { question: "count crown jewels", systemName: "payments" },
        { "content-type": "application/json" },
      ),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      reason_code: "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE",
    })
    expect(upstream).not.toHaveBeenCalled()
  })

  it("proxies capability only after backend identity, scope, and runtime readiness", async () => {
    enableCustomerScope()
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        enabled: true,
        status: "ready",
        systemName: "payments",
        release_fingerprint: "release-1",
      }),
    )
    const request = new NextRequest(
      "https://app.example/api/proxy/analyst/query?systemName=payments",
      { headers: OIDC_HEADERS },
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      enabled: true,
      status: "ready",
      systemName: "payments",
      release_fingerprint: "release-1",
    })
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://customer-backend.example/api/analyst/capability?systemName=payments",
    )
    const headers = new Headers(upstream.mock.calls[0][1]?.headers)
    expect(headers.get("x-amzn-oidc-data")).toBe("signed-alb-claims")
    expect(headers.has("x-amzn-oidc-identity")).toBe(false)
  })

  it("strips caller trust fields and sends only the closed Analyst request", async () => {
    enableCustomerScope()
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        schema_version: "analyst-response/v1",
        request_id: "request-1",
        status: "answered",
        effective_scope: { system_id: "payments" },
        operation: "crown_jewels.count",
        claims: [{ claim_id: "claim-1" }],
        deterministic_answer: "There are 2 crown jewels in payments.",
        release_fingerprint: "release-1",
      }),
    )

    const response = await POST(
      post({
        question: "  how many crown jewels?  ",
        systemName: "payments",
        locale: "en-US",
        timezone: "Asia/Jerusalem",
        principal: "admin",
        roles: ["*"],
        effective_scope: { system_id: "other" },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ status: "answered" })
    const call = upstream.mock.calls[0]
    expect(call[0]).toBe("https://customer-backend.example/api/analyst/query")
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      question: "how many crown jewels?",
      systemName: "payments",
      locale: "en-US",
      timezone: "Asia/Jerusalem",
    })
    const headers = new Headers(call[1]?.headers)
    expect(headers.get("x-amzn-oidc-data")).toBe("signed-alb-claims")
    expect(headers.has("x-amzn-oidc-identity")).toBe(false)
  })

  it("rejects a backend answer outside the immutable UI scope", async () => {
    enableCustomerScope()
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "answered",
        effective_scope: { system_id: "other-system" },
        deterministic_answer: "There are 99 crown jewels.",
      }),
    )

    const response = await POST(post({ question: "count crown jewels", systemName: "payments" }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason_code: "ANALYST_SCOPE_CONFLICT",
    })
  })

  it.each(["abstain", "clarify", "unavailable"])(
    "preserves the safe %s state without manufacturing an answer",
    async (status) => {
      enableCustomerScope()
      const payload = {
        status,
        effective_scope: { system_id: "payments" },
        reason_code: status === "clarify" ? undefined : `ANALYST_${status.toUpperCase()}`,
        clarification: status === "clarify" ? "Which severity?" : undefined,
        release_fingerprint: "release-1",
      }
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        Response.json(payload, { status: status === "unavailable" ? 503 : 200 }),
      )

      const response = await POST(post({ question: "tell me things", systemName: "payments" }))
      const result = await response.json()

      expect(response.status).toBe(status === "unavailable" ? 503 : 200)
      expect(result.status).toBe(status)
      expect(result.deterministic_answer).toBeUndefined()
    },
  )
})
