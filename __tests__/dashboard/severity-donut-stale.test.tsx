/**
 * A card that RETAINS cached counts must SAY so.
 *
 * Review of PR #519: the hook was changed to keep the last verified reading
 * through a 504 and mark it stale — but SeverityDonutCard destructured only
 * `{ data, loading, error, retry }`. It threw the staleness away, so a cached
 * "18 findings" rendered pixel-identical to a live one. Retention without
 * disclosure is worse than the blanking it replaced: the operator has no way
 * to tell.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let hookState: Record<string, unknown> = {}

vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  STALE_AGED_OUT: "cached reading",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: () => hookState,
}))

import { SeverityDonutCard } from "@/components/dashboard/v3/severity-donut-card"

const READY_COUNTS = {
  success: true,
  serve_state: "READY",
  analysis_complete: true,
  total: 18,
  critical: 2,
  high: 5,
  medium: 7,
  low: 4,
}

function state(over: Record<string, unknown> = {}) {
  return {
    data: READY_COUNTS,
    loading: false,
    error: null,
    retry: vi.fn(),
    isStale: false,
    cachedAt: null,
    staleReason: null,
    isComputing: false,
    ...over,
  }
}

beforeEach(() => {
  hookState = state()
})
afterEach(cleanup)

describe("SeverityDonutCard staleness presentation", () => {
  it("REGRESSION: cached counts kept through a 504 are labelled, not silent", () => {
    hookState = state({
      isStale: true,
      cachedAt: Date.now() - 90_000,
      staleReason: "backend recovering",
    })
    render(<SeverityDonutCard />)

    const text = document.body.textContent ?? ""
    // The number is still shown — retention is the point.
    expect(text).toMatch(/18/)
    // And it is explicitly not presented as live.
    expect(text).toMatch(/Backend recovering/i)
    expect(text).toMatch(/not live/i)
  })

  it("ordinary age uses the existing 'as of N, refreshing' pill", () => {
    hookState = state({
      isStale: true,
      cachedAt: Date.now() - 15 * 60_000,
      staleReason: "cached reading",
    })
    render(<SeverityDonutCard />)
    expect(document.body.textContent ?? "").toMatch(/refreshing/i)
  })

  it("a live reading carries no staleness wording at all", () => {
    render(<SeverityDonutCard />)
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/18/)
    expect(text).not.toMatch(/Backend recovering/i)
    expect(text).not.toMatch(/refreshing/i)
  })
})
