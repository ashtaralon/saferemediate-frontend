/**
 * Settings > Accounts: where a member account's DATA stands on its way to being shown (automatic onboarding, 2026-10-10),
 * the legacy "show its data" request, and the page's bounded refresh through it (Codex P2 on 473dd4db).
 *
 * PENDING CAPTURES: the base rows are REAL producer captures (fixtures/settings-c-producer: 18 = CONNECTED with its first
 * inventory collected, 17 = collecting 31 work items, 01 = a pending registration), but every `data_activation` object is
 * written to the contract (fixtures/data-activation.pending-captures.ts) because the backend that produces it is being built
 * now. Replace them with the backend's committed captures when they land, and rename this file.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import {
  DATA_ACTIVATION_STAGE_BOUND_MS,
  accountNeedsPolling,
  dataActivationAlreadyRequested,
  dataActivationCodeText,
  dataActivationNotRequestable,
  formatUtcInstantExact,
  type DataActivation,
} from "@/lib/account-admin"
import { OPERATOR, automatic, legacy, optionA, pendingRequest } from "@/__tests__/fixtures/data-activation.pending-captures"
import collected from "@/__tests__/fixtures/settings-c-producer/18_k2_collected.json"
import collecting from "@/__tests__/fixtures/settings-c-producer/17_k2_collecting.json"
import pendingRegistration from "@/__tests__/fixtures/settings-c-producer/01_pending_unverified.json"
import offboarded from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"

const CUSTOMER = "acme"
const MEMBER = "222222222222"
const LIST = `/api/proxy/admin/accounts?customer_id=${CUSTOMER}`
const SHOW = `/api/proxy/admin/accounts/${MEMBER}/activate-data?customer_id=${CUSTOMER}`

type Capture = { name: string; captured_at: string; body: { accounts: Array<Record<string, any>> } & Record<string, any> }
const BASE = collected as unknown as Capture
const NOW = Date.parse(BASE.captured_at)
/** A stage entered a minute before the capture's instant. */
const SINCE = new Date(NOW - 60_000).toISOString()

/** The platform account as the listing's contract sends it: no data activation (null). */
const PLATFORM = {
  customer_id: CUSTOMER, account_id: BASE.body.member_trust.platform_account_id, display_name: "Cyntro platform",
  environment: "SHARED_SERVICES", regions: ["eu-west-1"], onboarding_status: "REGISTERED", collection_mode: "LOCAL_CUSTOMER_PLANE",
  read_enabled: true, verification_enabled: true, mutation_enabled: false, validation_message: null, last_validated_at: null,
  sources: {}, pending_request: null, is_platform_account: true, data_activation: null,
}

const memberOf = (capture: Capture) => capture.body.accounts.find((account) => account.account_id === MEMBER) as Record<string, any>

/** The producer's listing with the member row's data_activation set (and, optionally, the platform row beside it). */
function listing(dataActivation: DataActivation | null, capture: Capture = BASE, withPlatform = false): Record<string, any> {
  const member = { ...memberOf(capture), data_activation: dataActivation }
  return { ...capture.body, accounts: withPlatform ? [PLATFORM, member] : [member], total: withPlatform ? 2 : 1 }
}

let current: Record<string, any>
const posts: Array<{ url: string; body: unknown }> = []
let lists = 0

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

async function mount(body: Record<string, any>, answer?: (url: string) => Response, now = NOW) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now })
  current = body
  posts.length = 0
  lists = 0
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    if (url === LIST && method === "GET") {
      lists += 1
      return json(current)
    }
    if (method === "POST") {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return answer ? answer(url) : json({ detail: "no answer set" }, 500)
    }
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  }))
  render(<AccountSettingsPage />)
  return screen.findByTestId(`account-row-${MEMBER}`)
}

