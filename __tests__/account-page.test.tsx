/**
 * The account page (/accounts/{accountId}, Alon 2026-10-05): opened from Settings > Accounts, an Overview of what the account
 * registry knows and an Inventory tab hosting the published account inventory (T11b). Every input is a real producer capture:
 * the listing from saferemediate-backend's own route (fixtures/settings-c-producer, README), the inventory from the real
 * account-inventory route's goldens (fixtures/account-inventory, their _provenance).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let search = new URLSearchParams()
const replace = vi.fn((url: string) => { search = new URLSearchParams(url.split("?")[1] ?? "") })
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => "/accounts/x",
  useSearchParams: () => search,
}))
vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", region: "all", loading: false, options: { accounts: [] }, refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountRoute from "@/app/accounts/[accountId]/page"
import { formatUtcInstantExact } from "@/lib/account-admin"
import measured from "@/__tests__/fixtures/settings-c-producer/27_k2_collected_measured.json"
import withdrawn from "@/__tests__/fixtures/settings-c-producer/25_withdrawn.json"
import offboarded from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"
import reAdded from "@/__tests__/fixtures/settings-c-producer/45_re_added_listing.json"
import pending from "@/__tests__/fixtures/settings-c-producer/01_pending_unverified.json"
import k8sHeld from "@/__tests__/fixtures/settings-c-producer/49_k2_k8s_source_held.json"

const MEMBER = "222222222222"
const inventory = (name: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory", `${name}.json`), "utf8"))

function serve(listing: { body: unknown }, inventoryGolden?: { status: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === "/api/proxy/admin/accounts?customer_id=acme") return new Response(JSON.stringify(listing.body), { status: 200 })
    if (url.startsWith("/api/proxy/accounts/") && inventoryGolden) {
      return new Response(JSON.stringify(inventoryGolden.body), { status: inventoryGolden.status, headers: { "cache-control": "no-store" } })
    }
    return new Response(JSON.stringify({ detail: `unexpected ${url}` }), { status: 404 })
  }))
}

async function open(accountId: string) {
  await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId })} />) })
}

beforeEach(() => { search = new URLSearchParams(); replace.mockClear() })
afterEach(() => { vi.unstubAllGlobals() })

describe("the account page's Overview", () => {
  it("names the account as AWS does and lists its first inventory by resource type, a count only where its run measured it", async () => {
    serve(measured as never)
    await open(MEMBER)
    const row = (measured as any).body.accounts.find((a: any) => a.account_id === MEMBER)
    expect(await screen.findByTestId("account-page-title")).toHaveTextContent(row.aws_account_name)
    const table = await screen.findByTestId("first-inventory-by-type")
    const outcome = row.registration.first_inventory
    expect(within(table).getAllByRole("row")).toHaveLength(outcome.items.length + 1)
    expect(screen.getByText(new RegExp(`${outcome.facts_emitted_total} resource records in all`))).toBeInTheDocument()
    // Largest measured first: the producer's own top item.
    const top = [...outcome.items].sort((a: any, b: any) => b.facts_emitted - a.facts_emitted)[0]
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(String(top.facts_emitted))
  })

  it("M1: a held source is listed as held with no count, and the inventory is said incomplete, never all committed", async () => {
    serve(k8sHeld as never)
    await open(MEMBER)
    const table = await screen.findByTestId("first-inventory-by-type")
    const k8s = within(table).getAllByRole("row").find((r) => r.textContent?.startsWith("Kubernetes objects"))!
    expect(k8s).toHaveTextContent("source held")
    expect(k8s).toHaveTextContent("—")
    expect(screen.getByText(/^First inventory incomplete: 30 of 31 work items collected; 1 work item could not read its source/))
      .toBeInTheDocument()
    expect(screen.queryByText(/evidence of all|resource records in all/)).toBeNull()
  })

  it("a registration that was never activated has no first inventory to list", async () => {
    serve(pending as never)
    await open(MEMBER)
    expect(await screen.findByTestId("first-inventory-by-type-empty")).toHaveTextContent("No first inventory yet")
  })

  it("an account no longer listed is said so, not shown as empty (a backend before level 5 sends no removed audit)", async () => {
    serve(withdrawn as never)
    await open(MEMBER)
    expect(await screen.findByTestId("account-not-listed")).toHaveTextContent(`Account ${MEMBER} is not in this installation's account list`)
    expect(screen.queryByTestId("account-removed")).toBeNull()
  })

  it("a removed account says who removed it, when, and what removing kept, from the listing's removed audit", async () => {
    serve(offboarded as never)
    await open(MEMBER)
    const removed = (offboarded as any).body.removed[0]
    const panel = await screen.findByTestId("account-removed")
    expect(panel).toHaveTextContent("This account was removed from Cyntro.")
    expect(panel).toHaveTextContent(
      `Removed after it was connected by Alice Operator · ${formatUtcInstantExact(removed.at)}. ` +
        "Its collected evidence is kept; its connection stack may still be in the account.",
    )
    expect(panel).toHaveTextContent("Adding it again in Settings › Accounts starts a new registration that collects afresh.")
    // QA-01: the remover is named as their verified token named them; the raw actor id is the record, not the label.
    expect(removed.by_display).toBe("Alice Operator")
    expect(panel).not.toHaveTextContent(removed.by)
    expect(screen.getByTestId("account-page-title")).toHaveTextContent(removed.display_name)
    expect(screen.getByText(MEMBER)).toBeInTheDocument()
    expect(screen.queryByTestId("account-not-listed")).toBeNull()
  })

  it("an account added again is its live registration, not its earlier removal", async () => {
    serve(reAdded as never)
    await open(MEMBER)
    expect((reAdded as any).body.removed.map((r: any) => r.account_id)).toContain(MEMBER)
    expect(await screen.findByText("Connection")).toBeInTheDocument()
    expect(screen.queryByTestId("account-removed")).toBeNull()
    expect(screen.queryByTestId("account-not-listed")).toBeNull()
  })

  it("another account's removal is not this account's", async () => {
    serve(offboarded as never)
    await open("444444444444")
    expect(await screen.findByTestId("account-not-listed")).toBeInTheDocument()
    expect(screen.queryByTestId("account-removed")).toBeNull()
  })
})

describe("the account page's Inventory tab", () => {
  it("is chosen in the URL and hosts the published inventory of exactly the path account", async () => {
    const golden = inventory("populated_page1")
    const account = golden.body.account_id
    serve(measured as never, golden)
    await open(account)
    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }))
    expect(replace).toHaveBeenCalledWith("/accounts/x?tab=inventory")
    search = new URLSearchParams("tab=inventory")
    await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: account })} />) })
    // By type (the publication carries its counts): one group per type the publication counts.
    await waitFor(() => expect(screen.getAllByTestId("inventory-group")).toHaveLength(Object.keys(golden.body.totals.by_type).length))
    const calls = (fetch as any).mock.calls.map((call: any[]) => String(call[0]))
    expect(calls.some((url: string) => url.startsWith(`/api/proxy/accounts/${account}/inventory`))).toBe(true)
  })

  it("QA-04: a removed account's Inventory tab says it was removed, and reads no inventory", async () => {
    search = new URLSearchParams("tab=inventory")
    serve(offboarded as never, inventory("refused_not_authorized_403"))
    await open(MEMBER)
    expect(await screen.findByTestId("account-removed")).toHaveTextContent("This account was removed from Cyntro.")
    const calls = (fetch as any).mock.calls.map((call: any[]) => String(call[0]))
    expect(calls.some((url: string) => url.startsWith("/api/proxy/accounts/"))).toBe(false)
    expect(screen.queryByText(/not authorized/)).toBeNull()
  })

  it("leaving the Inventory tab drops its filter from the URL", async () => {
    search = new URLSearchParams("tab=inventory&resource_type=ec2:instance")
    serve(measured as never, inventory("populated_page1"))
    await open(MEMBER)
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }))
    expect(replace).toHaveBeenLastCalledWith("/accounts/x")
  })
})
