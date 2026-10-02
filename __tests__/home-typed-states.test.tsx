/**
 * Home H1: a typed server state reaches the page as that state.
 *
 * Bodies are the backend's own (cyntro_data/semantic/estate_read.py _refuse_http and
 * held_route_refusal; api/system_resources.py collection_not_served_answer and
 * member_account_fields). Observed live on a control plane with no workload account: every held
 * read answered 503 INVENTORY_SCOPE_UNAVAILABLE/NO_DATA_ACCOUNTS, and the proxies turned that into
 * a bare 502 that the client replayed as "backend recovering", or the systems proxy into `[]`.
 * Each absence check has a control.
 */
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { relayBackendError } from "@/lib/server/proxy-error"
import { clearCached, setCached } from "@/lib/server/proxy-cache"
import { semanticHoldMessage, semanticStatusHold, typedServingRefusal } from "@/lib/semantic-hold"
import { systemsCoverageGaps } from "@/lib/systems-coverage"
import { useCachedFetch } from "@/lib/use-cached-fetch"

const NO_DATA = { detail: { code: "INVENTORY_SCOPE_UNAVAILABLE", reason: "NO_DATA_ACCOUNTS" } }
const HELD = { detail: { code: "SERVING_ROUTE_HELD", reason: "READ_MODEL_MISSING", read_model: "lp_analysis_views" } }
const SCOPE_REQUIRED = { detail: { code: "ACCOUNT_SCOPE_REQUIRED", reason: "several workload accounts are registered; name one with account_id" } }
const MISMATCH = { detail: { code: "INVENTORY_SCOPE_MISMATCH", reason: "CLAIM_OUTSIDE_SERVER_SCOPE" } }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function stubBackend(route: (url: string, n: number) => Response) {
  let n = 0
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    n += 1
    return route(url, n)
  }))
  return calls
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  window.localStorage.clear()
  clearCached("remediation-timeline:limit=1")
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("proxy relay", () => {
  it("a typed 503 is relayed typed with its reason and read model; an untyped 503 stays a generic 502", async () => {
    const typed = await relayBackendError(json(503, HELD))
    expect(typed.status).toBe(503)
    expect((await typed.json()).detail).toEqual({ code: "SERVING_ROUTE_HELD", reason: "READ_MODEL_MISSING", read_model: "lp_analysis_views" })
    const untyped = await relayBackendError(new Response("Traceback: boom", { status: 503 }))
    expect(untyped.status).toBe(502)
    expect(JSON.stringify(await untyped.json())).not.toContain("Traceback")
  })

  it("a 422 / 403 scope refusal keeps its status and typed detail", async () => {
    const required = await relayBackendError(json(422, SCOPE_REQUIRED))
    expect(required.status).toBe(422)
    expect((await required.json()).detail.code).toBe("ACCOUNT_SCOPE_REQUIRED")
    const denied = await relayBackendError(json(403, MISMATCH))
    expect(denied.status).toBe(403)
    expect((await denied.json()).detail.reason).toBe("CLAIM_OUTSIDE_SERVER_SCOPE")
  })
})

