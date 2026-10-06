/**
 * Phase 2 E2b: declaring from the account page's Inventory tab -- the REAL page (/accounts/{accountId}), the REAL inventory
 * view (Settings' I3) and the declaration picker, wired by components/system-boundary/declarable-account-inventory.tsx.
 *
 * Every response is a producer capture: the listing (fixtures/settings-c-producer), the inventory (fixtures/account-inventory)
 * and the authoring routes (fixtures/system-boundary). One exception is labelled, as in Settings' selection suite: the
 * inventory goldens hold no selectable row until AccountOnboarding's I2(d) capture, so page one's ec2:instance row is MUTATED
 * to the verdict the route stamps for a verified identity. The save itself runs on the real goldens in
 * system-boundary-declare-from-inventory.test.tsx; here, the wiring.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let search = new URLSearchParams("tab=inventory")
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
import AccountInventoryRoute from "@/app/accounts/[accountId]/inventory/page"
import measured from "@/__tests__/fixtures/settings-c-producer/27_k2_collected_measured.json"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fixture(directory: string, name: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", directory, `${name}.json`), "utf8"))
}

const PAGE1 = fixture("account-inventory", "populated_page1")
const ACCOUNT: string = PAGE1.body.account_id
const PICKABLE = PAGE1.body.rows.find((row: { resource_type: string }) => row.resource_type === "ec2:instance")

/** MUTATED until I2(d): page one's ec2:instance row with the route's verdict for a verified identity. */
function withSelectableRow() {
  const body = structuredClone(PAGE1.body)
  for (const row of body.rows) if (row.resource_type === "ec2:instance") row.eligibility = { selectable: true, reason: "SUPPORTED" }
  return body
}

let unexpected: string[] = []

function serve({ inventory, declarations }: { inventory: unknown; declarations: unknown | "network-error" }) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (url === "/api/proxy/admin/accounts?customer_id=acme") return json(measured.body)
    if (url.startsWith(`/api/proxy/accounts/${ACCOUNT}/inventory`)) return json(inventory)
    if (url.startsWith("/api/proxy/system-boundary/declarations/view")) {
      if (declarations === "network-error") throw new TypeError("network error")
      return json(declarations)
    }
    if (url.startsWith("/api/proxy/system-boundary/authoring-grants/self")) return json(fixture("system-boundary", "grant_self").body)
    unexpected.push(url)
    return json({ detail: `unexpected ${url}` }, 404)
  }))
}

async function openInventory() {
  await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId: ACCOUNT })} />) })
  await waitFor(() => expect(screen.getAllByTestId("inventory-group").length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole("button", { name: "List" }))
}

beforeEach(() => {
  search = new URLSearchParams("tab=inventory")
  unexpected = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  expect(unexpected).toEqual([])
})

describe("the account page's Inventory tab, with declaring", () => {
  it("hands the inventory the picker when saving is active: a box only where the route allows it, and the pick is counted", async () => {
    serve({ inventory: withSelectableRow(), declarations: fixture("system-boundary", "view_initial").body })
    await openInventory()
    await waitFor(() => expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots"))
    expect(screen.getAllByRole("checkbox")).toHaveLength(1)
    expect(screen.getAllByTestId("inventory-not-selectable")).toHaveLength(PAGE1.body.rows.length - 1)
    await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: `Pick ${PICKABLE.name} as a root` })) })
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("1 picked as roots")
    expect((screen.getByRole("checkbox", { name: `Pick ${PICKABLE.name} as a root` }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole("button", { name: "Declare a system" })).not.toBeDisabled()
  })

  it("is the browse-only inventory, unchanged, when the declarations cannot be read", async () => {
    serve({ inventory: withSelectableRow(), declarations: "network-error" })
    await openInventory()
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Root" })).toBeNull()
    expect(screen.queryByText(/not enabled on this installation/)).toBeNull()
  })

  it("the direct inventory route offers the same declaring", async () => {
    serve({ inventory: withSelectableRow(), declarations: fixture("system-boundary", "view_initial").body })
    await act(async () => { render(<AccountInventoryRoute params={Promise.resolve({ accountId: ACCOUNT })} />) })
    await waitFor(() => expect(screen.getAllByTestId("inventory-group").length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots"))
    expect(screen.getAllByRole("checkbox")).toHaveLength(1)
  })

  it("says declaring is not enabled when saving is not active, and offers no box (the view's phase explicitly MUTATED)", async () => {
    serve({ inventory: withSelectableRow(), declarations: { ...fixture("system-boundary", "view_initial").body, protocol_phase: "INITIALIZED" } })
    await openInventory()
    expect(await screen.findByText("Declaring systems from this inventory is not enabled on this installation yet.")).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
  })
})
