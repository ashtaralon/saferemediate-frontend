/**
 * The account's Overview and Inventory pages say where its DATA really stands (automatic onboarding, 2026-10-10). The live
 * page said "Now: collecting its first inventory" two minutes AFTER collection had finished: the inventory route's readiness
 * hold carries the lifecycle state recorded when it was published (BOOTSTRAPPING), which lags the account. When the listing
 * reports `data_activation.stage` / `inventory` / `census`, the not-yet-shown inventory and census are said from them;
 * otherwise each route's own words stand, as before.
 *
 * PENDING CAPTURES: the inventory and census answers are the REAL routes' captures (fixtures/account-inventory-captures,
 * account-inventory, account-census-captures; their _provenance), and the Overview's listing is the producer's capture 18 --
 * but every `data_activation` is written to the contract (fixtures/data-activation.pending-captures.ts) until the backend's
 * captures land. The one listing row for the captures' own account (111122223333) is a TEST INPUT shaped like the listing
 * contract, as settings-accounts-member-mode does: no listing capture names that account.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/accounts/x",
  useSearchParams: () => search,
}))
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", region: "all", loading: false, options: { accounts: [] }, refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountRoute from "@/app/accounts/[accountId]/page"
import { AccountCensusBands } from "@/components/accounts/account-census-bands"
import { AccountInventoryView } from "@/components/accounts/account-inventory-view"
import type { DataActivation, ManagedAccount } from "@/lib/account-admin"
import type { CensusFetcher } from "@/lib/account-census"
import type { InventoryFetcher } from "@/lib/account-inventory"
import { heldCopy } from "@/lib/inventory-copy"
import { automatic, legacy, optionA } from "@/__tests__/fixtures/data-activation.pending-captures"
import collected from "@/__tests__/fixtures/settings-c-producer/18_k2_collected.json"
import collecting from "@/__tests__/fixtures/settings-c-producer/17_k2_collecting.json"

const MEMBER = "222222222222"
type Golden = { status: number; body: Record<string, any> }
const golden = (dir: string, name: string): Golden => {
  const c = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", dir, `${name}.json`), "utf8"))
  return { status: c.status, body: c.body }
}
const HELD_INVENTORY = golden("account-inventory-captures", "held_lifecycle_not_active")
const CAPTURED_ACCOUNT: string = HELD_INVENTORY.body.account_id
const SINCE = "2026-10-05T07:57:19.000Z"

type Listing = { captured_at: string; body: { accounts: Array<Record<string, any>> } & Record<string, any> }
const memberRow = (capture: Listing) => capture.body.accounts.find((a) => a.account_id === MEMBER) as ManagedAccount
/** An account row for the inventory / census components: the producer's member row with a pending-capture data_activation. */
const withStage = (activation: DataActivation | null, capture: Listing = collected as unknown as Listing): ManagedAccount =>
  ({ ...memberRow(capture), data_activation: activation })

beforeEach(() => { search = new URLSearchParams() })
afterEach(() => { vi.unstubAllGlobals() })

async function inventoryWith(answer: Golden, account?: ManagedAccount | null) {
  const fetchPage: InventoryFetcher = vi.fn(async () => ({ status: answer.status, body: structuredClone(answer.body) }))
  await act(async () => {
    render(
      <AccountInventoryView accountId={CAPTURED_ACCOUNT} customerId="acme" region="all" resourceType={null}
        roster={{ status: "ready", displayName: null }} onResourceTypeChange={vi.fn()} fetchPage={fetchPage} account={account} />,
    )
  })
  return screen.findByRole("status")
}

