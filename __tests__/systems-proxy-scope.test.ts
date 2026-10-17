import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

describe("systems proxy tenant scope", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("forwards customer, account, and region scope to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      systems: [],
      timestamp: "2026-08-21T00:00:00Z",
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const { GET } = await import("@/app/api/proxy/systems/route")
    const response = await GET(new NextRequest(
      "https://cyntro.example/api/proxy/systems?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    ))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example/api/systems?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
      expect.any(Object),
    )
  })
})

// SW-S1A-20261015-84: on a customer-resident install the backend admits the PERSON behind each Systems read, so this
// proxy forwards the ALB's identity (the real accountAdminIdentityHeaders), never serves or keeps its in-memory list,
// and marks every answer private, no-store. Outside resident mode nothing changes.
describe("systems proxy person admission (resident)", () => {
  const SCOPE = "https://cyntro.example/api/proxy/systems?customer_id=acme&region=eu-west-1"
  const ALB = { "x-amzn-oidc-accesstoken": "alb-access-token", "x-amzn-oidc-data": "alb-signed-claims" }
  const list = (names: string[]) => new Response(JSON.stringify({
    systems: names.map((name) => ({ name, SystemName: name })), count: names.length, timestamp: "2026-10-15T00:00:00Z",
  }), { status: 200, headers: { "content-type": "application/json" } })
  const refusal = (status: number, code: string) => new Response(JSON.stringify({ detail: { code } }),
    { status, headers: { "content-type": "application/json" } })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()            // a fresh in-memory cache per test
  })

  async function get(headers: Record<string, string> = ALB) {
    const { GET } = await import("@/app/api/proxy/systems/route")
    return GET(new NextRequest(SCOPE, { headers }))
  }

  it("forwards the ALB's identity, asks the backend uncached, and answers private, no-store", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    const fetchMock = vi.fn().mockResolvedValue(list(["payments"]))
    vi.stubGlobal("fetch", fetchMock)

    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-cache")).toBe("BYPASS-PERSON")
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toMatchObject({ Authorization: "Bearer alb-access-token", "X-Amzn-Oidc-Data": "alb-signed-claims" })
    expect(init.cache).toBe("no-store")
    expect((await response.json()).systems.map((s: { name: string }) => s.name)).toEqual(["payments"])
  })

  it("never serves a list another person's request left behind: every read reaches the backend", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(list(["payments"]))                       // an admitted person, first
      .mockResolvedValueOnce(refusal(403, "PERSON_NOT_AUTHORIZED"))    // then a person without a group, same scope
    vi.stubGlobal("fetch", fetchMock)

    expect((await get()).status).toBe(200)
    const refused = await get({ "x-amzn-oidc-accesstoken": "no-group-token", "x-amzn-oidc-data": "other-claims" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refused.status).toBe(403)
    const body = await refused.json()
    expect(body.detail.code).toBe("PERSON_NOT_AUTHORIZED")
    expect(body.systems).toBeUndefined()
    expect(refused.headers.get("cache-control")).toBe("private, no-store")
  })

  it.each([
    [401, "PERSON_TOKEN_REQUIRED"],
    [401, "PERSON_TOKEN_INVALID"],
    [403, "PERSON_NOT_TENANT_WIDE"],
  ])("relays the backend's typed %i %s unchanged and never cacheable", async (status, code) => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status, code)))
    const response = await get()
    expect(response.status).toBe(status)
    expect((await response.json()).detail.code).toBe(code)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("marks a failed backend call private, no-store too", async () => {
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect refused")))
    const response = await get()
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("on a resident install a list already in the in-memory cache is never served (the read is bypassed too)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(list(["kept-from-an-unscoped-read"]))
      .mockResolvedValueOnce(refusal(403, "PERSON_NOT_AUTHORIZED"))
    vi.stubGlobal("fetch", fetchMock)
    expect((await get()).headers.get("x-cache")).toBe("MISS")       // filled outside resident mode
    vi.stubEnv("CYNTRO_DEPLOYMENT_MODE", "CUSTOMER_RESIDENT")
    const refused = await get()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refused.status).toBe(403)
    expect(JSON.stringify(await refused.json())).not.toContain("kept-from-an-unscoped-read")
  })

  it("outside resident mode is unchanged: no identity forwarded, the in-memory list serves the next read", async () => {
    const fetchMock = vi.fn().mockResolvedValue(list(["payments"]))
    vi.stubGlobal("fetch", fetchMock)

    const first = await get()
    expect(first.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600")
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "Content-Type": "application/json" })
    const second = await get()
    expect(second.headers.get("x-cache")).toBe("HIT")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
