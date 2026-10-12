/**
 * /api/systems withheld findings render as held in the Systems view — never
 * health 0, "0" criticals, a "Critical" average or a ranking built on nulls.
 *
 * Shape: api/systems.py `_serve_systems_payload` (saferemediate-backend branch
 * claude/cf01-lp-withhold-followup-apis): health_score/healthScore,
 * critical_count/criticalIssues, high_count/highIssues, medium/low,
 * totalFindings and status null, with `findings_withheld_reason`. Names and
 * numbers are synthetic test inputs.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const accountScope = {
  customerId: "test-customer",
  groupId: "all",
  accountId: "all",
  region: "all",
  options: { customer_id: "test-customer", accounts: [], groups: [] },
  customers: [],
  loading: false,
  error: null,
  scopeNotices: [] as string[],
  dismissScopeNotices: vi.fn(),
  setCustomerId: vi.fn(),
  setGroupId: vi.fn(),
  setAccountId: vi.fn(),
  setRegion: vi.fn(),
  refresh: vi.fn(),
}

vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => accountScope }))
vi.mock("@/components/back-to-dashboard", () => ({ BackToDashboard: () => null }))
vi.mock("@/components/ui/page-header", () => ({ PageHeader: () => null }))
vi.mock("@/components/new-systems-modal", () => ({ NewSystemsModal: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { SystemsView } from "@/components/systems-view"
import { HELD_LABEL, HELD_TITLE } from "@/lib/usage-held"

const UNVERIFIED = "IAM_USAGE_GENERATION_UNVERIFIED"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function system(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    SystemName: name,
    criticality: "MISSION CRITICAL",
    environment: "Production",
    resourceCount: 10,
    health_score: 45,
    healthScore: 45,
    critical_count: 3,
    criticalIssues: 3,
    high_count: 2,
    highIssues: 2,
    lastScan: "1h ago",
    lastScanAt: null,
    ...overrides,
  }
}

function heldSystem(name: string) {
  return system(name, {
    health_score: null,
    healthScore: null,
    critical_count: null,
    criticalIssues: null,
    high_count: null,
    highIssues: null,
    medium_count: null,
    mediumIssues: null,
    low_count: null,
    lowIssues: null,
    totalFindings: null,
    status: null,
    findings_withheld_reason: UNVERIFIED,
  })
}

function serveSystems(systems: unknown[]) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith("/api/proxy/systems")) return Response.json({ success: true, systems, findings_withheld_reason: UNVERIFIED })
    return Response.json({})
  })
  vi.stubGlobal("fetch", f)
  return f
}

describe("SystemsView with withheld findings", () => {
  it("renders withheld health and counts as Unknown and does not rank on them", async () => {
    serveSystems([heldSystem("test-system-a"), heldSystem("test-system-b")])
    render(<SystemsView />)

    expect((await screen.findAllByText("test-system-a")).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getAllByTestId("systems-row-critical")).toHaveLength(2))
    expect(screen.getAllByTestId("systems-row-high")).toHaveLength(2)
    for (const cell of screen.getAllByTestId("systems-row-health")) {
      expect(cell).toHaveTextContent(HELD_LABEL)
      expect(cell).toHaveAttribute("title", HELD_TITLE)
    }
    expect(screen.getByTestId("systems-total-critical")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("systems-mission-critical-at-risk")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("systems-avg-health")).toHaveTextContent(HELD_LABEL)
    // "Critical" is healthLabel(0): the old average of made-up zeros.
    expect(screen.queryByText("Critical")).not.toBeInTheDocument()
    expect(screen.getByTestId("systems-ranking-held")).toHaveTextContent(`2 of 2 systems not ranked: ${HELD_TITLE}`)
    // Never the false all-clear.
    expect(screen.queryByText(/All systems look clean/)).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", async () => {
    serveSystems([system("test-system-a"), system("test-system-b", { health_score: 90, healthScore: 90, critical_count: 0, criticalIssues: 0, high_count: 1, highIssues: 1 })])
    render(<SystemsView />)

    expect((await screen.findAllByText("test-system-a")).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getAllByText("45").length).toBeGreaterThan(0))
    expect(screen.queryByTestId("systems-row-critical")).not.toBeInTheDocument()
    expect(screen.queryByTestId("systems-ranking-held")).not.toBeInTheDocument()
    expect(screen.queryByTestId("systems-avg-health")).not.toBeInTheDocument()
    // Total criticals 3 + 0, mission-critical at risk 1, average health 68 -> "Fair".
    expect(screen.getByText("Total Critical Issues").parentElement?.nextElementSibling).toHaveTextContent(/^3$/)
    expect(screen.getByText("Mission Critical at Risk").parentElement?.nextElementSibling).toHaveTextContent(/^1$/)
    expect(screen.getByText("Fair")).toBeInTheDocument()
    expect(screen.getByText("3C")).toBeInTheDocument()
  })
})
