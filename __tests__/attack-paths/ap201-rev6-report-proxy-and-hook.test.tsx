/**
 * AP201 Rev 6 Day 4.3 · the per-path report read now that an install serves it from the publication.
 *
 * The bodies are the backend's own shapes (api/attack_path_report.py on enforce, review R1 of ec41fb51a): a 200
 * `not_recorded` hold with `hold_reason`, a typed 503 (`SEMANTIC_READ_UNAVAILABLE` / `SERVING_ROUTE_HELD`), a 422
 * `ACCOUNT_SCOPE_REQUIRED`, and a served report that may carry `fromStaleCache`. CONSTRUCTED report bodies only.
 *
 * Real: the Next route handler, the hook. Stubbed: upstream `fetch` (recorded) and the proxy cache (in memory).
 */
import { renderHook, waitFor } from "@testing-library/react"
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
    TTL_FAST: 30_000,
    TTL_STD: 60_000,
    TTL_SLOW: 300_000,
  }
})

import { GET as reportProxy } from "@/app/api/proxy/attack-paths/path/[pathId]/report/route"
import { useAttackPathReport } from "@/components/attack-paths-v2/use-attack-path-report"

const PATH_ID = "a".repeat(64)
const REPORT = { path_id: PATH_ID, claims: [], gates: {}, attacker_steps: [], damage_matrix: [], missing_evidence: [] }
const HOLD = { semantic_status: "not_recorded", source_generation: null, graph_version: null, coverage: null,
  hold_reason: "PATH_REPORT_PUBLICATION_NOT_RECORDED", hold_detail: "path_not_in_publication" }
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

let answer: () => Response
let upstream: ReturnType<typeof vi.fn>
beforeEach(async () => {
  const cache = await import("@/lib/server/proxy-cache")
  ;(cache as unknown as { __store: Map<string, unknown> }).__store.clear()
  answer = () => respond(200, REPORT)
  upstream = vi.fn(async () => answer())
  vi.stubGlobal("fetch", upstream)
})
afterEach(() => vi.unstubAllGlobals())

const proxy = (query = "") =>
  reportProxy(new NextRequest(`http://fe.local/api/proxy/attack-paths/path/${PATH_ID}/report${query}`),
    { params: Promise.resolve({ pathId: PATH_ID }) })
const upstreamUrls = () => upstream.mock.calls.map((c) => String(c[0]))

describe("report proxy", () => {
  it("forwards exactly the tenant / account claims and keys its cache by them", async () => {
    await proxy("?customer_id=acme&account_id=111111111111&evil=1")
    const qs = new URL(upstreamUrls()[0]).searchParams
    expect([qs.get("customer_id"), qs.get("account_id"), qs.get("evil")]).toEqual(["acme", "111111111111", null])
    await proxy("?customer_id=acme&account_id=222222222222")             // another account: never the cached one
    expect(upstream).toHaveBeenCalledTimes(2)
    await proxy("?customer_id=acme&account_id=111111111111")             // the same account: cached
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it("never caches a 200 hold or a report served marked stale, and serves them no-store", async () => {
    answer = () => respond(200, HOLD)
    const held = await proxy()
    expect(held.headers.get("cache-control")).toBe("no-store")
    expect(await held.json()).toEqual(HOLD)
    await proxy()
    expect(upstream).toHaveBeenCalledTimes(2)
    answer = () => respond(200, { ...REPORT, fromStaleCache: true })
    expect((await proxy()).headers.get("cache-control")).toBe("no-store")
    await proxy()
    expect(upstream).toHaveBeenCalledTimes(4)
  })

  it("passes typed refusals through with their status and body; an untyped 503 is not called a Neo4j outage", async () => {
    for (const [status, body] of [
      [503, { detail: { code: "SEMANTIC_READ_UNAVAILABLE", reason: "PATH_REPORT_PUBLICATION_UNAVAILABLE:x" } }],
      [503, { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } }],
      [422, { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts" } }],
    ] as const) {
      answer = () => respond(status, body)
      const res = await proxy()
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual(body)
      expect(res.headers.get("cache-control")).toBe("no-store")
    }
    answer = () => respond(503, { detail: "Graph driver unavailable" })
    const plain = await proxy()
    expect((await plain.json()).code).toBe("REPORT_UNAVAILABLE")
  })
})

describe("report hook", () => {
  const path = { id: PATH_ID, attack_path_id: PATH_ID, nodes: [], edges: [] } as never

  it("says a 200 hold in the server's words once, without retrying it as a cold backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, HOLD)))
    const { result } = renderHook(() => useAttackPathReport(path))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("Attack-path report: Not recorded yet — PATH_REPORT_PUBLICATION_NOT_RECORDED")
    expect(result.current.report).toBeNull()
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it("says a typed 503 once as not available / unavailable, never an object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, { detail: { code: "SERVING_ROUTE_HELD", reason: "HELD_CUSTOMER_READ" } })))
    const { result } = renderHook(() => useAttackPathReport(path))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("Attack-path report is not available on this install (SERVING_ROUTE_HELD: HELD_CUSTOMER_READ). This is not a result.")
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it("marks a report served stale as stale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { ...REPORT, fromStaleCache: true })))
    const { result } = renderHook(() => useAttackPathReport(path))
    await waitFor(() => expect(result.current.report).not.toBeNull())
    expect(result.current.stale).toBe(true)
  })
})
