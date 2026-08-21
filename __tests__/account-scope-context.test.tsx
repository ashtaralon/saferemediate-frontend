import { render, screen, waitFor } from "@testing-library/react"
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
})
