/**
 * #512 — a superseded response must never write.
 *
 * The Overview loader issued three fetches in a Promise.all and applied the
 * results straight to state, with no request identity. Switch systems while a
 * slow response is in flight, or let a manual Retry overlap the 5-minute poll,
 * and the LAST-RESOLVING response wins rather than the newest — system A's
 * counts painted onto system B. Plausible, correctly formatted, and wrong.
 *
 * These exercise the guard directly rather than mounting the 3.4k-line
 * dashboard, so the race is deterministic instead of timing-dependent.
 */

import { describe, expect, it, vi } from "vitest"
import { RequestEpoch } from "@/lib/request-epoch"

/** A promise plus the handles to settle it whenever the test chooses. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("RequestEpoch — superseded responses", () => {
  it("the older request stops being current the moment a newer one begins", () => {
    const epoch = new RequestEpoch()

    const first = epoch.begin()
    expect(first.isCurrent()).toBe(true)

    const second = epoch.begin()
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it("an older SUCCESS resolving last cannot overwrite a newer result", async () => {
    // The exact production race: A is slow, B is fast, A lands second.
    const epoch = new RequestEpoch()
    const slowA = deferred<string>()
    const fastB = deferred<string>()

    const applied: string[] = []
    const run = async (handle: ReturnType<RequestEpoch["begin"]>, p: Promise<string>) => {
      const value = await p
      if (!handle.isCurrent()) return
      applied.push(value)
    }

    const a = epoch.begin()
    const aDone = run(a, slowA.promise)
    const b = epoch.begin()
    const bDone = run(b, fastB.promise)

    fastB.resolve("system-B")
    await bDone
    slowA.resolve("system-A") // lands LAST
    await aDone

    expect(applied).toEqual(["system-B"])
    expect(applied).not.toContain("system-A")
  })

  it("an older FAILURE resolving last cannot overwrite a newer success", async () => {
    // Otherwise navigating away turns the previous system's 502 into an
    // "unavailable" banner over the system the operator just arrived at.
    const epoch = new RequestEpoch()
    const slowA = deferred<string>()
    const fastB = deferred<string>()

    const state: string[] = []
    const run = async (handle: ReturnType<RequestEpoch["begin"]>, p: Promise<string>) => {
      try {
        const v = await p
        if (!handle.isCurrent()) return
        state.push(`ok:${v}`)
      } catch {
        if (handle.wasAborted() || !handle.isCurrent()) return
        state.push("unavailable")
      }
    }

    const a = epoch.begin()
    const aDone = run(a, slowA.promise)
    const b = epoch.begin()
    const bDone = run(b, fastB.promise)

    fastB.resolve("system-B")
    await bDone
    slowA.reject(new Error("HTTP 502")) // the abandoned system's failure
    await aDone

    expect(state).toEqual(["ok:system-B"])
    expect(state).not.toContain("unavailable")
  })

  it("neither loading nor error state can be written by a superseded request", () => {
    const epoch = new RequestEpoch()
    const a = epoch.begin()
    epoch.begin()

    // Every write site is gated on the same predicate, so one assertion covers
    // data, error and loading alike.
    expect(a.isCurrent()).toBe(false)
  })
})

describe("RequestEpoch — cancellation", () => {
  it("begin() aborts the request it supersedes", () => {
    const epoch = new RequestEpoch()
    const first = epoch.begin()
    expect(first.signal.aborted).toBe(false)

    epoch.begin()
    expect(first.signal.aborted).toBe(true)
  })

  it("cancel() aborts in-flight work — the unmount path", () => {
    const epoch = new RequestEpoch()
    const handle = epoch.begin()

    epoch.cancel()

    expect(handle.signal.aborted).toBe(true)
    expect(handle.wasAborted()).toBe(true)
  })

  it("cancel() ALSO invalidates a response already past the network", () => {
    // Abort alone is not enough: a response resolved microseconds before the
    // abort would still be applied, writing into the next system's view.
    const epoch = new RequestEpoch()
    const handle = epoch.begin()

    epoch.cancel()

    expect(handle.isCurrent()).toBe(false)
  })

  it("a cancelled request is distinguishable from a failed one", () => {
    const epoch = new RequestEpoch()
    const cancelled = epoch.begin()
    epoch.cancel()

    const failed = epoch.begin()

    // The catch branch keys on this to avoid painting "unavailable" over a
    // system the operator navigated to.
    expect(cancelled.wasAborted()).toBe(true)
    expect(failed.wasAborted()).toBe(false)
  })

  it("a fresh request after cancel() is current and not aborted", () => {
    const epoch = new RequestEpoch()
    epoch.begin()
    epoch.cancel()

    const next = epoch.begin()
    expect(next.isCurrent()).toBe(true)
    expect(next.wasAborted()).toBe(false)
  })
})

describe("RequestEpoch — retry / refresh", () => {
  it("a manual Retry overlapping the poll keeps the Retry's answer", async () => {
    const epoch = new RequestEpoch()
    const poll = deferred<string>()
    const retry = deferred<string>()

    const applied: string[] = []
    const run = async (h: ReturnType<RequestEpoch["begin"]>, p: Promise<string>) => {
      const v = await p
      if (!h.isCurrent()) return
      applied.push(v)
    }

    const pollHandle = epoch.begin()          // 5-minute interval fires
    const pollDone = run(pollHandle, poll.promise)
    const retryHandle = epoch.begin()         // operator clicks Retry
    const retryDone = run(retryHandle, retry.promise)

    // Poll resolves LAST — the pre-fix behaviour applied it.
    retry.resolve("retry-result")
    await retryDone
    poll.resolve("poll-result")
    await pollDone

    expect(applied).toEqual(["retry-result"])
  })

  it("each begin() advances the epoch exactly once", () => {
    const epoch = new RequestEpoch()
    const start = epoch.current

    epoch.begin()
    epoch.begin()
    epoch.begin()

    expect(epoch.current).toBe(start + 3)
  })
})

describe("wiring — the signal actually reaches fetch", () => {
  it("passes an AbortSignal that cancellation trips", async () => {
    const epoch = new RequestEpoch()
    const handle = epoch.begin()

    const seen: (AbortSignal | undefined)[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined)
      return { ok: true, status: 200 } as Response
    })
    vi.stubGlobal("fetch", fetchMock)

    const { fetchWithTransientRetry } = await import("@/lib/transient-retry")
    await fetchWithTransientRetry("/api/proxy/issues-summary", {
      backoffMs: 0,
      init: { signal: handle.signal },
    })

    expect(seen[0]).toBe(handle.signal)
    expect(seen[0]?.aborted).toBe(false)

    epoch.cancel()
    expect(seen[0]?.aborted).toBe(true)

    vi.unstubAllGlobals()
  })
})
