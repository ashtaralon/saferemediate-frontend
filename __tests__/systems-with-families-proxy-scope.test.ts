import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const cacheSet = vi.fn()

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

vi.mock("@/lib/server/proxy-cache", () => ({
  getCached: () => null,
  setCached: cacheSet,
  TTL_SLOW: 300_000,
}))

describe("systems-with-families proxy scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards scope and isolates the proxy cache key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      systems: [],
      total: 0,
      errors: [],
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const { GET } = await import("@/app/api/proxy/systems/with-families/route")
    const response = await GET(new NextRequest(
      "https://cyntro.example/api/proxy/systems/with-families?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    ))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example/api/service-risk-scores/all-systems?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
      expect.any(Object),
    )
    expect(cacheSet.mock.calls[0][0]).toContain("customer_id=testbed-webshop")
    expect(cacheSet.mock.calls[0][0]).toContain("region=eu-west-1")
  })
})
