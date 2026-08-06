import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/business-impact/business-impact-report-section", () => ({
  BusinessImpactReportSection: () => <section>Conditional business impact</section>,
}))

import {
  ManagementReportDrawer,
  type ManagementReportContext,
  type ManagementReportSnapshot,
} from "@/components/dashboard/v3/management-report-drawer"

afterEach(cleanup)

const SNAPSHOT: ManagementReportSnapshot = {
  metrics: {
    systems: 8,
    systemsPartial: false,
    systemsRequiringAttention: 3,
    reachableCrownJewels: 4,
    internetExposedJewels: 2,
    viableAttackPaths: 11,
    proposedChanges: 5,
    heldChanges: 2,
  },
  systems: [
    {
      name: "Payments production",
      displayName: "Payments production",
      environment: "production",
      criticality: "MISSION CRITICAL",
      score: 38,
      resourceCount: 47,
      critical: 3,
      high: 7,
      weakestPlane: "privilege",
    },
    {
      name: "Developer portal",
      displayName: "Developer portal",
      environment: "development",
      criticality: "STANDARD",
      score: 82,
      resourceCount: 12,
      critical: 0,
      high: 1,
      weakestPlane: "network",
    },
    {
      name: "Operations sandbox",
      displayName: "Operations sandbox",
      environment: "production",
      criticality: "STANDARD",
      score: 76,
      resourceCount: 8,
      critical: 0,
      high: 0,
      weakestPlane: "network",
    },
  ],
  crownJewels: [
    {
      id: "arn:aws:s3:::payments-ledger",
      name: "payments-ledger",
      type: "S3Bucket",
      severity: "CRITICAL",
      pathCount: 4,
      riskScore: 88,
      internetExposed: true,
      dataClassification: "Restricted",
      systemName: "Payments production",
    },
  ],
  candidates: [
    {
      resourceType: "IAMRole",
      resourceId: "payments-writer",
      system: "Payments production",
      unusedCount: 18,
      totalPermissions: 24,
      severity: "HIGH",
      canAutoApply: true,
      blockReason: null,
    },
  ],
  evidence: {
    confidence: 82,
    accounts: 2,
    healthy: 6,
    degraded: 1,
    missing: 1,
    total: 8,
  },
  outcomes: {
    windowDays: 7,
    permissionsRemoved: 61,
    events: 5,
    rollbacks: 1,
    periodStart: "2026-07-30",
    periodEnd: "2026-08-05",
    byDay: [
      { date: "2026-08-04", permissionsRemoved: 21, events: 2 },
      { date: "2026-08-05", permissionsRemoved: 40, events: 3 },
    ],
  },
}

function reading(snapshot: ManagementReportSnapshot | null = SNAPSHOT): ManagementReportContext {
  return {
    scope: "8 discovered business systems",
    snapshot,
    sources: [
      { label: "Business systems", state: "READY", cachedAt: Date.now() },
      { label: "Attack paths", state: "READY", cachedAt: Date.now() },
      { label: "Proposed changes", state: "READY", cachedAt: Date.now() },
      { label: "Evidence health", state: "READY", cachedAt: Date.now() },
      { label: "Verified outcomes", state: "READY", cachedAt: Date.now() },
    ],
  }
}

describe("Management report", () => {
  it("turns the executive snapshot into risk, damage, progress, and decisions", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)
    const text = document.body.textContent ?? ""

    expect(text).toMatch(/2 crown jewels are reachable from an external entry point/i)
    expect(text).toMatch(/Payments production/i)
    expect(text).toMatch(/Sensitive-data disclosure/i)
    expect(text).toMatch(/61 permissions removed/i)
    expect(text).toMatch(/Authorize staged execution/i)
    expect(text).toMatch(/Print \/ save PDF/i)
    expect(text).toMatch(/Security & Resilience Report/i)
    expect(text).toMatch(/Conditional business impact/i)
    expect(text).not.toMatch(/Board Security & Resilience Brief/i)
  })

  it("never turns unknown path metrics into an all-clear", () => {
    const unknown: ManagementReportSnapshot = {
      ...SNAPSHOT,
      metrics: {
        ...SNAPSHOT.metrics,
        reachableCrownJewels: null,
        internetExposedJewels: null,
        viableAttackPaths: null,
      },
      crownJewels: [],
    }
    render(<ManagementReportDrawer open onClose={() => {}} report={reading(unknown)} />)
    const text = document.body.textContent ?? ""

    expect(text).toMatch(/Crown-jewel exposure cannot be confirmed/i)
    expect(text).toMatch(/Complete attack-path analysis before accepting crown-jewel risk/i)
    expect(text).not.toMatch(/No viable route to a crown jewel was reported/i)
  })

  it("lets the user narrow the report by dashboard environment metadata", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)

    fireEvent.click(screen.getByRole("button", { name: "Production" }))

    const article = document.getElementById("cyntro-report-print-root")
    expect(article?.textContent).toMatch(/Payments production/i)
    expect(article?.textContent).not.toMatch(/Developer portal/i)
    expect(article?.textContent).toMatch(/Selected scope/i)
    expect(article?.textContent).toMatch(/lower bounds, not estate-wide totals/i)
  })

  it("cascades environment and criticality filters into the systems picker", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)

    expect(screen.getByLabelText(/Developer portal/)).toBeTruthy()
    expect(screen.getByLabelText(/Operations sandbox/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Production" }))
    expect(screen.queryByLabelText(/Developer portal/)).toBeNull()
    expect(screen.getByLabelText(/Payments production/)).toBeTruthy()
    expect(screen.getByLabelText(/Operations sandbox/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "MISSION CRITICAL" }))
    expect(screen.getByLabelText(/Payments production/)).toBeTruthy()
    expect(screen.queryByLabelText(/Operations sandbox/)).toBeNull()
  })

  it("clears system search when report scope is reset", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)

    fireEvent.click(screen.getByRole("button", { name: "Production" }))
    const search = screen.getByPlaceholderText("Find a system…")
    fireEvent.change(search, { target: { value: "does-not-exist" } })
    expect(screen.getByText("No systems match the selected filters.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Reset scope" }))
    expect(search).toHaveValue("")
    expect(screen.getByLabelText(/Developer portal/)).toBeTruthy()
  })

  it("uses role-neutral content controls and selectable sections", () => {
    render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)

    expect(screen.getByText("Content emphasis")).toBeTruthy()
    expect(screen.getByRole("button", { name: /business/i })).toBeTruthy()
    expect(screen.getByText("Included sections")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/CISO|VP Platform|Board of Directors/i)

    fireEvent.click(screen.getByLabelText("Include Potential damage"))
    expect(document.getElementById("report-damage")).toBeNull()
  })

  it("keeps report settings reachable on responsive layouts", () => {
    const { rerender } = render(<ManagementReportDrawer open onClose={() => {}} report={reading()} />)

    const toggle = screen.getByRole("button", { name: "Report settings" })
    const panel = document.getElementById("management-report-settings")
    expect(document.body.style.overflow).toBe("hidden")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(panel).toHaveAttribute("data-mobile-open", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(panel).toHaveAttribute("data-mobile-open", "true")

    fireEvent.click(screen.getByRole("button", { name: "Close report settings" }))
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    rerender(<ManagementReportDrawer open={false} onClose={() => {}} report={reading()} />)
    expect(document.body.style.overflow).toBe("")
  })
})
