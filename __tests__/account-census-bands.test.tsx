/**
 * A7 S1c: the census bands around the account's inventory, on the REAL route's answers (backend
 * tests/cyntro_data/test_account_census_captures.py at f329ca131f1602847ece7b6d2ef2ea56b0b6c315; each capture's _provenance), delivered by a fetcher keyed on what
 * the page asks: one depth, one cursor. The page's three bands (agent-coordinator/claude-a7-s1c-page-semantics-2026-10-06.txt):
 * coverage first, the inventory itself second (the children), what only the census names last.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccountCensusBands } from "@/components/accounts/account-census-bands"
import { MAX_RESTARTS } from "@/components/accounts/use-census-read"
import type { CensusFetcher, CensusFetchResult } from "@/lib/account-census"

function capture(name: string): CensusFetchResult {
  const c = JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-census-captures", `${name}.json`), "utf8"))
  return { status: c.status, body: c.body }
}

const ACCOUNT: string = (capture("populated_page1").body as { account_id: string }).account_id

/** Answers keyed by "<depth>|<cursor or first>"; an unexpected request fails the test by name. */
function served(answers: Record<string, string | (() => string)>) {
  const asked: string[] = []
  const fetchPage: CensusFetcher = vi.fn(async (accountId, { depth, cursor }) => {
    expect(accountId).toBe(ACCOUNT)
    const key = `${depth}|${cursor === null ? "first" : cursor}`
    asked.push(key)
    const answer = answers[key]
    if (answer === undefined) throw new Error(`unexpected census request ${key}`)
    return capture(typeof answer === "function" ? answer() : answer)
  })
  return { fetchPage, asked }
}

function cursorOf(name: string): string {
  return (capture(name).body as { next_cursor: string }).next_cursor
}

async function mount(fetchPage: CensusFetcher) {
  await act(async () => {
    render(
      <AccountCensusBands accountId={ACCOUNT} fetchPage={fetchPage}>
        <div data-testid="inventory-band">the account inventory</div>
      </AccountCensusBands>,
    )
  })
}

beforeEach(() => {
  // Nothing in these tests may reach the network: the page's default fetcher would call the proxy.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unstubbed fetch") }))
})
afterEach(() => vi.unstubAllGlobals())

describe("the census bands on a served census", () => {
  const answers = {
    "listed_only|first": "depth_listed_only_page1",
    [`listed_only|${cursorOf("depth_listed_only_page1")}`]: "depth_listed_only_page2",
    [`listed_only|${cursorOf("depth_listed_only_page2")}`]: "depth_listed_only_page3",
    "inventory_pending|first": "depth_inventory_pending_served",
  }

  it("shows coverage first, the inventory second, and what only the census names last", async () => {
    const { fetchPage } = served(answers)
    await mount(fetchPage)
    const coverage = screen.getByRole("region", { name: "Census coverage" })
    expect(within(coverage).getByText(/Coverage:/).textContent).toContain("partial")
    expect(within(within(coverage).getByRole("list", { name: "Sources" })).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual([
        "AWS Config eu-west-1: unavailable, no configuration recorder",
        "Tagging API eu-west-1: partial by design (tagged or previously tagged resources only), 6 resources",
        "CloudFormation eu-west-1: complete, 1 resource in 1 stack (1 deleted stack listed as deleted)",
        "Resource Explorer eu-west-1: unavailable, no Resource Explorer index",
      ])
    expect(within(coverage).getByRole("note").textContent).toContain("cannot be observed in eu-west-1")
    expect(within(coverage).getByLabelText("Census totals").textContent).toBe(
      "Collected in depth 30 · Listed only 3 · Deleted 1")
    const order = [coverage, screen.getByTestId("inventory-band"), screen.getByRole("region", { name: "Listed only" })]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("groups listed-only rows by service, pages the same publication, and greys a deleted stack resource", async () => {
    const { fetchPage, asked } = served(answers)
    await mount(fetchPage)
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).getByRole("list", { name: "dynamodb resources" }).children).toHaveLength(2)
    await act(async () => { fireEvent.click(within(listed).getByRole("button", { name: "Show more listed resources" })) })
    const items = within(within(listed).getByRole("list", { name: "dynamodb resources" })).getAllByRole("listitem")
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual(["orders-00", "orders-01", "orders-02", "orders-v0 (deleted)"])
    expect(items[3].className).toContain("text-slate-400")
    await act(async () => { fireEvent.click(within(listed).getByRole("button", { name: "Show more listed resources" })) })
    expect(within(listed).queryByRole("button", { name: /Show more/ })).toBeNull()
    expect(asked).toEqual(["listed_only|first", "inventory_pending|first", `listed_only|${cursorOf("depth_listed_only_page1")}`,
      `listed_only|${cursorOf("depth_listed_only_page2")}`])
    expect(within(listed).queryByRole("checkbox")).toBeNull()
  })
})

describe("the census bands while the account's inventory is not published", () => {
  it("lists collected types under their own heading with why they wait, and says so on the coverage band", async () => {
    const { fetchPage } = served({
      "listed_only|first": "pending_stage_depth_listed_only",
      "inventory_pending|first": "pending_stage_depth_inventory_pending",
    })
    await mount(fetchPage)
    const coverage = screen.getByRole("region", { name: "Census coverage" })
    expect(within(coverage).getAllByRole("note").map((n) => n.textContent).join(" ")).toContain(
      "inventory is not published, so 3 resources of collected types are listed below")
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).getByText("Collected in depth, inventory not published")).toBeTruthy()
    expect(within(listed).getByText(/it has not been published yet/)).toBeTruthy()
    const pending = within(listed).getByLabelText("Inventory pending by service")
    expect(within(pending).getAllByRole("listitem").length).toBe(3)
  })
})

