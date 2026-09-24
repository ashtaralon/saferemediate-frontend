import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "@/app/api/proxy/iam-roles/[roleName]/gap-analysis/route"

const TOKEN = "fixture-service-token-0123456789abcdef"
const ROLE = "cyntro-tb-prod-web-role"

function request(headers: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost/api/proxy/iam-roles/${ROLE}/gap-analysis?days=365`,
    { headers },
  )
}

function call(incoming = request()) {
  return GET(incoming, { params: Promise.resolve({ roleName: ROLE }) })
}

function backend(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response
}

afterEach(() => {
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("clicked IAM gap-analysis proxy", () => {
  it("refuses locally when the service token is absent and does not call the backend", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error_code).toBe("DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED")
    expect(body.origin).toBe("proxy")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the service token and keeps a backend 401", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn(async () => backend(401, { detail: "service authentication required" }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await call()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ detail: "service authentication required" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`http://backend.test/api/iam-roles/${ROLE}/gap-analysis?days=365`)
    expect((init.headers as Record<string, string>)["X-Cyntro-Service-Token"]).toBe(TOKEN)
  })

  it("ignores a browser-supplied service token and does not return the server token", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn(async () => backend(200, { summary: { used_count: 6, unused_count: 4 } }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await call(request({ "x-cyntro-service-token": "browser-supplied-token" }))
    const text = JSON.stringify(await res.json())

    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain("browser-supplied-token")
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)["X-Cyntro-Service-Token"]).toBe(TOKEN)
  })

  it("keeps a backend 503 instead of collapsing it to 502", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const fetchMock = vi.fn(async () => backend(503, {
      detail: { code: "REVIEW_RUNTIME_UNAVAILABLE", message: "Permission detail is not served." },
    }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.detail.code).toBe("REVIEW_RUNTIME_UNAVAILABLE")
  })

  it("passes a populated review and a measured-empty review through unchanged", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const populated = { summary: { used_count: 6, unused_count: 4, data_confidence: "OBSERVED" } }
    const empty = { summary: { used_count: 0, unused_count: 0, data_confidence: "OBSERVED" } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(backend(200, populated))
      .mockResolvedValueOnce(backend(200, empty))
    vi.stubGlobal("fetch", fetchMock)

    expect(await (await call()).json()).toEqual(populated)
    expect(await (await call()).json()).toEqual(empty)
  })

  it("passes an unmeasured review through with null counts", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const unknown = { summary: { used_count: null, unused_count: null, data_confidence: "UNKNOWN" } }
    vi.stubGlobal("fetch", vi.fn(async () => backend(200, unknown)))

    expect(await (await call()).json()).toEqual(unknown)
  })

  it("prefers ALB OIDC over the service token and keeps two-customer refusals distinct", async () => {
    process.env.CYNTRO_SERVICE_TOKEN = TOKEN
    process.env.BACKEND_URL_OVERRIDE = "http://backend.test"
    const oidc = "eyJhbGciOiJSUzI1NiJ9.e30.sig"
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(backend(403, { detail: { code: "REVIEW_SCOPE_MISMATCH", customer: "other-shop" } }))
      .mockResolvedValueOnce(backend(503, { detail: { code: "ANALYST_RUNTIME_UNAVAILABLE" } }))
      .mockResolvedValueOnce(backend(401, { detail: { code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE" } }))
      .mockResolvedValueOnce(backend(200, { summary: { used_count: 2, unused_count: 1, tenant: "fixture-webshop" } }))
      .mockResolvedValueOnce(backend(200, { summary: { used_count: 0, unused_count: 0, tenant: "fixture-webshop", data_confidence: "OBSERVED" } }))
    vi.stubGlobal("fetch", fetchMock)

    const foreign = await call(request({ "x-amzn-oidc-data": oidc }))
    expect(foreign.status).toBe(403)
    expect((await foreign.json()).detail.code).toBe("REVIEW_SCOPE_MISMATCH")

    const analystDown = await call(request({ "x-amzn-oidc-data": oidc }))
    expect(analystDown.status).toBe(503)
    expect((await analystDown.json()).detail.code).toBe("ANALYST_RUNTIME_UNAVAILABLE")

    const badPrincipal = await call(request({ "x-amzn-oidc-data": oidc }))
    expect(badPrincipal.status).toBe(401)
    expect((await badPrincipal.json()).detail.code).toBe("DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE")

    const populated = await call(request({ "x-amzn-oidc-data": oidc }))
    const empty = await call(request({ "x-amzn-oidc-data": oidc }))
    expect(await populated.json()).toEqual({ summary: { used_count: 2, unused_count: 1, tenant: "fixture-webshop" } })
    expect(await empty.json()).toEqual({ summary: { used_count: 0, unused_count: 0, tenant: "fixture-webshop", data_confidence: "OBSERVED" } })

    for (const callArgs of fetchMock.mock.calls) {
      const init = callArgs[1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers["X-Amzn-Oidc-Data"]).toBe(oidc)
      expect(headers["X-Cyntro-Service-Token"]).toBeUndefined()
    }
  })
})
