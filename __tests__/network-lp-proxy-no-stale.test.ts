// @vitest-environment node
/**
 * The Network-LP proxies never answer a backend failure with an earlier body.
 *
 * Both routes used to keep the last good body in a module cache and, when the backend later
 * failed, answer it with status 200 (`X-Cache: STALE`): old route findings presented as current.
 * A failure is now the house error shape (lib/server/proxy-error, as the LP proxies answer it):
 * non-2xx, a string `error`, allowlisted typed detail only, and none of the route's value keys.
 *
 * Real HTTP backend on 127.0.0.1. The only things stubbed are the clock the proxy reads to age
 * its cache, and the length of its own abort timer.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.setConfig({ testTimeout: 30_000 })

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
let server: Server
let base = ""
let hits = 0
const hung: ServerResponse[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  for (const res of hung.splice(0)) res.destroy()
  delete process.env.BACKEND_URL_OVERRIDE
  vi.restoreAllMocks()
})

function answer(status: number, body: string, type = "application/json"): Handler {
  return (_req, res) => {
    res.writeHead(status, { "Content-Type": type })
    res.end(body)
  }
}

/** Accept the request and never answer: only the proxy's own abort can end it. */
const hang: Handler = (_req, res) => {
  hung.push(res)
}

type Route = {
  name: string
  module: string
  url: string
  /** A success body the backend answers first (test input, not product data). */
  good: Record<string, unknown>
  /** Every value key a success carries. None may appear in an error body. */
  valueKeys: string[]
}

const ROUTE_ROW = {
  route_id: "rtb-test0001:0.0.0.0/0",
  destination_cidr: "0.0.0.0/0",
  target_kind: "igw",
  path_type: "PUBLIC_INTERNET",
  recommendation: "REMOVE_ROUTE_CANDIDATE",
}

const ROUTES: Route[] = [
  {
    name: "network-lp-findings",
    module: "@/app/api/proxy/network-lp-findings/route",
    url: "http://localhost/api/proxy/network-lp-findings?system_id=test-system",
    good: {
      system_id: "test-system",
      subnet_count: 1,
      candidate_count: 1,
      subnets: [{ subnet_id: "subnet-test0001", route_count: 1, candidate_count: 1, routes: [ROUTE_ROW] }],
    },
    valueKeys: ["system_id", "subnet_count", "candidate_count", "subnets", "routes"],
  },
  {
    name: "network-lp-routes",
    module: "@/app/api/proxy/network-lp-routes/route",
    url: "http://localhost/api/proxy/network-lp-routes?subnet_id=subnet-test0001",
    good: { subnet_id: "subnet-test0001", route_count: 1, candidate_count: 1, routes: [ROUTE_ROW] },
    valueKeys: ["subnet_id", "route_count", "candidate_count", "routes", "observation_days"],
  },
]

type Mod = { GET: (req: NextRequest) => Promise<Response> }

/** A fresh module per case: the proxies' cache is module state, and must start empty. */
async function load(route: Route, target = base): Promise<Mod> {
  process.env.BACKEND_URL_OVERRIDE = target
  vi.resetModules()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  return (await import(/* @vite-ignore */ route.module)) as Mod
}

async function get(mod: Mod, url: string) {
  const res = await mod.GET(new NextRequest(url))
  return {
    status: res.status,
    origin: res.headers.get("X-Cyntro-Error-Origin"),
    xcache: res.headers.get("X-Cache"),
    cache: res.headers.get("Cache-Control"),
    body: (await res.json()) as Record<string, unknown>,
  }
}

function expectNoValues(route: Route, body: Record<string, unknown>) {
  const present = route.valueKeys.filter((key) => key in body)
  expect(present).toEqual([])
  expect(typeof body.error).toBe("string")
  expect(JSON.stringify(body)).not.toContain("subnet-test0001")
}

/** Move the proxy's clock past its 2-minute cache TTL, so the next request reaches the backend. */
function ageCache(ms = 3 * 60 * 1000) {
  const realNow = Date.now.bind(Date)
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + ms)
}

/** Shrink only the proxy's own 55s abort timer, so a hung backend reaches it in this test. */
function fastProxyAbort() {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(fn, ms !== undefined && ms >= 20_000 && ms <= 60_000 ? 30 : ms, ...rest)) as typeof setTimeout)
}

async function deadBackend() {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve))
  const dead = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return dead
}

/** Serve one good body through the proxy, so its cache holds it; returns the loaded module. */
async function primed(route: Route): Promise<Mod> {
  const mod = await load(route)
  handler = answer(200, JSON.stringify(route.good))
  const first = await get(mod, route.url)
  expect(first.status).toBe(200)
  expect(first.body).toEqual(route.good)
  return mod
}

