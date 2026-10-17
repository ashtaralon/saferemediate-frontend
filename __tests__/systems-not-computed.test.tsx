import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// SystemsView paints its per-scope systems cache (localStorage, stale-while-revalidate) BEFORE the fresh answer. Each case
// starts with no cache, so what it reads is the answer it served -- never a previous case's (FE CI 38123387270 read the
// first D3 case's cached webshop 134 where the unreported case serves null).
beforeEach(() => localStorage.clear())

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

describe("SystemsView resources column (D3)", () => {
  afterEach(() => vi.unstubAllGlobals())

  // The column rendered resourceCount under a header and tooltip that said "Total findings (all severities + all
  // statuses)". payments serves resourceCount 12 beside totalFindings 3: the column must say Resources and show 12.
  async function columnOf(body: unknown, header: string) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return json(body)
      return json({})
    }))
    render(<SystemsView />)
    await screen.findAllByText("webshop")
    const headers = screen.getAllByRole("columnheader")
    const index = headers.findIndex((th) => th.textContent === header)
    expect(index).toBeGreaterThanOrEqual(0)
    return {
      header: headers[index],
      cells: Object.fromEntries(screen.getAllByRole("row").slice(1).map((row) => {
        const cells = row.querySelectorAll("td")
        return [cells[0].querySelector("span")!.textContent, cells[index].textContent]
      })),
    }
  }

  it("is headed Resources, says it is not a findings count, and shows each system's resource count", async () => {
    const { header, cells } = await columnOf(INSTALL_SERVED, "Resources")
    expect(header.getAttribute("title")).toBe(
      "Resources the Systems list counts in this system. Not a findings count; — when the list did not report one.")
    expect(cells).toEqual({ webshop: "134", payments: "12" })
    expect(screen.queryByRole("columnheader", { name: "Total" })).toBeNull()
    expect(screen.queryByTitle(/Total findings/)).toBeNull()
  })

  it("shows an unreported resource count as —, never as 0", async () => {
    const unreported = {
      ...INSTALL_SERVED,
      systems: INSTALL_SERVED.systems.map((row) =>
        row.name === "webshop" ? { ...row, resourceCount: null, resource_count: null } : row),
    }
    const { cells } = await columnOf(unreported, "Resources")
    expect(cells).toEqual({ webshop: "—", payments: "12" })
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
