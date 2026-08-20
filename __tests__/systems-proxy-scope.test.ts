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
