/**
 * I3 (fix round r33; Alon 2026-10-06: "rows with service type, drill down ..., icons with the service type, colors"): the
 * inventory BY TYPE, the drill-down, and the wording of holds and refusals (QA-04, QA-13).
 *
 * Every answer is the REAL route's: AccountOnboarding's I2(d) captures (fixtures/account-inventory-captures, backend dd5d0d76)
 * -- real normalizers' facts, the real projector and P3a2 publisher (v3), the mounted route -- each naming the request it
 * answers, which these tests replay (the filter and the cursor sequence). The readiness holds are the backend's own, captured
 * by EXECUTING its provider (fixtures/account-inventory-types/hold-reasons.json). One case is explicitly MUTATED and named so:
 * an older backend's answer without the account-wide counts (no such backend is captured).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountInventoryView } from "@/components/accounts/account-inventory-view"
import holds from "@/__tests__/fixtures/account-inventory-types/hold-reasons.json"
import { formatUtcInstantExact } from "@/lib/account-admin"
import type { InventoryFetchResult, InventoryFetcher } from "@/lib/account-inventory"
import { detailLabel, formatDetail } from "@/lib/inventory-details"
import { heldCopy } from "@/lib/inventory-copy"
import { INVENTORY_CATEGORY_LABEL, inventoryTypeMeta, type InventoryCategory } from "@/lib/inventory-types"

interface Capture {
  _provenance: { request: { query: Record<string, string>; cursor?: { from: string } } }
  status: number
  body: Record<string, any>
}

function capture(name: string): Capture {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory-captures", `${name}.json`), "utf8"))
}

function answer(name: string, mutate?: (b: Record<string, any>) => void): InventoryFetchResult {
  const c = capture(name)
  const body = structuredClone(c.body)
  mutate?.(body)
  return { status: c.status, body }
}

const PAGE1 = capture("populated_page1").body
const ACCOUNT: string = PAGE1.account_id
const BY_TYPE: Record<string, number> = PAGE1.totals.by_type
const row = (name: string) => PAGE1.rows.find((r: any) => (r.name ?? r.native_id) === name)

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
    expect(screen.getAllByTestId("inventory-group")).toHaveLength(Object.keys(BY_TYPE).length)
    for (const [resourceType, count] of Object.entries(BY_TYPE)) {
      expect(within(group(resourceType)).getByTestId("inventory-group-count")).toHaveTextContent(String(count))
      // The tile is the type's icon and colors; beside its visible label it is hidden from assistive technology.
      const tile = within(group(resourceType)).getByTestId("inventory-type-tile")
      expect(tile).toHaveAttribute("data-resource-type", resourceType)
      expect(tile).toHaveAttribute("aria-hidden", "true")
      expect(within(group(resourceType)).getByRole("button")).toHaveTextContent(inventoryTypeMeta(resourceType).label)
    }
    expect(BY_TYPE["ec2:instance"]).toBe(2)                               // a type of many resources
    expect(screen.getByTestId("inventory-card-all")).toHaveTextContent(`All resources${PAGE1.totals.account_total}`)
    const sums = new Map<InventoryCategory, number>()
    for (const [resourceType, count] of Object.entries(BY_TYPE)) {
      const category = inventoryTypeMeta(resourceType).category
      sums.set(category, (sums.get(category) ?? 0) + count)
    }
    for (const [category, sum] of sums) {
      expect(screen.getByTestId(`inventory-card-${category}`)).toHaveTextContent(`${INVENTORY_CATEGORY_LABEL[category]}${sum}`)
    }
    expect(screen.getByTestId("inventory-regions")).toHaveTextContent("By Region: eu-west-1 20 · Global 5")
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

  it("an opened group reads exactly its own type by cursor, with the type's own columns, date and tags", async () => {
    const { calls, fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    fireEvent.click(within(group("ec2:instance")).getByRole("button", { expanded: false }))
    expect(capture("filtered_page1")._provenance.request.query.resource_type).toBe("ec2:instance")
    expect(calls[1].params).toEqual({ resourceType: "ec2:instance", cursor: null })
    await release(1, answer("filtered_page1"))
    // The instance's own state is a detail ("State"); the inventory record's is "Inventory status" -- never two "State"s.
    expect(screen.getAllByRole("columnheader").map((node) => node.textContent))
      .toEqual(["Name", "Instance type", "State", "Private IP", "Launched", "Region", "Inventory status", "Tags"])
    const first = capture("filtered_page1").body.rows[0]
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((node) => node.textContent)
    expect(cells).toEqual([
      first.name,
      formatDetail("instance_type", first.details.instance_type),
      formatDetail("instance_state", first.details.instance_state),
      formatDetail("private_ip", first.details.private_ip),
      formatUtcInstantExact(first.details.launch_time),
      first.region,
      first.state,
      String(Object.keys(first.tags).length),
    ])
    fireEvent.click(screen.getByRole("button", { name: "Load more (1 of 2)" }))
    expect(calls[2].params).toEqual({ resourceType: "ec2:instance", cursor: capture("filtered_page1").body.next_cursor })
    expect(capture("filtered_page2")._provenance.request.cursor?.from).toBe("filtered_page1")
    await release(2, answer("filtered_page2"))
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows).toHaveLength(BY_TYPE["ec2:instance"])
    expect(rows[1]).toHaveTextContent("50 (not shown)")                            // the tags_withheld instance
    fireEvent.click(within(group("ec2:instance")).getByRole("button", { expanded: true }))
    expect(screen.queryAllByRole("row")).toHaveLength(0)
  })

  it("the layout is offered only when the publication carries its counts, and is kept across accounts", async () => {
    const { fetchPage, release } = controllable()
    const { rerender } = view(fetchPage)
    // MUTATED (an older backend, not captured): no account-wide counts -> the one cursor-paged list, no layout choice.
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

describe("the list of every resource", () => {
  it("counts each row's tags: a number, 'None' when read and empty, '—' when the type's tags are not collected", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1"))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent)
    const tagsAt = headers.indexOf("Tags")
    expect(headers).toEqual(["Name", "Type", "Region", "Inventory status", "Tags", "Last verified"])
    const cell = (r: any) => {
      const tr = screen.getAllByRole("row").find((node) => within(node).queryByRole("button", { name: r.name ?? r.native_id })
        && within(node).queryByText(inventoryTypeMeta(r.resource_type).label))!
      return within(tr).getAllByRole("cell")[tagsAt].textContent
    }
    const namespace = PAGE1.rows.find((r: any) => r.resource_type === "k8s:namespace")
    expect(namespace.tags).toEqual({})
    expect(cell(namespace)).toBe("None")
    expect(cell(PAGE1.rows.find((r: any) => r.resource_type === "account:regions"))).toBe("—")
    const tagged = PAGE1.rows.find((r: any) => r.tags && Object.keys(r.tags).length > 0)
    expect(cell(tagged)).toBe(String(Object.keys(tagged.tags).length))
    expect(cell(PAGE1.rows.find((r: any) => r.tags_withheld))).toBe("50 (not shown)")
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

  it("says where the resource is, every detail exactly as collected with its label, its tags and its evidence", async () => {
    const instance = row("checkout-api-1")
    const drawer = await opened(instance.name)
    expect(drawer).toHaveTextContent(`Payments prod (${ACCOUNT})`)
    expect(document.activeElement).toBe(within(drawer).getByRole("button", { name: "Close" }))
    expect(drawer).toHaveTextContent(instance.arn)
    const details = within(drawer).getByTestId("inventory-details")
    for (const [attribute, value] of Object.entries(instance.details as Record<string, string | number | boolean>)) {
      expect(details).toHaveTextContent(`${detailLabel(attribute)}${formatDetail(attribute, value)}`)
    }
    expect(details).toHaveTextContent(`Launched${formatUtcInstantExact(instance.details.launch_time)}`)
    const tags = within(drawer).getByTestId("inventory-tags")
    for (const [key, value] of Object.entries(instance.tags as Record<string, string>)) expect(tags).toHaveTextContent(`${key}${value}`)
    expect(drawer).toHaveTextContent(formatUtcInstantExact(instance.observation.last_verified_at))
    expect(drawer).toHaveTextContent(instance.observation.configuration_hash)
    expect(screen.queryByTestId("inventory-internet-facing")).toBeNull()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByTestId("inventory-resource-drawer")).toBeNull()
  })

  it("calls a resource internet-facing only by the named fact, in the list and in the drill-down", async () => {
    const lb = row("my-lb")
    expect(lb.details.scheme).toBe("internet-facing")
    const drawer = await opened(lb.name)
    expect(within(drawer).getByTestId("inventory-internet-facing")).toHaveTextContent("Internet-facing: scheme = internet-facing")
    expect(drawer).toHaveTextContent("Tags are not collected for this resource type.")       // ELB DescribeTags is not called
  })

  it("says how many tags were withheld and why, never 'no tags'", async () => {
    const withheld = PAGE1.rows.find((r: any) => r.tags_withheld)
    expect(withheld.tags_withheld).toEqual({ reason: "TAGS_OVER_CAP", count: 50 })
    const drawer = await opened(withheld.name ?? withheld.native_id)
    expect(drawer).toHaveTextContent("50 tags, not shown (too large to show).")
    expect(drawer).not.toHaveTextContent("No tags.")
  })

  it("never says 'no tags' about a type whose tags are not collected", async () => {
    const regions = PAGE1.rows.find((r: any) => r.resource_type === "account:regions")
    expect("tags" in regions).toBe(false)
    const drawer = await opened(regions.name)
    expect(drawer).toHaveTextContent("Tags are not collected for this resource type.")
    expect(drawer).not.toHaveTextContent("No tags.")
    expect(drawer).toHaveTextContent("No details were collected for this resource.")
    expect(drawer).toHaveTextContent("Global (account-wide)")
  })
})

describe("holds and refusals in words (QA-13, QA-04)", () => {
  it("QA-13: the lifecycle hold the deployed readiness wiring answers reads as words, never as its code", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    const held = capture("held_lifecycle_not_active")
    expect(held.body.reason_code).toBe(holds.lifecycle_holds.BOOTSTRAPPING)        // the executed table agrees with the route
    await release(0, answer("held_lifecycle_not_active"))
    expect(screen.getByRole("status")).toHaveTextContent(heldCopy(held.body.reason_code))
    expect(screen.getByRole("status")).toHaveTextContent("Now: collecting its first inventory.")
    expect(screen.queryByText(/CONSUMER_NOT_READY/)).toBeNull()
  })

  it("QA-04: the scope refusal (a removed account) says it is outside this installation, not 'not authorized'", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("refused_scope_mismatch_403"))
    expect(screen.getByRole("status")).toHaveTextContent("This account is not in this installation's scope")
    expect(screen.queryByText(/not authorized/)).toBeNull()
  })
})
