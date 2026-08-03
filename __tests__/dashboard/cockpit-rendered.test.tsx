/**
 * RENDERED tests — the two defects source-string assertions could not see.
 *
 * Review of 3d78f48d: "13 of the 17 new behavioral tests are still
 * source-string assertions; they do not render the stale-to-fresh
 * transition or partial-evidence response, which is why these defects
 * remain green." Correct twice over — the same gap let the original five
 * ship. These mount the real components and assert on the DOM.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EvidenceHealthCardV3 } from "@/components/dashboard/v3/evidence-health-card"
import { SafeRemediationsQueueCard } from "@/components/dashboard/v3/safe-remediations-queue-card"
import { ManagementReportDrawer } from "@/components/dashboard/v3/management-report-drawer"
import { deriveEvidenceIntegrity } from "@/lib/evidence-integrity"
import { deriveSystemsIntegrity, isCacheableSystems } from "@/lib/systems-integrity"
import type { UseCachedFetchResult } from "@/lib/use-cached-fetch"

afterEach(cleanup)

/** A lifted reading, exactly as the cockpit passes it down. */
function reading<T>(over: Partial<UseCachedFetchResult<T>> = {}): UseCachedFetchResult<T> {
  return {
    data: null,
    isStale: false,
    cachedAt: null,
    loading: false,
    error: null,
    isComputing: false,
    retry: vi.fn(),
    ...over,
  } as UseCachedFetchResult<T>
}

// ── partial evidence ─────────────────────────────────────────────────────

describe("partial evidence coverage", () => {
  const PARTIAL = {
    accounts: [
      {
        // Matches AccountCoverage exactly — a double that drifts from the
        // real shape tests a system we don't ship.
        account_id: "111122223333",
        cloud: "aws",
        aggregate_confidence: 82,
        sources: [],
        health: { healthy: 3, degraded: 0, missing: 0, total: 3 },
      },
    ],
    aggregate_confidence: 82,
    health: { healthy: 3, degraded: 0, missing: 0, total: 3 },
    errors: ["222233334444: AccessDenied"],
  }

  it("classifies errors[] as PARTIAL, not READY", () => {
    const i = deriveEvidenceIntegrity(PARTIAL)
    expect(i.state).toBe("PARTIAL")
    expect(i.failedAccounts).toBe(1)
    expect(i.reason).toContain("1 account fetch failed")
  })

  it("complete coverage is READY; an empty estate is READY; junk is UNAVAILABLE", () => {
    expect(deriveEvidenceIntegrity({ ...PARTIAL, errors: [] }).state).toBe("READY")
    expect(deriveEvidenceIntegrity({ no_accounts: true }).state).toBe("READY")
    expect(deriveEvidenceIntegrity({ health: {} }).state).toBe("UNAVAILABLE")
    expect(deriveEvidenceIntegrity(null).state).toBe("UNAVAILABLE")
  })

  it("RENDERS the failure the report used to omit", () => {
    // The card surfaced "N account fetches failed" while readiness said
    // READY. Whatever the card can say, the report must be able to say.
    render(<EvidenceHealthCardV3 shared={reading({ data: PARTIAL as never })} />)
    expect(document.body.textContent).toMatch(/failed/i)
  })
})

// ── stale-to-fresh metadata ──────────────────────────────────────────────

