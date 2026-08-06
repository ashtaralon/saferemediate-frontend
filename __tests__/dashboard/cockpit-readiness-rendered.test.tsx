import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let payload: unknown
let staleReason: string | null = null

vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: () => ({
    data: payload,
    isStale: staleReason !== null,
    cachedAt: staleReason ? Date.now() - 60_000 : null,
    staleReason,
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}))

import { ExecutiveCockpit } from "@/components/dashboard/v3/executive-cockpit"

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
      body: `Cyntro identified ${lower ? "at least " : ""}170 attack paths to ${lower ? "at least " : ""}18 crown jewels across 1 of 8 systems analyzed.`,
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
      top_risks: [],
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

describe("executive snapshot, rendered", () => {
  it("renders one coherent graph-backed reading", () => {
    render(<ExecutiveCockpit />)
    expect(screen.getByText("170")).toBeInTheDocument()
    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(screen.getByText(/No verified narrowing in the last 7 days/i)).toBeInTheDocument()
  })

  it("keeps lower-bound numbers visible under PARTIAL", () => {
    payload = snapshot("PARTIAL")
    render(<ExecutiveCockpit />)
    expect(screen.getByText(/Analysis in progress/i)).toBeInTheDocument()
    expect(screen.getByText("≥170")).toBeInTheDocument()
    expect(screen.getByText("≥18")).toBeInTheDocument()
    expect(screen.getByText(/1\/8 systems/i)).toBeInTheDocument()
  })

  it("labels a cached reading while transport recovers", () => {
    staleReason = "backend recovering"
    render(<ExecutiveCockpit />)
    expect(screen.getByText(/Backend recovering — showing the last verified snapshot/i)).toBeInTheDocument()
    expect(screen.getByText(/mutations stay disabled/i)).toBeInTheDocument()
  })

  it("publishes the same reading to the report generator", () => {
    const onReportData = vi.fn()
    render(<ExecutiveCockpit onReportData={onReportData} />)

    expect(onReportData).toHaveBeenCalledWith(expect.objectContaining({
      scope: "8 of 8 business systems analyzed",
      sources: expect.arrayContaining([
        expect.objectContaining({ label: "Material risk", state: "READY" }),
        expect.objectContaining({ label: "Verified outcomes", state: "READY" }),
      ]),
      snapshot: expect.objectContaining({
        metrics: expect.objectContaining({
          systems: 8,
          reachableCrownJewels: 18,
          viableAttackPaths: 170,
          proposedChanges: 2,
        }),
      }),
    }))
  })
})