describe.each(ROUTES)("$name — a failure after a good read never serves the earlier body", (route) => {
  it("a backend 500 after the cache aged is a 502 error, not the cached body", async () => {
    const mod = await primed(route)
    ageCache()
    handler = answer(500, '{"detail":"Internal error: boom"}')
    const out = await get(mod, route.url)
    expect(out.status).toBe(502)
    expect(out.origin).toBe("backend")
    expect(out.xcache).toBeNull()
    expect(out.body.backendStatus).toBe(500)
    expect(out.cache).toContain("no-store")
    expectNoValues(route, out.body)
  })

  it("a typed 503 refusal keeps its status and code, not the cached body", async () => {
    const mod = await primed(route)
    ageCache()
    handler = answer(503, '{"detail":{"code":"SERVING_READ_REFUSED","message":"serving tier refused the read"}}')
    const out = await get(mod, route.url)
    expect(out.status).toBe(503)
    expect(out.body.detail).toEqual({ code: "SERVING_READ_REFUSED", message: "serving tier refused the read" })
    expectNoValues(route, out.body)
  })

  it("a non-JSON upstream page forwards nothing from it, and nothing cached", async () => {
    const mod = await primed(route)
    ageCache()
    handler = answer(502, "<html>bad gateway</html>", "text/html")
    const out = await get(mod, route.url)
    expect(out.status).toBe(502)
    expect(out.body.detail).toBeUndefined()
    expect(JSON.stringify(out.body)).not.toContain("<html>")
    expectNoValues(route, out.body)
  })

  it("a forced refresh inside the TTL that fails is an error, not the cached body", async () => {
    const mod = await primed(route)
    handler = answer(500, '{"detail":"Internal error: boom"}')
    const out = await get(mod, `${route.url}&refresh=true`)
    expect(out.status).toBe(502)
    expectNoValues(route, out.body)
  })

  it("after a failure, a request inside the TTL reaches the backend instead of the pre-failure body", async () => {
    const mod = await primed(route)
    handler = answer(500, '{"detail":"Internal error: boom"}')
    expect((await get(mod, `${route.url}&refresh=true`)).status).toBe(502)
    const before = hits
    const out = await get(mod, route.url)
    expect(hits).toBeGreaterThan(before)
    expect(out.status).toBe(502)
    expectNoValues(route, out.body)
  })

  it("a backend that went away after a good read is a 503 proxy error, not the cached body", async () => {
    // Its own backend, so it can be shut down between the good read and the failing one
    // (BACKEND_URL is read at module load; a reload would also empty the cache under test).
    const own = createServer((_req, res) => answer(200, JSON.stringify(route.good))(_req, res))
    await new Promise<void>((resolve) => own.listen(0, "127.0.0.1", resolve))
    const mod = await load(route, `http://127.0.0.1:${(own.address() as AddressInfo).port}`)
    const first = await get(mod, route.url)
    expect(first.body).toEqual(route.good)
    own.closeAllConnections()
    await new Promise<void>((resolve) => own.close(() => resolve()))
    ageCache()
    const out = await get(mod, route.url)
    expect(out.status).toBe(503)
    expect(out.origin).toBe("proxy")
    expectNoValues(route, out.body)
  })

  it("an unreachable backend with nothing cached is a 503 proxy error", async () => {
    const mod = await load(route, await deadBackend())
    const out = await get(mod, route.url)
    expect(out.status).toBe(503)
    expectNoValues(route, out.body)
  })

  it("the proxy's own timeout after the cache aged is a 504 proxy error, not the cached body", async () => {
    const mod = await primed(route)
    ageCache()
    handler = hang
    fastProxyAbort()
    const out = await get(mod, route.url)
    expect(out.status).toBe(504)
    expect(out.origin).toBe("proxy")
    expectNoValues(route, out.body)
  })
})

describe("controls: real value paths are unchanged", () => {
  it.each(ROUTES)("$name passes a success through as sent, no-store", async (route) => {
    const mod = await load(route)
    handler = answer(200, JSON.stringify(route.good))
    const out = await get(mod, route.url)
    expect(out.status).toBe(200)
    expect(out.xcache).toBe("MISS")
    expect(out.cache).toBe("no-store")
    expect(out.body).toEqual(route.good)
  })

  it.each(ROUTES)("$name still serves a fresh cache hit inside the TTL while the backend is healthy", async (route) => {
    const mod = await primed(route)
    const before = hits
    const out = await get(mod, route.url)
    expect(hits).toBe(before)
    expect(out.status).toBe(200)
    expect(out.xcache).toBe("HIT")
    expect(out.body).toEqual(route.good)
  })

  it.each(ROUTES)("$name refreshes to the new body once the cache aged", async (route) => {
    const mod = await primed(route)
    ageCache()
    const next = { ...route.good, candidate_count: 0 }
    handler = answer(200, JSON.stringify(next))
    const out = await get(mod, route.url)
    expect(out.status).toBe(200)
    expect(out.body).toEqual(next)
  })

  it("network-lp-routes still refuses a missing subnet_id with a 400", async () => {
    const mod = await load(ROUTES[1])
    const res = await mod.GET(new NextRequest("http://localhost/api/proxy/network-lp-routes"))
    expect(res.status).toBe(400)
  })
})