describe("systems proxy", () => {
  const req = (q = "customer_id=localtest") => new NextRequest(`https://app.example/api/proxy/systems?${q}`)

  it("relays the backend's not-recorded hold -- systems null, never [] -- and never caches it", async () => {
    const calls = stubBackend(() => json(200, { systems: null, count: null, semantic_status: "not_recorded",
      collection_status: "NOT_RECORDED", hold_reason: "NO_DATA_ACCOUNTS" }))
    const { GET } = await import("@/app/api/proxy/systems/route")
    const body = await (await GET(req("customer_id=hold-a"))).json()
    expect(body.systems).toBeNull()
    expect(body.semantic_status).toBe("not_recorded")
    expect(body.hold_reason).toBe("NO_DATA_ACCOUNTS")
    await GET(req("customer_id=hold-a"))
    expect(calls).toHaveLength(2)
  })

  it("a typed 503 is relayed typed and not retried", async () => {
    const calls = stubBackend(() => json(503, NO_DATA))
    const { GET } = await import("@/app/api/proxy/systems/route")
    const res = await GET(req("customer_id=typed-b"))
    expect(res.status).toBe(503)
    expect((await res.json()).detail.reason).toBe("NO_DATA_ACCOUNTS")
    expect(calls).toHaveLength(1)
  })

  it("control: a served answer keeps its systems and relays what it did not cover", async () => {
    stubBackend(() => json(200, { systems: [{ name: "orders", SystemName: "orders" }], count: 1, semantic_status: "populated",
      accounts_held: { "416651950952": "CONSUMER_NOT_READY" }, regions_not_served: { "416651950952": ["us-east-1"] } }))
    const { GET } = await import("@/app/api/proxy/systems/route")
    const body = await (await GET(req("customer_id=served-c"))).json()
    expect(body.systems).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.accounts_held).toEqual({ "416651950952": "CONSUMER_NOT_READY" })
    expect(systemsCoverageGaps(body)).toEqual([
      "Account 416651950952 is not served yet (CONSUMER_NOT_READY)",
      "Account 416651950952: us-east-1 not served by this install",
    ])
  })
})

describe("issues-summary proxy never replays over a refusal", () => {
  const READY = { serve_state: "READY", analysis_complete: true, total: 3, success: true }
  const req = () => new NextRequest("https://app.example/api/proxy/issues-summary?systemName=refusal-test")

  it.each([
    ["typed hold (503)", 503, NO_DATA],
    ["401", 401, { detail: "unauthenticated" }],
    ["422 scope required", 422, SCOPE_REQUIRED],
  ])("%s after a cached READY answer is relayed, not replayed", async (_name, status, body) => {
    stubBackend((_url, n) => (n === 1 ? json(200, READY) : json(status as number, body)))
    const { GET } = await import("@/app/api/proxy/issues-summary/route")
    await GET(req())
    const res = await GET(req())
    expect(res.status).toBe(status)
    expect((await res.json()).fromStaleCache).toBeUndefined()
  })

  it("control: a transport failure after a cached READY answer replays it, marked stale", async () => {
    stubBackend((_url, n) => (n === 1 ? json(200, READY) : new Response("bad gateway", { status: 502 })))
    const { GET } = await import("@/app/api/proxy/issues-summary/route")
    const r = () => new NextRequest("https://app.example/api/proxy/issues-summary?systemName=transport-test")
    await GET(r())
    const body = await (await GET(r())).json()
    expect(body.fromStaleCache).toBe(true)
    expect(body.serve_state).toBe("NOT_READY")
  })
})

describe("timeline proxy", () => {
  const OLD = { events: [{ event_id: "e1", timestamp: "2026-10-01T00:00:00Z" }], chart_data: [] }
  const req = () => new NextRequest("https://app.example/api/proxy/remediation-history/timeline?limit=1")

  it("a 403 or typed hold is never covered by a replay", async () => {
    for (const [status, body] of [[403, { detail: "forbidden" }], [503, NO_DATA]] as const) {
      setCached("remediation-timeline:limit=1", OLD, -1)
      stubBackend(() => json(status, body))
      const { GET } = await import("@/app/api/proxy/remediation-history/timeline/route")
      const out = await (await GET(req())).json()
      expect(out.degraded).toBe(true)
      expect(out.events).toEqual([])
    }
  })

  it("control: a transport failure replays the older list, stamped stale", async () => {
    setCached("remediation-timeline:limit=1", OLD, -1)
    stubBackend(() => new Response("boom", { status: 500 }))
    const { GET } = await import("@/app/api/proxy/remediation-history/timeline/route")
    const out = await (await GET(req())).json()
    expect(out.events).toHaveLength(1)
    expect(out.stale).toBe(true)
  })
})

