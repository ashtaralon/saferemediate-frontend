/**
 * Transport failure must NOT erase the last verified reading.
 *
 * 2026-08-03: four backend PRs merged in a row, each restarting Render. Every
 * dashboard feed 504'd during the window. `failClosedOnError` cleared
 * localStorage and nulled the data, so a read-only executive page erased its
 * own last-known-good view, rendered "unavailable" in every section, and did
 * not recover when the backend came back — it needed a manual Refresh. The
 * data was in Neo4j the entire time.
 *
 * The rule these tests pin:
 *
 *   TRANSPORT failure (502/503/504/522/524, network throw, timeout)
 *     → keep the last verified reading, mark STALE, retry.
 *       A 504 is evidence the backend is unreachable. It is NOT evidence the
 *       cached reading became false.
 *
 *   SEMANTIC failure (4xx, or a payload that fails isCacheable)
 *     → discard. The backend answered authoritatively that the data is bad,
 *       and a wrong-but-confident number is worse than no number.
 *
 * Fail-closed belongs on the write path. Mutations stay disabled whenever the
 * reading is stale, partial or unavailable — that is asserted separately at
 * the card level; nothing here re-enables a mutation.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  STALE_BACKEND_RECOVERING,
  useCachedFetch,
} from "@/lib/use-cached-fetch"

const KEY = "test:stale-recovery"
const URL = "/api/proxy/test-feed"
const GOOD = { systems: [{ id: "s1" }, { id: "s2" }], total: 2 }

function seedCache(payload: unknown, ageMs = 0) {
  window.localStorage.setItem(
    `cyntro:swr:${KEY}`,
    JSON.stringify({ data: payload, ts: Date.now() - ageMs }),
  )
}

function cacheEntry(): unknown {
  const raw = window.localStorage.getItem(`cyntro:swr:${KEY}`)
  return raw ? JSON.parse(raw) : null
}

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("transport failure preserves the last verified reading", () => {
  // The exact statuses a Render restart / Vercel timeout produces.
  it.each([502, 503, 504, 522, 524])(
    "HTTP %i keeps data, marks stale, and does not clear the cache",
    async (status) => {
      seedCache(GOOD)
      vi.stubGlobal("fetch", vi.fn(() => respond(status)))

      const { result } = renderHook(() =>
        useCachedFetch<typeof GOOD>(URL, {
          cacheKey: KEY,
          failClosedOnError: true,
        }),
      )

      await waitFor(() => expect(result.current.isStale).toBe(true))

      expect(result.current.data).toEqual(GOOD)
      expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING)
      expect(result.current.error).toBeNull()
      // The regression: the entry used to be deleted here.
      expect(cacheEntry()).not.toBeNull()
    },
  )

  it("a thrown fetch (network/timeout) also preserves the reading", async () => {
    seedCache(GOOD)
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))))

    const { result } = renderHook(() =>
      useCachedFetch<typeof GOOD>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
      }),
    )

    await waitFor(() => expect(result.current.isStale).toBe(true))
    expect(result.current.data).toEqual(GOOD)
    expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING)
    expect(cacheEntry()).not.toBeNull()
  })

  it("recovers on its own once the backend returns — no manual Refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedCache(GOOD)
    const fresh = { systems: [{ id: "s1" }, { id: "s2" }, { id: "s3" }], total: 3 }
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond(504))
      .mockImplementation(() => respond(200, fresh))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useCachedFetch<typeof GOOD>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
        autoRetryMs: 1000,
      }),
    )

    await waitFor(() => expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })

    await waitFor(() => expect(result.current.isStale).toBe(false))
    expect(result.current.data).toEqual(fresh)
    expect(result.current.staleReason).toBeNull()
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it("stops retrying after recovery instead of polling forever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedCache(GOOD)
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond(504))
      .mockImplementation(() => respond(200, GOOD))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useCachedFetch<typeof GOOD>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
        autoRetryMs: 1000,
      }),
    )

    await waitFor(() => expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    await waitFor(() => expect(result.current.isStale).toBe(false))

    const afterRecovery = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fetchMock.mock.calls.length).toBe(afterRecovery)
  })

  it("retries an HTTP 200 stale proxy snapshot until a live response arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const stale = { ...GOOD, fromStaleCache: true, staleReason: "timeout" }
    const fresh = { systems: [{ id: "s1" }, { id: "s2" }, { id: "s3" }], total: 3 }
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond(200, stale))
      .mockImplementation(() => respond(200, fresh))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useCachedFetch<typeof stale | typeof fresh>(URL, {
        cacheKey: KEY,
        autoRetryMs: 1000,
      }),
    )

    await waitFor(() => expect(result.current.staleReason).toBe(STALE_BACKEND_RECOVERING))
    expect(result.current.isStale).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300)
    })

    await waitFor(() => expect(result.current.isStale).toBe(false))
    expect(result.current.data).toEqual(fresh)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe("semantic failure still discards — fail-closed is not weakened", () => {
  // A 4xx is the backend answering authoritatively. Unlike a 504, it IS
  // evidence about the data.
  it.each([400, 401, 403, 404, 422])(
    "HTTP %i clears the cache and nulls the data when failClosedOnError",
    async (status) => {
      seedCache(GOOD)
      vi.stubGlobal("fetch", vi.fn(() => respond(status)))

      const { result } = renderHook(() =>
        useCachedFetch<typeof GOOD>(URL, {
          cacheKey: KEY,
          failClosedOnError: true,
        }),
      )

      await waitFor(() => expect(result.current.error).toBe(`HTTP ${status}`))
      expect(result.current.data).toBeNull()
      expect(result.current.isStale).toBe(false)
      expect(result.current.staleReason).toBeNull()
      expect(cacheEntry()).toBeNull()
    },
  )

  it("a 200 carrying an error envelope is NOT cached as a reading", async () => {
    // The defect this guards: the proxy returns HTTP 200 with an `error`
    // field and zeroed counts. Preserving that under a STALE label would
    // cache a lie — worse than showing nothing.
    const poisoned = { systems: [], total: 0, error: "upstream_unavailable" }
    const isCacheable = (d: unknown) =>
      !!d && typeof d === "object" && !("error" in (d as object))

    vi.stubGlobal("fetch", vi.fn(() => respond(200, poisoned)))

    const { result } = renderHook(() =>
      useCachedFetch<typeof poisoned>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
        isCacheable,
      }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(cacheEntry()).toBeNull()
  })

  it("REGRESSION: a rejected 200 must not be beaten by a cached READY", async () => {
    // The inversion caught in review of de52ed5c. A 200 NOT_READY/HELD is the
    // backend answering authoritatively about RIGHT NOW. Preferring an older
    // READY presented a stale all-clear as current and discarded the live held
    // reason — semantic failure failing OPEN, the exact bug failClosedOnError
    // exists to prevent.
    seedCache(GOOD) // a cached READY-shaped reading
    const held = { systems: [], total: 0, serve_state: "NOT_READY", error: "held" }
    const isCacheable = (d: unknown) =>
      !!d && typeof d === "object" && !("error" in (d as object))

    vi.stubGlobal("fetch", vi.fn(() => respond(200, held)))

    const { result } = renderHook(() =>
      useCachedFetch<typeof held>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
        isCacheable,
      }),
    )

    // Wait on something only true AFTER the response settles. `loading` is
    // false from the first render here — the cache is seeded, so there is no
    // loading phase — which made an earlier version of this test race the
    // fetch and fail ~1 run in 3.
    await waitFor(() => expect(result.current.data).toEqual(held))

    // The old READY is gone from the screen...
    expect(result.current.data).not.toEqual(GOOD)
    // ...and from storage, so it cannot return on the next mount.
    expect(cacheEntry()).toBeNull()
    // The current held envelope is what renders — the card shows its honest
    // NOT_READY state rather than blanking.
    expect(result.current.data).toEqual(held)
    // And it is never dressed up as a retained reading.
    expect(result.current.isStale).toBe(false)
    expect(result.current.staleReason).toBeNull()
  })

  it("a transport failure never resurrects a payload that fails isCacheable", async () => {
    // Seed a poisoned entry, then 504. isCacheable must gate the fallback
    // read too, or the recovery path becomes a way to serve rejected data.
    const poisoned = { systems: [], total: 0, error: "upstream_unavailable" }
    seedCache(poisoned)
    const isCacheable = (d: unknown) =>
      !!d && typeof d === "object" && !("error" in (d as object))

    vi.stubGlobal("fetch", vi.fn(() => respond(504)))

    const { result } = renderHook(() =>
      useCachedFetch<typeof poisoned>(URL, {
        cacheKey: KEY,
        failClosedOnError: true,
        isCacheable,
      }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.staleReason).toBeNull()
  })
})
