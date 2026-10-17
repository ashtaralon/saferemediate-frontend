/**
 * Dashboard proxies never answer a count for a read that failed.
 *
 * Each of these used to turn a backend failure into a body of zeros or an
 * unflagged empty -- `averageBloatPercentage: 0`, `total_findings: 0`,
 * `contributing_systems: 0`, `{items: [], total: 0}`, an empty timeline -- which
 * the V3 Home cards rendered as "0%", "No findings scored yet", "No systems
 * contribute scores", "0 events" and "Engine idle". The backend statuses below
 * are the ones observed on a control-plane install with no workload account
 * (every one of these reads answered 503).
 *
 * `fetch` is stubbed for every URL, so nothing here reaches a backend. Each
 * absence check has a control in which the same route serves the real answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { clearCached, setCached } from "@/lib/server/proxy-cache"

type Route = (url: string) => { status: number; body: unknown } | "throw" | "timeout"

function stubBackend(route: Route) {
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    const hit = route(url)
    if (hit === "throw") throw new TypeError("fetch failed")
    if (hit === "timeout") throw Object.assign(new Error("aborted"), { name: "AbortError" })
    return new Response(JSON.stringify(hit.body), {
      status: hit.status,
      headers: { "Content-Type": "application/json" },
    })
  }))
  return calls
}

const HELD_503 = { status: 503, body: { detail: { code: "INVENTORY_SCOPE_UNAVAILABLE", reason: "NO_DATA_ACCOUNTS" } } }

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  for (const key of ["family-aggregate", "decision-routing-30", "recent-activity", "remediation-timeline:limit=1"]) {
    clearCached(key)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const req = (path: string) => new NextRequest(`https://app.example${path}`)

describe("least-privilege metrics proxy", () => {
  it("a held backend is a typed failure with no metric in it", async () => {
    stubBackend(() => HELD_503)
    const { GET } = await import("@/app/api/proxy/least-privilege/metrics/route")
    const res = await GET(req("/api/proxy/least-privilege/metrics"))
    expect(res.ok).toBe(false)
    const body = await res.json()
    expect(body).not.toHaveProperty("averageBloatPercentage")
    expect(body).not.toHaveProperty("totalUnusedPermissions")
  })

  it("a timeout is 504 with no metric in it", async () => {
    stubBackend(() => "timeout")
    const { GET } = await import("@/app/api/proxy/least-privilege/metrics/route")
    const res = await GET(req("/api/proxy/least-privilege/metrics"))
    expect(res.status).toBe(504)
    expect(await res.json()).not.toHaveProperty("averageBloatPercentage")
  })

  it("control: a real reading passes through", async () => {
    const reading = { totalRoles: 12, analyzedRoles: 10, rolesWithBloat: 4, averageBloatPercentage: 37.5, totalUnusedPermissions: 140, totalRecommendedReductions: 3 }
    stubBackend(() => ({ status: 200, body: reading }))
    const { GET } = await import("@/app/api/proxy/least-privilege/metrics/route")
    const res = await GET(req("/api/proxy/least-privilege/metrics"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(reading)
  })
})

describe("decision-routing proxy", () => {
  it("a held backend is a typed failure with no counts", async () => {
    stubBackend(() => HELD_503)
    const { GET } = await import("@/app/api/proxy/findings/decision-routing/route")
    const res = await GET(req("/api/proxy/findings/decision-routing?limit=30"))
    expect(res.ok).toBe(false)
    const body = await res.json()
    expect(body).not.toHaveProperty("total_findings")
    expect(body).not.toHaveProperty("scored_count")
  })

  it("a network failure is a typed failure with no counts", async () => {
    stubBackend(() => "throw")
    const { GET } = await import("@/app/api/proxy/findings/decision-routing/route")
    const res = await GET(req("/api/proxy/findings/decision-routing?limit=30"))
    expect(res.ok).toBe(false)
    expect(await res.json()).not.toHaveProperty("scored_count")
  })
})

describe("family-aggregate proxy", () => {
  it("a backend 200 that says discovery failed is a failure, not 'no systems', and is not cached", async () => {
    // api/service_risk_scores.py on a failed graph read: 200, nothing scored, an error named.
    const calls = stubBackend(() => ({ status: 200, body: { systems: [], total: 0, aggregate_layers: {}, errors: ["neo4j driver not initialized"] } }))
    const { GET } = await import("@/app/api/proxy/family-aggregate/route")
    const first = await GET(req("/api/proxy/family-aggregate"))
    expect(first.ok).toBe(false)
    const body = await first.json()
    expect(body).not.toHaveProperty("families")
    expect(body).not.toHaveProperty("total_systems")
    await GET(req("/api/proxy/family-aggregate"))
    expect(calls.length).toBe(2) // the failure was not served from cache
  })

  it("a held backend is a typed failure with no counts", async () => {
    stubBackend(() => HELD_503)
    const { GET } = await import("@/app/api/proxy/family-aggregate/route")
    const res = await GET(req("/api/proxy/family-aggregate"))
    expect(res.ok).toBe(false)
    expect(await res.json()).not.toHaveProperty("contributing_systems")
  })

  it("control: a partial reading keeps its errors, and a missing total is null, never 0", async () => {
    stubBackend(() => ({ status: 200, body: {
      aggregate_layers: { privilege: { score: 62, weight: 30, contributing_systems: 1 } },
      errors: ["system b: timeout"],
    } }))
    const { GET } = await import("@/app/api/proxy/family-aggregate/route")
    const res = await GET(req("/api/proxy/family-aggregate"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.families.privilege.score).toBe(62)
    expect(body.errors).toEqual(["system b: timeout"])
    expect(body.total_systems).toBeNull()
    expect(body.contributing_systems).toBeNull()
  })
})

describe("remediation timeline proxy", () => {
  for (const [name, outcome] of [
    ["an absent endpoint (404)", { status: 404, body: { detail: "Not Found" } }],
    ["a held backend (503)", HELD_503],
    ["a network failure", "throw"],
  ] as const) {
    it(`${name} answers degraded -- never an unflagged empty that reads as idle -- with no summary counts`, async () => {
      stubBackend(() => outcome as never)
      const { GET } = await import("@/app/api/proxy/remediation-history/timeline/route")
      const body = await (await GET(req("/api/proxy/remediation-history/timeline?limit=1"))).json()
      expect(body.degraded).toBe(true)
      expect(body.events).toEqual([])
      expect(body).not.toHaveProperty("summary")
    })
  }

  it("control: the backend's own empty answer is not degraded", async () => {
    stubBackend(() => ({ status: 200, body: { events: [], chart_data: [], summary: { total_events: 0 } } }))
    const { GET } = await import("@/app/api/proxy/remediation-history/timeline/route")
    const body = await (await GET(req("/api/proxy/remediation-history/timeline?limit=1"))).json()
    expect(body.degraded).toBeUndefined()
    expect(body.events).toEqual([])
  })
})

describe("recent-activity proxy", () => {
  it("every source failing names every failure", async () => {
    stubBackend(() => HELD_503)
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.items).toEqual([])
    expect(body.errors).toHaveLength(3)
  })

  it("an older feed served over a failed read is stamped stale", async () => {
    setCached("recent-activity", { items: [{ kind: "snapshot", timestamp: "2026-10-01T00:00:00Z" }], total: 1, errors: [] }, -1)
    stubBackend(() => HELD_503)
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.items).toHaveLength(1)
    expect(body.stale).toBe(true)
  })

  const OLD_FEED = { items: [{ kind: "snapshot", timestamp: "2026-10-01T00:00:00Z" }], total: 1, errors: [] }
  const quiet = (url: string) => ({
    status: 200,
    body: url.includes("/timeline") ? { events: [] } : url.includes("/snapshots") ? { snapshots: [] } : { rollbacks: [] },
  })

  it("a fresh read in which every source answered empty replaces an older feed", async () => {
    setCached("recent-activity", OLD_FEED, -1)
    stubBackend(quiet)
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.items).toEqual([])
    expect(body.errors).toEqual([])
    expect(body.stale).toBeUndefined()
  })

  it("a refused source (401/403) is never covered by a replay of earlier data", async () => {
    setCached("recent-activity", OLD_FEED, -1)
    stubBackend((url) => (url.includes("/snapshots") ? { status: 403, body: { detail: "forbidden" } } : quiet(url)))
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.items).toEqual([])
    expect(body.stale).toBeUndefined()
    expect(body.errors).toEqual(["snapshots: backend 403"])
  })

  it("a 200 without the expected list is a source error, not an empty source", async () => {
    stubBackend((url) => (url.includes("/rollbacks") || url.includes("rollback") ? { status: 200, body: { error: "held" } } : quiet(url)))
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toMatch(/^rollbacks parse: response carried no rollbacks list/)
  })

  it("control: a feed every source answered is not stamped", async () => {
    stubBackend((url) => ({
      status: 200,
      body: url.includes("/timeline") ? { events: [] } : url.includes("/snapshots") ? { snapshots: [] } : { rollbacks: [] },
    }))
    const { GET } = await import("@/app/api/proxy/recent-activity/route")
    const body = await (await GET(req("/api/proxy/recent-activity"))).json()
    expect(body.errors).toEqual([])
    expect(body.stale).toBeUndefined()
  })
})
