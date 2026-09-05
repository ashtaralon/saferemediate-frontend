import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://serving-backend.example",
}))

import { GET } from "@/app/api/proxy/cloudtrail/events/route"

afterEach(() => {
  vi.restoreAllMocks()
})

function request(query = "") {
  return new NextRequest(`https://app.example/api/proxy/cloudtrail/events${query}`)
}

describe("CloudTrail proxy truthfulness boundary", () => {
  it("does not put customer evidence in a shared cache", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        status: "success",
        events: [{ eventName: "ListBuckets" }],
        total: 1,
        analysis_complete: true,
        counts_are_partial: false,
        effective_as_of: "2026-09-05T10:00:00Z",
      }),
    )

    const response = await GET(request("?days=7&limit=100&roleName=payments-reader"))

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Cache")).toBe("BYPASS")
    expect(await response.json()).toMatchObject({ total: 1 })
    expect(String(upstream.mock.calls[0][0])).toContain("roleName=payments-reader")
  })

  it("returns typed unavailable instead of a false empty result on backend failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("customer-specific backend detail", { status: 503 }),
    )

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body).toMatchObject({
      status: "unavailable",
      events: null,
      total: null,
      analysis_complete: false,
      counts_are_partial: true,
      error_code: "CLOUDTRAIL_BACKEND_UNAVAILABLE",
    })
    expect(JSON.stringify(body)).not.toContain("customer-specific backend detail")
  })

  it("returns typed unavailable when the upstream request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("sensitive transport detail"))

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body).toMatchObject({
      status: "unavailable",
      events: null,
      total: null,
      error_code: "CLOUDTRAIL_PROXY_UNAVAILABLE",
    })
    expect(JSON.stringify(body)).not.toContain("sensitive transport detail")
  })

  it("rejects a successful-looking response with no authoritative count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ status: "success" }),
    )

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      status: "unavailable",
      events: null,
      total: null,
      error_code: "CLOUDTRAIL_INVALID_RESPONSE",
    })
  })

  it("rejects the legacy success shape without positive completeness proof", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ status: "success", events: [], total: 0 }),
    )

    const response = await GET(request("?days=1&limit=1"))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toMatchObject({
      status: "unavailable",
      events: null,
      total: null,
      analysis_complete: false,
      counts_are_partial: true,
      error_code: "CLOUDTRAIL_INVALID_RESPONSE",
    })
  })

  it("returns a non-200 typed timeout rather than an empty success", async () => {
    const timeout = new Error("timed out")
    timeout.name = "AbortError"
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(timeout)

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(504)
    expect(body).toMatchObject({
      status: "unavailable",
      events: null,
      total: null,
      error_code: "CLOUDTRAIL_TIMEOUT",
    })
  })
})