describe("freshness travels with the reading", () => {
  const CANDIDATES = {
    candidates: [
      {
        resource_type: "IAMRole",
        resource_id: "arn:aws:iam::1:role/a",
        resource_name: "role-a",
        safety: { can_auto_apply: true },
      },
    ],
    summary: { total_candidates: 1, by_type: {}, auto_applicable: 1, blocked: 0 },
  }

  it("a FRESH lifted reading renders no stale indicator", () => {
    // The bug: `data` came from `shared` but `isStale`/`cachedAt` from
    // `own`, and in Executive `own` has url=null so it never refreshes. A
    // card hydrated from stale cache said "refreshing" forever while the
    // parent's fresh payload was already rendered beside it.
    render(
      <SafeRemediationsQueueCard
        shared={reading({ data: CANDIDATES as never, isStale: false, cachedAt: null })}
      />,
    )
    expect(document.body.textContent).not.toMatch(/refreshing/i)
  })

  it("a STALE lifted reading DOES render the indicator", () => {
    // The guard must not have been achieved by suppressing staleness —
    // honest staleness signalling is required, just sourced correctly.
    render(
      <SafeRemediationsQueueCard
        shared={reading({
          data: CANDIDATES as never,
          isStale: true,
          cachedAt: Date.now() - 45 * 60 * 1000,
        })}
      />,
    )
    expect(document.body.textContent).toMatch(/refreshing|ago/i)
  })
})

// ── the queue's pagination claim ─────────────────────────────────────────

describe("pagination claim follows the request", () => {
  function candidates(n: number) {
    return {
      candidates: Array.from({ length: n }, (_, i) => ({
        resource_type: "IAMRole",
        resource_id: `arn:aws:iam::1:role/r${i}`,
        resource_name: `role-${i}`,
        safety: { can_auto_apply: true },
      })),
      summary: { total_candidates: n, by_type: {}, auto_applicable: n, blocked: 0 },
    }
  }

  it("10 of a 50-row page does NOT claim more may exist", () => {
    // Threshold stayed at 10 after the request moved to ?limit=50, so a
    // page 40 rows short of full claimed truncation.
    render(<SafeRemediationsQueueCard shared={reading({ data: candidates(10) as never })} />)
    expect(document.body.textContent).not.toMatch(/more may exist/i)
  })

  it("a genuinely full page still warns", () => {
    render(<SafeRemediationsQueueCard shared={reading({ data: candidates(50) as never })} />)
    expect(document.body.textContent).toMatch(/more may exist/i)
  })

  it("the 'more ready' footer counts against the display limit", () => {
    // limit={3} with 10 ready showed 3 rows and said "+5 more".
    render(
      <SafeRemediationsQueueCard limit={3} shared={reading({ data: candidates(10) as never })} />,
    )
    expect(document.body.textContent).toMatch(/\+\s*7\s*more ready/i)
    expect(document.body.textContent).not.toMatch(/\+\s*5\s*more ready/i)
  })
})

// ── the failure envelope, rendered ───────────────────────────────────────

describe("a 200 carrying `error` renders as unavailable, not as zero", () => {
  it("does not present a dead upstream as an empty queue", () => {
    render(
      <SafeRemediationsQueueCard
        shared={reading({
          data: {
            candidates: [],
            summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
            error: "Failed to load remediation candidates",
          } as never,
        })}
      />,
    )
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Failed to load remediation candidates/i)
    expect(text).not.toMatch(/No actions ready yet/i)
  })
})

// ── readiness is what the report consumes ────────────────────────────────

describe("the report refuses to call a partial estate complete", () => {
  it("RENDERS a PARTIAL evidence feed as a blocker, not as 5/5 ready", () => {
    // Defect 1 lived in the COCKPIT's readiness, not in the card — the card
    // already said "N account fetches failed" while the drawer said every
    // feed was ready. Testing the card missed it; this tests the consumer.
    render(
      <ManagementReportDrawer
        open
        onClose={() => {}}
        readiness={{
          scope: "8 discovered business systems",
          generation: null,
          sources: [
            { label: "Business systems", state: "READY", cachedAt: null },
            { label: "Attack paths", state: "READY", cachedAt: null },
            { label: "Proposed changes", state: "READY", cachedAt: null },
            {
              label: "Evidence health",
              state: "PARTIAL",
              detail: "1 account fetch failed",
              cachedAt: null,
            },
            { label: "Verified outcomes", state: "READY", cachedAt: null },
          ],
        }}
      />,
    )
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Board-ready:\s*No/i)
    expect(text).toMatch(/Evidence health is PARTIAL/i)
    expect(text).toMatch(/1 account fetch failed/i)
    expect(text).toMatch(/4 of 5 feeds ready/i)
    expect(text).not.toMatch(/5 of 5 feeds ready/i)
  })

  it("the cockpit derives evidence readiness from the governed snapshot", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components/dashboard/v3/executive-cockpit.tsx"),
      "utf8",
    )
    expect(src).toContain('label: "Evidence readiness"')
    expect(src).toContain("stateLabel(data.evidence.serve_state)")
    expect(src).not.toMatch(/state: data\.evidence \? "READY"/)
  })
})

