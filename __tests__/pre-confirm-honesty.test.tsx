/**
 * r41 (Alon 2026-10-08, the first-account QA's pre-Confirm gate): the frontend says exactly what the registration proves.
 * Every listing is a REAL producer capture (fixtures/settings-c-producer, README; 47/48 were generated for this from the
 * installed r40 backend), every inventory / census answer a real route capture (fixtures/account-inventory*,
 * fixtures/account-census-captures). Nothing here is hand-written data.
 *
 * Before activation (an option-C registration with no activation marker): no claim that a name was read before the check
 * read one; the check's name is that check's evidence, never the account's identity; collection has not started; neither
 * inventory route asks the inventory, census or authoring routes anything. After activation the normal readers resume, and
 * no answer that is not data (not published, unavailable, a scope refusal) is ever shown as empty, zero, removed or
 * unauthorized.
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

import AccountSettingsPage from "@/app/settings/accounts/page"
import AccountRoute from "@/app/accounts/[accountId]/page"
import AccountInventoryRoute from "@/app/accounts/[accountId]/inventory/page"
import { accountLabel, accountNameNote, collectionNotStarted, type ManagedAccount } from "@/lib/account-admin"
import { outcomeSentence } from "@/lib/account-census"
import pending from "@/__tests__/fixtures/settings-c-producer/01_pending_unverified.json"
import refused from "@/__tests__/fixtures/settings-c-producer/02_access_refused.json"
import checking from "@/__tests__/fixtures/settings-c-producer/03_checking.json"
import confirmable from "@/__tests__/fixtures/settings-c-producer/04_access_confirmable.json"
import activating from "@/__tests__/fixtures/settings-c-producer/05_activating.json"
import connectPending from "@/__tests__/fixtures/settings-c-producer/12_connect_pending.json"
import recheck from "@/__tests__/fixtures/settings-c-producer/13b_access_confirmable_rechecked.json"
import listedPending from "@/__tests__/fixtures/settings-c-producer/14_listed_pending.json"
import k2Queued from "@/__tests__/fixtures/settings-c-producer/16_k2_queued.json"
import k2Collected from "@/__tests__/fixtures/settings-c-producer/18_k2_collected.json"
import measured from "@/__tests__/fixtures/settings-c-producer/27_k2_collected_measured.json"
import offboarded from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"
import nameDenied from "@/__tests__/fixtures/settings-c-producer/47_access_confirmable_name_not_permitted.json"
import nameEmpty from "@/__tests__/fixtures/settings-c-producer/48_access_confirmable_name_no_name.json"

const CUSTOMER = "acme"
const MEMBER = "222222222222"
const LIST = `/api/proxy/admin/accounts?customer_id=${CUSTOMER}`
/** The inventory and census route captures' own account: an account none of these listings names. */
const UNLISTED = "111122223333"

type Capture = { name: string; body: { accounts: Array<Record<string, any>> } & Record<string, any> }
const rowOf = (capture: Capture) => capture.body.accounts.find((a) => a.account_id === MEMBER) as ManagedAccount
const golden = (dir: string, name: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "__tests__/fixtures", dir, `${name}.json`), "utf8")) as { status: number; body: unknown }

/** Every request the page makes, answered from the captures only; anything else is a 404 the test would see. */
function serve(listing: Capture, inventory?: { status: number; body: unknown }) {
  const census = golden("account-census-captures", "not_published_census_not_run")
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store" } })
    if (url === LIST) return reply(listing.body)
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return reply({ customer_id: CUSTOMER, groups: [] })
    if (url === `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}`) return reply({ customer_id: CUSTOMER, state: "NOT_RUN" })
    if (url.includes("/census")) return reply(census.body, census.status)
    const discovery = /^\/api\/proxy\/accounts\/([0-9]{12})\/discovery$/.exec(url)
    if (discovery) {
      // Basic discovery: no discovery run for these accounts -- the backend's own NOT_REQUESTED status (its capture, the
      // requested account's ID), which keeps the published readers these cases are about.
      const status = golden("account-resources", "discovery_not_requested")
      return reply({ ...(status.body as Record<string, unknown>), account_id: discovery[1] }, status.status)
    }
    if (url.startsWith("/api/proxy/accounts/") && inventory) return reply(inventory.body, inventory.status)
    return reply({ detail: `unexpected ${url}` }, 404)
  }))
}

