/**
 * Additions stacked on #509's rendering model.
 *
 * #509 decides WHAT to paint when a read fails. These cover the three things it
 * does not:
 *   1. a transient failure gets one more attempt before we believe it
 *   2. "retryable" has exactly one definition, shared by all three consumers
 *   3. a HELD analysis is not a never-scanned system
 *
 * Plus the backend resolver, whose hardcoded copy made the failure path
 * untestable locally in the first place.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import {
  TRANSIENT_STATUSES,
  fetchWithTransientRetry,
  isTransientStatus,
} from "@/lib/transient-retry"
import { SystemBlastRadiusHero } from "@/components/system-detail/blast-radius-hero"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const res = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as Response

// ---------------------------------------------------------------------------
// 1. Bounded retry — one extra attempt, and only for transient statuses
// ---------------------------------------------------------------------------

describe("fetchWithTransientRetry", () => {
  it("defaults to ONE extra attempt, not more", async () => {
    // Budget guard. These proxy routes abort at 55s, so 2 attempts is already
    // ~110s worst case; a third would mean ~3 minutes of spinner, which is
    // worse than showing the honest unavailable state.
    const fetchMock = vi.fn().mockResolvedValue(res(503))
    vi.stubGlobal("fetch", fetchMock)

    await fetchWithTransientRetry("/api/proxy/issues-summary", { backoffMs: 0 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("a transient failure that recovers is never surfaced as a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(504))
      .mockResolvedValueOnce(res(200))
    vi.stubGlobal("fetch", fetchMock)

    const out = await fetchWithTransientRetry("/api/proxy/issues-summary", {
      backoffMs: 0,
    })

    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a non-transient status", async () => {
    // A 404 is a real answer; retrying it hides the actual problem.
    const fetchMock = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal("fetch", fetchMock)

    const out = await fetchWithTransientRetry("/api/proxy/x", { backoffMs: 0 })

    expect(out.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("a permanent failure still returns the failing response — never a fake success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(502))
    vi.stubGlobal("fetch", fetchMock)

    const out = await fetchWithTransientRetry("/api/proxy/x", { backoffMs: 0 })

    // `ok: false` is what lets the caller mark the card unavailable. Swallowing
    // this into an empty 200-shaped result is exactly how a failed read becomes
    // a rendered zero.
    expect(out.ok).toBe(false)
    expect(out.status).toBe(502)
  })

  it("covers every status the production cold-cycle produced", () => {
    for (const status of [502, 503, 504]) {
      expect(isTransientStatus(status)).toBe(true)
    }
    expect(isTransientStatus(404)).toBe(false)
    expect(isTransientStatus(200)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. One definition of "retryable", genuinely shared
// ---------------------------------------------------------------------------

describe("canonical transient set", () => {
  // Source-level, deliberately. An earlier version of this test compared
  // `mod.TRANSIENT_STATUSES` to the same imported binding — trivially true, and
  // it survived a mutation that reintroduced a private copy in use-retry-fetch.
  // The defect is a SECOND DEFINITION existing at all, so that is what to assert.
  const CONSUMERS = [
    "lib/use-cached-fetch.ts",
    "lib/use-retry-fetch.ts",
    "components/system-detail-dashboard.tsx",
  ]

  it("no consumer defines its own status set", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const root = path.resolve(__dirname, "..")

    for (const rel of CONSUMERS) {
      const src = fs.readFileSync(path.join(root, rel), "utf8")
      expect(
        /new Set\(\s*\[\s*408\b/.test(src),
        `${rel} defines its own transient set — there must be exactly one, in lib/transient-retry.ts`,
      ).toBe(false)
    }
  })

  it("every consumer imports the canonical one", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const root = path.resolve(__dirname, "..")

    for (const rel of CONSUMERS) {
      const src = fs.readFileSync(path.join(root, rel), "utf8")
      expect(
        /from ["']@\/lib\/transient-retry["']/.test(src),
        `${rel} does not import from @/lib/transient-retry`,
      ).toBe(true)
    }
  })

  it("the canonical set is the one the helper actually consults", () => {
    // Ties the exported constant to the exported predicate, so swapping the
    // predicate's source would not go unnoticed.
    for (const status of TRANSIENT_STATUSES) {
      expect(isTransientStatus(status)).toBe(true)
    }
    expect(isTransientStatus(418)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. A held analysis is not a never-scanned system
// ---------------------------------------------------------------------------

describe("SystemBlastRadiusHero — empty reasons are three distinct claims", () => {
  const base = { brssHistory: [], systemName: "alon-prod", resourceCount: 63 }

  it("only a genuine never-run says 'Awaiting first scan'", () => {
    render(<SystemBlastRadiusHero {...base} brss={null} emptyReason="awaiting_scan" />)
    expect(screen.getByText(/Awaiting first scan for alon-prod/i)).toBeTruthy()
  })

  it("INTEGRITY_HELD must NOT say 'Awaiting first scan'", () => {
    // The #509 gap: an HTTP-200 held payload has `res.ok === true` and non-null
    // data, so an ok/null check fell through to awaiting_scan and told the
    // operator a scanned-but-incomplete estate had never been scanned.
    render(<SystemBlastRadiusHero {...base} brss={null} emptyReason="incomplete" />)

    expect(screen.queryByText(/Awaiting first scan/i)).toBeNull()
    expect(screen.getByText(/did not complete/i)).toBeTruthy()
    expect(screen.getByText(/not a clean score of 0/i)).toBeTruthy()
  })

  it("a failed read must NOT say 'Awaiting first scan'", () => {
    render(<SystemBlastRadiusHero {...base} brss={null} emptyReason="unavailable" />)

    expect(screen.queryByText(/Awaiting first scan/i)).toBeNull()
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })

  it("no empty state renders a number", () => {
    for (const reason of ["awaiting_scan", "unavailable", "incomplete"] as const) {
      const { container, unmount } = render(
        <SystemBlastRadiusHero {...base} brss={null} emptyReason={reason} />,
      )
      // A "0", or a grade, would be a claim none of these reads earned.
      expect(/\b\d+\s*\/\s*100\b/.test(container.textContent ?? "")).toBe(false)
      unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Backend resolution — prod-identical, override honoured
// ---------------------------------------------------------------------------

describe("getBackendBaseUrl", () => {
  const RENDER_PROD = "https://saferemediate-backend-f.onrender.com"

  it("falls back to the same Render URL the route used to hardcode", async () => {
    vi.resetModules()
    const prev = process.env.BACKEND_URL_OVERRIDE
    const prevProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    const prevVercelUrl = process.env.VERCEL_URL
    delete process.env.BACKEND_URL_OVERRIDE
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL

    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    // Prod behaviour is unchanged by the switch away from the literal.
    expect(getBackendBaseUrl()).toBe(RENDER_PROD)

    if (prev !== undefined) process.env.BACKEND_URL_OVERRIDE = prev
    if (prevProductionUrl !== undefined) process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProductionUrl
    if (prevVercelUrl !== undefined) process.env.VERCEL_URL = prevVercelUrl
  })

  it("binds the C1 Vercel project to the C1 backend without an override", async () => {
    vi.resetModules()
    const prev = process.env.BACKEND_URL_OVERRIDE
    const prevProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.BACKEND_URL_OVERRIDE
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "cyntro-c1.vercel.app"

    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(getBackendBaseUrl()).toBe("https://cyntro-c1.onrender.com")

    if (prev === undefined) delete process.env.BACKEND_URL_OVERRIDE
    else process.env.BACKEND_URL_OVERRIDE = prev
    if (prevProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProductionUrl
  })

  it("honours BACKEND_URL_OVERRIDE, which the hardcoded literal could not", async () => {
    vi.resetModules()
    const prev = process.env.BACKEND_URL_OVERRIDE
    process.env.BACKEND_URL_OVERRIDE = "http://127.0.0.1:8788"

    const { getBackendBaseUrl } = await import("@/lib/server/backend-url")
    expect(getBackendBaseUrl()).toBe("http://127.0.0.1:8788")

    if (prev === undefined) delete process.env.BACKEND_URL_OVERRIDE
    else process.env.BACKEND_URL_OVERRIDE = prev
  })
})

// ---------------------------------------------------------------------------
// 5. The mapping itself — the #509 correction, tested without the dashboard
// ---------------------------------------------------------------------------

describe("brssEmptyReasonFor", () => {
  it("HTTP-200 INTEGRITY_HELD is 'incomplete', NOT 'awaiting_scan'", async () => {
    const { brssEmptyReasonFor } = await import("@/lib/summary-integrity")

    // The exact production shape: held sweeps come back 200 with real data.
    expect(
      brssEmptyReasonFor({ responseOk: true, hasData: true, state: "INTEGRITY_HELD" }),
    ).toBe("incomplete")
  })

  it("NOT_READY is 'unavailable' — the backend declines to vouch", async () => {
    const { brssEmptyReasonFor } = await import("@/lib/summary-integrity")
    expect(
      brssEmptyReasonFor({ responseOk: true, hasData: true, state: "NOT_READY" }),
    ).toBe("unavailable")
  })

  it("a failed response is 'unavailable' regardless of state", async () => {
    const { brssEmptyReasonFor } = await import("@/lib/summary-integrity")
    for (const state of ["READY", "INTEGRITY_HELD", "NOT_READY"] as const) {
      expect(brssEmptyReasonFor({ responseOk: false, hasData: false, state })).toBe(
        "unavailable",
      )
      expect(brssEmptyReasonFor({ responseOk: true, hasData: false, state })).toBe(
        "unavailable",
      )
    }
  })

  it("only READY-with-data yields 'awaiting_scan'", async () => {
    const { brssEmptyReasonFor } = await import("@/lib/summary-integrity")
    expect(
      brssEmptyReasonFor({ responseOk: true, hasData: true, state: "READY" }),
    ).toBe("awaiting_scan")
  })
})
