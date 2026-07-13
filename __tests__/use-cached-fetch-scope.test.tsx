/// <reference types="vitest/globals" />

import { renderHook, cleanup } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCachedFetch } from "@/lib/use-cached-fetch"

// Pins the cacheKey-change reset in useCachedFetch. The estate map's VPC
// scope picker swaps the hook's cacheKey mid-mount; before the fix the
// hook kept the PREVIOUS key's `data` until the new fetch resolved — and
// if that fetch failed, the error was swallowed (data !== null) and the
// operator saw the wrong scope's numbers indefinitely (EC2 chip stuck on
// the old VPC's count). See lib/use-cached-fetch.ts "Re-sync rendered
// state when cacheKey changes".

const PREFIX = "cyntro:swr:"

function seed(key: string, data: unknown, ageMs = 0) {
  window.localStorage.setItem(
    PREFIX + key,
    JSON.stringify({ ts: Date.now() - ageMs, data }),
  )
}

// A fetch that never settles — isolates the SYNCHRONOUS render-time reset
// from any background-fetch timing, so each assertion tests only the
// key-change behavior.
function hangingFetch() {
  return vi.fn(() => new Promise<Response>(() => {}))
}

const props = (key: string, url: string) => ({ key, url })
const render = () =>
  renderHook(
    ({ key, url }: { key: string; url: string }) =>
      useCachedFetch<{ ec2: number }>(url, { cacheKey: key }),
    { initialProps: props("scope:A", "/api/A") },
  )

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useCachedFetch — cacheKey change (scope switch)", () => {
  it("resets to loading (never keeps the old key's data) when switching to an uncached key", () => {
    seed("scope:A", { ec2: 7 })
    vi.stubGlobal("fetch", hangingFetch())

    const { result, rerender } = render()
    expect(result.current.data).toEqual({ ec2: 7 })

    rerender(props("scope:B", "/api/B"))
    // The core regression assertion: must NOT still read { ec2: 7 }.
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it("shows the new key's cached data instantly on switch (no wait for network)", () => {
    seed("scope:A", { ec2: 7 })
    seed("scope:B", { ec2: 4 })
    vi.stubGlobal("fetch", hangingFetch())

    const { result, rerender } = render()
    expect(result.current.data).toEqual({ ec2: 7 })

    rerender(props("scope:B", "/api/B"))
    expect(result.current.data).toEqual({ ec2: 4 })
  })

  it("does not reset when the cacheKey is unchanged (static-key consumers unaffected)", () => {
    seed("scope:A", { ec2: 7 })
    vi.stubGlobal("fetch", hangingFetch())

    const { result, rerender } = render()
    expect(result.current.data).toEqual({ ec2: 7 })

    rerender(props("scope:A", "/api/A")) // same key — e.g. a parent re-render
    expect(result.current.data).toEqual({ ec2: 7 })
  })
})

describe("useCachedFetch — Wave D computing envelope", () => {
  it("keeps last-good cache when fetch returns status=computing", async () => {
    const { waitFor } = await import("@testing-library/react")
    seed("topo:alon", { system_kpis: { n: 1 }, nodes: [{ id: "a" }] })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "computing",
            system_name: "alon-prod",
            staleReason: "peer_computing",
            system_kpis: null,
            nodes: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    const { result } = renderHook(() =>
      useCachedFetch<{ system_kpis: { n: number }; nodes: { id: string }[] }>(
        "/api/proxy/topology-risk/alon-prod",
        { cacheKey: "topo:alon" },
      ),
    )
    expect(result.current.data?.system_kpis).toEqual({ n: 1 })

    await waitFor(() => expect(result.current.isComputing).toBe(true))
    expect(result.current.data?.system_kpis).toEqual({ n: 1 })
    expect(result.current.data?.nodes).toEqual([{ id: "a" }])
    expect(result.current.isStale).toBe(true)
  })
})
