import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { resilientReadMock } = vi.hoisted(() => ({
  resilientReadMock: vi.fn(),
}))

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://canonical.test",
}))

vi.mock("@/lib/server/resilient-backend-read", () => ({
  resilientBackendJsonRead: resilientReadMock,
}))

import { GET as getInspector } from "@/app/api/proxy/inspector/[resourceId]/route"
import { GET as getReadiness } from "@/app/api/proxy/decision-coverage/resource/[neo4jLabel]/[resourceId]/route"

beforeEach(() => resilientReadMock.mockReset())

describe("Estate resilient proxy routes", () => {
  it("returns live Inspector JSON with provenance headers", async () => {
    resilientReadMock.mockResolvedValue({
      ok: true,
      data: { resource_type: "Lambda", resource_id: "arn:test" },
      source: "backend",
      latencyMs: 21,
    })

    const response = await getInspector(
      new NextRequest("https://ui.test/api/proxy/inspector/arn%3Atest?system_name=test&resource_type=Lambda"),
      { params: Promise.resolve({ resourceId: "arn:test" }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Cyntro-Read-Source")).toBe("backend")
    expect(response.headers.get("X-Cyntro-Backend-Latency-Ms")).toBe("21")
    expect(await response.json()).toMatchObject({ resource_type: "Lambda" })
  })

  it("marks a last-good Readiness response in both headers and JSON", async () => {
    resilientReadMock.mockResolvedValue({
      ok: true,
      data: { inventory: true, max_outcome: "BLOCK" },
      source: "stale-cache",
      latencyMs: 0,
      staleAgeMs: 90_000,
      staleReason: "backend_timeout",
    })

    const response = await getReadiness(
      new NextRequest("https://ui.test/api/proxy/decision-coverage/resource/LambdaFunction/arn%3Atest"),
      { params: Promise.resolve({ neo4jLabel: "LambdaFunction", resourceId: "arn:test" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Cyntro-Read-Source")).toBe("stale-cache")
    expect(body).toMatchObject({
      inventory: true,
      fromStaleCache: true,
      staleReason: "backend_timeout",
      staleAgeMs: 90_000,
    })
  })

  it("fails quickly and honestly when no last-good response exists", async () => {
    resilientReadMock.mockResolvedValue({
      ok: false,
      error: "This operation was aborted",
      timedOut: true,
      latencyMs: 12_000,
    })

    const response = await getInspector(
      new NextRequest("https://ui.test/api/proxy/inspector/arn%3Atest"),
      { params: Promise.resolve({ resourceId: "arn:test" }) },
    )

    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({
      error: "Inspector backend request timed out",
      origin: "proxy",
    })
  })
})