describe("a census whose pending rows cannot be read", () => {
  it("says so instead of hiding them, since the coverage band counts them", async () => {
    const { fetchPage } = served({
      "listed_only|first": "pending_stage_depth_listed_only",
      "inventory_pending|first": "unavailable_store_503",
    })
    await mount(fetchPage)
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).getByRole("status").textContent).toContain(
      "3 resources of collected types wait for this account's inventory, but they could not be read: "
      + "The census could not be read (store_unavailable).")
    expect(within(listed).queryByText("Collected in depth, inventory not published")).toBeNull()
  })
})

describe("the census bands when there are no rows to show", () => {
  it.each([
    ["not_published_census_disabled", "Census is not enabled on this install."],
    ["not_published_census_not_run", "Census has not run yet for this account's current registration."],
    ["not_published_census_stopped", "Census has stopped (last dispatched 2027-01-12T08:00:00+00:00)."],
    ["held_authority_changed", "This account was registered again since the census was published; the next census pass replaces it."],
    ["unavailable_store_503", "The census could not be read (store_unavailable)."],
  ])("%s: says why in words and still shows the inventory", async (name, sentence) => {
    const { fetchPage } = served({ "listed_only|first": name, "inventory_pending|first": name })
    await mount(fetchPage)
    expect(screen.getByRole("status").textContent).toBe(sentence)
    expect(screen.getByTestId("inventory-band")).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Listed only" })).toBeNull()
  })
})

describe("a filtered listing that answers an empty page before its rows", () => {
  it("follows the empty page on, so 'nothing is listed only' is never said while pages remain (page 1 explicitly MUTATED)", async () => {
    // api/account_census.py: "a filtered page may be short or empty while next_cursor is not null" -- the captured route did
    // not produce one on this estate, so page 1 is the real first page with its rows removed (MUTATED); page 2 is real.
    const empty = capture("depth_listed_only_page1")
    ;(empty.body as { rows: unknown[] }).rows = []
    const fetchPage: CensusFetcher = vi.fn(async (_accountId, { depth, cursor }) => {
      if (depth === "inventory_pending") return capture("depth_inventory_pending_served")
      if (cursor === null) return empty
      if (cursor === cursorOf("depth_listed_only_page1")) return capture("depth_listed_only_page2")
      throw new Error(`unexpected cursor ${cursor}`)
    })
    await mount(fetchPage)
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).queryByText("Nothing is listed only.")).toBeNull()
    expect(within(listed).getByRole("list", { name: "dynamodb resources" }).children).toHaveLength(2)
  })
})

describe("a publication that moves while the page reads it", () => {
  it("restarts on a page of another publication even when none of its rows were seen (page 2's attempt explicitly MUTATED)", async () => {
    // The real page 2 (rows disjoint from page 1) under another publication attempt: only the attempt says it moved.
    const cursor = cursorOf("depth_listed_only_page1")
    const moved = capture("depth_listed_only_page2")
    ;(moved.body as { publication: { attempt: string } }).publication.attempt = "f".repeat(32)
    let firsts = 0
    const fetchPage: CensusFetcher = vi.fn(async (_accountId, { depth, cursor: asked }) => {
      if (depth === "inventory_pending") return capture("depth_inventory_pending_served")
      if (asked === null) { firsts += 1; return capture("depth_listed_only_page1") }
      if (asked === cursor) return moved
      throw new Error(`unexpected cursor ${asked}`)
    })
    await mount(fetchPage)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show more listed resources" })) })
    expect(firsts).toBe(2)
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).getByRole("list", { name: "dynamodb resources" }).children).toHaveLength(2)
  })

  it("never appends a page of another publication: it restarts from the first page instead", async () => {
    // Two REAL answers of two different publications: the served census's first page, then (as its "next" page) the
    // listed-only answer of the earlier, inventory-pending publication.
    const cursor = cursorOf("depth_listed_only_page1")
    const { fetchPage, asked } = served({
      "listed_only|first": "depth_listed_only_page1",
      [`listed_only|${cursor}`]: "pending_stage_depth_listed_only",
      "inventory_pending|first": "depth_inventory_pending_served",
    })
    await mount(fetchPage)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show more listed resources" })) })
    expect(asked.filter((k) => k === "listed_only|first")).toHaveLength(2)
    const listed = screen.getByRole("region", { name: "Listed only" })
    expect(within(listed).getByRole("list", { name: "dynamodb resources" }).children).toHaveLength(2)
  })

  it("restarts from the first page when the backend says the cursor's publication moved, and says so if it keeps moving", async () => {
    const cursor = cursorOf("depth_listed_only_page1")
    const { fetchPage, asked } = served({
      "listed_only|first": "depth_listed_only_page1",
      [`listed_only|${cursor}`]: "refused_cursor_restart_409",
      "inventory_pending|first": "depth_inventory_pending_served",
    })
    await mount(fetchPage)
    for (let n = 0; n <= MAX_RESTARTS; n += 1) {
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show more listed resources" })) })
    }
    expect(asked.filter((k) => k === "listed_only|first")).toHaveLength(1 + MAX_RESTARTS)
    expect(screen.getByRole("status").textContent).toBe(
      "The census changed while it was being read; refresh to read the current one.")
  })
})
