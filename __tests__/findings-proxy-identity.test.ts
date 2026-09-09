import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://serving-backend.example",
}))

import { GET } from "@/app/api/proxy/findings/route"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("findings proxy identity boundary", () => {
  it("withholds identity-less rows before they reach a browser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          total: 3,
          findings: [
            { finding_id: " finding-1 ", severity: "HIGH", status: "OPEN" },
            { id: "finding-2", severity: "LOW", status: "OPEN" },
            { title: "invalid", resourceId: "customer-resource-marker" },
          ],
        }),
      ),
    )

    const response = await GET(new NextRequest(
      "https://app.example/api/proxy/findings?systemName=identity-boundary-test",
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ total: 2, count: 2 })
    expect(body.findings.map((finding: any) => finding.id)).toEqual(["finding-1", "finding-2"])
    expect(body.findings.map((finding: any) => finding.finding_id)).toEqual(["finding-1", "finding-2"])
    expect(JSON.stringify(body)).not.toContain("customer-resource-marker")
    expect(warn).toHaveBeenCalledWith(
      "[Findings Proxy] Withheld 1 finding(s) without a canonical backend ID",
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain("customer-resource-marker")
  })
})
