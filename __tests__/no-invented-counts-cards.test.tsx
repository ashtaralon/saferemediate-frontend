/**
 * V3 Home cards, the report drawer, the sidebar badges and the legacy Home
 * view render a count only where the backend gave one.
 *
 * Payloads are the literal shapes the code builds: the proxies' answers (see
 * no-invented-counts-proxies.test.ts), the backend LP issues catch-all (api/
 * least_privilege.py: summary of zeros, resources [], serve_state "ERROR"), and
 * the decision-routing response (api/findings_decision_routing.py). Each
 * absence check is paired with a control in which the same query finds the value.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const readings: Record<string, unknown> = {}
vi.mock("@/lib/use-cached-fetch", () => ({
  STALE_BACKEND_RECOVERING: "backend recovering",
  RECOVERY_POLL_MS: 12000,
  useCachedFetch: (url: string | null) => ({
    data: url ? readings[url] ?? null : null,
    loading: false,
    error: null,
    retry: vi.fn(),
    isStale: false,
    cachedAt: null,
    staleReason: null,
  }),
}))

import { WildcardBloatCard } from "@/components/dashboard/v3/wildcard-bloat-card"
import { LPTopIssuesCard } from "@/components/dashboard/v3/lp-top-issues-card"
import { DecisionRoutingCard } from "@/components/dashboard/v3/decision-routing-card"
import { FamilyStrip } from "@/components/dashboard/v3/family-strip"
import { RecentActivityCard } from "@/components/dashboard/v3/recent-activity-card"
import { LiveNowStrip as DenseLiveNowStrip } from "@/components/dashboard/dense/live-now-strip"
import { narrowedAttention, narrowedCount, pathSum } from "@/components/dashboard/v3/management-report-drawer"
import { sharedResourcesActionableCount } from "@/components/left-sidebar-nav"
import { parseGapReading, removableGapPercent, urgentIssueCount } from "@/lib/home-legacy-readings"

afterEach(() => {
  cleanup()
  for (const key of Object.keys(readings)) delete readings[key]
})

const text = () => document.body.textContent ?? ""

describe("Wildcard bloat", () => {
  const url = "/api/proxy/least-privilege/metrics"
  it("a body without the bloat figure shows no percentage", () => {
    readings[url] = { totalRoles: 0, analyzedRoles: 0, rolesWithBloat: 0, averageBloatPercentage: null, totalUnusedPermissions: null }
    render(<WildcardBloatCard />)
    expect(text()).toContain("carried no bloat figures")
    expect(text()).not.toMatch(/\b0\s*%/)
  })
  it("no analyzed roles is said, not drawn as a green 0%", () => {
    readings[url] = { totalRoles: 5, analyzedRoles: 0, rolesWithBloat: 0, averageBloatPercentage: 0, totalUnusedPermissions: 0 }
    render(<WildcardBloatCard />)
    expect(text()).toContain("No IAM roles have been analyzed yet")
    expect(text()).not.toMatch(/\b0\s*%/)
  })
  it("control: a real reading shows its percentage", () => {
    readings[url] = { totalRoles: 12, analyzedRoles: 10, rolesWithBloat: 4, averageBloatPercentage: 37.5, totalUnusedPermissions: 140 }
    render(<WildcardBloatCard />)
    expect(text()).toContain("38%")
    expect(text()).toContain("140 unused permissions")
  })
})

describe("Top least-privilege issues", () => {
  const url = "/api/proxy/least-privilege/issues"
  const ERROR_BODY = {
    summary: { totalResources: 0, criticalCount: 0, highCount: 0, totalExcessPermissions: 0 },
    resources: [], serve_state: "ERROR", error: "graph read failed",
  }
  it("the backend's ERROR body is not an all-clear and carries no counts", () => {
    readings[url] = ERROR_BODY
    render(<LPTopIssuesCard />)
    expect(text()).not.toContain("None show excess permissions")
    expect(text()).not.toContain("0 crit")
    expect(text()).toContain("Analysis did not run")
  })
  it("control: a READY analysis with no gaps is the all-clear, with its counts", () => {
    readings[url] = { ...ERROR_BODY, summary: { ...ERROR_BODY.summary, totalResources: 7 }, serve_state: "READY", analysis_complete: true }
    render(<LPTopIssuesCard />)
    expect(text()).toContain("7 resources analyzed. None show excess permissions.")
    expect(text()).toContain("0 crit")
  })
})

describe("Execution readiness (decision routing)", () => {
  const url = "/api/proxy/findings/decision-routing?limit=30"
  const bucket = (n: number) => ({ AUTO_EXECUTE: 0, CANARY_FIRST: 0, REQUIRE_APPROVAL: 0, MANUAL_REVIEW: n, BLOCK: 0, EXCLUDE: 0 })
  it("a body without scored counts is no reading, not 'No findings scored yet'", () => {
    readings[url] = { error: "decision_routing_unavailable", by_family: {} }
    render(<DecisionRoutingCard />)
    expect(text()).toContain("carried no scored counts")
    expect(text()).not.toContain("No findings scored yet")
  })
  it("a family absent from the response gets no column (never a 0)", () => {
    readings[url] = { total_findings: 3, scored_count: 3, by_family: { permissions: bucket(3), network: bucket(0) } }
    render(<DecisionRoutingCard />)
    expect(screen.queryByText("Data")).toBeNull()
    expect(screen.getByText("Permissions")).toBeInTheDocument()
    expect(screen.getByText("Network")).toBeInTheDocument()
  })
  it("control: a real response shows its scored count", () => {
    readings[url] = { total_findings: 3, scored_count: 3, by_family: { permissions: bucket(3), network: bucket(0), data: bucket(0) } }
    render(<DecisionRoutingCard />)
    expect(text()).toContain("3 findings scored")
    expect(screen.getByText("Data")).toBeInTheDocument()
  })
})

describe("Family strip", () => {
  const url = "/api/proxy/family-aggregate"
  it("a partial reading names its errors and never says 'no systems contribute'", () => {
    readings[url] = { families: {}, contributing_systems: null, total_systems: null, errors: ["system b: timeout"] }
    render(<FamilyStrip />)
    expect(text()).toContain("Some systems were not scored: system b: timeout")
    expect(text()).not.toContain("No systems contribute scores")
  })
  it("control: a complete reading with no contributing system says so", () => {
    readings[url] = { families: {}, contributing_systems: 0, total_systems: 0, errors: [] }
    render(<FamilyStrip />)
    expect(text()).toContain("No systems contribute scores for this family yet")
  })
})

describe("Recent activity", () => {
  const url = "/api/proxy/recent-activity"
  const failed = { items: [], total: 0, errors: ["remediation-events: backend 503", "snapshots: backend 503", "rollbacks: backend 503"] }
  it("every source failing is 'could not be read', not '0 events' / 'No remediation events'", () => {
    readings[url] = failed
    render(<RecentActivityCard />)
    expect(text()).toContain("Activity could not be read")
    expect(text()).not.toContain("0 events")
    expect(text()).not.toContain("No remediation events recorded yet")
    expect(text()).toContain("Source errors")
  })
  it("a replayed older feed says so", () => {
    readings[url] = { items: [{ kind: "snapshot", timestamp: "2026-10-01T00:00:00Z", resource_type: "IAMRole", resource_id: "r" }], total: 1, errors: [], stale: true }
    render(<RecentActivityCard />)
    expect(text()).toContain("Last feed shown")
    expect(text()).not.toContain("1 events")
  })
  it("control: a complete empty feed is the honest 'no events'", () => {
    readings[url] = { items: [], total: 0, errors: [] }
    render(<RecentActivityCard />)
    expect(text()).toContain("0 events")
    expect(text()).toContain("No remediation events recorded yet")
  })
  it("the dense strip says 'unavailable', not 'Engine idle', when no source answered", () => {
    readings[url] = failed
    render(<DenseLiveNowStrip />)
    expect(text()).toContain("Remediation activity unavailable")
    expect(text()).not.toContain("Engine idle")
    cleanup()
    readings[url] = { items: [], total: 0, errors: [] }
    render(<DenseLiveNowStrip />)
    expect(text()).toContain("Engine idle")
  })
})

describe("Report drawer narrowed metrics", () => {
  it("a recount is the metric only when the rows hold every counted item", () => {
    expect(narrowedCount(5, 5, 2)).toBe(2)
    expect(narrowedCount(12, 5, 0)).toBeNull() // capped sample: unknown, not 0
    expect(narrowedCount(null, 5, 0)).toBeNull() // unknown stays unknown
  })
  it("path sums are unknown when any jewel's count is", () => {
    const jewel = (pathCount: number | null) => ({ id: "j", name: "j", type: "S3", severity: null, pathCount, riskScore: null, internetExposed: null, dataClassification: null, systemName: "s" })
    expect(pathSum([jewel(3), jewel(4)])).toBe(7)
    expect(pathSum([jewel(3), jewel(null)])).toBeNull()
  })
  it("systems needing attention are unknown while any system lacks its figures", () => {
    const system = (critical: number | null, high: number | null, score: number | null) => ({
      name: "s", displayName: "s", environment: null, criticality: null, score, resourceCount: null, critical, high, weakestPlane: null,
    })
    expect(narrowedAttention([system(2, 0, 80), system(0, 0, 90)])).toBe(1)
    expect(narrowedAttention([system(0, 0, 90), system(null, null, null)])).toBeNull()
    expect(narrowedAttention([system(1, null, null)])).toBe(1)
  })
})

describe("Sidebar Shared Resources badge", () => {
  it("both sources, or no count", () => {
    const iam = { shared_roles: [{ headline_state: "narrowing_available" }, { headline_state: "none" }] }
    const sg = { shared_sgs: [{ narrowing: { headline_state: "narrowing_available" } }] }
    expect(sharedResourcesActionableCount(iam, sg)).toBe(2)
    expect(sharedResourcesActionableCount(iam, null)).toBeNull()
    expect(sharedResourcesActionableCount({}, sg)).toBeNull()
  })
})

describe("Legacy Home readings", () => {
  it("the gap reading is the summary's numbers or nothing", () => {
    expect(parseGapReading({ byCategory: { permissions: { allowed: 200, used: 50 } }, resources: { iam_roles: 4 } }))
      .toEqual({ allowed: 200, used: 50, unused: 150, roleLabel: "4 IAM Roles Analyzed" })
    expect(parseGapReading({ byCategory: {} })).toBeNull()
    expect(parseGapReading(null)).toBeNull()
  })
  it("removable % and urgent counts are null without a reading", () => {
    expect(removableGapPercent(null)).toBeNull()
    expect(removableGapPercent({ allowed: 0, used: 0, unused: 0, roleLabel: "x" })).toBeNull()
    expect(removableGapPercent({ allowed: 200, used: 50, unused: 150, roleLabel: "x" })).toBe(75)
    expect(urgentIssueCount({ by_severity: { critical: null, high: null } })).toBeNull()
    expect(urgentIssueCount(null)).toBeNull()
    expect(urgentIssueCount({ by_severity: { critical: 2, high: 3 } })).toBe(5)
  })
})
