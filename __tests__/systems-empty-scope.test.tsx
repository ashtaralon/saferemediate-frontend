import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The 2026-08-23 incident, at the component level: a narrowing region filter
// excludes every system, the scoped read legitimately returns an empty list,
// and the page must say "hidden by your filters" with a way out — never the
// generic "No systems in this scope yet" that reads as data loss.

const setGroupId = vi.fn()
const accountScope = {
  customerId: "testbed-webshop",
  groupId: "all",
  accountId: "all",
  region: "us-east-1",
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
  setGroupId,
  setAccountId: vi.fn(),
  setRegion: vi.fn(),
  refresh: vi.fn(),
}

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => accountScope,
}))
vi.mock("@/components/back-to-dashboard", () => ({ BackToDashboard: () => null }))
// The header renders only its actions (the Refresh control the person-refusal tests use); the empty states above
// return before the header and are unaffected.
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ actions }: { actions?: unknown }) => actions ?? null }))
vi.mock("@/components/new-systems-modal", () => ({ NewSystemsModal: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { SystemsView } from "@/components/systems-view"

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("SystemsView filtered-empty state", () => {
  beforeEach(() => {
    setGroupId.mockClear()
    window.localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("names what the filters hide and resets them in one click", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) {
        // The scoped read carries the narrowing region; the honesty probe
        // lifts it. The organization has one real system outside the filter.
        if (url.includes("region=")) return json({ success: true, systems: [] })
        return json({ success: true, systems: [{ SystemName: "testbed-webshop", resourceCount: 134 }] })
      }
      return json({})
    }))

    render(<SystemsView />)

    expect(await screen.findByText("Systems hidden by scope filters")).toBeInTheDocument()
    expect(
      screen.getByText(/1 system exists in this organization outside the selected account group, account, or region filters/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reset filters to All" }))
    expect(setGroupId).toHaveBeenCalledWith("all")
  })

  it("still reports a true empty when the organization has no systems anywhere", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return json({ success: true, systems: [] })
      return json({})
    }))

    render(<SystemsView />)

    expect(await screen.findByText("No systems in this scope yet")).toBeInTheDocument()
    expect(screen.queryByText("Systems hidden by scope filters")).not.toBeInTheDocument()
  })

  it("says no AWS account is connected when the organization has none in scope", async () => {
    const connected = accountScope.options.accounts
    const narrowed = accountScope.region
    accountScope.options.accounts = []
    accountScope.region = "all"
    try {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith("/api/proxy/systems")) return json({ success: true, systems: [] })
        return json({})
      }))

      render(<SystemsView />)

      expect(await screen.findByText("No AWS accounts connected")).toBeInTheDocument()
      expect(
        screen.getByText("The testbed-webshop organization has no AWS accounts in scope. Connect a workload account in Settings › Accounts."),
      ).toBeInTheDocument()
      expect(screen.queryByText("No systems in this scope yet")).not.toBeInTheDocument()
    } finally {
      accountScope.options.accounts = connected
      accountScope.region = narrowed
    }
  })
})

// SW-S1A-20261015-84: a person refusal (the backend's typed 401, or a 403 whose code names the person) is shown as
// itself, and nothing from an earlier answer survives it: not the rows on screen, not the browser's saved copy.
describe("SystemsView person refusal", () => {
  const SAVED = "cyntro-systems:v2:testbed-webshop:all:all:us-east-1"
  const refusal = (status: number, code: string) => new Response(JSON.stringify({ detail: { code }, origin: "backend" }), {
    status,
    headers: { "Content-Type": "application/json" },
  })

  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  function backend(answers: { systems: () => Response }) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return answers.systems()
      return json({})
    }))
  }

  it("drops the displayed rows and the saved copy when a later read is refused", async () => {
    const answers = { systems: () => json({ success: true, systems: [{ SystemName: "payments", resourceCount: 3 }] }) }
    backend(answers)
    render(<SystemsView />)
    expect((await screen.findAllByText("payments")).length).toBeGreaterThan(0)
    expect(window.localStorage.getItem(SAVED)).toContain("payments")

    answers.systems = () => refusal(403, "PERSON_NOT_AUTHORIZED")
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))

    expect(await screen.findByText("Your sign-in is not authorized to view Systems")).toBeInTheDocument()
    expect(screen.getByText(/Ask an administrator for Cyntro access/)).toBeInTheDocument()
    expect(screen.queryAllByText("payments")).toHaveLength(0)
    expect(window.localStorage.getItem(SAVED)).toBeNull()
  })

  it.each([
    [401, "PERSON_TOKEN_REQUIRED", "Your sign-in could not be verified for the Systems list"],
    [403, "PERSON_NOT_TENANT_WIDE", "Your access covers specific accounts, not the whole organization"],
  ])("a %i %s on the first read clears a copy an earlier session saved", async (status, code, title) => {
    window.localStorage.setItem(SAVED, JSON.stringify([{ name: "earlier-session-system", resourceCount: 1 }]))
    backend({ systems: () => refusal(status, code) })
    render(<SystemsView />)
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.queryByText("earlier-session-system")).not.toBeInTheDocument()
    expect(window.localStorage.getItem(SAVED)).toBeNull()
  })

  it("leaves other refusals as they were: a scope 403 keeps the rows already shown", async () => {
    const answers = { systems: () => json({ success: true, systems: [{ SystemName: "payments", resourceCount: 3 }] }) }
    backend(answers)
    render(<SystemsView />)
    expect((await screen.findAllByText("payments")).length).toBeGreaterThan(0)

    answers.systems = () => refusal(403, "INVENTORY_SCOPE_MISMATCH")
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }))
    await waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(3))
    expect(screen.getAllByText("payments").length).toBeGreaterThan(0)
    expect(screen.queryByText("Your sign-in is not authorized to view Systems")).not.toBeInTheDocument()
  })
})
