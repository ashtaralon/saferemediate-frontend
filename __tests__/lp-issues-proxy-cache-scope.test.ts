// @vitest-environment node
// The route runs on Node's fetch through the process-wide writer, as instrumentation.ts installs it.
/**
 * The LP issues proxy never serves one tenant's scoped list to another.
 *
 * ONE backend serves TWO registered tenants that share a system name
 * ("fixture-shop") and a role name ("fixture-shared-name-role"), at the SAME URL,
 * through the SAME FE proxy URL, with the SAME server token. Which tenant a
 * request belongs to is decided by the backend from its server-verified
 * principal; the proxy never sees that identity (only request claims), so it
 * cannot key a reusable answer by it. The backend here is a real HTTP server on
 * 127.0.0.1 whose authorized tenant is set per request, as a verified principal
 * would set it.
 *
 * Before the fix the proxy kept a shared in-memory cache keyed by systemName +
 * days: tenant B received tenant A's READY list from cache without the backend
 * being asked, a timeout for B served A's list as stale, and success responses
 * were `public, s-maxage=120`. Keying by backend origin would not help: both
 * tenants are behind one backend.
 */
import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { installCustomerBackendAuthFetch } from "@/lib/server/customer-backend-auth"

const PROXY_URL = "http://localhost/api/proxy/least-privilege/issues?systemName=fixture-shop"
const TOKEN = "fixture-shared-backend-service-token-0123456789"
const TENANTS = {
  A: { tenant: "fixture-webshop", account: "111111111111" },
  B: { tenant: "fixture-neighbour-co", account: "333333333333" },
} as const
const originalFetch = globalThis.fetch

let server: Server
let base = ""
let authorizedAs: keyof typeof TENANTS = "A"
let hang = false
const seen: { tenant: string; path?: string }[] = []

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    seen.push({ tenant: TENANTS[authorizedAs].tenant, path: req.url })
    if (hang) return // accept and never answer: the proxy's own abort decides
    if (req.headers["x-cyntro-service-token"] !== TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ detail: "service authentication required" }))
      return
    }
    const t = TENANTS[authorizedAs]
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      serve_state: "READY",
      analysis_complete: true,
      systemName: "fixture-shop",
      tenant_label: t.tenant,
      resources: [{
        resourceType: "IAMRole",
        resourceName: "fixture-shared-name-role",
        resourceArn: `arn:aws:iam::${t.account}:role/fixture-shared-name-role`,
      }],
    }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  delete process.env.CYNTRO_SERVICE_TOKEN
  delete process.env.BACKEND_URL_OVERRIDE
  seen.length = 0
  hang = false
  authorizedAs = "A"
  vi.restoreAllMocks()
})

/** The server boots once: one backend, one token, the process-wide writer. */
async function bootProxy() {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("cyntro.customerBackendAuthFetch")]
  process.env.BACKEND_URL_OVERRIDE = base
  process.env.CYNTRO_SERVICE_TOKEN = TOKEN
  installCustomerBackendAuthFetch()
  vi.resetModules()
  return (await import("@/app/api/proxy/least-privilege/issues/route")).GET
}

async function call(GET: (req: NextRequest) => Promise<Response>, url = PROXY_URL) {
  const res = await GET(new NextRequest(url))
  return { status: res.status, cache: res.headers.get("Cache-Control"), body: await res.json() }
}

describe("LP issues proxy with one backend serving two registered tenants", () => {
  it("a READY list for tenant A is never served to tenant B at the same URL", async () => {
    const GET = await bootProxy()

    authorizedAs = "A"
    const first = await call(GET)
    expect(first.status).toBe(200)
    expect(first.body.tenant_label).toBe("fixture-webshop")

    authorizedAs = "B"
    const second = await call(GET)

    expect(second.status).toBe(200)
    expect(second.body.tenant_label).toBe("fixture-neighbour-co")
    expect(JSON.stringify(second.body)).not.toContain("111111111111")
    expect(second.body.fromCache).not.toBe(true)
    expect(seen.map((s) => s.tenant)).toEqual(["fixture-webshop", "fixture-neighbour-co"])
  })

  it("every request asks the backend, even the same tenant's repeat", async () => {
    const GET = await bootProxy()
    await call(GET)
    const again = await call(GET)

    expect(again.body.fromCache).not.toBe(true)
    expect(seen).toHaveLength(2)
  })

  it("a timeout for tenant B never serves tenant A's earlier READY list", async () => {
    const GET = await bootProxy()
    authorizedAs = "A"
    await call(GET)

    authorizedAs = "B"
    hang = true
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) =>
      realSetTimeout(fn, ms === 55_000 ? 50 : ms)) as typeof setTimeout)
    const res = await GET(new NextRequest(PROXY_URL))
    const body = await res.json()

    expect(res.status).toBe(504)
    expect(JSON.stringify(body)).not.toContain("111111111111")
    expect(JSON.stringify(body)).not.toContain("fixture-webshop")
    expect(body.fromStaleCache).toBeUndefined()
    expect(body.resources).toBeUndefined()
  })

  it("a scoped list and its errors are never cacheable by a shared cache", async () => {
    const GET = await bootProxy()
    const served = await call(GET)
    hang = true
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) =>
      realSetTimeout(fn, ms === 55_000 ? 50 : ms)) as typeof setTimeout)
    const timedOut = await call(GET)

    for (const header of [served.cache, timedOut.cache]) {
      expect(header).toBeTruthy()
      expect(header).not.toMatch(/public|s-maxage|stale-while-revalidate/)
      expect(header).toMatch(/no-store/)
    }
    expect(served.cache).toMatch(/private/)
  })

  it("the route holds no module-level answer store", () => {
    const src = readFileSync(join(process.cwd(), "app/api/proxy/least-privilege/issues/route.ts"), "utf8")
    expect(src).not.toMatch(/^let\s/m)
    expect(src).not.toMatch(/cachedData|fromStaleCache|stale-while-revalidate|s-maxage/)
  })
})
