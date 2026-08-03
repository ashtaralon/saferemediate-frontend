/**
 * The recovery path, rendered — not asserted through the hook in isolation.
 *
 * Review of PR #519 caught that the hook was right and the SCREEN was still
 * wrong: `DataStatusBanner` returned early whenever no feed was semantically
 * non-READY, which is exactly the primary scenario — every feed holding a
 * cached READY while the backend 504s. The warning never rendered, so
 * customers saw old numbers looking perfectly current. That is worse than the
 * blank page it replaced, because a blank page does not lie.
 *
 * Hook-level tests could not catch it. These render.
 */
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const responses = new Map<string, unknown>()
const staleReasons = new Map<string, string | null>()

vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  STALE_AGED_OUT: "cached reading",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: (url: string | null) => {
    const reason = url ? (staleReasons.get(url) ?? null) : null
    return {
      data: url ? (responses.get(url) ?? null) : null,
      isStale: reason !== null,
      cachedAt: reason !== null ? Date.now() - 60_000 : null,
      staleReason: reason,
      loading: false,
      error: null,
      isComputing: false,
      retry: vi.fn(),
    }
  },
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const SYSTEMS = "/api/proxy/systems/with-families"
const PATHS = "/api/proxy/identity-attack-paths/all"
const EVIDENCE = "/api/proxy/evidence/coverage"

const HEALTHY: Record<string, unknown> = {
  "/api/proxy/systems/with-families": { systems: [{ name: "alon-prod" }], errors: [] },
  "/api/proxy/identity-attack-paths/all": {
    serve_state: "READY",
    analysis_complete: true,
    crown_jewels: [],
    total_jewels: 30,
    total_paths: 236,
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

/** Every feed holds a complete, semantically READY payload. */
function seedAllReady() {
  for (const [k, v] of Object.entries(HEALTHY)) responses.set(k, v)
}

beforeEach(() => {
  responses.clear()
  staleReasons.clear()
  vi.clearAllMocks()
})

async function renderCockpit() {
  const { ExecutiveCockpit } = await import(
    "@/components/dashboard/v3/executive-cockpit"
  )
  return render(<ExecutiveCockpit />)
}

describe("recovery banner, rendered", () => {
  it("PRIMARY SCENARIO: all feeds cached-READY + 504 still warns the operator", async () => {
    // The regression. Every feed is semantically READY (from cache), so the
    // old `if (bad.length === 0) return null` hid the banner entirely and the
    // page presented stale numbers as current.
    seedAllReady()
    for (const u of [SYSTEMS, PATHS, EVIDENCE]) {
      staleReasons.set(u, "backend recovering")
    }

    await renderCockpit()

    expect(
      screen.getByText(/Backend recovering — showing the last verified reading/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/not live/i)).toBeInTheDocument()
    expect(screen.getByText(/Actions stay disabled/i)).toBeInTheDocument()
  })

  it("says nothing when everything is READY and nothing is recovering", async () => {
    seedAllReady()
    await renderCockpit()
    expect(
      screen.queryByText(/Backend recovering/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/feeds are not current/i)).not.toBeInTheDocument()
  })

  it("MIXED: a recovering feed does not hide a simultaneous semantic PARTIAL", async () => {
    // Different causes, different remedies. One must not mask the other —
    // "backend recovering" heals itself; a PARTIAL estate does not.
    seedAllReady()
    responses.set(SYSTEMS, {
      systems: [{ name: "alon-prod" }],
      errors: ["default: fan-out failed"], // semantic PARTIAL
    })
    staleReasons.set(PATHS, "backend recovering") // transport, different feed

    await renderCockpit()

    expect(screen.getByText(/Backend recovering/i)).toBeInTheDocument()
    // The PARTIAL feed is still enumerated, under its own heading.
    expect(
      screen.getByText(/not\s+current for its own reason/i),
    ).toBeInTheDocument()
  })
})
