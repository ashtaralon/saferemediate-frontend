/**
 * AP201 review S11 (end to end at the proxy): the closure-preview and permission-cut-plan proxies relay the install's
 * typed 503 hold with its own status and body -- never the 502 "backend 503 {...}" wrapper the hooks then printed as an
 * outage -- and a 200 hold is never cached. Real: the two proxy routes and the shared `typedBackendAnswer`. Stubbed
 * (labelled): the backend `fetch` and the proxy cache store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  return {
    __store: store,
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: () => null,
    setCached: (key: string, data: unknown) => { store.set(key, data) },
    clearCached: (key: string) => { store.delete(key) },
    TTL_FAST: 30_000, TTL_STD: 60_000, TTL_SLOW: 300_000,
  }
})

import { GET as closureProxy } from "@/app/api/proxy/attack-paths/path/[pathId]/closure-preview/route"
import { POST as cutPlanProxy } from "@/app/api/proxy/attack-paths/[systemName]/permission-cut-plan/route"

const ROUTE_HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }
const HOLD_200 = { semantic_status: "not_recorded", source_generation: null, graph_version: null, coverage: null,
  hold_reason: "X_NOT_RECORDED", hold_detail: "x" }
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

let backend: ReturnType<typeof vi.fn>
beforeEach(async () => {
  const cache = await import("@/lib/server/proxy-cache")
  ;(cache as unknown as { __store: Map<string, unknown> }).__store.clear()
  backend = vi.fn(async () => respond(503, ROUTE_HELD))
  vi.stubGlobal("fetch", backend)
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const closure = () => closureProxy(new NextRequest("http://fe.local/api/proxy/attack-paths/path/p1/closure-preview"),
  { params: Promise.resolve({ pathId: "p1" }) })
const cutPlan = () => cutPlanProxy(new NextRequest(
  "http://fe.local/api/proxy/attack-paths/shop/permission-cut-plan?jewel_ref=arn:aws:s3:::b&role_arn=arn:aws:iam::1:role/r",
  { method: "POST" }), { params: Promise.resolve({ systemName: "shop" }) })

describe("typed 503 holds keep their status and body", () => {
  it.each([["closure-preview", closure], ["permission-cut-plan", cutPlan]] as const)("%s", async (_name, call) => {
    const response = await call()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual(ROUTE_HELD)
  })
})

describe("closure-preview never caches a 200 hold", () => {
  it("asks the backend again after a hold, and serves the hold no-store", async () => {
    backend.mockImplementation(async () => respond(200, HOLD_200))
    const first = await closure()
    expect(first.headers.get("cache-control")).toBe("no-store")
    await closure()
    expect(backend).toHaveBeenCalledTimes(2)
  })
})

describe("S10 · the path-detail read says a typed answer with its own reason, once", () => {
  it("a 422 ACCOUNT_SCOPE_REQUIRED settles on the first attempt with its reason, never the generic proxy error", async () => {
    const { fetchConvergencePathDetail } = await import("@/lib/attack-paths/convergence-path-details")
    const typed = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }
    const fetchImpl = vi.fn(async () => respond(422, typed))
    const result = await fetchConvergencePathDetail({ url: "/detail", fetchImpl: fetchImpl as never, sleep: async () => undefined })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect((result as { error: string }).error).not.toMatch(/^detail 422$/)
    expect((result as { error: string }).error).toMatch(/Path detail/)
  })

  it("an untyped failure keeps today's message", async () => {
    const { fetchConvergencePathDetail } = await import("@/lib/attack-paths/convergence-path-details")
    const fetchImpl = vi.fn(async () => respond(404, { error: "not found" }))
    const result = await fetchConvergencePathDetail({ url: "/detail", fetchImpl: fetchImpl as never, sleep: async () => undefined })
    expect(result).toEqual({ ok: false, error: "not found", status: 404 })
  })
})