// ── partial business systems ─────────────────────────────────────────────

describe("partial business systems", () => {
  const PARTIAL_SYSTEMS = {
    systems: [{ name: "alon-prod" }, { name: "cyntro-demo" }],
    errors: ["payment-production: 504", "default: 502"],
  }

  it("classifies fan-out errors[] as PARTIAL", () => {
    const i = deriveSystemsIntegrity(PARTIAL_SYSTEMS)
    expect(i.state).toBe("PARTIAL")
    expect(i.failedSystems).toBe(2)
    expect(i.countIsPartial).toBe(true)
    expect(i.reason).toContain("2 system fan-out calls failed")
  })

  it("complete is READY; the 502 envelope and junk are UNAVAILABLE", () => {
    expect(deriveSystemsIntegrity({ systems: [], errors: [] }).state).toBe("READY")
    expect(deriveSystemsIntegrity({ systems: [{ name: "a" }] }).countIsPartial).toBe(false)
    expect(
      deriveSystemsIntegrity({
        error: "all_systems_endpoint_unavailable",
        systems: [],
        errors: ["backend 502"],
      }).state,
    ).toBe("UNAVAILABLE")
    expect(deriveSystemsIntegrity({ errors: [] }).state).toBe("UNAVAILABLE")
    expect(deriveSystemsIntegrity(null).state).toBe("UNAVAILABLE")
  })

  it("a partial estate is never cached as a complete reading", () => {
    expect(isCacheableSystems(PARTIAL_SYSTEMS)).toBe(false)
    expect(isCacheableSystems({ systems: [{ name: "a" }], errors: [] })).toBe(true)
  })

  it("RENDERS as 4 of 5 feeds ready, not 5 of 5", () => {
    render(
      <ManagementReportDrawer
        open
        onClose={() => {}}
        readiness={{
          scope: "at least 2 discovered business systems (partial)",
          generation: null,
          sources: [
            {
              label: "Business systems",
              state: "PARTIAL",
              detail: "2 system fan-out calls failed",
              cachedAt: null,
            },
            { label: "Attack paths", state: "READY", cachedAt: null },
            { label: "Proposed changes", state: "READY", cachedAt: null },
            { label: "Evidence health", state: "READY", cachedAt: null },
            { label: "Verified outcomes", state: "READY", cachedAt: null },
          ],
        }}
      />,
    )
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/4 of 5 feeds ready/i)
    expect(text).not.toMatch(/5 of 5 feeds ready/i)
    expect(text).toMatch(/Board-ready:\s*No/i)
    expect(text).toMatch(/Business systems is PARTIAL/i)
    expect(text).toMatch(/2 system fan-out calls failed/i)
  })

  it("the cockpit uses the snapshot's server-owned material-risk coverage", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components/dashboard/v3/executive-cockpit.tsx"),
      "utf8",
    )
    expect(src).toContain("data.material_risk.systems_discovered")
    expect(src).toContain("data.material_risk.systems_scanned")
    expect(src).toContain("counts_are_lower_bounds")
    expect(src).not.toContain("deriveSystemsIntegrity")
  })

  it("the candidate page scope is owned by the snapshot contract", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "lib/executive-snapshot.ts"),
      "utf8",
    )
    expect(src).toContain('count_scope?: "returned_page"')
    expect(src).toContain("page_limit?: number")
  })
})
