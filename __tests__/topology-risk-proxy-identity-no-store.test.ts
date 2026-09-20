/// <reference types="vitest/globals" />
/**
 * The topology-risk proxy must not cache an identity-bearing body.
 *
 * `identity_access` is decided PER REQUEST: the backend reads the tenant's
 * lifecycle and either serves the decision evidence, demotes the block to
 * inventory only, or withholds it. A proxy that keeps such a body breaks that
 * in two ways at once.
 *
 *  - `Cache-Control: public` invites any CDN or intermediary to store a
 *    tenant-scoped, identity-bearing response and hand it to the next reader
 *    whose request looks the same.
 *  - The proxy's own in-process cache would keep answering with decision
 *    evidence after a demotion for the whole TTL, so the cache outlives the
 *    verdict that authorized it.
 *
 * A body with no identity block keeps the existing shared caching: this is a
 * rule about identity, not a blanket cache removal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/backend-url", () => ({
  getBackendBaseUrl: () => "https://backend.example",
}))

vi.mock("@/lib/server/proxy-cache", () => {
  const store = new Map<string, unknown>()
  const stale = new Map<string, unknown>()
  return {
    __store: store,
    __stale: stale,
    getCached: (key: string) => (store.has(key) ? store.get(key) : null),
    getStaleCached: (key: string) => (stale.has(key) ? stale.get(key) : null),
    setCached: (key: string, data: unknown) => {
      store.set(key, data)
      stale.set(key, data)
    },
    clearCached: (key: string) => {
      store.delete(key)
    },
    TTL_SLOW: 60_000,
  }
})

const SCOPE = "customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1"

function backendJson(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json" },
  })
}

function withIdentity(extra: Record<string, unknown> = {}) {
  return {
    system: "fixture-v11-estate",
    scored_at: "2026-09-16T00:00:00Z",
    system_kpis: { workloads_total: 0 },
    nodes: [],
    identity_access: {
      contract_version: "estate-identity-access/v1",
      status: "ready",
      scope: { customer_id: "testbed-webshop", account_id: "416651950952" },
      roles: [],
      decision_lifecycle: { may_serve_decisions: true, refusal: null },
    },
    ...extra,
  }
}

function withoutIdentity() {
  return {
    system: "fixture-v11-estate",
    scored_at: "2026-09-16T00:00:00Z",
    system_kpis: { workloads_total: 0 },
    nodes: [],
  }
}

async function callProxy() {
  const { GET } = await import("@/app/api/proxy/topology-risk/[systemName]/route")
  return GET(
    new NextRequest(
      `https://cyntro.example/api/proxy/topology-risk/fixture-v11-estate?${SCOPE}`,
    ),
    { params: Promise.resolve({ systemName: "fixture-v11-estate" }) },
  )
}

async function cacheModule() {
  return (await import("@/lib/server/proxy-cache")) as unknown as {
    __store: Map<string, unknown>
    __stale: Map<string, unknown>
  }
}

/** The proxy's own key builder — a guessed key would seed a row it never reads. */
async function cacheKey(): Promise<string> {
  const { buildTopologyRiskServerCacheKey } = await import(
    "@/components/topology-v0-2/topology-scope-url"
  )
  return buildTopologyRiskServerCacheKey("fixture-v11-estate", {
    customerId: "testbed-webshop",
    accountId: "416651950952",
    region: "eu-west-1",
  })
}

describe("topology-risk proxy · identity-bearing bodies are never cached", () => {
  beforeEach(async () => {
    vi.resetModules()
    const cache = await cacheModule()
    cache.__store.clear()
    cache.__stale.clear()
  })

  it("answers no-store and stores nothing when the body carries identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => backendJson(withIdentity())))

    const response = await callProxy()
    const cache = await cacheModule()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Cache-Control")).not.toContain("public")
    expect(cache.__store.size).toBe(0)
    // The body itself is unchanged — this is a caching rule, not a filter.
    const body = await response.json()
    expect(body.identity_access.status).toBe("ready")
  })

  it("keeps shared caching for a body with no identity block", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => backendJson(withoutIdentity())))

    const response = await callProxy()
    const cache = await cacheModule()

    expect(response.headers.get("Cache-Control")).toContain("public")
    expect(cache.__store.size).toBe(1)
  })

  it("never replays a previously cached identity body from the hit path", async () => {
    const cache = await cacheModule()
    const key = await cacheKey()
    // A body cached by an older process, before this rule existed.
    cache.__store.set(key, withIdentity({ nodes: ["from-the-cache"] }))
    expect(cache.__store.get(key)).toBeTruthy()

    const backend = vi.fn(async () => backendJson(withIdentity({ nodes: [] })))
    vi.stubGlobal("fetch", backend)

    const response = await callProxy()
    const body = await response.json()

    expect(response.headers.get("X-Cache")).not.toBe("HIT")
    expect(backend).toHaveBeenCalled()
    expect(body.nodes).toEqual([])
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(cache.__store.has(key)).toBe(false)
  })

  it("does not answer a failing backend from a stale identity body", async () => {
    const cache = await cacheModule()
    cache.__stale.set(await cacheKey(), withIdentity({ nodes: ["from-the-stale-cache"] }))
    vi.stubGlobal("fetch", vi.fn(async () => backendJson({ detail: "boom" }, { status: 503 })))

    const response = await callProxy()

    // Whatever it answers, it must not be a 200 carrying the stale identity.
    expect(response.status).not.toBe(200)
    const body = await response.json()
    expect(body.identity_access ?? null).toBeNull()
  })
})