describe("Inventory: a not-yet-shown inventory is said from the data's real stage", () => {
  it("the captured hold is the live bug: its own words say 'collecting' however far the account has moved", async () => {
    expect(HELD_INVENTORY.body.reason_code).toBe(`${CAPTURED_ACCOUNT}:CONSUMER_NOT_READY:lifecycle_not_active:BOOTSTRAPPING`)
    expect(await inventoryWith(HELD_INVENTORY)).toHaveTextContent(heldCopy(HELD_INVENTORY.body.reason_code))
    expect(screen.getByRole("status")).toHaveTextContent("Now: collecting its first inventory.")
  })

  it.each([
    ["staging", automatic.staging(SINCE), "Inventory appears once this account's data is active. Now: staging its collected data."],
    ["checking", automatic.checking(SINCE), "Inventory appears once this account's data is active. Now: checking its data."],
    ["activating", automatic.activating(SINCE), "Inventory appears once this account's data is active. Now: turning its data on."],
    ["publishing", automatic.publishing(SINCE), "This account's data is on; its inventory is being published."],
    ["held", automatic.held(SINCE, ["acceptance_not_current"]), "Inventory is held (acceptance_not_current)."],
    ["legacy", legacy(SINCE),
      "Inventory appears once this account's data is active. Now: it was connected for collection only; its data is shown once someone asks for it in Settings › Accounts."],
  ] as const)("%s", async (_stage, activation, text) => {
    const status = await inventoryWith(HELD_INVENTORY, withStage(activation))
    expect(status.textContent).toBe(text)
    expect(status).not.toHaveTextContent("collecting its first inventory")
  })

  it("collecting: with the producer's own count of collected work items", async () => {
    const status = await inventoryWith(HELD_INVENTORY, withStage(automatic.collecting(SINCE), collecting as unknown as Listing))
    expect(status.textContent).toBe(
      "Inventory appears once this account's data is active. Now: collecting its first inventory (0 of 31 work items collected).")
  })

  it("not published yet (the real not_published answer) is said from the stage too", async () => {
    const status = await inventoryWith(golden("account-inventory", "not_published"), withStage(automatic.checking(SINCE)))
    expect(status.textContent).toBe("Inventory appears once this account's data is active. Now: checking its data.")
  })

  it.each([
    ["no listed row", undefined],
    ["a listed row from a backend without stages (option A)", withStage(optionA({}))],
    ["a listed row whose inventory is ready (the route's answer stands)", withStage({ ...automatic.checking(SINCE), inventory: { state: "ready", detail: null } })],
  ] as const)("%s: the route's own words, as before", async (_label, account) => {
    expect(await inventoryWith(HELD_INVENTORY, account)).toHaveTextContent(heldCopy(HELD_INVENTORY.body.reason_code))
  })

  it("a hold that is not about readiness (AUTHORITY_CHANGED) is never replaced by the stage", async () => {
    const authority = golden("account-inventory", "held_authority_changed")
    expect(await inventoryWith(authority, withStage(automatic.checking(SINCE)))).toHaveTextContent(heldCopy("AUTHORITY_CHANGED"))
  })
})

function censusOf(name: string): CensusFetcher {
  const answer = golden("account-census-captures", name)
  return vi.fn(async () => ({ status: answer.status, body: structuredClone(answer.body) }))
}

async function censusWith(name: string, account?: ManagedAccount | null) {
  await act(async () => {
    render(
      <AccountCensusBands accountId={CAPTURED_ACCOUNT} fetchPage={censusOf(name)} account={account}>
        <div>the inventory</div>
      </AccountCensusBands>,
    )
  })
  return within(screen.getByRole("region", { name: "Census coverage" })).getByRole("status")
}

describe("Census: its line uses census.state", () => {
  it("the captured readiness hold, without a stage: the route's own words", async () => {
    expect(await censusWith("held_no_census_rows")).toHaveTextContent("The census for this account is not ready to be shown yet.")
  })

  it.each([
    ["staging, census pending", automatic.staging(SINCE), "The census appears once this account's data is active. Now: staging its collected data."],
    ["publishing, census pending", automatic.publishing(SINCE), "This account's data is on; its census is being published."],
    ["held", automatic.held(SINCE, ["acceptance_not_current"]), "The census is held (acceptance_not_current)."],
  ] as const)("%s", async (_label, activation, text) => {
    expect((await censusWith("held_no_census_rows", withStage(activation))).textContent).toBe(text)
  })

  it("census ready in the listing: the route's own answer stands", async () => {
    const ready = { ...automatic.checking(SINCE), census: { state: "ready", detail: null } }
    expect(await censusWith("held_no_census_rows", withStage(ready))).toHaveTextContent("The census for this account is not ready to be shown yet.")
  })

  it("an install fact -- census disabled -- is never replaced by the stage", async () => {
    expect(await censusWith("not_published_census_disabled", withStage(automatic.checking(SINCE)))).toHaveTextContent(
      "Census is not enabled on this install.")
  })
})

