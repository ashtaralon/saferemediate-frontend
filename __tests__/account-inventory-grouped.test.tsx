/**
 * I3 (fix round r33; Alon 2026-10-06: "rows with service type, drill down ..., icons with the service type, colors"): the
 * inventory BY TYPE, the drill-down, and the wording of holds and refusals (QA-04, QA-13).
 *
 * Every envelope is a PRODUCER golden (fixtures/account-inventory, its _provenance: the served states at backend fa2edd53 --
 * row v3 and the account-wide counts). The readiness holds are the backend's own, captured by EXECUTING its provider
 * (fixtures/account-inventory-types/hold-reasons.json). Two cases are explicitly MUTATED and named so, until AccountOnboarding's
 * I2(d) captures land (a filtered page of one type; the scope refusal): each is a golden with the named fields changed to what
 * the route answers for it (api/account_inventory.py; estate_read._refuse_http).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountInventoryView } from "@/components/accounts/account-inventory-view"
import holds from "@/__tests__/fixtures/account-inventory-types/hold-reasons.json"
import { formatUtcInstantExact } from "@/lib/account-admin"
import type { InventoryFetchResult, InventoryFetcher } from "@/lib/account-inventory"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, type InventoryCategory } from "@/lib/inventory-types"

function golden(name: string): { status: number; body: Record<string, any> } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory", `${name}.json`), "utf8"))
}

function answer(name: string, mutate?: (b: Record<string, any>) => void): InventoryFetchResult {
  const g = golden(name)
  const body = structuredClone(g.body)
  mutate?.(body)
  return { status: g.status, body }
}

const PAGE1 = golden("populated_page1").body
const ACCOUNT: string = PAGE1.account_id
const BY_TYPE: Record<string, number> = PAGE1.totals.by_type

/** MUTATED until I2(d): the route's answer for ONE type, derived from the real page -- that type's rows, its count. */
function onlyType(resourceType: string) {
  return (b: Record<string, any>) => {
    b.rows = b.rows.filter((row: { resource_type: string }) => row.resource_type === resourceType)
    b.totals.filter_total = b.totals.by_type[resourceType]
    b.has_more = false
    b.next_cursor = null
  }
}

function controllable() {
  const calls: Array<{ params: { resourceType: string | null; cursor: string | null }; resolve: (r: InventoryFetchResult) => void }> = []
  const fetchPage: InventoryFetcher = vi.fn((_accountId, params) => new Promise<InventoryFetchResult>((resolve) => {
    calls.push({ params, resolve })
  }))
  const release = async (index: number, result: InventoryFetchResult) => {
    await act(async () => { calls[index].resolve(result) })
  }
  return { calls, fetchPage, release }
}

function view(fetchPage: InventoryFetcher) {
  return render(
    <AccountInventoryView accountId={ACCOUNT} customerId="acme" region="all" resourceType={null}
      roster={{ status: "ready", displayName: "Payments prod" }} onResourceTypeChange={vi.fn()} fetchPage={fetchPage} />,
  )
}

function group(resourceType: string): HTMLElement {
  const label = inventoryTypeMeta(resourceType).label
  return screen.getAllByTestId("inventory-group").find((node) => within(node).queryByText(resourceType) !== null
    && within(node).queryByText(label) !== null)!
}

