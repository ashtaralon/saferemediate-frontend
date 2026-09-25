// @vitest-environment node
/**
 * CF01 · the IAP proxy (app/api/proxy/identity-attack-paths/[systemName]/route.ts)
 * carries the evidence contract intact, and never turns a held or refused
 * answer into a cached map or a stale map.
 *
 * Bodies are backend route output captured from the backend's own harness
 * (__tests__/fixtures/cf01-attack-path-evidence/README.md). The upstream
 * `fetch` is a stub standing in for the backend process; the route, the proxy
 * cache, the customer-backend auth wrapper and the middleware are the real code.
 *
 * The proxy cache is module-level, so every test re-imports the route after
 * vi.resetModules() — a cache left by one test would otherwise answer the next.
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import holdsFixture from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json"
import twoCustomers from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-two-customers.json"

const BACKEND = "http://127.0.0.1:8000"
const TOKEN_HEADER = "X-Cyntro-Service-Token"
const HOLDS = holdsFixture as Record<string, { status: number; body: unknown }>
const ORIGINAL_FETCH = globalThis.fetch

type Upstream = ReturnType<typeof vi.fn>

function answer(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

async function loadRoute(upstream: Upstream, opts: { customerResident?: boolean } = {}) {
  vi.resetModules()
  process.env.BACKEND_URL_OVERRIDE = BACKEND
  if (opts.customerResident) {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    process.env.CYNTRO_SERVICE_TOKEN = "customer-secret"
  }
  globalThis.fetch = upstream as unknown as typeof fetch
  if (opts.customerResident) {
    const { installCustomerBackendAuthFetch } = await import("@/lib/server/customer-backend-auth")
    installCustomerBackendAuthFetch()
  }
  const { GET } = await import("@/app/api/proxy/identity-attack-paths/[systemName]/route")
  return (system = "payments") =>
    GET(new NextRequest(`https://console.example.test/api/proxy/identity-attack-paths/${system}`), {
      params: Promise.resolve({ systemName: system }),
    })
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("authenticated install path", () => {
  it("carries the service token to the backend and the evidence contract back intact", async () => {
    const upstream = vi.fn(async () => answer(twoCustomers.acme))
    const get = await loadRoute(upstream, { customerResident: true })

    const response = await get()
    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url).startsWith(`${BACKEND}/api/identity-attack-paths/payments?`)).toBe(true)
    expect(new Headers(init?.headers).get(TOKEN_HEADER)).toBe("customer-secret")

    const body = await response.json()
    expect(body.paths).toHaveLength(4)
    expect(body.paths.map((p: any) => p.evidence_contract)).toEqual(
      twoCustomers.acme.paths.map((p) => p.evidence_contract),
    )
    expect(body.paths.map((p: any) => p.evidence_type)).toEqual(
      twoCustomers.acme.paths.map((p) => p.evidence_type),
    )
    expect(JSON.stringify(body)).not.toContain("222222222222")
  })
})

describe("hosted middleware", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = "correct horse battery staple"
    delete process.env.CYNTRO_SITE_SESSION_SECRET
    delete process.env.CYNTRO_DEPLOYMENT_MODE
  })
  afterEach(() => {
    delete process.env.SITE_PASSWORD
  })

  it("redirects an unauthenticated IAP proxy read to /login, and passes a sealed session", async () => {
    const { middleware } = await import("@/middleware")
    const denied = await middleware(
      new NextRequest("https://console.example.test/api/proxy/identity-attack-paths/payments"),
    )
    expect([302, 307]).toContain(denied.status)
    expect(new URL(denied.headers.get("location") || "").pathname).toBe("/login")

    // Control: the same request with a session this server issued passes.
    const { issueSiteSession, SITE_SESSION_COOKIE } = await import("@/lib/server/site-session")
    const cookie = `${SITE_SESSION_COOKIE}=${await issueSiteSession()}`
    const passed = await middleware(
      new NextRequest("https://console.example.test/api/proxy/identity-attack-paths/payments", {
        headers: { cookie },
      }),
    )
    expect(passed.headers.get("x-middleware-next")).toBe("1")
  })
})

describe("held answers are passed through and never cached", () => {
  it.each(["install_not_recorded", "c1_unavailable"])("%s: every GET reaches the backend", async (key) => {
    const hold = HOLDS[key]
    expect(hold.status).toBe(200) // precondition: a 200 hold, the shape that used to be cached
    const upstream = vi.fn(async () => answer(hold.body))
    const get = await loadRoute(upstream)

    const first = await get()
    expect(first.status).toBe(200)
    expect(first.headers.get("cache-control")).toBe("no-store")
    expect(await first.json()).toEqual(hold.body)

    const second = await get()
    expect(await second.json()).toEqual(hold.body)
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it("control: a populated map IS cached, so the hold result above is not vacuous", async () => {
    const upstream = vi.fn(async () => answer(twoCustomers.beta))
    const get = await loadRoute(upstream)
    await get()
    const second = await get()
    expect(second.headers.get("x-cache")).toBe("HIT")
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it("a hold answering the lighter-budget retry is passed through and not cached either", async () => {
    const hold = HOLDS.install_not_recorded
    const upstream = vi
      .fn()
      .mockImplementationOnce(async () => answer({ detail: "bad gateway" }, 502)) // untyped, fast
      .mockImplementation(async () => answer(hold.body))
    const get = await loadRoute(upstream)
    const first = await get()
    expect(upstream).toHaveBeenCalledTimes(2) // primary 502, then the lighter budget
    expect(first.headers.get("cache-control")).toBe("no-store")
    expect(await first.json()).toEqual(hold.body)
    await get()
    expect(upstream).toHaveBeenCalledTimes(3) // not served from cache
  })

  it("a hold arriving after a cached map replaces it — never a stale map", async () => {
    const upstream = vi
      .fn()
      .mockImplementationOnce(async () => answer(twoCustomers.acme))
      .mockImplementation(async () => answer(HOLDS.install_not_recorded.body))
    const get = await loadRoute(upstream)
    await get()
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now + 301_000) // past TTL_SLOW: stale, not fresh
    const held = await get()
    const body = await held.json()
    expect(body).toEqual(HOLDS.install_not_recorded.body)
    expect(body.fromStaleCache).toBeUndefined()
  })
})

describe("typed 503s", () => {
  async function withStaleMap(errorKey: string) {
    const upstream = vi
      .fn()
      .mockImplementationOnce(async () => answer(twoCustomers.acme))
      .mockImplementation(async () => answer(HOLDS[errorKey].body, HOLDS[errorKey].status))
    const get = await loadRoute(upstream)
    const warm = await get()
    expect(warm.status).toBe(200) // the map is now in the proxy cache
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now + 301_000) // past TTL: only a STALE entry remains
    return { get, upstream }
  }

  it.each(["install_serving_read_refused", "install_serving_route_held"])("%s passes through as 503 even with a stale map in cache", async (key) => {
    const { get, upstream } = await withStaleMap(key)
    const refused = await get()
    expect(refused.status).toBe(503)
    expect(refused.headers.get("cache-control")).toBe("no-store")
    const body = await refused.json()
    expect(body).toEqual(HOLDS[key].body)
    expect(body.fromStaleCache).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain("acme-data")
    // A typed answer is read once — no compute-in-progress retry.
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it("after a refusal, a later transport failure cannot resurrect the refused map", async () => {
    const { get, upstream } = await withStaleMap("install_serving_read_refused")
    await get()
    upstream.mockImplementation(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" })
    })
    const later = await get()
    const body = await later.json()
    expect(later.status).toBe(504)
    expect(body.fromStaleCache).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain("acme-data")
  })

  it("SEMANTIC_READ_UNAVAILABLE (a reader failure) keeps the labelled stale serve", async () => {
    const { get } = await withStaleMap("install_semantic_read_unavailable")
    const res = await get()
    const body = await res.json()
    expect(res.headers.get("x-cache")).toBe("STALE")
    expect(body.fromStaleCache).toBe(true)
    expect(body.staleReason).toBe("backend_503")
  })

  it("SEMANTIC_READ_UNAVAILABLE with nothing cached passes the typed body through", async () => {
    const hold = HOLDS.install_semantic_read_unavailable
    const upstream = vi.fn(async () => answer(hold.body, hold.status))
    const get = await loadRoute(upstream)
    const res = await get()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual(hold.body)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})