const rowNow = () => screen.getByTestId(`account-row-${MEMBER}`)
const stageOf = (row: HTMLElement) => within(row).getByTestId(`data-stage-${MEMBER}`)
const lineOf = (row: HTMLElement) => within(row).getByTestId(`data-stage-line-${MEMBER}`)
const showButton = (row: HTMLElement) => within(row).queryByRole("button", { name: `Show data for ${MEMBER}` })
const dialogName = `Show data from prod-payments (${MEMBER})?`
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the base rows are the producer's", () => {
  it("18 is CONNECTED with its first inventory collected and nothing open; 17 is collecting 31 work items", () => {
    const row = memberOf(BASE)
    expect([row.onboarding_status, row.registration.first_inventory.state, row.pending_request ?? null]).toEqual(["CONNECTED", "COLLECTED", null])
    const moving = memberOf(collecting as unknown as Capture).registration.first_inventory
    expect([moving.state, moving.items.length, moving.counts.collected + moving.counts.completed]).toEqual(["COLLECTING", 31, 0])
    expect((offboarded as unknown as Capture).body.removed[0].by_display).toBe(OPERATOR)
  })
})

describe("one honest line per stage", () => {
  it("collecting: counted from the producer's own first inventory", async () => {
    const row = await mount(listing(automatic.collecting(SINCE), collecting as unknown as Capture))
    expect(stageOf(row)).toHaveAttribute("data-kind", "COLLECTING")
    expect(lineOf(row).textContent).toBe("Collecting (0/31)")
  })

  it.each([
    ["staging", automatic.staging(SINCE), "STAGING", "Staging the collected data"],
    ["checking", automatic.checking(SINCE), "CHECKING", "Checking the data"],
    ["activating", automatic.activating(SINCE), "ACTIVATING", "Turning the data on"],
    ["publishing", automatic.publishing(SINCE), "PUBLISHING", "Publishing inventory and census"],
    ["active", automatic.active(SINCE), "ACTIVE", "Data active"],
  ] as const)("%s", async (_stage, activation, kind, text) => {
    const row = await mount(listing(activation))
    expect(stageOf(row)).toHaveAttribute("data-kind", kind)
    expect(lineOf(row).textContent).toBe(text)
    expect(showButton(row)).toBeNull()
  })

  it("held: 'Held:' with each known code's words, and every code verbatim -- an unknown one included", async () => {
    const codes = ["acceptance_not_current", "a_hold_this_page_does_not_know:x"]
    const row = await mount(listing(automatic.held(SINCE, codes)))
    expect(stageOf(row)).toHaveAttribute("data-kind", "HELD")
    expect(lineOf(row).textContent).toBe(
      "Held: This account has no current passing acceptance run: none is recorded, or the last one has expired.")
    const items = within(within(row).getByTestId(`data-stage-codes-${MEMBER}`)).getAllByRole("listitem")
    expect(items.map((item) => item.querySelector("code")?.textContent)).toEqual(codes)
    expect(items[1].textContent).toBe("a_hold_this_page_does_not_know:x")
  })

  it("held with only unknown codes still says it is held, and names them", async () => {
    const row = await mount(listing(automatic.held(SINCE, ["a_hold_this_page_does_not_know"])))
    expect(lineOf(row).textContent).toBe("Held: for a reason named below.")
    expect(within(row).getByTestId(`data-stage-codes-${MEMBER}`)).toHaveTextContent("a_hold_this_page_does_not_know")
  })

  it("an unknown stage is said by its own name", async () => {
    const row = await mount(listing({ ...automatic.checking(SINCE), stage: "a_stage_this_page_does_not_know" }))
    expect(lineOf(row).textContent).toBe("Data in a stage Cyntro does not know (a_stage_this_page_does_not_know)")
  })

  it("the platform row (data_activation null) shows nothing of it, beside a member row that does", async () => {
    await mount(listing(automatic.checking(SINCE), BASE, true))
    const platform = screen.getByTestId(`account-row-${PLATFORM.account_id}`)
    expect(within(platform).queryByTestId(`data-activation-${PLATFORM.account_id}`)).toBeNull()
    expect(platform).not.toHaveTextContent(/Data active|Checking the data|Show its data|collection only/)
    expect(lineOf(rowNow()).textContent).toBe("Checking the data")
  })

  it("a registration not confirmed yet shows nothing of it: its Confirm is the consent, never a legacy request", async () => {
    const pending = pendingRegistration as unknown as Capture
    const row = await mount(listing(legacy(SINCE, { consent: null }), pending), undefined, Date.parse(pending.captured_at))
    expect(within(row).queryByTestId(`data-activation-${MEMBER}`)).toBeNull()
    expect(showButton(row)).toBeNull()
    expect(row).not.toHaveTextContent("collection only")
  })
})

