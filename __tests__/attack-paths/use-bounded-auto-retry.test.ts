/**
 * AP201 · useBoundedAutoRetry — the bound on the Attack Paths page's background-IAP auto-retry.
 *
 * Real: the hook. CONSTRUCTED: the read's state (error / data / loading), driven the way useCachedFetch drives it —
 * `retry()` clears the error, the failed re-read sets it again. The page-level storm case in
 * ap201-claimed-defects.test.tsx cannot observe the loop (React defers the re-render that re-arms the timer past the
 * act scope: it reads 2 with and without the bound), so this is the test that proves the bound.
 */
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useBoundedAutoRetry } from "@/components/attack-paths-v2/use-bounded-auto-retry"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const isTransport = (e: unknown) => String(e).includes("502") || String(e).includes("504")

type Props = { error: unknown; data: unknown; loading: boolean; resetKey?: unknown }

function mount(retry: () => void, initial: Props, limit = 3) {
  return renderHook((p: Props) => useBoundedAutoRetry({ ...p, retry, limit, delayMs: 8_000, isTransient: isTransport }), {
    initialProps: initial,
  })
}

/** One failed re-read, the way useCachedFetch reports it: retry() cleared the error, the 502 set it back. */
async function failedReread(h: ReturnType<typeof mount>) {
  await act(async () => { h.rerender({ error: null, data: null, loading: false }) })
  await act(async () => { h.rerender({ error: "HTTP 502", data: null, loading: false }) })
}

describe("useBoundedAutoRetry", () => {
  it("retries a transport failure at most `limit` times, then leaves it to the manual Retry", async () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const h = mount(retry, { error: "HTTP 502", data: null, loading: false })
    for (let cycle = 1; cycle <= 6; cycle++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
      await failedReread(h)
    }
    // 6 cycles of 8 s on a backend that never recovers: 3 retries, not 6.
    expect(retry).toHaveBeenCalledTimes(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(80_000) })
    expect(retry).toHaveBeenCalledTimes(3)
  })

  it("never retries a final answer (4xx), a loading read, or a read that has data", async () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const h = mount(retry, { error: "HTTP 404", data: null, loading: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    await act(async () => { h.rerender({ error: "HTTP 502", data: null, loading: true }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    await act(async () => { h.rerender({ error: "HTTP 502", data: { ok: true }, loading: false }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(retry).not.toHaveBeenCalled()
  })

  it("a successful read resets the budget; the next outage gets its own retries", async () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const h = mount(retry, { error: "HTTP 502", data: null, loading: false })
    for (let cycle = 1; cycle <= 4; cycle++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
      await failedReread(h)
    }
    expect(retry).toHaveBeenCalledTimes(3)
    // recovered …
    await act(async () => { h.rerender({ error: null, data: { paths: [] }, loading: false }) })
    // … then down again
    await act(async () => { h.rerender({ error: "HTTP 504", data: null, loading: false }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
    expect(retry).toHaveBeenCalledTimes(4)
  })

  it("a new read (resetKey) gets its own budget; the exhausted one does not carry over", async () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const h = mount(retry, { error: "HTTP 502", data: null, loading: false, resetKey: "/iap/Orders" })
    for (let cycle = 1; cycle <= 4; cycle++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
      await act(async () => { h.rerender({ error: null, data: null, loading: false, resetKey: "/iap/Orders" }) })
      await act(async () => { h.rerender({ error: "HTTP 502", data: null, loading: false, resetKey: "/iap/Orders" }) })
    }
    expect(retry).toHaveBeenCalledTimes(3)
    // the operator switches system: a different URL, still failing
    await act(async () => { h.rerender({ error: null, data: null, loading: true, resetKey: "/iap/Billing" }) })
    await act(async () => { h.rerender({ error: "HTTP 502", data: null, loading: false, resetKey: "/iap/Billing" }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
    expect(retry).toHaveBeenCalledTimes(4)
  })

  it("unmounting cancels a pending retry", async () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const h = mount(retry, { error: "HTTP 502", data: null, loading: false })
    h.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(retry).not.toHaveBeenCalled()
  })
})
