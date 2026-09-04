import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/proxy/system-map/resource-children/route"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("system-map resource-children proxy", () => {
  it("preserves backend 404 as a typed missing-evidence state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const response = await GET(new NextRequest(
      "https://cyntro.example/api/proxy/system-map/resource-children?resource_id=arn%3Aaws%3As3%3A%3A%3Acustomer-data&system_name=payments-prod",
    ))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: "scope_evidence_not_found",
      code: "SCOPE_EVIDENCE_NOT_FOUND",
      status: 404,
      resource_id: "arn:aws:s3:::customer-data",
    })
  })

  it("keeps upstream availability failures fail-closed as 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    const response = await GET(new NextRequest(
      "https://cyntro.example/api/proxy/system-map/resource-children?resource_id=customer-data",
    ))

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      code: "SCOPE_EVIDENCE_UNAVAILABLE",
      status: 503,
    })
  })
})
