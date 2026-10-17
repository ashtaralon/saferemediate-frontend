/**
 * H3 O2: the scope bar says each account's registry status in plain words, and keeps every account selectable.
 *
 * The options answer (api/account_registry.py scope_options) carries per account only account_id, display_name,
 * regions, group_ids and status (the registry's onboarding_status). A pending registration appears as status
 * REGISTERING, but nothing in that answer says explicitly that it is not yet a registry member -- and a status is
 * not authorization -- so no row is disabled: a read of a not-yet-connected account answers its own state.
 * Rendered through the REAL AccountScopeProvider; only fetch is stubbed.
 */
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("customer_id=localtest"),
}))

import { GlobalScopeBar } from "@/components/global-scope-bar"
import { accountOptionText, accountStatusLabel } from "@/lib/account-scope"
import { AccountScopeProvider } from "@/lib/account-scope-context"

const ACCOUNTS = [
  { account_id: "222222222222", display_name: "workload-a", regions: ["eu-west-1"], group_ids: [], status: "CONNECTED" },
  { account_id: "333333333333", display_name: "workload-b", regions: ["eu-west-1"], group_ids: [], status: "AWAITING_CONNECTION" },
  { account_id: "444444444444", display_name: "workload-c", regions: ["eu-west-1"], group_ids: [], status: "CONNECTION_FAILED" },
  { account_id: "555555555555", display_name: "workload-d", regions: ["eu-west-1"], group_ids: [], status: "REGISTERING" },
]

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
    if (url === "/api/proxy/admin/customers") return json([{ customer_id: "localtest", display_name: "Local test" }])
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return json({ customer_id: "localtest", accounts: ACCOUNTS, groups: [] })
    }
    return new Response("not found", { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe("scope bar: account status labels", () => {
  it("names each non-connected account's status; a connected one carries no label; none is disabled", async () => {
    render(<AccountScopeProvider><GlobalScopeBar /></AccountScopeProvider>)
    const account = await screen.findByRole("combobox", { name: "Account" })
    await within(account).findByRole("option", { name: "workload-a · 222222222222" })
    for (const name of [
      "workload-b · 333333333333 · not connected yet",
      "workload-c · 444444444444 · connection failed",
      "workload-d · 555555555555 · registering",
    ]) {
      expect(within(account).getByRole("option", { name })).toBeInTheDocument()
    }
    for (const option of within(account).getAllByRole("option")) {
      expect(option).not.toBeDisabled()
    }
  })

  it("a selected not-yet-connected account keeps its status in the bar's title", async () => {
    window.localStorage.setItem("cyntro-product-scope", JSON.stringify(
      { customerId: "localtest", groupId: "all", accountId: "333333333333", region: "all" }))
    render(<AccountScopeProvider><GlobalScopeBar /></AccountScopeProvider>)
    const account = await screen.findByRole("combobox", { name: "Account" })
    await within(account).findByRole("option", { name: "workload-b · 333333333333 · not connected yet" })
    expect(account).toHaveValue("333333333333")
    expect(account).toHaveAttribute("title", "workload-b · 333333333333 · not connected yet")
  })

  it("the words: connected states carry none, unknown states are shown as recorded, an empty one is unknown", () => {
    expect(accountStatusLabel("CONNECTED")).toBeNull()
    expect(accountStatusLabel("READY")).toBeNull()
    expect(accountStatusLabel("VALIDATION_HELD")).toBe("validation held")
    expect(accountStatusLabel("")).toBe("status unknown")
    expect(accountStatusLabel(undefined)).toBe("status unknown")
    expect(accountOptionText({ display_name: "w", account_id: "1", status: "CONNECTED" })).toBe("w · 1")
  })
})
