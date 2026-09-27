/**
 * A server REFUSAL or HOLD is never masked by the browser cache.
 *
 * useCachedFetch keeps last-good data over TRANSPORT failures (untyped 5xx,
 * timeouts) — C1 relies on that, and use-cached-fetch-stale-recovery.test.ts
 * pins it. A typed answer that this read is not served is different:
 *
 *   503 detail.code SERVING_READ_REFUSED | SERVING_ROUTE_HELD
 *     → drop the cached entry for this key, data null, error + hold name it.
 *   200 semantic_status not_recorded | unavailable
 *     → never cached, never shown as data; evicts what the key held.
 *   503 detail.code SEMANTIC_READ_UNAVAILABLE (a reader failure)
 *     → transport rule: last-good kept, labelled stale.
 *
 * Bodies are the backend's own, captured in
 * __tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import holdsFixture from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-holds.json"
import twoCustomers from "@/__tests__/fixtures/cf01-attack-path-evidence/iap-payments-two-customers.json"
import { STALE_BACKEND_RECOVERING, useCachedFetch } from "@/lib/use-cached-fetch"

const HOLDS = holdsFixture as Record<string, { status: number; body: unknown }>
const KEY = "test:semantic-hold"
const URL = "/api/proxy/identity-attack-paths/payments"
const GOOD = twoCustomers.acme

function seedCache(payload: unknown) {
  window.localStorage.setItem(`cyntro:swr:${KEY}`, JSON.stringify({ data: payload, ts: Date.now() }))
}

function cacheEntry(): unknown {
  const raw = window.localStorage.getItem(`cyntro:swr:${KEY}`)
  return raw ? JSON.parse(raw) : null
}

function respond(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("typed refusal after a cached success", () => {
  it.each([
    ["install_serving_read_refused", "refused", "SERVING_READ_REFUSED: FACADE_READ_OUTSIDE_ADMISSION"],
    ["install_serving_route_held", "route_held", "SERVING_ROUTE_HELD: HELD_CUSTOMER_READ"],
  ])("%s clears the cache and surfaces the refusal", async (key, kind, reason) => {
    seedCache(GOOD)
    const fetchMock = vi.fn(() => respond(HOLDS[key].status, HOLDS[key].body))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY, transientRetries: 2 }),
    )
    // Precondition: the cached map painted first.
    expect(result.current.data).toEqual(GOOD)

    await waitFor(() => expect(result.current.hold).not.toBeNull())
    expect(result.current.hold).toEqual({ kind, reason })
    expect(result.current.data).toBeNull()
    expect(result.current.isStale).toBe(false)
    expect(result.current.error).toContain(reason)
    expect(cacheEntry()).toBeNull()
    // An answer, not a blip: not retried even with transientRetries.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("untyped 503 after a cached success (unchanged)", () => {
  it("keeps last-good, labelled stale, and keeps the cache", async () => {
    seedCache(GOOD)
    vi.stubGlobal("fetch", vi.fn(() => respond(503, { detail: "Service Unavailable" })))

    const { result } = renderHook(() => useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY }))

    await waitFor(() => expect(result.current.isStale).toBe(true))
    expect(result.current.data).toEqual(GOOD)
    expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING)
    expect(result.current.hold).toBeNull()
    expect(result.current.error).toBeNull()
    expect(cacheEntry()).not.toBeNull()
  })

  it("SEMANTIC_READ_UNAVAILABLE is a reader failure: last-good kept, labelled stale", async () => {
    seedCache(GOOD)
    const hold = HOLDS.install_semantic_read_unavailable
    vi.stubGlobal("fetch", vi.fn(() => respond(hold.status, hold.body)))

    const { result } = renderHook(() => useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY }))

    await waitFor(() => expect(result.current.isStale).toBe(true))
    expect(result.current.data).toEqual(GOOD)
    expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING)
    expect(result.current.hold).toBeNull()
    expect(cacheEntry()).not.toBeNull()
  })
})

describe("200 hold", () => {
  it.each([
    ["install_not_recorded", "not_recorded", "CONSUMER_READINESS_UNOBSERVABLE"],
    ["c1_unavailable", "unavailable", "503: Neo4j not connected"],
  ])("%s is never cached and evicts the cached map", async (key, kind, reason) => {
    seedCache(GOOD)
    vi.stubGlobal("fetch", vi.fn(() => respond(200, HOLDS[key].body)))

    const { result } = renderHook(() => useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY }))

    await waitFor(() => expect(result.current.hold).not.toBeNull())
    expect(result.current.hold).toEqual({ kind, reason })
    expect(result.current.data).toBeNull()
    expect(result.current.error).toContain(reason)
    expect(cacheEntry()).toBeNull()
  })

  it("with nothing cached, a hold is still not written", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(200, HOLDS.install_not_recorded.body)))
    const { result } = renderHook(() => useCachedFetch<unknown>(URL, { cacheKey: KEY }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hold?.kind).toBe("not_recorded")
    expect(cacheEntry()).toBeNull()
  })

  it("control: a populated 200 is cached and carries no hold", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(200, GOOD)))
    const { result } = renderHook(() => useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(GOOD)
    expect(result.current.hold).toBeNull()
    expect(cacheEntry()).not.toBeNull()
  })

  it("a later success clears the hold", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond(200, HOLDS.install_not_recorded.body))
      .mockImplementation(() => respond(200, GOOD))
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useCachedFetch<typeof GOOD>(URL, { cacheKey: KEY }))
    await waitFor(() => expect(result.current.hold).not.toBeNull())
    await act(async () => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.data).toEqual(GOOD))
    expect(result.current.hold).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
