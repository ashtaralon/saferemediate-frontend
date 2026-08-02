/**
 * Renders the COCKPIT with the fetch layer mocked, so the assertion is
 * "a partial payload produces a PARTIAL source", not "the source file
 * contains a string".
 *
 * Two prior rounds shipped defects because a source-string assertion or a
 * card-level render stood in for the decision under test. The management
 * report consumes the cockpit's readiness; this exercises that path.
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const responses = new Map<string, unknown>()

vi.mock("@/lib/use-cached-fetch", () => ({
  useCachedFetch: (url: string | null) => ({
    data: url ? (responses.get(url) ?? null) : null,
    isStale: false,
    cachedAt: null,
    loading: false,
    error: null,
    isComputing: false,
    retry: vi.fn(),
  }),
}))

import { ExecutiveCockpit } from "@/components/dashboard/v3/executive-cockpit"

const HEALTHY = {
  "/api/proxy/systems/with-families": { systems: [{ name: "alon-prod" }], errors: [] },
  "/api/proxy/identity-attack-paths/all": {
    serve_state: "READY",
    analysis_complete: true,
    crown_jewels: [],
    total_jewels: 3,
    total_paths: 9,
    exposed_jewels: 0,
    systems_discovered: 1,
    systems_scanned: 1,
    systems_uncomputed: 0,
    uncomputed: [],
    errors: [],
  },
  "/api/proxy/remediation-candidates?limit=50": {
    candidates: [],
    summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
  },
  "/api/proxy/evidence/coverage": {
    accounts: [],
    aggregate_confidence: 90,
    health: { healthy: 1, degraded: 0, missing: 0, total: 1 },
    errors: [],
  },
  "/api/proxy/remediation-history/narrowing-summary?days=7": {
    window_days: 7,
    permissions_removed: 0,
    events_count: 0,
    rollbacks_count: 0,
    by_day: [],
  },
}

beforeEach(() => {
  responses.clear()
  for (const [k, v] of Object.entries(HEALTHY)) responses.set(k, v)
})
afterEach(cleanup)

describe("cockpit readiness, rendered", () => {
  it("a complete estate shows no partial-data banner", () => {
    render(<ExecutiveCockpit />)
    expect(document.body.textContent).not.toMatch(/Partial data/i)
  })

  it("REGRESSION: systems errors[] produce a PARTIAL feed, not READY", () => {
    // The proxy preserves fan-out errors and returns 200 with the systems
    // it did get. The cockpit's local type did not declare `errors`, so a
    // partial estate read as complete and could be cached that way.
    responses.set("/api/proxy/systems/with-families", {
      systems: [{ name: "alon-prod" }, { name: "cyntro-demo" }],
      errors: ["payment-production: 504", "default: 502"],
    })
    render(<ExecutiveCockpit />)
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Partial data/i)
    expect(text).toMatch(/Business systems: partial/i)
    expect(text).toMatch(/2 system fan-out calls failed/i)
  })

  it("REGRESSION: the discovered count is a floor, not a total", () => {
    responses.set("/api/proxy/systems/with-families", {
      systems: [{ name: "alon-prod" }, { name: "cyntro-demo" }],
      errors: ["payment-production: 504"],
    })
    render(<ExecutiveCockpit />)
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/of at least 2 discovered/i)
    expect(text).not.toMatch(/of 2 discovered business systems/i)
  })

  it("evidence errors[] also surface in the banner", () => {
    responses.set("/api/proxy/evidence/coverage", {
      accounts: [],
      aggregate_confidence: 50,
      health: { healthy: 0, degraded: 1, missing: 0, total: 1 },
      errors: ["222233334444: AccessDenied"],
    })
    render(<ExecutiveCockpit />)
    expect(document.body.textContent).toMatch(/Evidence health: partial/i)
  })

  it("a remediation failure envelope surfaces as unavailable", () => {
    responses.set("/api/proxy/remediation-candidates?limit=50", {
      candidates: [],
      summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
      error: "Failed to load remediation candidates",
    })
    render(<ExecutiveCockpit />)
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Proposed changes: unavailable/i)
    expect(text).toMatch(/Failed to load remediation candidates/i)
  })
})
