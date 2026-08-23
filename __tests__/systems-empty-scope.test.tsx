import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The 2026-08-23 incident, at the component level: a narrowing region filter
// excludes every system, the scoped read legitimately returns an empty list,
// and the page must say "hidden by your filters" with a way out — never the
// generic "No Tagged Systems Found" that reads as data loss.

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
vi.mock("@/components/ui/page-header", () => ({ PageHeader: () => null }))
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

    expect(await screen.findByText("No Tagged Systems Found")).toBeInTheDocument()
    expect(screen.queryByText("Systems hidden by scope filters")).not.toBeInTheDocument()
  })
})
