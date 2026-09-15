/// <reference types="vitest/globals" />
/**
 * The blast-radius proxy must:
 *  - forward the operator's customer/account/region to the backend verbatim,
 *  - partition its in-memory cache by those params so one tenant's cached
 *    compose can never serve another's session,
 *  - and, when scope is absent, propagate the backend's honest 503 rather
 *    than fabricate a shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

// The proxy caches in a module-scope Map (lib/server/proxy-cache). Reset it
// between cases so a warmed key from one test doesn't paint the next.
vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  return {
    __store: store,
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: () => null,
    setCached: (key: string, data: unknown) => {
      store.set(key, data)
    },
    TTL_SLOW: 60_000,
  }
})

function backendJson(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json" },
  })
}

async function callProxy(query: string) {
  const { GET } = await import("@/app/api/proxy/business-system/[systemName]/blast-radius/route")
  const url = query
    ? `https://cyntro.example/api/proxy/business-system/payments/blast-radius?${query}`
    : "https://cyntro.example/api/proxy/business-system/payments/blast-radius"
  return GET(new NextRequest(url), { params: Promise.resolve({ systemName: "payments" }) })
}

describe("business-system blast-radius proxy", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    const cache = await import("@/lib/server/proxy-cache")
    // Reach into the mock's store (see vi.mock above) to guarantee isolation.
    ;(cache as unknown as { __store: Map<string, unknown> }).__store.clear()
  })

  it("forwards customer/account/region to the backend verbatim", async () => {
    const fetchMock = vi.fn().mockResolvedValue(backendJson({ verdict: "ok", zones: [] }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await callProxy(
      "customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
    )
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example/api/business-system/payments/blast-radius" +
        "?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1",
      expect.any(Object),
    )
  })

  it("partitions its cache by scope — two tenants never share a compose", async () => {
    const tenantAPayload = { verdict: "tenant-a", zones: [{ id: "a" }] }
    const tenantBPayload = { verdict: "tenant-b", zones: [{ id: "b" }] }

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(backendJson(tenantAPayload))
      .mockResolvedValueOnce(backendJson(tenantBPayload))
    vi.stubGlobal("fetch", fetchMock)

    const first = await callProxy(
      "customer_id=tenant-a&account_id=111111111111&region=eu-west-1",
    )
    expect(await first.json()).toMatchObject(tenantAPayload)

    // Same system, different scope. If the cache key were scope-blind this
    // second call would repaint tenant-a's compose without hitting fetch.
    const second = await callProxy(
      "customer_id=tenant-b&account_id=222222222222&region=us-east-1",
    )
    expect(await second.json()).toMatchObject(tenantBPayload)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("distinguishes region-only differences in the cache key", async () => {
    const euPayload = { verdict: "eu", zones: [{ id: "eu" }] }
    const usPayload = { verdict: "us", zones: [{ id: "us" }] }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(backendJson(euPayload))
      .mockResolvedValueOnce(backendJson(usPayload))
    vi.stubGlobal("fetch", fetchMock)

    const eu = await callProxy(
      "customer_id=acme&account_id=111111111111&region=eu-west-1",
    )
    expect(await eu.json()).toMatchObject(euPayload)

    const us = await callProxy(
      "customer_id=acme&account_id=111111111111&region=us-east-1",
    )
    expect(await us.json()).toMatchObject(usPayload)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("propagates the backend's honest error when scope is missing — no fabricated shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      backendJson({ detail: "scope required" }, { status: 503 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await callProxy("")
    expect(res.status).toBe(503)
    const body = await res.json()
    // Empty envelope keeps the shape the UI expects; error line names the
    // real failure — the caller must never mistake this for a real verdict.
    expect(body).toMatchObject({
      verdict: null,
      zones: [],
      dependency_plane: [],
      top_paths: [],
      recommended_cuts: [],
      error: "Backend returned 503",
    })
  })

  it("re-serves the same scope from cache (no double fetch)", async () => {
    const payload = { verdict: "cached", zones: [] }
    const fetchMock = vi.fn().mockResolvedValue(backendJson(payload))
    vi.stubGlobal("fetch", fetchMock)

    const query = "customer_id=acme&account_id=111111111111&region=eu-west-1"
    await callProxy(query)
    const cached = await callProxy(query)
    expect(cached.headers.get("X-Cache")).toBe("HIT")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