describe("classification", () => {
  it("the scope codes are server states with plain words", () => {
    expect(semanticHoldMessage(typedServingRefusal(NO_DATA)!)).toBe(
      "No workload account is connected yet — connect one in Settings › Accounts")
    expect(typedServingRefusal(SCOPE_REQUIRED)!.kind).toBe("scope_required")
    // By default a view does not send a selected account: never point at the scope bar.
    expect(semanticHoldMessage(typedServingRefusal(SCOPE_REQUIRED)!)).toBe(
      "Several workload accounts are registered — this view does not read one selected account, so it cannot show this")
    expect(semanticHoldMessage(typedServingRefusal(SCOPE_REQUIRED)!)).not.toMatch(/scope bar/)
    expect(typedServingRefusal(MISMATCH)!.kind).toBe("scope_denied")
    expect(typedServingRefusal({ detail: { code: "SOMETHING_ELSE" } })).toBeNull()
    expect(semanticHoldMessage(semanticStatusHold({ semantic_status: "not_recorded", hold_reason: "REGION_NOT_SERVED:us-east-1" })!))
      .toBe("Region us-east-1 is not served by this install yet")
  })

  it("accountSelection words ACCOUNT_SCOPE_REQUIRED only -- every other state keeps its own words", () => {
    const required = typedServingRefusal(SCOPE_REQUIRED)!
    expect(semanticHoldMessage(required, { accountSelection: "offer" })).toBe(
      "Several workload accounts are registered — choose one account in the scope bar to see this")
    expect(semanticHoldMessage(required, { accountSelection: "diagnose" })).toBe(
      "An account is selected, but the server still asked for one (ACCOUNT_SCOPE_REQUIRED) — the selection did not reach this read")
    for (const selection of ["offer", "diagnose"] as const) {
      expect(semanticHoldMessage(typedServingRefusal(NO_DATA)!, { accountSelection: selection })).toBe(
        "No workload account is connected yet — connect one in Settings › Accounts")
      expect(semanticHoldMessage(typedServingRefusal(MISMATCH)!, { accountSelection: selection })).toBe(
        semanticHoldMessage(typedServingRefusal(MISMATCH)!))
    }
  })
})

describe("fetch hook", () => {
  const KEY = "test:typed-states"
  const URL = "/api/proxy/whatever"
  const seed = () => window.localStorage.setItem(`cyntro:swr:${KEY}`, JSON.stringify({ data: { n: 1 }, ts: Date.now() }))

  it.each([[401, /session is no longer valid/], [403, /Not permitted/]])(
    "%s drops the cached reading and never replays it", async (status, message) => {
      seed()
      vi.stubGlobal("fetch", vi.fn(async () => json(status as number, { detail: "no" })))
      const { result } = renderHook(() => useCachedFetch<{ n: number }>(URL, { cacheKey: KEY }))
      await waitFor(() => expect(result.current.error).toMatch(message as RegExp))
      expect(result.current.data).toBeNull()
      expect(window.localStorage.getItem(`cyntro:swr:${KEY}`)).toBeNull()
    })

  it("a 422 ACCOUNT_SCOPE_REQUIRED is a hold with its wording, not retried", async () => {
    const fetchMock = vi.fn(async () => json(422, SCOPE_REQUIRED))
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useCachedFetch(URL, { cacheKey: KEY, transientRetries: 2 }))
    await waitFor(() => expect(result.current.hold?.kind).toBe("scope_required"))
    expect(result.current.error).toMatch(/does not read one selected account/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    [undefined, /does not read one selected account/],
    ["offer", /choose one account in the scope bar/],
    ["diagnose", /An account is selected, but the server still asked for one \(ACCOUNT_SCOPE_REQUIRED\)/],
  ] as const)("a 422 ACCOUNT_SCOPE_REQUIRED with accountSelection=%s is worded for what the caller can do", async (selection, words) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(422, SCOPE_REQUIRED)))
    const { result } = renderHook(() => useCachedFetch(URL, { cacheKey: KEY, accountSelection: selection }))
    await waitFor(() => expect(result.current.hold?.kind).toBe("scope_required"))
    expect(result.current.error).toMatch(words)
    expect(result.current.data).toBeNull()
  })

  it("control: a transport 502 keeps the cached reading, marked stale", async () => {
    seed()
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 502 })))
    const { result } = renderHook(() => useCachedFetch<{ n: number }>(URL, { cacheKey: KEY }))
    await waitFor(() => expect(result.current.isStale).toBe(true))
    expect(result.current.data).toEqual({ n: 1 })
  })
})