describe("the CURRENT registration's progress only, on the Inventory and Overview pages", () => {
  const EARLIER = "0".repeat(32)   // a registration id that is not the row's current one

  it("inventory and census of an earlier registration: 'waiting for this registration's data', never its state", async () => {
    const stale = { ...automatic.publishing(SINCE), registration_id: EARLIER }
    expect((await inventoryWith(HELD_INVENTORY, withStage(stale))).textContent).toBe(
      "Inventory appears once this account's data is active. Now: waiting for this registration's data.")
  })

  it("census of an earlier registration: its census.state is never said", async () => {
    const stale = { ...automatic.active(SINCE), registration_id: EARLIER }
    expect((await censusWith("held_no_census_rows", withStage(stale))).textContent).toBe(
      "The census appears once this account's data is active. Now: waiting for this registration's data.")
  })

  it("Overview: a first inventory naming an earlier registration lists none of its rows or numbers", async () => {
    const listing = collected as unknown as Listing
    const member = memberRow(listing) as any
    const stale = { ...member, data_activation: null,
      registration: { ...member.registration, first_inventory: { ...member.registration.first_inventory, registration_id: EARLIER } } }
    serveRoute({ ...listing.body, accounts: [stale] })
    await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: MEMBER })} />) })
    expect(await screen.findByTestId("first-inventory-by-type-other-registration")).toHaveTextContent("Waiting for this registration's data")
    expect(screen.queryByTestId("first-inventory-by-type")).toBeNull()
    expect(screen.getByTestId(`first-collection-${MEMBER}`).textContent).toBe("First inventory: waiting for this registration's data.")
  })
})

function serveRoute(listingBody: Record<string, any>) {
  const inventory = HELD_INVENTORY
  const census = golden("account-census-captures", "held_no_census_rows")
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store" } })
    if (url === "/api/proxy/admin/accounts?customer_id=acme") return reply(listingBody)
    if (url.startsWith(`/api/proxy/accounts/${CAPTURED_ACCOUNT}/census`)) return reply(census.body, census.status)
    if (url.startsWith(`/api/proxy/accounts/${CAPTURED_ACCOUNT}/inventory`)) return reply(inventory.body, inventory.status)
    return reply({ detail: `unexpected ${url}` }, 404)
  }))
}

describe("the account page threads the listed row to both", () => {
  it("Inventory tab: inventory and census both say the real stage, not the hold's 'collecting'", async () => {
    // TEST INPUT shaped like the listing contract (no listing capture names the inventory captures' own account).
    const row = {
      customer_id: "acme", account_id: CAPTURED_ACCOUNT, display_name: CAPTURED_ACCOUNT, environment: "PRODUCTION",
      regions: ["eu-west-1"], onboarding_status: "CONNECTED", collection_mode: "MEMBER_READ_ROLE", read_enabled: true,
      verification_enabled: false, mutation_enabled: false, validation_message: null, last_validated_at: null, sources: {},
      pending_request: null, is_platform_account: false, data_activation: automatic.checking(SINCE),
    }
    serveRoute({ mode: "MEMBER_ACCOUNTS", accounts: [row], removed: [], total: 1, registry_available: true,
      summary: { connected: 1, needs_attention: 0, discovered: 0, mutation_enabled: 0 } })
    search = new URLSearchParams("tab=inventory")
    await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: CAPTURED_ACCOUNT })} />) })
    await waitFor(() => expect(screen.getByText("Inventory appears once this account's data is active. Now: checking its data.")).toBeInTheDocument())
    expect(screen.getByText("The census appears once this account's data is active. Now: checking its data.")).toBeInTheDocument()
    expect(screen.queryByText(/collecting its first inventory/)).toBeNull()
  })

  it("Overview: the same one line Settings shows for the stage, without an action", async () => {
    const listing = collected as unknown as Listing
    serveRoute({ ...listing.body, accounts: [withStage(automatic.checking(SINCE))] })
    await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: MEMBER })} />) })
    const line = await screen.findByTestId(`data-stage-line-${MEMBER}`)
    expect(line.textContent).toBe("Checking the data")
    expect(screen.queryByRole("button", { name: /Show data/ })).toBeNull()
  })

  it("Overview of a legacy account: says it was connected for collection only; the request stays in Settings", async () => {
    const listing = collected as unknown as Listing
    serveRoute({ ...listing.body, accounts: [withStage(legacy(SINCE))] })
    await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: MEMBER })} />) })
    expect((await screen.findByTestId(`data-stage-line-${MEMBER}`)).textContent).toBe(
      "This account was connected for collection only. Show its data?")
    expect(screen.queryByRole("button", { name: /Show data/ })).toBeNull()
    expect(screen.getByRole("link", { name: "Manage in Settings › Accounts" })).toHaveAttribute("href", "/settings/accounts")
  })
})
