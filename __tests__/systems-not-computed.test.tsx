import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A fresh customer install serves /api/systems from the published collection
// before any LP findings exist: every score and count is null, environment /
// owner / criticality are null, and lastScan is "Unknown". The view must show
// those as NOT COMPUTED — never as health 0 / "Critical", 0 findings, a
// "Production" environment, a "Platform Team" owner or a "Just now" scan.

const accountScope = {
  customerId: "testbed-webshop",
  groupId: "all",
  accountId: "all",
  region: "all",
  options: {
    customer_id: "testbed-webshop",
    accounts: [{
      account_id: "416651950952",
      display_name: "Testbed",
      regions: ["eu-west-1"],
      group_ids: [],
      status: "active",
    }],
    groups: [],
  },
  customers: [{ customer_id: "testbed-webshop", display_name: "Cyntro Testbed Webshop" }],
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

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => accountScope,
}))
vi.mock("@/components/back-to-dashboard", () => ({ BackToDashboard: () => null }))
vi.mock("@/components/ui/page-header", () => ({ PageHeader: () => null }))
vi.mock("@/components/new-systems-modal", () => ({ NewSystemsModal: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { SystemsView } from "@/components/systems-view"
import { healthLabel } from "@/lib/utils"

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

const INSTALL_SERVED = {
  success: true,
  count: 2,
  systems: [
    {
      name: "webshop", displayName: "webshop", SystemName: "webshop",
      resourceCount: 134, resource_count: 134, account_id: "416651950952", region: "eu-west-1",
      environment: null, owner: null, criticality: null,
      health_score: null, healthScore: null,
      critical_count: null, criticalIssues: null, high_count: null, highIssues: null,
      totalFindings: null, status: "unknown", findings_state: "not_published",
      lastScan: "Unknown", lastScanAt: null,
    },
    {
      name: "payments", displayName: "payments", SystemName: "payments",
      resourceCount: 12, resource_count: 12, account_id: "416651950952", region: "eu-west-1",
      environment: null, owner: null, criticality: null,
      health_score: 91, healthScore: 91,
      critical_count: 2, criticalIssues: 2, high_count: 1, highIssues: 1,
      totalFindings: 3, status: "healthy", lastScan: "Unknown", lastScanAt: null,
    },
  ],
  withheld: { findings: "lp_findings_rollup" },
}

describe("SystemsView on an install that has not computed findings", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders null scores and counts as not computed, never as zero or a default", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return json(INSTALL_SERVED)
      return json({})
    }))

    render(<SystemsView />)

    expect((await screen.findAllByText("webshop")).length).toBeGreaterThan(0)
    expect(screen.getByText("1 of 2 systems not computed yet")).toBeInTheDocument()
    expect(screen.getAllByTitle("Findings not computed for this system yet").length).toBeGreaterThan(0)
    // The measured system still shows its numbers.
    expect(screen.getAllByText("payments").length).toBeGreaterThan(0)
    // No fabricated defaults anywhere on the page.
    expect(screen.queryByText("Platform Team")).not.toBeInTheDocument()
    expect(screen.queryByText("Just now")).not.toBeInTheDocument()
    expect(screen.queryAllByText("Production")).toHaveLength(0)
  })
})

describe("healthLabel", () => {
  it("labels a missing score as not computed instead of Critical", () => {
    expect(healthLabel(null).label).toBe("Not computed")
    expect(healthLabel(undefined).label).toBe("Not computed")
    expect(healthLabel(0).label).toBe("Critical")
    expect(healthLabel(95).label).toBe("Healthy")
  })
})
