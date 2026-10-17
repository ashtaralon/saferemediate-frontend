/**
 * I3: the inventory view's selection hook (lib/account-inventory.ts InventorySelection), the interface AccountOnboardingPhase2's
 * declare-from-inventory flow hands it. The view offers a box only where the ROUTE marked a row selectable, says why any other
 * row is not, names the publication each pick is made under, and holds no picks of its own.
 *
 * Every answer is the REAL route's (AccountOnboarding's I2(d) captures, re-captured at backend 8b492146, A7 P2-ID (a)-1): its
 * selectable rows are the ones the route judged SUPPORTED -- the IAM roles and policy, the Kubernetes deployment, and since
 * P2-ID (a)-1 every EC2 resource (its AWS-generated id) and load balancer / target group (its ARN), whose immutable identity
 * is verified -- and every other row (the account's Regions, the EKS cluster, the Kubernetes namespace) carries the route's
 * own reason. Three cases are explicitly MUTATED and named so, because no capture holds them: a republished inventory
 * (another publication attempt), an opened group served from another publication, and an opened group whose rows are not
 * selectable (the filtered capture is of ec2:instance, which is selectable since P2-ID).
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
import { inventoryTypeMeta } from "@/lib/inventory-types"

function capture(name: string): { status: number; body: Record<string, any> } {
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
const SHOWN: PublicationIdentity = {
  attempt: PAGE1.publication.attempt, generation: PAGE1.publication.generation,
  source_identity: PAGE1.publication.source_identity, authority_digest: PAGE1.publication.authority_digest,
  registration_id: PAGE1.account_authority.registration_id,
}
const SELECTABLE = PAGE1.rows.filter((r: any) => r.eligibility.selectable === true)
const ROLE = PAGE1.rows.find((r: any) => r.resource_type === "iam:role")

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

/** The list row of one capture row: two resources may share a name (the IAM role and the deployment "checkout-api"). */
function rowOf(r: any): HTMLElement {
  const name = r.name ?? r.native_id
  const label = inventoryTypeMeta(r.resource_type).label
  const rows = screen.getAllByRole("row").filter((tr) => within(tr).queryByRole("button", { name }) !== null
    && within(tr).queryByText(label) !== null)
  expect(rows).toHaveLength(1)
  return rows[0]
}

async function listed(selection?: InventorySelection) {
  const { fetchPage, release, calls } = controllable()
  view(fetchPage, selection)
  await release(0, answer("populated_page1"))
  fireEvent.click(screen.getByRole("button", { name: "List" }))
  return { release, calls }
}

describe("the route's own verdicts in the capture", () => {
  it("are SUPPORTED exactly for the types with a verified identity, and a reason for every other row", () => {
    expect(SELECTABLE.map((r: any) => r.resource_type).sort()).toEqual([
      "ec2:instance", "ec2:instance", "ec2:internet-gateway", "ec2:nat-gateway", "ec2:network-acl", "ec2:network-interface",
      "ec2:route-table", "ec2:security-group", "ec2:subnet", "ec2:vpc", "ec2:vpc-endpoint",
      "elasticloadbalancing:load-balancer", "elasticloadbalancing:target-group",
      "iam:policy", "iam:role", "iam:role", "k8s:deployment",
    ])
    expect(SELECTABLE.every((r: any) => r.eligibility.reason === "SUPPORTED")).toBe(true)
    const held = PAGE1.rows.filter((r: any) => r.eligibility.selectable !== true)
    expect(held.map((r: any) => r.resource_type).sort()).toEqual(["account:regions", "eks:cluster", "k8s:namespace"])
    expect(held.every((r: any) => r.eligibility.reason === "INCARNATION_NOT_PROVIDED")).toBe(true)
  })
})

describe("without a selection hook", () => {
  it("is browse only: no box, no Root column, no eligibility words", async () => {
    await listed()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("columnheader", { name: "Root" })).toBeNull()
    expect(screen.queryAllByTestId("inventory-not-selectable")).toHaveLength(0)
  })
})

