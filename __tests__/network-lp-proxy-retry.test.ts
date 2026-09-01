import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

describe("Network LP findings proxy transient recovery", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.BACKEND_URL_OVERRIDE
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("retries one transient upstream 502 and returns the recovered findings", async () => {
    process.env.BACKEND_URL_OVERRIDE = "https://c1-backend.example"
    const recovered = { subnet_count: 1, candidate_count: 0, subnets: [] }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(Response.json(recovered))

    const { GET } = await import("@/app/api/proxy/network-lp-findings/route")
    const response = await GET(
      new NextRequest("http://localhost/api/proxy/network-lp-findings?system_id=testbed-webshop"),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(recovered)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it("does not retry a permanent upstream 404", async () => {
    process.env.BACKEND_URL_OVERRIDE = "https://c1-backend.example"
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }))

    const { GET } = await import("@/app/api/proxy/network-lp-findings/route")
    const response = await GET(new NextRequest("http://localhost/api/proxy/network-lp-findings"))

    expect(response.status).toBe(404)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