describe("a new account never gets a separate action: the informed confirmation was the consent", () => {
  it.each(["collecting", "staging", "checking", "activating", "publishing", "active"] as const)(
    "%s with can_request true: still no 'Show its data'", async (stage) => {
      const row = await mount(listing({ ...automatic[stage](SINCE), can_request: true, blocked_by: [] }))
      expect(showButton(row)).toBeNull()
      expect(row).not.toHaveTextContent("collection only")
    })

  it("awaiting consent although consent collect_and_show: said so, no action", async () => {
    const row = await mount(listing(legacy(SINCE, { consent: "collect_and_show" })))
    expect(lineOf(row).textContent).toBe("Waiting for consent to show its data")
    expect(showButton(row)).toBeNull()
  })
})

describe("a legacy account (connected for collection only) is offered the one separate request", () => {
  it.each([["collect_only"], [null]] as const)("consent %s: the upgrade line and action, and no automatic-onboarding copy", async (consent) => {
    const row = await mount(listing(legacy(SINCE, { consent })))
    expect(stageOf(row)).toHaveAttribute("data-kind", "LEGACY")
    expect(lineOf(row).textContent).toBe("This account was connected for collection only. Show its data?")
    expect(showButton(row)).toBeInTheDocument()
    expect(row).not.toHaveTextContent(/Collecting|Staging|Checking the data|Turning the data on|Publishing|Data active/)
  })

  it("the dialog says what showing does -- not the new account's consent -- and Cancel sends nothing", async () => {
    const row = await mount(listing(legacy(SINCE)))
    fireEvent.click(showButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    expect(dialog).toHaveTextContent("This account was connected for collection only: Cyntro collects it, but does not show its data.")
    const said = within(dialog).getByTestId("show-data-explanation")
    expect(said).toHaveTextContent("Cyntro checks this account's collected data and its latest acceptance run.")
    expect(said).toHaveTextContent("If they pass, Cyntro shows its data: inventory, census and systems.")
    expect(said).toHaveTextContent("Read only: nothing in the AWS account changes.")
    expect(said).toHaveTextContent("The decision is recorded under your name.")
    expect(said).toHaveTextContent("It is not instant. You can follow each step here: checking, turning the data on, publishing.")
    expect(dialog).not.toHaveTextContent(/minute|second|hour|usually|within|soon/i)
    expect(dialog).not.toHaveTextContent(/turns reading on|collects this account's inventory/)
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull()
    expect(posts).toHaveLength(0)
  })

  it("'Show its data' posts to activate-data with the customer; 202 then shows it queued under the requester", async () => {
    const queued = pendingRequest("queued", new Date(NOW).toISOString())
    const row = await mount(listing(legacy(SINCE)), (url) => {
      if (url !== SHOW) return json({ detail: `unexpected POST ${url}` }, 404)
      current = listing(legacy(SINCE, { can_request: false, request: queued }))
      return json({ request_id: queued.request_id, status: "queued", account_id: MEMBER }, 202)
    })
    fireEvent.click(showButton(row) as HTMLElement)
    fireEvent.click(within(await screen.findByRole("dialog", { name: dialogName })).getByRole("button", { name: "Show its data" }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: SHOW, body: {} })
    await waitFor(() => expect(lineOf(rowNow()).textContent).toBe(`Activation requested by ${OPERATOR} — waiting to be processed`))
    expect(showButton(rowNow())).toBeNull()
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull()
  })

  it("409 ACTIVATION_NOT_REQUESTABLE: the dialog names each blocker; nothing was requested; it cannot be sent again", async () => {
    const blockedBy = ["first_inventory_not_collected", "lifecycle_unreadable"]
    const row = await mount(listing(legacy(SINCE)), () => {
      current = listing(legacy(SINCE, { can_request: false, blocked_by: blockedBy }))
      return json({ detail: { code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: blockedBy } }, 409)
    })
    fireEvent.click(showButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    fireEvent.click(within(dialog).getByRole("button", { name: "Show its data" }))
    const refusal = await within(dialog).findByTestId("show-data-not-requestable")
    expect(refusal).toHaveTextContent("Its data cannot be shown now. Nothing was requested.")
    expect(within(refusal).getAllByRole("listitem").map((item) => item.getAttribute("data-code"))).toEqual(blockedBy)
    expect(refusal).toHaveTextContent("first_inventory_not_collected This account's first inventory has not been collected yet.")
    expect(within(dialog).getByRole("button", { name: "Show its data" })).toBeDisabled()
    await waitFor(() => expect(within(rowNow()).getByTestId(`data-activation-blocked-${MEMBER}`)).toBeInTheDocument())
    expect(posts).toHaveLength(1)
  })

  it("409 ACTIVATION_ALREADY_REQUESTED (the backend's own shape at 2343b3a2): said as a notice, and the list read again", async () => {
    const open = pendingRequest("queued", SINCE)
    const row = await mount(listing(legacy(SINCE)), () => {
      current = listing(legacy(SINCE, { can_request: false, request: open }))
      return json({ detail: { code: "ACTIVATION_ALREADY_REQUESTED", request_id: open.request_id, status: "queued" } }, 409)
    })
    fireEvent.click(showButton(row) as HTMLElement)
    fireEvent.click(within(await screen.findByRole("dialog", { name: dialogName })).getByRole("button", { name: "Show its data" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      `A request to show the data of ${MEMBER} is already open (queued); Cyntro is still working on it.`)
    expect(screen.queryByRole("alert")).toBeNull()
    await waitFor(() => expect(stageOf(rowNow())).toHaveAttribute("data-kind", "QUEUED"))
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull()
  })

  it("not requestable: each blocker named instead of the button", async () => {
    const row = await mount(listing(legacy(SINCE, { can_request: false, blocked_by: ["lifecycle_unreadable"] })))
    expect(showButton(row)).toBeNull()
    const blocked = within(row).getByTestId(`data-activation-blocked-${MEMBER}`)
    expect(blocked).toHaveTextContent("Its data cannot be shown yet:")
    expect(blocked).toHaveTextContent("lifecycle_unreadable Cyntro could not read where this account's data stands.")
  })

  it("refused: the outcome and every refusal verbatim -- an unknown one included -- and it can be asked again", async () => {
    const refusals = ["requester_not_verified", "platform_not_ready", "acceptance_not_current", "tenant_not_ready:SHADOW",
                      "lifecycle_unreadable", "a_code_this_page_does_not_know:x"]
    const refused = pendingRequest("refused", SINCE, { completed_at: SINCE, outcome: "not_ready", refusals })
    const row = await mount(listing(legacy(SINCE, { request: refused })))
    expect(lineOf(row).textContent).toBe("Activation refused")
    const items = within(within(row).getByTestId(`data-stage-codes-${MEMBER}`)).getAllByRole("listitem")
    expect(items.map((item) => item.querySelector("code")?.textContent)).toEqual(["not_ready", ...refusals])
    expect(items[1]).toHaveTextContent("Cyntro could not verify the person who asked.")
    expect(items[2]).toHaveTextContent("This installation's own account is not operational yet; an account's data can be turned on only once it is.")
    expect(items[3]).toHaveTextContent("This account has no current passing acceptance run")
    expect(items[4]).toHaveTextContent("This account's data is not checked and ready yet, so it cannot be turned on. Now: its first data is staged and being checked.")
    expect(items[5]).toHaveTextContent("Cyntro could not read where this account's data stands.")
    expect(items[6].textContent).toBe("a_code_this_page_does_not_know:x")
    expect(showButton(row)).toBeInTheDocument()
  })

  it.each([
    ["queued", "QUEUED", `Activation requested by ${OPERATOR} — waiting to be processed`],
    ["running", "RUNNING", "Checking acceptance…"],
  ] as const)("a request %s is said by the request, with no second action", async (status, kind, text) => {
    const row = await mount(listing(legacy(SINCE, { can_request: false, request: pendingRequest(status, SINCE) })))
    expect(stageOf(row)).toHaveAttribute("data-kind", kind)
    expect(lineOf(row).textContent).toBe(text)
    expect(showButton(row)).toBeNull()
  })
})

const REVOKED_AT = new Date(NOW - 30_000).toISOString()

describe("a revoked permit: said truthfully, a fresh confirmation offered, never retried on its own", () => {
  // PROVISIONAL field name permit_revoked_at (no backend capture names the revocation yet; lib/account-admin.ts reads it in
  // one place, dataActivationRevoked).
  const revoked = (fields: Partial<DataActivation> = {}) =>
    ({ ...automatic.held(SINCE, []), stage: "awaiting_consent", stage_detail: [], can_request: true, permit_revoked_at: REVOKED_AT, ...fields })

  it("the line says it was revoked, and the action is a fresh confirmation in the same dialog", async () => {
    const row = await mount(listing(revoked()))
    expect(stageOf(row)).toHaveAttribute("data-kind", "REVOKED")
    expect(lineOf(row).textContent).toBe("Data access was revoked — confirm again to show this account's data")
    expect(showButton(row)).toHaveTextContent("Confirm again…")
    fireEvent.click(showButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    expect(within(dialog).getByTestId("show-data-why").textContent).toBe(
      "Data access for this account was revoked, so its data is not shown. Showing it again needs your fresh confirmation.")
    expect(within(dialog).getByTestId("show-data-explanation")).toHaveTextContent("The decision is recorded under your name.")
  })

  it("never retried on its own: no request is sent and the page does not keep re-reading", async () => {
    await mount(listing(revoked()))
    await waitFor(() => expect(lists).toBeGreaterThan(0))
    const settled = lists
    await tick(20_000)
    expect(posts).toHaveLength(0)
    expect(lists).toBe(settled)
  })

  it("only the person's click sends it, to activate-data, once", async () => {
    const row = await mount(listing(revoked()), () => {
      current = listing(revoked({ can_request: false, request: pendingRequest("queued", new Date(NOW).toISOString()) }))
      return json({ request_id: "pending-capture-request-1", status: "queued", account_id: MEMBER }, 202)
    })
    fireEvent.click(showButton(row) as HTMLElement)
    fireEvent.click(within(await screen.findByRole("dialog", { name: dialogName })).getByRole("button", { name: "Show its data" }))
    await waitFor(() => expect(posts).toEqual([{ url: SHOW, body: {} }]))
    await waitFor(() => expect(stageOf(rowNow())).toHaveAttribute("data-kind", "QUEUED"))
  })

  it("a confirmation refused after the revocation is said by its refusal, the newer fact", async () => {
    const later = new Date(NOW - 10_000).toISOString()
    const refused = pendingRequest("refused", later, { completed_at: later, outcome: "not_ready", refusals: ["acceptance_not_current"] })
    const row = await mount(listing(revoked({ request: refused })))
    expect(lineOf(row).textContent).toBe("Activation refused")
    expect(within(row).getByTestId(`data-stage-codes-${MEMBER}`)).toHaveTextContent("acceptance_not_current")
    expect(showButton(row)).toBeInTheDocument()
  })

  it("a permit revoked earlier and since moving again is not said revoked", async () => {
    const row = await mount(listing({ ...automatic.activating(SINCE), permit_revoked_at: REVOKED_AT }))
    expect(lineOf(row).textContent).toBe("Turning the data on")
    expect(showButton(row)).toBeNull()
  })
})

describe("progress belongs to the CURRENT registration only", () => {
  const current = () => memberOf(BASE).registration.registration_id as string
  const EARLIER = "0".repeat(32)   // a registration id that is not the row's current one

  it("data_activation naming an earlier registration: 'waiting for this registration's data', no stage, no action", async () => {
    expect(current()).not.toBe(EARLIER)
    // PROVISIONAL field name registration_id on data_activation (read only in dataActivationOtherRegistration).
    const row = await mount(listing({ ...legacy(SINCE), registration_id: EARLIER }))
    expect(stageOf(row)).toHaveAttribute("data-kind", "OTHER_REGISTRATION")
    expect(lineOf(row).textContent).toBe("Waiting for this registration's data")
    expect(showButton(row)).toBeNull()
    expect(row).not.toHaveTextContent("collection only")
  })

  it("the same registration is its own progress", async () => {
    const row = await mount(listing({ ...automatic.checking(SINCE), registration_id: current() }))
    expect(lineOf(row).textContent).toBe("Checking the data")
  })

  it("a first inventory naming an earlier registration: never its numbers -- not in the stage line, not in the first-collection status", async () => {
    const capture = collecting as unknown as Capture
    const member = memberOf(capture)
    const stale = { ...member, data_activation: automatic.collecting(SINCE),
      registration: { ...member.registration, first_inventory: { ...member.registration.first_inventory, registration_id: EARLIER } } }
    const row = await mount({ ...capture.body, accounts: [stale] }, undefined, Date.parse(capture.captured_at))
    expect(lineOf(row).textContent).toBe("Waiting for this registration's data")
    expect(within(row).getByTestId(`first-collection-${MEMBER}`).textContent).toBe("First inventory: waiting for this registration's data.")
    expect(row).not.toHaveTextContent(/\b0\/31\b|of 31 work items|31 work items/)
  })

  it("the refresh never runs on an earlier registration's stage", () => {
    const row = memberOf(BASE)
    expect(accountNeedsPolling({ ...row, data_activation: { ...automatic.checking(SINCE), registration_id: EARLIER } } as any, NOW)).toBe(false)
    expect(accountNeedsPolling({ ...row, data_activation: { ...automatic.checking(SINCE), registration_id: current() } } as any, NOW)).toBe(true)
  })
})

describe("the page's refresh runs through approval, activation and publication, and is bounded (Codex P2)", () => {
  it("Codex's case: CONNECTED, collection complete, request completed-permit_granted, active false -> active is discovered with no Refresh", async () => {
    const approved = optionA({ request: pendingRequest("completed", SINCE, { completed_at: SINCE, outcome: "permit_granted" }) })
    const row = await mount(listing(approved))
    expect(lineOf(row).textContent).toBe("Approved — data is being activated")
    current = listing(optionA({ state: "ACTIVE", active: true, request: approved.request }))
    await tick(4_500)
    await waitFor(() => expect(lineOf(rowNow()).textContent).toBe("Data active"))
    // Success ends the refresh.
    const settled = lists
    await tick(12_000)
    expect(lists).toBe(settled)
    expect(posts).toHaveLength(0)
  })

  it("automatic onboarding: activating -> publishing -> active with its inventory ready, each discovered with no Refresh, then the refresh stops", async () => {
    const row = await mount(listing(automatic.activating(SINCE)))
    expect(lineOf(row).textContent).toBe("Turning the data on")
    current = listing(automatic.publishing(SINCE))
    await tick(4_500)
    await waitFor(() => expect(lineOf(rowNow()).textContent).toBe("Publishing inventory and census"))
    current = listing(automatic.active(SINCE))
    await tick(4_500)
    await waitFor(() => expect(lineOf(rowNow()).textContent).toBe("Data active"))
    const settled = lists
    await tick(12_000)
    expect(lists).toBe(settled)
  })

  // Codex P2 on 0b2042ed: data on and its inventory ready, but its census still pending, is not done.
  const READY = { state: "ready", detail: null }
  const censusPending = () => ({ ...automatic.publishing(SINCE), inventory: READY, census: { state: "pending", detail: null } })

  it("active, inventory ready, census pending (stage publishing) -> census ready is discovered with no Refresh, then the refresh stops", async () => {
    const row = await mount(listing(censusPending()))
    expect(lineOf(row).textContent).toBe("Publishing inventory and census")
    const before = lists
    current = listing(automatic.active(SINCE))
    await tick(4_500)
    await waitFor(() => expect(lineOf(rowNow()).textContent).toBe("Data active"))
    expect(lists).toBeGreaterThan(before)
    const settled = lists
    await tick(12_000)
    expect(lists).toBe(settled)
    expect(posts).toHaveLength(0)
  })

  it("census held (a named hold) with the data on and its inventory ready: the refresh stops", async () => {
    await mount(listing({ ...automatic.active(SINCE), census: { state: "held", detail: ["CENSUS_STOPPED"] } }))
    await waitFor(() => expect(lists).toBeGreaterThan(0))
    const settled = lists
    await tick(12_000)
    expect(lists).toBe(settled)
  })

  it.each([
    ["refused", legacy(SINCE, { request: pendingRequest("refused", SINCE, { completed_at: SINCE, outcome: "not_ready", refusals: ["acceptance_not_current"] }) })],
    ["held", automatic.held(SINCE, ["acceptance_not_current"])],
    ["awaiting consent (legacy)", legacy(SINCE)],
    ["active with its inventory ready", automatic.active(SINCE)],
  ] as const)("%s: the page does not keep re-reading", async (_label, activation) => {
    await mount(listing(activation))
    await waitFor(() => expect(lists).toBeGreaterThan(0))
    const settled = lists
    await tick(12_000)
    expect(lists).toBe(settled)
  })

  it("a stage unchanged past the bound: the refresh stops, and the row says it is taking longer than expected", async () => {
    const since = new Date(NOW - DATA_ACTIVATION_STAGE_BOUND_MS + 6_000).toISOString()
    const row = await mount(listing(automatic.checking(since)))
    expect(within(row).queryByTestId(`data-stage-overdue-${MEMBER}`)).toBeNull()
    await tick(4_500)
    expect(lists).toBeGreaterThan(1)                                      // still within the bound: re-read
    await tick(4_500)
    const overdue = await within(rowNow()).findByTestId(`data-stage-overdue-${MEMBER}`)
    expect(overdue.textContent).toBe(
      `Taking longer than expected: unchanged since ${formatUtcInstantExact(since)}. Use Refresh to check again.`)
    expect(lineOf(rowNow()).textContent).toBe("Checking the data")
    const stopped = lists
    await tick(12_000)
    expect(lists).toBe(stopped)
  })

  it("the rule itself: moving stages refresh within the bound; success, holds and refusals do not; no parseable instant, no refresh", () => {
    const row = memberOf(BASE)
    const polled = (activation: DataActivation, now = NOW) => accountNeedsPolling({ ...row, data_activation: activation } as any, now)
    for (const stage of ["staging", "checking", "activating", "publishing"] as const) expect(polled(automatic[stage](SINCE))).toBe(true)
    expect(polled({ ...automatic.active(SINCE), inventory: { state: "pending", detail: null } })).toBe(true)
    expect(polled({ ...automatic.active(SINCE), census: { state: "pending", detail: null } })).toBe(true)
    expect(polled({ ...automatic.active(SINCE), census: { state: "a_state_this_page_does_not_know", detail: null } })).toBe(true)
    expect(polled({ ...automatic.active(SINCE), census: { state: "held", detail: ["CENSUS_STOPPED"] } })).toBe(false)
    expect(polled({ ...automatic.active(SINCE), inventory: { state: "held", detail: null }, census: { state: "pending", detail: null } })).toBe(true)
    expect(polled(automatic.active(SINCE))).toBe(false)
    expect(polled(automatic.held(SINCE, ["acceptance_not_current"]))).toBe(false)
    expect(polled(legacy(SINCE))).toBe(false)
    expect(polled(automatic.checking(SINCE), Date.parse(SINCE) + DATA_ACTIVATION_STAGE_BOUND_MS)).toBe(false)
    expect(polled({ ...automatic.checking(SINCE), stage_since: "not a time" })).toBe(false)
    expect(polled(legacy(SINCE, { request: pendingRequest("running", SINCE) }))).toBe(true)
  })
})

describe("the words and the refusal shape", () => {
  it("each code the backend names has its line; an unknown code has none (it is shown verbatim instead)", () => {
    for (const code of ["requester_not_verified", "platform_not_ready", "acceptance_not_current", "tenant_not_ready", "lifecycle_unreadable",
                        "already_active", "account_offboarded", "first_inventory_not_collected"]) {
      expect(dataActivationCodeText(code)).toEqual(expect.any(String))
    }
    expect(dataActivationCodeText("a_code_this_page_does_not_know")).toBeNull()
  })

  it("ACTIVATION_NOT_REQUESTABLE is read in detail or at the top level; ACTIVATION_ALREADY_REQUESTED is its own answer", () => {
    expect(dataActivationNotRequestable({ detail: { code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: ["x"] } })).toEqual(["x"])
    expect(dataActivationNotRequestable({ code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: ["y"] })).toEqual(["y"])
    expect(dataActivationNotRequestable({ detail: { code: "ACTIVATION_ALREADY_REQUESTED" } })).toBeNull()
    expect(dataActivationNotRequestable(null)).toBeNull()
    expect(dataActivationAlreadyRequested({ detail: { code: "ACTIVATION_ALREADY_REQUESTED", request_id: "r", status: "running" } }))
      .toEqual({ status: "running" })
    expect(dataActivationAlreadyRequested({ detail: { code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: [] } })).toBeNull()
  })
})