const requested = () => (fetch as any).mock.calls.map((call: any[]) => String(call[0])) as string[]
/** The reads a pre-activation view must never make: inventory, census and authoring. */
const dataReads = () => requested().filter((u) => u.startsWith("/api/proxy/accounts/") || u.startsWith("/api/proxy/system-boundary/"))

async function openTab(accountId: string) {
  search = new URLSearchParams("tab=inventory")
  await act(async () => { render(<AccountRoute params={Promise.resolve({ accountId })} />) })
}
async function openInventoryRoute(accountId: string) {
  await act(async () => { render(<AccountInventoryRoute params={Promise.resolve({ accountId })} />) })
}
const ENTRY_POINTS = [["/accounts/{id}?tab=inventory", openTab], ["/accounts/{id}/inventory", openInventoryRoute]] as const

beforeEach(() => { search = new URLSearchParams() })
afterEach(() => { vi.unstubAllGlobals() })

const PRE_ACTIVATION = [pending, refused, checking, confirmable, connectPending, recheck, listedPending, nameDenied, nameEmpty] as Capture[]
const ACTIVATED = [activating, k2Queued, k2Collected] as Capture[]

describe("the captures are the states they are named for", () => {
  it.each(PRE_ACTIVATION)("$name: a registration with no activation marker -- collection has not started", (capture) => {
    expect(rowOf(capture).registration?.activation ?? null).toBeNull()
    expect(collectionNotStarted(rowOf(capture))).toBe(true)
  })
  it.each(ACTIVATED)("$name: activation marker present -- the normal readers apply", (capture) => {
    expect(rowOf(capture).registration?.activation).toBeTruthy()
    expect(collectionNotStarted(rowOf(capture))).toBe(false)
  })
  it("47/48 reached the account and did not read its name, with the backend's own reason", () => {
    expect(rowOf(nameDenied as Capture).registration?.access_check).toMatchObject({ outcome: "REACHED", name_in_aws: null, name_unreadable: "NOT_PERMITTED" })
    expect(rowOf(nameEmpty as Capture).registration?.access_check).toMatchObject({ outcome: "REACHED", name_in_aws: null, name_unreadable: "NO_NAME" })
  })
})

describe("1. pending, no access check", () => {
  it("claims no name was read and no inventory exists: the row says so in words, with no Inventory link", async () => {
    serve(pending as Capture)
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${MEMBER}`)
    expect(within(row).getByTestId(`account-name-note-${MEMBER}`)).toHaveTextContent(
      "AWS name not read yet: Cyntro tries to read it during the access check.")
    expect(row).not.toHaveTextContent("once it connects")
    expect(within(row).getByTestId(`inventory-not-collected-${MEMBER}`)).toHaveTextContent("Inventory: not collected yet")
    expect(within(row).queryByRole("link", { name: `Inventory of ${MEMBER}` })).toBeNull()
    expect(dataReads()).toEqual([])
  })
})

describe("2. a REACHED access check before Confirm", () => {
  it("shows the check's name as that check's evidence, not the account's identity, and says collection has not started", async () => {
    serve(confirmable as Capture)
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${MEMBER}`)
    const name = rowOf(confirmable as Capture).registration!.access_check!.name_in_aws as string
    expect(name).toBe("prod-payments")
    const note = within(row).getByTestId(`account-name-note-${MEMBER}`)
    expect(note).toHaveTextContent(`AWS name returned by the access check: ${name}.`)
    expect(note).toHaveTextContent("It is a label set in AWS, not proof of who owns the account.")
    expect(note).toHaveTextContent("Collection has not started.")
    expect(note).not.toHaveTextContent("once it connects")
    // Not promoted: the account is still named by its ID everywhere it is named.
    expect(rowOf(confirmable as Capture).aws_account_name ?? null).toBeNull()
    expect(accountLabel(rowOf(confirmable as Capture))).toBe(MEMBER)
    expect(within(row).getByRole("link", { name: `Open account ${MEMBER}` })).toHaveTextContent(MEMBER)
    expect(within(row).getByRole("link", { name: `Open account ${MEMBER}` })).not.toHaveTextContent(name)
    expect(within(row).getByTestId(`inventory-not-collected-${MEMBER}`)).toHaveTextContent("Inventory: not collected yet")
    expect(within(row).queryByRole("link", { name: `Inventory of ${MEMBER}` })).toBeNull()
    expect(dataReads()).toEqual([])
  })

  it("the account page is titled by the ID, never by the check's name", async () => {
    serve(confirmable as Capture)
    await openTab(MEMBER)
    expect(await screen.findByTestId("account-page-title")).toHaveTextContent(MEMBER)
    expect(screen.getByTestId("account-page-title")).not.toHaveTextContent("prod-payments")
  })
})