describe("with a selection hook", () => {
  it("offers a box exactly where the route allows one, and says why in words everywhere else", async () => {
    await listed(hook())
    expect(screen.getAllByRole("checkbox")).toHaveLength(SELECTABLE.length)
    for (const r of SELECTABLE) expect(within(rowOf(r)).getByRole("checkbox")).toBeInTheDocument()
    const reasons = screen.getAllByTestId("inventory-not-selectable").map((node) => node.textContent)
    expect(reasons).toEqual(PAGE1.rows.filter((r: any) => r.eligibility.selectable !== true)
      .map((r: any) => ELIGIBILITY_COPY[r.eligibility.reason]))
    expect(screen.queryByText(/INCARNATION_NOT_PROVIDED/)).toBeNull()
  })

  it("a box hands its owner the row and the publication it was served from, and holds no pick itself", async () => {
    const selection = hook()
    await listed(selection)
    const box = within(rowOf(ROLE)).getByRole("checkbox") as HTMLInputElement
    fireEvent.click(box)
    expect(selection.onToggle).toHaveBeenCalledTimes(1)
    const [picked, publication] = selection.onToggle.mock.calls[0]
    expect(rowKey(picked)).toBe(rowKey(ROLE))
    expect(picked.observed_incarnation).toEqual(ROLE.observed_incarnation)
    expect(publication).toEqual(SHOWN)
    expect(box.checked).toBe(false)
  })

  it("shows the owner's picks, and marks one the owner made under another publication", async () => {
    const other = { ...SHOWN, attempt: "e".repeat(32) }               // the owner's own record of an earlier pick
    await listed(hook(new Map([[rowKey(ROLE), other], [rowKey(SELECTABLE[0]), SHOWN]])))
    expect((within(rowOf(ROLE)).getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByTestId("inventory-pick-other-publication")).toHaveLength(1)
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
    // MUTATED: a republished inventory (another publication attempt; no capture holds two publications).
    await release(2, answer("populated_page1", (b) => { b.publication.attempt = "f".repeat(32) }))
    expect(selection.onPublication).toHaveBeenCalledTimes(2)
    expect(selection.onPublication).toHaveBeenLastCalledWith({ ...SHOWN, attempt: "f".repeat(32) })
  })

  it("an opened group offers a box where the route allows one, and its read is never the shown publication", async () => {
    const { calls, fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1"))
    const group = screen.getAllByTestId("inventory-group").find((node) => within(node).queryByText("ec2:instance") !== null)!
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    expect(calls[1].params).toEqual({ resourceType: "ec2:instance", cursor: null })
    await release(1, answer("filtered_page1"))
    const [instance] = capture("filtered_page1").body.rows
    expect(instance.eligibility).toEqual({ selectable: true, reason: "SUPPORTED" })
    fireEvent.click(within(group).getByRole("checkbox"))
    const [picked, publication] = selection.onToggle.mock.calls[0]
    expect(rowKey(picked)).toBe(rowKey(instance))
    expect(publication).toEqual(SHOWN)                                   // the capture's group read is the shown publication
    expect(within(group).queryByTestId("inventory-not-selectable")).toBeNull()
    expect(selection.onPublication).toHaveBeenCalledTimes(1)
  })

  it("MUTATED (no capture holds a not-selectable group): an opened group's rows say why they are not selectable", async () => {
    const { calls, fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1"))
    const group = screen.getAllByTestId("inventory-group").find((node) => within(node).queryByText("ec2:instance") !== null)!
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    await release(1, answer("filtered_page1", (b) => {
      b.rows[0].eligibility = { selectable: false, reason: "INCARNATION_NOT_PROVIDED" }
    }))
    expect(within(group).queryByRole("checkbox")).toBeNull()
    expect(within(group).getByTestId("inventory-not-selectable")).toHaveTextContent(ELIGIBILITY_COPY.INCARNATION_NOT_PROVIDED)
    expect(selection.onPublication).toHaveBeenCalledTimes(1)
  })

  it("MUTATED (no capture holds two publications): a pick in an opened group names that group's own read", async () => {
    const { calls, fetchPage, release } = controllable()
    const selection = hook()
    view(fetchPage, selection)
    await release(0, answer("populated_page1"))
    const group = screen.getAllByTestId("inventory-group").find((node) => within(node).queryByText("ec2:instance") !== null)!
    fireEvent.click(within(group).getByRole("button", { expanded: false }))
    expect(calls[1].params).toEqual({ resourceType: "ec2:instance", cursor: null })
    await release(1, answer("filtered_page1", (b) => { b.publication.attempt = "d".repeat(32) }))
    fireEvent.click(within(group).getByRole("checkbox"))
    expect(selection.onToggle.mock.calls[0][1]).toEqual({ ...SHOWN, attempt: "d".repeat(32) })
    expect(selection.onPublication).toHaveBeenCalledTimes(1)
  })
})
