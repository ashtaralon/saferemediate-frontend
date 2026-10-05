/**
 * T11b: the mounted inventory view. Answers are the PRODUCER goldens (backend commit
 * 92b2c54f7ea6fbf09b50ae06cec98f9c268bedd0), delivered by a controllable fetcher so a late or out-of-order answer can
 * be released exactly when an account switch, refresh or retry has already moved on. The one partial-inventory case is
 * an explicitly MUTATED robustness case: the producer never emits it.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { AccountInventoryView, type RosterState } from "@/components/accounts/account-inventory-view"
import type { InventoryFetchResult, InventoryFetcher } from "@/lib/account-inventory"

type Name =
  | "populated_page1" | "populated_page2" | "complete_empty" | "filter_empty" | "not_published"
  | "held_authority_changed" | "refused_cursor_restart_publication_moved" | "refused_not_authorized_403"
  | "unavailable_registry_unreadable"

function golden(name: Name): { status: number; body: Record<string, any> } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures/account-inventory", `${name}.json`), "utf8"))
}

function answer(name: Name, mutate?: (b: Record<string, any>) => void): InventoryFetchResult {
  const g = golden(name)
  const body = structuredClone(g.body)
  mutate?.(body)
  return { status: g.status, body }
}

const ACCOUNT: string = golden("populated_page1").body.account_id
const OTHER = "444455556666"
const PAGE1_NAMES: string[] = golden("populated_page1").body.rows.map((r: any) => r.name ?? r.native_id)
const PAGE2_NAMES: string[] = golden("populated_page2").body.rows.map((r: any) => r.name ?? r.native_id)

interface Call {
  accountId: string
  params: { resourceType: string | null; cursor: string | null }
  resolve: (result: InventoryFetchResult) => void
}

function controllable() {
  const calls: Call[] = []
  const fetchPage: InventoryFetcher = vi.fn((accountId, params) => new Promise<InventoryFetchResult>((resolve) => {
    calls.push({ accountId, params, resolve })
  }))
  const release = async (index: number, result: InventoryFetchResult) => {
    await act(async () => {
      calls[index].resolve(result)
    })
  }
  return { calls, fetchPage, release }
}

function view(props: Partial<ComponentProps<typeof AccountInventoryView>> & { fetchPage: InventoryFetcher }) {
  const onResourceTypeChange = vi.fn()
  const roster: RosterState = { status: "ready", displayName: "Payments prod" }
  const utils = render(
    <AccountInventoryView accountId={ACCOUNT} customerId="acme" region="all" resourceType={null} roster={roster}
      onResourceTypeChange={onResourceTypeChange} {...props} />,
  )
  const rerender = (next: Partial<ComponentProps<typeof AccountInventoryView>>) => utils.rerender(
    <AccountInventoryView accountId={ACCOUNT} customerId="acme" region="all" resourceType={null} roster={roster}
      onResourceTypeChange={onResourceTypeChange} {...props} {...next} />,
  )
  return { ...utils, rerender, onResourceTypeChange }
}

function tableRows(): number {
  return Math.max(0, screen.queryAllByRole("row").length - 1)   // minus the header row
}

describe("the inventory view", () => {
  it("pages by cursor and shows no selection, eligibility or assignment", async () => {
    const { calls, fetchPage, release } = controllable()
    view({ fetchPage })
    expect(calls[0].params).toEqual({ resourceType: null, cursor: null })
    await release(0, answer("populated_page1"))
    expect(tableRows()).toBe(PAGE1_NAMES.length)
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    expect(calls[1].params.cursor).toBe(golden("populated_page1").body.next_cursor)
    await release(1, answer("populated_page2"))
    expect(tableRows()).toBe(PAGE1_NAMES.length + PAGE2_NAMES.length)
    const text = document.body.textContent ?? ""
    for (const forbidden of ["selectable", "SUPPORTED", "INCARNATION_NOT_PROVIDED", "not_evaluated", "Add to system"]) {
      expect(text).not.toContain(forbidden)
    }
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("keeps complete-empty, filter-empty and not-published visibly different", async () => {
    const copies: string[] = []
    for (const name of ["complete_empty", "filter_empty", "not_published"] as const) {
      const { fetchPage, release } = controllable()
      const { unmount } = view({ fetchPage, resourceType: name === "filter_empty" ? "ec2:no-such-type" : null })
      await release(0, answer(name))
      copies.push(screen.getAllByRole("status").map((node) => node.textContent).join(" "))
      unmount()
    }
    expect(copies[0]).toContain("complete and contains no resources")
    expect(copies[1]).toContain("No resources of type ec2:no-such-type")
    expect(copies[2]).toContain("has not been published")
    expect(new Set(copies).size).toBe(3)
  })

  it("a late answer for the previous account never renders after a switch, and A -> B -> A keeps only the newest", async () => {
    const { calls, fetchPage, release } = controllable()
    const { rerender } = view({ fetchPage })
    rerender({ accountId: OTHER })
    expect(calls[1].accountId).toBe(OTHER)
    await release(0, answer("populated_page1"))                   // A's late answer
    expect(tableRows()).toBe(0)
    await release(1, { status: 0, body: null })                   // B: transport failure
    expect(screen.getByRole("status").textContent).toContain("unavailable")
    rerender({ accountId: ACCOUNT })                              // back to A: a NEW read
    await release(2, answer("populated_page1"))
    expect(tableRows()).toBe(PAGE1_NAMES.length)
  })

  it("a same-key refresh drops the earlier answer", async () => {
    const { calls, fetchPage, release } = controllable()
    view({ fetchPage })
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(calls).toHaveLength(2)
    await release(0, answer("populated_page1"))                   // the pre-refresh answer, late
    expect(tableRows()).toBe(0)
    await release(1, answer("not_published"))
    expect(screen.getByRole("status").textContent).toContain("has not been published")
    expect(tableRows()).toBe(0)
  })

  it("a cursor restart re-reads page one once, then offers a retry", async () => {
    const { calls, fetchPage, release } = controllable()
    view({ fetchPage })
    await release(0, answer("populated_page1"))
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    await release(1, answer("refused_cursor_restart_publication_moved"))
    expect(calls[2].params.cursor).toBeNull()                     // the one automatic restart
    expect(tableRows()).toBe(0)
    await release(2, answer("populated_page1"))
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    await release(3, answer("refused_cursor_restart_publication_moved"))
    expect(screen.getByRole("status").textContent).toContain("being republished")
    expect(calls).toHaveLength(4)                                 // no loop
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(calls[4].params.cursor).toBeNull()
  })

  it("refusals and holds clear the rows and say what happened", async () => {
    const cases: Array<[Name, string]> = [
      ["refused_not_authorized_403", "not authorized"],
      ["held_authority_changed", "registration changed"],
      ["unavailable_registry_unreadable", "INVENTORY_SCOPE_UNAVAILABLE"],
    ]
    for (const [name, copy] of cases) {
      const { calls, fetchPage, release } = controllable()
      const { unmount } = view({ fetchPage })
      await release(0, answer("populated_page1"))
      fireEvent.click(screen.getByRole("button", { name: "Load more" }))
      await release(1, answer(name))
      expect(calls).toHaveLength(2)
      expect(tableRows()).toBe(0)
      expect(screen.getByRole("status").textContent).toContain(copy)
      unmount()
    }
  })

  it("says the inventory is account-wide when a Region is selected", async () => {
    const { fetchPage, release } = controllable()
    const { rerender } = view({ fetchPage, region: "eu-west-1" })
    await release(0, answer("populated_page1"))
    expect(screen.getByTestId("inventory-scope").textContent).toContain("does not filter this inventory")
    rerender({ region: "all" })
    expect(screen.getByTestId("inventory-scope").textContent).not.toContain("does not filter")
  })

  it("MUTATED robustness case (never emitted by the producer): a partial publication is marked partial", async () => {
    const { fetchPage, release } = controllable()
    view({ fetchPage })
    await release(0, answer("populated_page1", (b) => { b.publication.inventory_complete = false }))
    expect(screen.getByText(/This inventory is partial/)).toBeInTheDocument()
    expect(tableRows()).toBe(PAGE1_NAMES.length)
  })

  it("names the roster state without treating it as a refusal, and filters through the URL callback", async () => {
    const { fetchPage } = controllable()
    const { rerender, onResourceTypeChange } = view({ fetchPage, roster: { status: "loading" } })
    expect(screen.getByText("Loading account list…")).toBeInTheDocument()
    rerender({ roster: { status: "unavailable" } })
    expect(screen.getByText(`Account list unavailable; showing account ${ACCOUNT}.`)).toBeInTheDocument()
    rerender({ roster: { status: "ready", displayName: "Payments prod" } })
    expect(screen.getByRole("heading").textContent).toContain(`Payments prod (${ACCOUNT})`)
    fireEvent.change(screen.getByLabelText("Resource type"), { target: { value: "s3:bucket" } })
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    expect(onResourceTypeChange).toHaveBeenCalledWith("s3:bucket")
  })
})