describe("3. a check that reached the account but could not read its name", () => {
  it.each([
    [nameDenied, "The access check reached the account but did not read its AWS name: AWS denied permission to read it. Collection has not started."],
    [nameEmpty, "The access check reached the account but did not read its AWS name: AWS returned no name. Collection has not started."],
  ] as Array<[Capture, string]>)("$0.name: the exact reason, no name", async (capture, sentence) => {
    serve(capture)
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${MEMBER}`)
    expect(within(row).getByTestId(`account-name-note-${MEMBER}`)).toHaveTextContent(sentence)
    // No fabricated name, and never the wording of a name not yet attempted.
    expect(row).not.toHaveTextContent("AWS name returned by the access check")
    expect(row).not.toHaveTextContent("tries to read it during the access check")
    expect(accountLabel(rowOf(capture))).toBe(MEMBER)
  })

  it("a refused check says the name was not read because the check did not reach the account", () => {
    expect(accountNameNote(rowOf(refused as Capture))).toBe("AWS name not read: the access check did not reach the account.")
  })
})

describe("4. both inventory entry points before activation", () => {
  for (const [route, open] of ENTRY_POINTS) {
    it.each(PRE_ACTIVATION)(`${route}, $name: the same not-collected state, and no inventory, census or authoring read`, async (capture) => {
      serve(capture as Capture, golden("account-inventory", "populated_page1"))
      await open(MEMBER)
      const panel = await screen.findByTestId("inventory-not-collected")
      expect(panel).toHaveTextContent("Inventory not collected yet")
      expect(panel).toHaveTextContent(
        "This account is registered but has not been confirmed. Cyntro has not started inventory collection. Inventory becomes " +
          "available after the account is confirmed and its inventory collection begins.")
      expect(panel.textContent).not.toMatch(/empty|zero|no resources|removed|not authorized|unavailable/i)
      expect(screen.queryByTestId("inventory-group")).toBeNull()
      expect(dataReads()).toEqual([])
      expect(requested()).toContain(LIST)
    })
  }
})

describe("5. activated: the normal readers resume (the positive control of 4)", () => {
  for (const [route, open] of ENTRY_POINTS) {
    it.each(ACTIVATED)(`${route}, $name: inventory and census are read, and the not-collected state is not shown`, async (capture) => {
      serve(capture as Capture, golden("account-inventory", "not_published"))
      await open(MEMBER)
      await waitFor(() => expect(dataReads().some((u) => u.startsWith(`/api/proxy/accounts/${MEMBER}/inventory`))).toBe(true))
      expect(dataReads().some((u) => u.startsWith(`/api/proxy/accounts/${MEMBER}/census`))).toBe(true)
      expect(screen.queryByTestId("inventory-not-collected")).toBeNull()
    })
  }

  it("activation is not collection: a queued first inventory keeps the Inventory link and does not read as collected", async () => {
    serve(k2Queued as Capture)
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${MEMBER}`)
    expect(rowOf(k2Queued as Capture).registration?.first_inventory?.state).toBe("QUEUED")
    expect(within(row).getByRole("link", { name: `Inventory of ${MEMBER}` })).toBeInTheDocument()
    expect(within(row).queryByTestId(`inventory-not-collected-${MEMBER}`)).toBeNull()
    expect(row).not.toHaveTextContent(/First inventory collected/)
  })

  it("not published is said as not published, never as empty", async () => {
    serve(measured as Capture, golden("account-inventory", "not_published"))
    await openInventoryRoute(UNLISTED)
    expect(await screen.findByText("Inventory has not been published for this account yet.")).toBeInTheDocument()
    expect(screen.queryByText(/no resources|empty|zero/i)).toBeNull()
  })
})