describe("the inventory by type", () => {
  it("is the publication's own counts: cards per category, Regions, one group per counted type, no row table", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    expect(screen.queryAllByRole("row")).toHaveLength(0)
    const groups = screen.getAllByTestId("inventory-group")
    expect(groups).toHaveLength(Object.keys(BY_TYPE).length)
    for (const [resourceType, count] of Object.entries(BY_TYPE)) {
      expect(within(group(resourceType)).getByTestId("inventory-group-count")).toHaveTextContent(String(count))
      expect(within(group(resourceType)).getByTestId("inventory-type-tile")).toHaveAttribute("aria-label",
        inventoryTypeMeta(resourceType).label)
    }
    expect(screen.getByTestId("inventory-card-all")).toHaveTextContent(`All resources${PAGE1.totals.account_total}`)
    const sums = new Map<InventoryCategory, number>()
    for (const [resourceType, count] of Object.entries(BY_TYPE)) {
      const category = inventoryTypeMeta(resourceType).category
      sums.set(category, (sums.get(category) ?? 0) + count)
    }
    for (const [category, sum] of sums) {
      expect(screen.getByTestId(`inventory-card-${category}`)).toHaveTextContent(`${INVENTORY_CATEGORY_LABEL[category]}${sum}`)
    }
    expect(screen.getByTestId("inventory-regions")).toHaveTextContent("By Region: eu-west-1 24 · Global 6")
  })

  it("MUTATED until I2(d) brings a type of many resources: a card sums its types' counts, not how many types it has", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    // One publication of the same 30 resources, but with both EC2 instances' worth counted under ec2:instance.
    await release(0, answer("populated_page1", (b) => {
      b.totals.by_type["ec2:instance"] += b.totals.by_type["lambda:function"]
      delete b.totals.by_type["lambda:function"]
    }))
    const compute = Object.entries(BY_TYPE)
      .filter(([t]) => inventoryTypeMeta(t).category === "compute")
      .reduce((sum, [, n]) => sum + n, 0)
    expect(screen.getByTestId("inventory-card-compute")).toHaveTextContent(`${INVENTORY_CATEGORY_LABEL.compute}${compute}`)
    expect(within(group("ec2:instance")).getByTestId("inventory-group-count")).toHaveTextContent("2")
  })

  it("a category card narrows the list to its types, with no read", async () => {
    const { calls, fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    fireEvent.click(screen.getByTestId("inventory-card-network"))
    const network = Object.keys(BY_TYPE).filter((t) => inventoryTypeMeta(t).category === "network")
    expect(screen.getAllByTestId("inventory-group")).toHaveLength(network.length)
    fireEvent.click(screen.getByTestId("inventory-card-all"))
    expect(screen.getAllByTestId("inventory-group")).toHaveLength(Object.keys(BY_TYPE).length)
    expect(calls).toHaveLength(1)
  })

  it("an opened group reads exactly its own type by cursor and shows that type's own columns and date", async () => {
    const { calls, fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    fireEvent.click(within(group("ec2:instance")).getByRole("button", { expanded: false }))
    expect(calls[1].params).toEqual({ resourceType: "ec2:instance", cursor: null })
    await release(1, answer("populated_page1", onlyType("ec2:instance")))           // MUTATED until I2(d)
    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent)
    // The instance's own state is a detail ("State"); the inventory record's is "Inventory status" -- never two "State"s.
    expect(headers).toEqual(["Name", "Instance type", "State", "Private IP", "Launched", "Region", "Inventory status", "Tags"])
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows).toHaveLength(BY_TYPE["ec2:instance"])
    expect(rows[0]).toHaveTextContent("i-1")
    expect(rows[0]).toHaveTextContent("None")                                       // tags read, none
    fireEvent.click(within(group("ec2:instance")).getByRole("button", { expanded: true }))
    expect(screen.queryAllByRole("row")).toHaveLength(0)
  })

  it("the layout is offered only when the publication carries its counts, and is kept across accounts", async () => {
    const { fetchPage, release } = controllable()
    const { rerender } = view(fetchPage)
    // MUTATED (an older backend): no account-wide counts -> the one cursor-paged list, no layout choice.
    await release(0, answer("populated_page1", (b) => {
      delete b.totals.by_type
      delete b.totals.by_region
      delete b.publication.row_contract
    }))
    expect(screen.queryByRole("button", { name: "List" })).toBeNull()
    expect(screen.getAllByRole("row").length - 1).toBe(PAGE1.rows.length)
    rerender(
      <AccountInventoryView accountId="444455556666" customerId="acme" region="all" resourceType={null}
        roster={{ status: "ready", displayName: null }} onResourceTypeChange={vi.fn()} fetchPage={fetchPage} />,
    )
    expect(screen.queryAllByTestId("inventory-group")).toHaveLength(0)
  })
})

describe("the drill-down", () => {
  async function opened(name: string) {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    fireEvent.click(screen.getByRole("button", { name }))
    return screen.getByTestId("inventory-resource-drawer")
  }

  it("says where the resource is, its details exactly as collected, its tags and when it was verified", async () => {
    const row = PAGE1.rows.find((r: any) => r.resource_type === "ec2:instance")
    const drawer = await opened(row.name)
    expect(drawer).toHaveTextContent(`Payments prod (${ACCOUNT})`)
    expect(drawer).toHaveTextContent(row.arn)
    expect(within(drawer).getByTestId("inventory-details")).toHaveTextContent(
      `Instance profile${row.details.iam_instance_profile}`)
    expect(drawer).toHaveTextContent("No tags.")
    expect(drawer).toHaveTextContent(formatUtcInstantExact(row.observation.last_verified_at))
    expect(drawer).toHaveTextContent(row.observation.configuration_hash)
    expect(screen.queryByTestId("inventory-internet-facing")).toBeNull()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByTestId("inventory-resource-drawer")).toBeNull()
  })

  it("never says 'no tags' about a type whose tags are not collected", async () => {
    const row = PAGE1.rows.find((r: any) => r.resource_type === "account:regions")
    expect("tags" in row).toBe(false)
    const drawer = await opened(row.name)
    expect(drawer).toHaveTextContent("Tags are not collected for this resource type.")
    expect(drawer).not.toHaveTextContent("No tags.")
    expect(drawer).toHaveTextContent("No details were collected for this resource.")
    expect(drawer).toHaveTextContent("Global (account-wide)")
  })
})

describe("holds and refusals in words (QA-13, QA-04)", () => {
  it("QA-13: a lifecycle hold the backend's own provider produced reads as words, never as its code", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    const code = holds.lifecycle_holds.BOOTSTRAPPING
    await release(0, answer("held_consumer_not_recorded", (b) => { b.reason_code = code }))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Inventory appears once this account's data is active. Now: collecting its first inventory.")
    expect(screen.queryByText(/CONSUMER_NOT_READY/)).toBeNull()
  })

  it("QA-04 (MUTATED until I2(d)): the scope refusal says the account is outside this installation, not 'not authorized'", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("refused_not_authorized_403", (b) => { b.reason_code = "INVENTORY_SCOPE_MISMATCH" }))
    expect(screen.getByRole("status")).toHaveTextContent("This account is not in this installation's scope")
    expect(screen.queryByText(/not authorized/)).toBeNull()
  })
})
