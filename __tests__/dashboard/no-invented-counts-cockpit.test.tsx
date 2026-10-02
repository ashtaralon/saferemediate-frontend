/**
 * Per-system Critical / High in the management report are the system's own counts (the catalog), never a
 * count of how many of the five top-risk rows are CRITICAL. The scoped catalog row here carries no
 * critical/high, and one top-risk row is CRITICAL: the report must say "not known" (null), not 1.
 * Also: the legacy banner shows no "urgent findings" pill for an unread count.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({
    customerId: "testbed-webshop",
    groupId: "all",
    accountId: "all",
    region: "all",
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

let payload: unknown
let staleReason: string | null = null

vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: (url: string | null) => ({
    data: url?.startsWith("/api/proxy/systems")
      ? { systems: [{ name: "testbed-webshop", SystemName: "testbed-webshop" }] }
      : payload,
    isStale: staleReason !== null,
    cachedAt: staleReason ? Date.now() - 60_000 : null,
    staleReason,
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

import { ExecutiveCockpit } from "@/components/dashboard/v3/executive-cockpit"
import { HomeStatsBanner } from "@/components/home-stats-banner"

function snapshot(state: "READY" | "PARTIAL" = "READY") {
  const lower = state === "PARTIAL"
  return {
    schema_version: 1,
    source: "neo4j",
    computed_at: "2026-08-03T00:00:00Z",
    serve_state: state,
    analysis_complete: !lower,
    counts_are_partial: lower,
    narrative: {
      tone: "action_required",
      title: "Action required",
      body: `testbed-webshop has ${lower ? "at least " : ""}170 attack paths to ${lower ? "at least " : ""}18 crown jewels.`,
    },
    material_risk: {
      serve_state: state,
      analysis_complete: !lower,
      counts_are_lower_bounds: lower,
      systems_discovered: 8,
      systems_scanned: lower ? 1 : 8,
      systems_uncomputed: lower ? 7 : 0,
      attack_paths: 170,
      crown_jewels: 18,
      high_risk_targets: 7,
      externally_exposed_jewels: 0,
      top_risks: [{ id: "r1", name: "orders-db", resource_type: "RDSInstance", severity: "CRITICAL", path_count: 4,
                    priority_score: 90, internet_exposed: false, system_name: "testbed-webshop" }],
    },
    remediation: {
      serve_state: "READY",
      analysis_complete: true,
      ready_on_page: 2,
      held_on_page: 3,
      top_candidates: [],
    },
    evidence: {
      serve_state: "READY",
      analysis_complete: true,
      healthy: 5,
      degraded: 6,
      missing: 89,
      total: 100,
      top_blockers: [],
    },
    outcomes: {
      serve_state: "READY",
      analysis_complete: true,
      window_days: 7,
      permissions_removed: 0,
      events_count: 0,
      rollbacks_count: 0,
      by_day: [],
    },
  }
}


beforeEach(() => {
  payload = snapshot()
  staleReason = null
})
afterEach(cleanup)

describe("report per-system counts", () => {
  it("a CRITICAL top-risk row is not the system's Critical count", () => {
    const onReportData = vi.fn()
    render(<ExecutiveCockpit onReportData={onReportData} />)
    const report = onReportData.mock.calls.at(-1)?.[0]
    const row = report.snapshot.systems.find((s: { name: string }) => s.name === "testbed-webshop")
    expect(row).toBeTruthy()
    expect(row.critical).toBeNull()
    expect(row.high).toBeNull()
    // control: the risk row itself is in the report
    expect(report.snapshot.crownJewels.map((j: { name: string }) => j.name)).toContain("orders-db")
  })
})

describe("legacy banner pills", () => {
  it("no urgent-findings pill for an unread count; control: a measured one shows", () => {
    render(<HomeStatsBanner urgentFindings={null} resourceCount={null} />)
    expect(document.body.textContent).not.toContain("urgent findings")
    cleanup()
    render(<HomeStatsBanner urgentFindings={3} resourceCount={null} />)
    expect(document.body.textContent).toContain("3 urgent findings")
  })
})