describe("6. the scope refusal and a real authorization refusal", () => {
  it("INVENTORY_SCOPE_MISMATCH: outside the serving scope -- never 'not authorized', never a guess that it was removed", async () => {
    const answer = golden("account-inventory-captures", "refused_scope_mismatch_403")
    expect((answer.body as any).reason_code).toBe("INVENTORY_SCOPE_MISMATCH")
    serve(measured as Capture, answer)
    await openInventoryRoute(UNLISTED)
    expect(await screen.findByText("This account is not currently in this installation's serving scope, so its inventory is not shown."))
      .toBeInTheDocument()
    expect(screen.queryByText(/not authorized/)).toBeNull()
    expect(screen.queryByText(/removed/)).toBeNull()
  })

  it("PERSON_NOT_AUTHORIZED stays an authorization refusal", async () => {
    const answer = golden("account-inventory", "refused_not_authorized_403")
    expect((answer.body as any).reason_code).toBe("PERSON_NOT_AUTHORIZED")
    serve(measured as Capture, answer)
    await openInventoryRoute(UNLISTED)
    expect(await screen.findByText("You are not authorized to view this account's inventory.")).toBeInTheDocument()
  })

  it("the census words the two 403s apart (PERSON_NOT_AUTHORIZED: unified/identity/person_request.py's refusal, raised by the census route's shared _verified_reader)", () => {
    expect(outcomeSentence({ state: "refused", status: 403, reasonCode: "PERSON_NOT_AUTHORIZED" } as any))
      .toBe("You are not authorized to read this account's census.")
    expect(outcomeSentence({ state: "refused", status: 403, reasonCode: "INVENTORY_SCOPE_MISMATCH" } as any))
      .toBe("This account is not currently in this installation's serving scope, so its census is not shown.")
  })

  for (const [route, open] of ENTRY_POINTS) {
    it(`${route}: a removed account is said removed only from the listing's positive removed record, and nothing is read`, async () => {
      serve(offboarded as Capture, golden("account-inventory", "populated_page1"))
      await open(MEMBER)
      expect(await screen.findByTestId("account-removed")).toHaveTextContent("This account was removed from Cyntro.")
      expect(dataReads()).toEqual([])
    })
  }
})

describe("7. unavailable is never zero", () => {
  it("an unavailable inventory is said unavailable, with its code, never as an empty or zero inventory", async () => {
    const answer = golden("account-inventory", "unavailable_registry_unreadable")
    serve(measured as Capture, answer)
    await openInventoryRoute(UNLISTED)
    expect(await screen.findByText(`Inventory is unavailable right now (${(answer.body as any).reason_code}).`)).toBeInTheDocument()
    expect(screen.queryByText(/no resources|empty|zero/i)).toBeNull()
    expect(screen.queryByTestId("inventory-group")).toBeNull()
  })
})

describe("8. an activated, collected account is unchanged", () => {
  it("named as AWS names it, with no name note and its Inventory link", async () => {
    serve(k2Collected as Capture)
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${MEMBER}`)
    const account = rowOf(k2Collected as Capture)
    expect(account.aws_account_name).toBe("prod-payments")
    expect(within(row).getByRole("link", { name: `Open account ${MEMBER}` })).toHaveTextContent("prod-payments")
    expect(within(row).queryByTestId(`account-name-note-${MEMBER}`)).toBeNull()
    expect(within(row).getByRole("link", { name: `Inventory of ${MEMBER}` })).toHaveAttribute("href", `/accounts/${MEMBER}?tab=inventory`)
  })
})
