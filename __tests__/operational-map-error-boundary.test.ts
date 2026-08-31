import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://canonical.test",
}))

import { GET } from "@/app/api/proxy/operational-map/[systemName]/[...path]/route"

afterEach(() => vi.restoreAllMocks())

describe("operational map infrastructure error boundary", () => {
  it("does not expose Neptune hosts, ports, or transport exceptions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      detail: "topology_risk_failed: Neptune read failed: HTTPSConnectionPool(host=internal.cluster.neptune.amazonaws.com, port=8182): Read timed out",
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    }))

    const response = await GET(
      new NextRequest("https://ui.test/api/proxy/operational-map/test-system/resource?resource_id=worker"),
      { params: Promise.resolve({ systemName: "test-system", path: ["resource"] }) },
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      code: "OPERATIONAL_GRAPH_UNAVAILABLE",
      detail: "Live operational graph enrichment is temporarily unavailable.",
    })
    expect(JSON.stringify(body)).not.toMatch(/neptune\.amazonaws\.com|8182|HTTPSConnectionPool/)
  })
})
