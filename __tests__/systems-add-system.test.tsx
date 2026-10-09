/**
 * D2/D4/D17 (resident QA, 2026-10-09): Systems' "Add System" leads into the System Boundary wizard -- the one sanctioned way
 * to create a system -- and nothing else. It used to open an "Available systems from AWS" dropdown built from the Systems
 * list itself, insert a row with invented Production / mission-critical defaults, toast "System Added", and only then POST
 * /api/proxy/systems/add (a route the backend never had; the proxy read another field and answered 400).
 *
 * Now: one served account in the scope -> a link to that account's inventory with the declare flow asked for; several ->
 * a chooser of exactly those accounts. Nothing is POSTed, no row is added, nothing claims a system was added.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AccountScopeOption } from "@/lib/account-scope"

const ACCOUNT_A: AccountScopeOption = {
  account_id: "416651950952", display_name: "Testbed", regions: ["eu-west-1"], group_ids: ["g-prod"], status: "CONNECTED",
}
const ACCOUNT_B: AccountScopeOption = {
  account_id: "222222222222", display_name: "prod-payments", regions: ["us-east-1"], group_ids: [], status: "AWAITING_CONNECTION",
}

const accountScope = {
  customerId: "testbed-webshop",
  groupId: "all",
  accountId: "all",
  region: "all",
  options: { customer_id: "testbed-webshop", accounts: [ACCOUNT_A] as AccountScopeOption[], groups: [] },
  customers: [{ customer_id: "testbed-webshop", display_name: "Cyntro Testbed Webshop" }],
  loading: false,
  error: null as string | null,
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
vi.mock("@/components/RefreshEvidenceButton", () => ({ RefreshEvidenceButton: () => null }))

import { SystemsView } from "@/components/systems-view"

const calls: { url: string; method: string }[] = []

function serve(systems: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: (init?.method || "GET").toUpperCase() })
    if (url.startsWith("/api/proxy/systems")) {
      return new Response(JSON.stringify({ success: true, systems }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    return new Response(JSON.stringify({ detail: `unexpected ${url}` }), { status: 404 })
  }))
}

// One served system, as the v1 Systems list answers it.
const LISTED = [{ SystemName: "testbed-webshop", resourceCount: 134 }]

beforeEach(() => {
  calls.length = 0
  window.localStorage.clear()
  accountScope.options.accounts = [ACCOUNT_A]
  accountScope.groupId = "all"
  accountScope.accountId = "all"
  accountScope.region = "all"
})
afterEach(() => vi.unstubAllGlobals())

describe("Systems > Add System leads into the System Boundary wizard", () => {
  it("with one served account in scope, links to that account's inventory with the declare flow asked for", async () => {
    serve(LISTED)
    render(<SystemsView />)
    await screen.findAllByText("testbed-webshop")
    const add = screen.getByTestId("add-system")
    expect(add.tagName).toBe("A")
    expect(add.getAttribute("href")).toBe("/accounts/416651950952?tab=inventory&declare=1")
    fireEvent.click(add)
    // Nothing is saved from here, no row is invented, and nothing says a system was added.
    expect(calls.filter((call) => call.method !== "GET")).toEqual([])
    expect(calls.some((call) => call.url.includes("/systems/add"))).toBe(false)
    expect(screen.queryByText("System Added")).toBeNull()
    expect(screen.queryByText("Available systems from AWS")).toBeNull()
    expect(screen.getAllByRole("row")).toHaveLength(1 + LISTED.length)        // header + the served row, no optimistic row
  })

  it("with several served accounts in scope, lists exactly those to choose from, each into its declare flow", async () => {
    accountScope.options.accounts = [ACCOUNT_A, ACCOUNT_B]
    serve(LISTED)
    render(<SystemsView />)
    await screen.findAllByText("testbed-webshop")
    const add = screen.getByTestId("add-system")
    expect(add.tagName).toBe("BUTTON")
    fireEvent.click(add)
    const chooser = screen.getByTestId("add-system-accounts")
    const links = within(chooser).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Testbed · 416651950952", "/accounts/416651950952?tab=inventory&declare=1"],
      ["prod-payments · 222222222222 · not connected yet", "/accounts/222222222222?tab=inventory&declare=1"],
    ])
    expect(calls.filter((call) => call.method !== "GET")).toEqual([])
  })

  it("narrows to the scope: a selected account is the only one offered", async () => {
    accountScope.options.accounts = [ACCOUNT_A, ACCOUNT_B]
    accountScope.accountId = ACCOUNT_B.account_id
    serve(LISTED)
    render(<SystemsView />)
    await screen.findAllByText("testbed-webshop")
    expect(screen.getByTestId("add-system").getAttribute("href")).toBe("/accounts/222222222222?tab=inventory&declare=1")
  })

  it("the empty Systems list offers the same entry, and the same nothing-saved behaviour", async () => {
    serve([])
    render(<SystemsView />)
    expect(await screen.findByText("No Tagged Systems Found")).toBeInTheDocument()
    expect(screen.getByTestId("add-system").getAttribute("href")).toBe("/accounts/416651950952?tab=inventory&declare=1")
    expect(calls.filter((call) => call.method !== "GET")).toEqual([])
  })

  it("is disabled, with its reason, when the scope's accounts could not be read", async () => {
    const options = accountScope.options
    accountScope.options = null as unknown as typeof options
    try {
      serve(LISTED)
      render(<SystemsView />)
      await screen.findAllByText("testbed-webshop")
      const add = screen.getByTestId("add-system")
      expect(add).toBeDisabled()
      expect(add.getAttribute("title")).toBe(
        "The accounts in scope could not be read, so no account can be opened to declare a system.")
    } finally {
      accountScope.options = options
    }
  })
})
