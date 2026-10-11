/**
 * D2/D4/D17 (resident QA, 2026-10-09): Systems' "Add System" leads into the System Boundary wizard -- the one sanctioned way
 * to create a system -- and nothing else. It used to open an "Available systems from AWS" dropdown built from the Systems
 * list itself, insert a row with invented Production / mission-critical defaults, toast "System Added", and only then POST
 * /api/proxy/systems/add (a route the backend never had; the proxy read another field and answered 400).
 *
 * Now: one served account in the scope -> a link to that account's inventory with the declare flow asked for; several ->
 * a chooser of exactly those accounts. Nothing is POSTed, no row is added, nothing claims a system was added.
 *
 * Codex review of 137d85da (P2, reproduced): the provider KEEPS its previous options while a reload is in flight, after it
 * fails, and when a customer switch names the new customer before its options arrive. Those retained accounts must never
 * become a link or a chooser: the entry is disabled with why until the CURRENT scope is read, and recovers when it is.
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
import { AddSystemEntry } from "@/components/system-boundary/add-system-entry"

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
  accountScope.customerId = "testbed-webshop"
  accountScope.options = { customer_id: "testbed-webshop", accounts: [ACCOUNT_A], groups: [] }
  accountScope.loading = false
  accountScope.error = null
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

  it("D50: the entry stays on screen at desktop widths -- a labelled, focusable link the view's own width cannot push away", async () => {
    // Live 0.10.6 at 1512 px: the table and action row set the shell's minimum width, the page overflowed 264 px and
    // "Add System" rendered at x=1505..1615. jsdom has no layout, so this pins the three guarantees that fixed it in the
    // measured browser (contained inline size, wrapping action row, table scrolling inside its own box).
    serve(LISTED)
    render(<SystemsView />)
    await screen.findAllByText("testbed-webshop")
    const add = screen.getByTestId("add-system")
    expect(add).toHaveAccessibleName("Add System")
    add.focus()
    expect(document.activeElement).toBe(add)
    expect(add.closest(".space-y-6")?.className).toContain("[contain:inline-size]")
    expect(add.parentElement?.className).toContain("flex-wrap")
    const table = screen.getAllByRole("table")[0]
    expect(table.closest(".rounded-lg.border")?.className).toContain("overflow-x-auto")
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
    // D2 copy (Codex review): a valid empty list proves no system is listed, not that AWS holds no tags.
    expect(await screen.findByText("No systems in this scope yet")).toBeInTheDocument()
    expect(screen.getByText(
      "No systems are listed for the selected organization, account group, account, and Region. Systems are declared from "
      + "an account's inventory: choose Add System.")).toBeInTheDocument()
    expect(screen.queryByText(/Tagged|SystemName/)).toBeNull()
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

// Codex review of 137d85da: __tests__/codex-add-system-scope-review.test.tsx (1 control passing, 3 expected-disabled cases
// failing against 137d85da), brought here over this file's scope object. Each case RETAINS the previous options.
describe("Add System offers accounts only from the current, settled scope (Codex review, P2)", () => {
  const href = () => screen.getByTestId("add-system").getAttribute("href")

  it("control: a resolved current scope offers its account", () => {
    render(<AddSystemEntry />)
    expect(href()).toBe("/accounts/416651950952?tab=inventory&declare=1")
  })

  it("a failed scope refresh with the previous options retained disables the entry, with why", () => {
    accountScope.error = "Account scope is unavailable (503)"
    render(<AddSystemEntry />)
    const add = screen.getByTestId("add-system")
    expect(add).toBeDisabled()
    expect(add.getAttribute("title")).toBe(
      "The accounts in scope could not be read, so no account can be opened to declare a system.")
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("an in-flight scope refresh with the previous options retained disables the entry, with why", () => {
    accountScope.loading = true
    render(<AddSystemEntry />)
    const add = screen.getByTestId("add-system")
    expect(add).toBeDisabled()
    expect(add.getAttribute("title")).toBe("Loading the accounts in scope…")
  })

  it("the previous customer's options never become the new customer's links -- one account or several", () => {
    accountScope.customerId = "new-customer"
    const { unmount } = render(<AddSystemEntry />)
    const add = screen.getByTestId("add-system")
    expect(add).toBeDisabled()
    expect(add.getAttribute("title")).toBe(
      "The accounts of the selected organization have not been read yet, so no account can be opened to declare a system.")
    unmount()
    accountScope.options.accounts = [ACCOUNT_A, ACCOUNT_B]
    render(<AddSystemEntry />)
    fireEvent.click(screen.getByTestId("add-system"))
    expect(screen.queryByTestId("add-system-accounts")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("no organization resolved: disabled, with why", () => {
    accountScope.customerId = null as unknown as string
    render(<AddSystemEntry />)
    expect(screen.getByTestId("add-system").getAttribute("title")).toBe(
      "No organization is selected, so no account can be opened to declare a system.")
  })

  it("recovers when the current scope is read successfully: the failed refresh's disabled entry becomes the link", () => {
    accountScope.error = "Account scope is unavailable (503)"
    const { rerender } = render(<AddSystemEntry />)
    expect(screen.getByTestId("add-system")).toBeDisabled()
    // The reload for the current customer succeeds: settled, no error, options naming this customer.
    accountScope.error = null
    accountScope.options = { customer_id: "testbed-webshop", accounts: [ACCOUNT_B], groups: [] }
    rerender(<AddSystemEntry />)
    expect(href()).toBe("/accounts/222222222222?tab=inventory&declare=1")
  })

  it("recovers after a customer switch once the new customer's own options arrive", () => {
    accountScope.customerId = "new-customer"
    accountScope.loading = true
    const { rerender } = render(<AddSystemEntry />)
    expect(screen.getByTestId("add-system")).toBeDisabled()
    accountScope.loading = false
    accountScope.options = { customer_id: "new-customer", accounts: [ACCOUNT_B], groups: [] }
    rerender(<AddSystemEntry />)
    expect(href()).toBe("/accounts/222222222222?tab=inventory&declare=1")
  })
})
