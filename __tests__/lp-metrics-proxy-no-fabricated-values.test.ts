// @vitest-environment node
/**
 * The LP metrics proxy never answers a failure with metric values.
 *
 * It used to return zeroed MetricsResponse fields (0 roles, 0% bloat, 0 unused permissions) on every
 * upstream error and timeout — a fabricated reading in an error body. A failure is now the house proxy
 * error shape (lib/server/proxy-error, as the LP issues proxy answers it); a success is passed through
 * as sent, withheld nulls included. Real HTTP backend on 127.0.0.1; nothing stubbed.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/** Every MetricsResponse field (api/least_privilege.py). None may appear in an error body. */
const METRIC_KEYS = [
  "totalRoles",
  "analyzedRoles",
  "rolesWithBloat",
  "averageBloatPercentage",
  "totalUnusedPermissions",
  "totalRecommendedReductions",
  "lastAnalysisDate",
  "bloatPercentageDeltaPp",
  "bloatBaselineAgeDays",
  "bloatBaselineTimestamp",
]

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
let server: Server
let base = ""

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  delete process.env.BACKEND_URL_OVERRIDE
  vi.restoreAllMocks()
})

function answer(status: number, body: string, type = "application/json"): Handler {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": type })
    res.end(body)
  }
}

async function call(target = base) {
  process.env.BACKEND_URL_OVERRIDE = target
  vi.resetModules()
  vi.spyOn(console, "error").mockImplementation(() => {})
  const { GET } = await import("@/app/api/proxy/least-privilege/metrics/route")
  const res = await GET(new NextRequest("http://localhost/api/proxy/least-privilege/metrics"))
  return { status: res.status, origin: res.headers.get("X-Cyntro-Error-Origin"), body: await res.json() }
}

function expectNoMetricValues(body: Record<string, unknown>) {
  const present = METRIC_KEYS.filter((key) => key in body)
  expect(present).toEqual([])
  expect(typeof body.error).toBe("string")
}

describe("LP metrics proxy — errors carry no metric values", () => {
  it("a backend 500 is a 502 error with no metrics", async () => {
    handler = answer(500, '{"detail":"Internal error: boom"}')
    const out = await call()
    expect(out.status).toBe(502)
    expect(out.origin).toBe("backend")
    expect(out.body.backendStatus).toBe(500)
    expectNoMetricValues(out.body)
  })

  it("a typed 503 refusal keeps its status and code, and no metrics", async () => {
    handler = answer(503, '{"detail":{"code":"SERVING_READ_REFUSED","message":"serving tier refused the read"}}')
    const out = await call()
    expect(out.status).toBe(503)
    expect(out.body.detail).toEqual({ code: "SERVING_READ_REFUSED", message: "serving tier refused the read" })
    expectNoMetricValues(out.body)
  })

  it("a non-JSON upstream page forwards nothing from it", async () => {
    handler = answer(502, "<html>bad gateway</html>", "text/html")
    const out = await call()
    expect(out.status).toBe(502)
    expect(out.body.detail).toBeUndefined()
    expectNoMetricValues(out.body)
  })

  it("an unreachable backend is a 503 proxy error with no metrics", async () => {
    // A port nothing listens on: bind, read it, close.
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve))
    const dead = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`
    await new Promise<void>((resolve) => probe.close(() => resolve()))

    const out = await call(dead)
    expect(out.status).toBe(503)
    expect(out.origin).toBe("proxy")
    expectNoMetricValues(out.body)
  })

  it("control: a success passes through as sent, withheld nulls included", async () => {
    const held = {
      totalRoles: 12,
      analyzedRoles: 12,
      rolesWithBloat: null,
      averageBloatPercentage: null,
      totalUnusedPermissions: null,
      totalRecommendedReductions: null,
      lastAnalysisDate: "2026-09-29T10:00:00+00:00",
      bloatPercentageDeltaPp: null,
      bloatBaselineAgeDays: null,
      bloatBaselineTimestamp: null,
      error_code: "IAM_USAGE_GENERATION_UNVERIFIED",
      held_reason: "test input: usage counts are read off an unverified IAM usage generation",
    }
    handler = answer(200, JSON.stringify(held))
    const out = await call()
    expect(out.status).toBe(200)
    expect(out.body).toEqual(held)
  })
})
