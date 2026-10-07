/**
 * Phase 2 E2b: declaring from the account page's Inventory tab -- the REAL page (/accounts/{accountId}), the REAL inventory
 * view (Settings' I3) and the declaration picker, wired by components/system-boundary/declarable-account-inventory.tsx.
 *
 * Every response is a producer capture, unmutated: the listing (fixtures/settings-c-producer), the inventory -- the REAL
 * account-inventory route's answer with its own SUPPORTED rows (fixtures/account-inventory-captures, AccountOnboarding's
 * I2(d), backend dd5d0d76, page 1 re-captured at 8b492146) -- and the authoring routes (fixtures/system-boundary). Two of those rows share the name
 * "checkout-api" (an IAM role and a k8s deployment): each box is named with its type. The save itself runs on the real
 * goldens in system-boundary-declare-from-inventory.test.tsx; here, the wiring up to the reviewed declaration.
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

type Row = { resource_type: string; name?: string | null; native_id: string; eligibility: { selectable: boolean } }
const PAGE1 = fixture("account-inventory-captures", "populated_page1")
const ACCOUNT: string = PAGE1.body.account_id
const ROWS: Row[] = PAGE1.body.rows
const SELECTABLE = ROWS.filter((row) => row.eligibility.selectable === true)
const ROLE = ROWS.find((row) => row.resource_type === "iam:role" && row.name === "checkout-api")!
const NAMESAKE = ROWS.find((row) => row.resource_type === "k8s:deployment" && row.name === "checkout-api")!
const box = (row: Row) => `Pick ${row.name ?? row.native_id} (${row.resource_type}) as a root`

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
  it("hands the inventory the picker when saving is active: a box exactly where the route allows it, each named with its type", async () => {
    serve({ inventory: PAGE1.body, declarations: fixture("system-boundary", "view_initial").body })
    await openInventory()
    await waitFor(() => expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots"))
    // A7 P2-ID (a)-1 (backend 8b492146): EC2 resources and load balancers / target groups carry their AWS-generated identity.
    expect(SELECTABLE.map((row) => row.resource_type).sort()).toEqual([
      "ec2:instance", "ec2:instance", "ec2:internet-gateway", "ec2:nat-gateway", "ec2:network-acl", "ec2:network-interface",
      "ec2:route-table", "ec2:security-group", "ec2:subnet", "ec2:vpc", "ec2:vpc-endpoint",
      "elasticloadbalancing:load-balancer", "elasticloadbalancing:target-group",
      "iam:policy", "iam:role", "iam:role", "k8s:deployment",
    ])
    expect(screen.getAllByRole("checkbox")).toHaveLength(SELECTABLE.length)
    expect(screen.getAllByTestId("inventory-not-selectable")).toHaveLength(ROWS.length - SELECTABLE.length)
    await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: box(ROLE) })) })
    expect(screen.getByTestId("declare-toolbar").textContent).toContain("1 picked as roots")
    expect((screen.getByRole("checkbox", { name: box(ROLE) }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole("checkbox", { name: box(NAMESAKE) }) as HTMLInputElement).checked).toBe(false)
  })

  it("a picked REAL role reaches the reviewed declaration as that role, verified", async () => {
    serve({ inventory: PAGE1.body, declarations: fixture("system-boundary", "view_initial").body })
    await openInventory()
    await act(async () => { fireEvent.click(await screen.findByRole("checkbox", { name: box(ROLE) })) })
    fireEvent.click(screen.getByRole("button", { name: "Declare a system" }))
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Checkout" } })
    fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: "LOW" } })
    fireEvent.change(screen.getByLabelText("Deployment key"), { target: { value: "prod" } })
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "PRODUCTION" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review" })))
    const review = screen.getByTestId("declaration-review")
    const cells = [...review.querySelectorAll("tbody td")].map((cell) => cell.textContent)
    expect(cells).toEqual(["checkout-api", "iam:role", `${ACCOUNT} / global`, "verified"])
  })

  it("is the browse-only inventory, unchanged, when the declarations cannot be read", async () => {
    serve({ inventory: PAGE1.body, declarations: "network-error" })
    await openInventory()
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Root" })).toBeNull()
    expect(screen.queryByText(/not enabled on this installation/)).toBeNull()
  })

  it("the direct inventory route offers the same declaring", async () => {
    serve({ inventory: PAGE1.body, declarations: fixture("system-boundary", "view_initial").body })
    await act(async () => { render(<AccountInventoryRoute params={Promise.resolve({ accountId: ACCOUNT })} />) })
    await waitFor(() => expect(screen.getAllByTestId("inventory-group").length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    await waitFor(() => expect(screen.getByTestId("declare-toolbar").textContent).toContain("0 picked as roots"))
    expect(screen.getAllByRole("checkbox")).toHaveLength(SELECTABLE.length)
  })

  it("says declaring is not enabled when saving is not active, and offers no box (the view's phase explicitly MUTATED)", async () => {
    serve({ inventory: PAGE1.body, declarations: { ...fixture("system-boundary", "view_initial").body, protocol_phase: "INITIALIZED" } })
    await openInventory()
    expect(await screen.findByText("Declaring systems from this inventory is not enabled on this installation yet.")).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByTestId("declare-toolbar")).toBeNull()
  })
})
