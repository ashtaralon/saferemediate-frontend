/**
 * I3: the inventory view's selection hook (lib/account-inventory.ts InventorySelection), the interface AccountOnboardingPhase2's
 * declare-from-inventory flow hands it. The view offers a box only where the ROUTE marked a row selectable, says why any other
 * row is not, names the publication each pick is made under, and holds no picks of its own.
 *
 * Envelopes are the PRODUCER goldens (fixtures/account-inventory, served states at backend fa2edd53). Their rows are all
 * INCARNATION_NOT_PROVIDED (the harness's facts carry no role_id), and the captured pages hold no iam:role row at all. So a
 * SELECTABLE row is explicitly MUTATED until AccountOnboarding's I2(d) capture of "the selectable iam:role row Phase 2
 * needs": page one's ec2:instance row given the verdict the route stamps for a verified identity
 * (account_inventory_collection.judge_row: SELECTABLE / SUPPORTED). The view reads only that verdict, never the type.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountInventoryView } from "@/components/accounts/account-inventory-view"
import {
  ELIGIBILITY_COPY,
  rowKey,
  type InventoryFetchResult,
  type InventoryFetcher,
  type InventorySelection,
  type PublicationIdentity,
} from "@/lib/account-inventory"

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
const SHOWN: PublicationIdentity = {
  attempt: PAGE1.publication.attempt, generation: PAGE1.publication.generation,
  source_identity: PAGE1.publication.source_identity, authority_digest: PAGE1.publication.authority_digest,
  registration_id: PAGE1.account_authority.registration_id,
}

const PICKABLE_TYPE = "ec2:instance"

/** MUTATED until I2(d): page one's ec2:instance row with the route's verdict for a verified identity. */
function markSelectable(b: Record<string, any>) {
  for (const row of b.rows) {
    if (row.resource_type === PICKABLE_TYPE) row.eligibility = { selectable: true, reason: "SUPPORTED" }
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

function view(fetchPage: InventoryFetcher, selection?: InventorySelection) {
  return render(
    <AccountInventoryView accountId={ACCOUNT} customerId="acme" region="all" resourceType={null}
      roster={{ status: "ready", displayName: null }} onResourceTypeChange={vi.fn()} fetchPage={fetchPage}
      selection={selection} />,
  )
}

function hook(selected: ReadonlyMap<string, PublicationIdentity> = new Map()) {
  return { selected, onToggle: vi.fn(), onPublication: vi.fn() }
}

describe("without a selection hook", () => {
  it("is browse only: no box, no Root column, no eligibility words", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage)
    await release(0, answer("populated_page1", markSelectable))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Root" })).toBeNull()
    expect(screen.queryAllByTestId("inventory-not-selectable")).toHaveLength(0)
  })
})

describe("with a selection hook", () => {
  it("offers no box where the route marked no row selectable, and says why in words", async () => {
    const { fetchPage, release } = controllable()
    view(fetchPage, hook())
    await release(0, answer("populated_page1"))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(screen.queryByRole("checkbox")).toBeNull()
    const reasons = screen.getAllByTestId("inventory-not-selectable").map((node) => node.textContent)
    expect(reasons).toEqual(PAGE1.rows.map(() => ELIGIBILITY_COPY.INCARNATION_NOT_PROVIDED))
    expect(screen.queryByText(/INCARNATION_NOT_PROVIDED/)).toBeNull()
  })

  it("tells its owner the shown publication once, and again only when it changes", async () => {
    const { fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1"))
    expect(selection.onPublication).toHaveBeenCalledTimes(1)
    expect(selection.onPublication).toHaveBeenCalledWith(SHOWN)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    await release(1, answer("populated_page1"))
    expect(selection.onPublication).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    // MUTATED: a republished inventory (another publication attempt).
    await release(2, answer("populated_page1", (b) => { b.publication.attempt = "f".repeat(32) }))
    expect(selection.onPublication).toHaveBeenCalledTimes(2)
    expect(selection.onPublication).toHaveBeenLastCalledWith({ ...SHOWN, attempt: "f".repeat(32) })
  })

  it("MUTATED until I2(d): a selectable row's box hands its owner the row and the publication it was served from", async () => {
    const { fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1", markSelectable))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    const pickable = PAGE1.rows.find((r: any) => r.resource_type === PICKABLE_TYPE)
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes).toHaveLength(1)
    fireEvent.click(screen.getByRole("checkbox", { name: `Pick ${pickable.name} as a root` }))
    expect(selection.onToggle).toHaveBeenCalledTimes(1)
    const [row, publication] = selection.onToggle.mock.calls[0]
    expect(rowKey(row)).toBe(rowKey(pickable))
    expect(publication).toEqual(SHOWN)
    expect((boxes[0] as HTMLInputElement).checked).toBe(false)          // the view holds no pick of its own
  })

  it("MUTATED until I2(d): shows the owner's picks, and marks one made under another publication", async () => {
    const pickable = PAGE1.rows.find((r: any) => r.resource_type === PICKABLE_TYPE)
    const { fetchPage, release } = controllable()
    view(fetchPage, hook(new Map([[rowKey(pickable), { ...SHOWN, attempt: "e".repeat(32) }]])))
    await release(0, answer("populated_page1", markSelectable))
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId("inventory-pick-other-publication")).toHaveTextContent("picked in another publication")
  })

  it("MUTATED until I2(d): a pick in an opened type group names that group's own publication", async () => {
    const { calls, fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1"))
    const group = screen.getAllByTestId("inventory-group").find((node) => within(node).queryByText(PICKABLE_TYPE) !== null)!
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    expect(calls[1].params).toEqual({ resourceType: PICKABLE_TYPE, cursor: null })
    // The group's own read, of a republished inventory: that type only, selectable, under another attempt.
    await release(1, answer("populated_page1", (b) => {
      markSelectable(b)
      b.rows = b.rows.filter((r: any) => r.resource_type === PICKABLE_TYPE)
      b.totals.filter_total = b.totals.by_type[PICKABLE_TYPE]
      b.has_more = false
      b.next_cursor = null
      b.publication.attempt = "d".repeat(32)
    }))
    fireEvent.click(screen.getByRole("checkbox"))
    expect(selection.onToggle.mock.calls[0][1]).toEqual({ ...SHOWN, attempt: "d".repeat(32) })
    expect(selection.onPublication).toHaveBeenCalledTimes(1)                // a group's read is not the shown publication
  })
})
