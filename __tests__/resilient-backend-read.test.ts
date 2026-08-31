import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearResilientBackendReadState,
  resilientBackendJsonRead,
} from "@/lib/server/resilient-backend-read"

afterEach(() => {
  clearResilientBackendReadState()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("resilientBackendJsonRead", () => {
  it("caches only a successful JSON response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ value: 7 }))

    const first = await resilientBackendJsonRead<{ value: number }>({
      key: "success",
      url: "https://backend.test/success",
      attemptTimeoutMs: 100,
    })
    const second = await resilientBackendJsonRead<{ value: number }>({
      key: "success",
      url: "https://backend.test/success",
      attemptTimeoutMs: 100,
    })

    expect(first).toMatchObject({ ok: true, source: "backend", data: { value: 7 } })
    expect(second).toMatchObject({ ok: true, source: "fresh-cache", data: { value: 7 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("coalesces identical concurrent reads", async () => {
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending)
    const options = {
      key: "shared",
      url: "https://backend.test/shared",
      attemptTimeoutMs: 1_000,
    }

    const first = resilientBackendJsonRead<{ value: number }>(options)
    const second = resilientBackendJsonRead<{ value: number }>(options)
    release(jsonResponse({ value: 9 }))

    expect(await first).toMatchObject({ ok: true, source: "backend" })
    expect(await second).toMatchObject({ ok: true, source: "coalesced" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("uses a separate AbortSignal for every bounded retry", async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      signals.push(init?.signal as AbortSignal)
      return jsonResponse({ error: "busy" }, 503)
    })

    const result = await resilientBackendJsonRead({
      key: "retry-signals",
      url: "https://backend.test/retry",
      attemptTimeoutMs: 100,
      attempts: 2,
      retryDelayMs: 0,
    })

    expect(result).toMatchObject({ ok: false, status: 503 })
    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
  })

  it("serves an explicitly marked last-good response after a live failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ value: "live" }))
      .mockResolvedValue(jsonResponse({ error: "busy" }, 503))

    await resilientBackendJsonRead({
      key: "last-good",
      url: "https://backend.test/data",
      attemptTimeoutMs: 100,
      freshTtlMs: -1,
    })
    const result = await resilientBackendJsonRead<{ value: string }>({
      key: "last-good",
      url: "https://backend.test/data",
      attemptTimeoutMs: 100,
      attempts: 2,
      retryDelayMs: 0,
    })

    expect(result).toMatchObject({
      ok: true,
      source: "stale-cache",
      staleReason: "backend_503",
      data: { value: "live" },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
