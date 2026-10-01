/**
 * READY / Connected means "platform operational", never "fully supported".
 * Settings > Accounts says so and links each operational account to its
 * per-source coverage; the coverage page scopes to ?account_id=.
 *
 * Account rows are TEST INPUTS shaped like api/account_registry.py listings.
 */
import { render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "tenant-a", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({ useSearchParams: () => search }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import CoveragePage from "@/app/settings/coverage/page"
import { OperationalNotCompleteNote } from "@/components/settings/connect-account-panel"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const BASE = {
  customer_id: "tenant-a",
  environment: "PRODUCTION",
  regions: ["eu-west-1"],
  read_enabled: true,
  verification_enabled: false,
  mutation_enabled: false,
  validation_message: null,
  last_validated_at: null,
  sources: {},
  pending_request: null,
}

const PLATFORM = { ...BASE, account_id: "111122223333", display_name: "Platform", onboarding_status: "REGISTERED", collection_mode: "LOCAL_CUSTOMER_PLANE", is_platform_account: true }
const CONNECTED = { ...BASE, account_id: "777788889999", display_name: "Data platform", onboarding_status: "CONNECTED", collection_mode: "MEMBER_READ_ROLE", is_platform_account: false }
const AWAITING = { ...BASE, account_id: "444455556666", display_name: "Payments", onboarding_status: "AWAITING_CONNECTION", collection_mode: "MEMBER_READ_ROLE", is_platform_account: false }

function memberList(accounts: Array<Record<string, unknown>>) {
  return {
    mode: "MEMBER_ACCOUNTS",
    accounts,
    total: accounts.length,
    registry_available: true,
    member_trust: { platform_account_id: "111122223333", organization_id: "o-test", ready: true },
    failed_requests: [],
    summary: { connected: 1, needs_attention: 1, discovered: 0, mutation_enabled: 0 },
  }
}

describe("Settings > Accounts: READY means operational", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("states that Connected/READY is operational, not complete history, and links per-source coverage", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/admin/accounts/groups")) return json({ groups: [] })
      return json(memberList([PLATFORM, CONNECTED, AWAITING]))
    }))

    render(<AccountSettingsPage />)

    const note = await screen.findByTestId("ready-means-operational")
    expect(note).toHaveTextContent("Connected / READY means the platform is operational for this account. It does not mean every evidence source has complete history")
    expect(within(note).getByRole("link", { name: "View evidence coverage" })).toHaveAttribute("href", "/settings/coverage")
    expect(screen.getByRole("link", { name: "Evidence coverage" })).toHaveAttribute("href", "/settings/coverage")

    const connected = await screen.findByTestId("account-row-777788889999")
    const link = within(connected).getByRole("link", { name: "Evidence coverage for 777788889999" })
    expect(link).toHaveAttribute("href", "/settings/coverage?account_id=777788889999")
    expect(link).toHaveTextContent("Operational · evidence coverage")

    // The platform account links to its coverage without claiming an operational state it does not have.
    const platform = screen.getByTestId("account-row-111122223333")
    expect(within(platform).getByRole("link", { name: "Evidence coverage for 111122223333" })).toHaveTextContent(/^Evidence coverage$/)

    // An account that is not connected gets no operational claim.
    const awaiting = screen.getByTestId("account-row-444455556666")
    expect(within(awaiting).queryByRole("link")).not.toBeInTheDocument()
  })

  it("the connect panel's Connected outcome carries the same clarification", () => {
    render(<OperationalNotCompleteNote accountId="777788889999" />)
    const note = screen.getByTestId("connected-means-operational")
    expect(note).toHaveTextContent("Connected means Cyntro can operate in this account, not that its history is complete.")
    expect(within(note).getByRole("link", { name: "Evidence coverage" })).toHaveAttribute("href", "/settings/coverage?account_id=777788889999")
  })
})

describe("Settings > Evidence coverage page", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    search = new URLSearchParams()
  })

  it("scopes the coverage record to ?account_id=", async () => {
    search = new URLSearchParams({ account_id: "777788889999" })
    const fetchMock = vi.fn(async () => json({ status: "NOT_RECORDED", accounts: [] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<CoveragePage />)

    expect(await screen.findByTestId("coverage-not-recorded")).toHaveTextContent("Coverage not recorded yet")
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/coverage/sources?account_id=777788889999", { cache: "no-store" })
    expect(screen.getByText("777788889999")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Show all accounts" })).toHaveAttribute("href", "/settings/coverage")
  })
})
