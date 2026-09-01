import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

describe("resource dependencies proxy", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("forwards only server-supported scope and page claims", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith("/healthz")) return new Response("ok", { status: 200 })
      return Response.json({
        success: true,
        inbound_count: 0,
        outbound_count: 0,
        coverage: {},
        scope: {},
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/proxy/resource-view/[resourceId]/connections/route")
    const request = new NextRequest(
      "https://cyntro.test/api/proxy/resource-view/sg-1/connections?customer_id=c1&account_id=111111111111&page=500&region=eu-west-1&account_group=g1",
    )

    const result = await GET(request, { params: Promise.resolve({ resourceId: "sg-1" }) })
    expect(result.status).toBe(200)

    const backendCall = fetchMock.mock.calls
      .map(([value]) => String(value))
      .find((value) => value.includes("/api/resource-view/"))
    expect(backendCall).toBe(
      "https://backend.example/api/resource-view/sg-1/connections?customer_id=c1&account_id=111111111111&page=500",
    )
    expect(backendCall).not.toContain("region=")
    expect(backendCall).not.toContain("account_group=")
  })
})
