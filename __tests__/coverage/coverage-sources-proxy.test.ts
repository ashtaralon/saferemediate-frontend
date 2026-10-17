/**
 * /api/proxy/coverage/sources → backend /api/coverage/sources.
 * Same identity rule as the account-admin proxy: on a customer-resident
 * install only the ALB-signed x-amzn-oidc-data is forwarded.
 */
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/backend-url", () => ({ getBackendBaseUrl: () => "https://backend.test" }))

import { GET } from "@/app/api/proxy/coverage/sources/route"

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>
}

describe("coverage sources proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("forwards account_id and relays a NOT_RECORDED 200 unchanged", async () => {
    const body = { tenant_id: "tenant-a", generated_at: null, read_model_generation: null, status: "NOT_RECORDED", accounts: [] }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body))

    const response = await GET(new NextRequest("https://app.test/api/proxy/coverage/sources?account_id=444455556666"))

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://backend.test/api/coverage/sources?account_id=444455556666")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET", cache: "no-store" })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual(body)
  })

  it("forwards the ALB-signed operator header on a customer-resident install, and nothing else", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ status: "NOT_RECORDED", accounts: [] }))

    await GET(new NextRequest("https://app.test/api/proxy/coverage/sources", {
      headers: { "x-amzn-oidc-data": "signed.jwt.value", cookie: "cyntro_operator_session=ignored" },
    }))

    const headers = headersOf(fetchMock.mock.calls[0]?.[1])
    expect(headers["X-Amzn-Oidc-Data"]).toBe("signed.jwt.value")
    expect(headers.Authorization).toBeUndefined()
  })

  it("does not forward the ALB header outside customer-resident mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ status: "NOT_RECORDED", accounts: [] }))

    await GET(new NextRequest("https://app.test/api/proxy/coverage/sources", {
      headers: { "x-amzn-oidc-data": "signed.jwt.value" },
    }))

    expect(headersOf(fetchMock.mock.calls[0]?.[1])["X-Amzn-Oidc-Data"]).toBeUndefined()
  })

  it("relays a backend failure with its status and body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "coverage read model unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const response = await GET(new NextRequest("https://app.test/api/proxy/coverage/sources"))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ detail: "coverage read model unavailable" })
  })

  it("answers an unreachable backend with an honest 502 envelope, never an empty record", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"))

    const response = await GET(new NextRequest("https://app.test/api/proxy/coverage/sources"))
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload).toEqual({ error: "coverage_proxy_unavailable", detail: "connect ECONNREFUSED" })
    expect(payload).not.toHaveProperty("accounts")
  })
})
