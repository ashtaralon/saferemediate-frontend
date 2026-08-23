import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const replace = vi.fn()
const searchParams = new URLSearchParams("customer_id=alon-prod")

vi.mock("next/navigation", () => ({
  usePathname: () => "/systems",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}))

import { GlobalScopeBar } from "@/components/global-scope-bar"
import { AccountScopeProvider } from "@/lib/account-scope-context"

describe("AccountScopeProvider", () => {
  beforeEach(() => {
    replace.mockClear()
    window.localStorage.clear()
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/admin/customers") {
        return new Response(JSON.stringify([
          { customer_id: "testbed-webshop", display_name: "Testbed Webshop" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
        return new Response(JSON.stringify({
          customer_id: "testbed-webshop",
          accounts: [{
            account_id: "111111111111",
            display_name: "Testbed",
            regions: ["eu-west-1"],
            group_ids: [],
            status: "active",
          }],
          groups: [],
        }), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      return new Response("not found", { status: 404 })
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it("recovers a stale URL organization and exposes the authoritative roster", async () => {
    render(
      <AccountScopeProvider>
        <GlobalScopeBar />
      </AccountScopeProvider>,
    )

    const organization = await screen.findByRole("combobox", { name: "Organization" })
    await waitFor(() => expect(organization).toHaveValue("testbed-webshop"))
    expect(screen.getByRole("option", { name: "Testbed Webshop" })).toBeInTheDocument()
    expect(screen.getByText("1 accounts in view")).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith(
      "/systems?customer_id=testbed-webshop",
      { scroll: false },
    )
  })

  it("heals a persisted region the organization cannot satisfy and says so — the 2026-08-23 incident", async () => {
    // The incident shape exactly: a valid organization, a narrowing region
    // left behind in localStorage that no account of the organization has.
    // Applying it blanked every scoped view with no error; the provider must
    // reset it against the live options and surface the reset.
    searchParams.set("customer_id", "testbed-webshop")
    window.localStorage.setItem(
      "cyntro-product-scope",
      JSON.stringify({ customerId: "testbed-webshop", groupId: "all", accountId: "all", region: "us-east-1" }),
    )
    try {
      render(
        <AccountScopeProvider>
          <GlobalScopeBar />
        </AccountScopeProvider>,
      )

      const region = await screen.findByRole("combobox", { name: "Region" })
      await waitFor(() => expect(region).toHaveValue("all"))
      expect(
        screen.getByText(/Region "us-east-1" is not available in the selected scope/),
      ).toBeInTheDocument()
      // The persisted scope is rewritten too — the heal must survive reloads.
      await waitFor(() => {
        const stored = JSON.parse(window.localStorage.getItem("cyntro-product-scope") || "{}")
        expect(stored.region).toBe("all")
      })

      fireEvent.click(screen.getByRole("button", { name: "Dismiss scope notice" }))
      expect(
        screen.queryByText(/Region "us-east-1" is not available in the selected scope/),
      ).not.toBeInTheDocument()
    } finally {
      searchParams.set("customer_id", "alon-prod")
    }
  })

  it("does not heal across a customer switch — the switch already reset the narrowing", async () => {
    // URL claims an organization the roster does not have; the provider
    // recovers to the first registered customer and resets the narrowing.
    // The heal must not run afterwards with the pre-switch closure values.
    window.localStorage.setItem(
      "cyntro-product-scope",
      JSON.stringify({ customerId: "alon-prod", groupId: "all", accountId: "all", region: "us-east-1" }),
    )
    render(
      <AccountScopeProvider>
        <GlobalScopeBar />
      </AccountScopeProvider>,
    )

    const organization = await screen.findByRole("combobox", { name: "Organization" })
    await waitFor(() => expect(organization).toHaveValue("testbed-webshop"))
    const region = screen.getByRole("combobox", { name: "Region" })
    await waitFor(() => expect(region).toHaveValue("all"))
    // No notice: nothing was healed, the customer switch reset the scope.
    expect(screen.queryByText(/reset to All/)).not.toBeInTheDocument()
  })
})
