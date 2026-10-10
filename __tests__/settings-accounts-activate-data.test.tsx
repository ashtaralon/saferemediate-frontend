/**
 * Settings > Accounts: "Activate data" for a member account whose first inventory is collected and staged but whose data is
 * not active yet (the person-initiated request; backend POST /api/admin/accounts/{id}/activate-data).
 *
 * The base row is the REAL producer's activated member account (fixtures/settings-c-producer/38_activated_listing.json).
 * The backend route is being built in parallel, so no producer capture of `data_activation` exists yet: each object below is
 * written to the fixed contract -- exactly its fields (state, policy, active, can_request, blocked_by, request {request_id,
 * status, requested_by {display}, requested_at, completed_at, outcome, refusals}) and nothing else. The operator name is the
 * producer's own (capture 41's by_display); the instants are the capture's. Replace these with producer captures once the
 * backend lands. There are no counts here to fabricate.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import {
  accountNeedsPolling,
  dataActivationCodeText,
  dataActivationNotRequestable,
  type DataActivation,
  type DataActivationRequest,
} from "@/lib/account-admin"
import activated from "@/__tests__/fixtures/settings-c-producer/38_activated_listing.json"
import offboarded from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"

const CUSTOMER = "acme"
const MEMBER = "222222222222"
const LIST = `/api/proxy/admin/accounts?customer_id=${CUSTOMER}`
const ACTIVATE = `/api/proxy/admin/accounts/${MEMBER}/activate-data?customer_id=${CUSTOMER}`

type Capture = { name: string; captured_at: string; body: { accounts: Array<Record<string, any>> } & Record<string, any> }
const base = activated as unknown as Capture
const CAPTURED = base.captured_at
const OPERATOR = (offboarded as unknown as Capture).body.removed[0].by_display as string

// ── the contract's shapes, one per state ────────────────────────────────────────────────────────────────────────────
const request = (status: string, extra: Partial<DataActivationRequest> = {}): DataActivationRequest => ({
  request_id: "activation-request-1",
  status,
  requested_by: { display: OPERATOR },
  requested_at: CAPTURED,
  completed_at: null,
  outcome: null,
  refusals: [],
  ...extra,
})

const activation = (fields: Partial<DataActivation>): DataActivation => ({
  state: "READY",
  policy: "STAGE_ONLY",
  active: false,
  can_request: false,
  blocked_by: [],
  request: null,
  ...fields,
})

const REQUESTABLE = activation({ state: "READY", can_request: true })
const BLOCKED = activation({ state: "SHADOW", blocked_by: ["tenant_not_ready:SHADOW", "acceptance_not_current"] })
const QUEUED = activation({ request: request("queued") })
const RUNNING = activation({ request: request("running") })
const APPROVED = activation({ policy: "AUTO_ACTIVATE_WHEN_READY",
  request: request("completed", { completed_at: CAPTURED, outcome: "permit_granted" }) })
const ACTIVE = activation({ state: "ACTIVE", policy: "AUTO_ACTIVATE_WHEN_READY", active: true,
  request: request("completed", { completed_at: CAPTURED, outcome: "permit_granted" }) })
const REFUSAL_CODES = ["requester_not_verified", "platform_not_ready:PROVISIONING", "acceptance_not_current",
                       "tenant_not_ready:SHADOW", "lifecycle_unreadable", "a_code_this_page_does_not_know:x"]
const REFUSED = activation({ state: "SHADOW", request: request("refused", { completed_at: CAPTURED, refusals: REFUSAL_CODES }) })

/** The platform account as the listing's contract sends it: no data activation (null). */
const PLATFORM = {
  customer_id: CUSTOMER, account_id: base.body.member_trust.platform_account_id, display_name: "Cyntro platform",
  environment: "SHARED_SERVICES", regions: ["eu-west-1"], onboarding_status: "REGISTERED", collection_mode: "LOCAL_CUSTOMER_PLANE",
  read_enabled: true, verification_enabled: true, mutation_enabled: false, validation_message: null, last_validated_at: null,
  sources: {}, pending_request: null, is_platform_account: true, data_activation: null,
}

/** The producer's listing with the member row's data_activation set (and, optionally, the platform row). */
function listing(dataActivation: DataActivation, withPlatform = false): Record<string, any> {
  const member = { ...base.body.accounts.find((account) => account.account_id === MEMBER), data_activation: dataActivation }
  return { ...base.body, accounts: withPlatform ? [PLATFORM, member] : [member], total: withPlatform ? 2 : 1 }
}

let current: Record<string, any>
const posts: Array<{ url: string; body: unknown }> = []
let lists = 0

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function install(body: Record<string, any>, answer?: (url: string) => Response) {
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
}

async function mount(dataActivation: DataActivation, answer?: (url: string) => Response, withPlatform = false) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse(CAPTURED) })
  install(listing(dataActivation, withPlatform), answer)
  render(<AccountSettingsPage />)
  return screen.findByTestId(`account-row-${MEMBER}`)
}

const activateButton = (row: HTMLElement) => within(row).queryByRole("button", { name: `Activate data for ${MEMBER}` })
const progressOf = (row: HTMLElement) => within(row).getByTestId(`data-activation-progress-${MEMBER}`)
const dialogName = `Activate data for prod-payments (${MEMBER})?`

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the base row is the producer's activated member account", () => {
  it("38_activated_listing carries the member row, connected, with its registration activated", () => {
    const row = base.body.accounts.find((account) => account.account_id === MEMBER) as Record<string, any>
    expect([row.collection_mode, row.onboarding_status, Boolean(row.registration?.activation)]).toEqual(["MEMBER_READ_ROLE", "CONNECTED", true])
    expect(OPERATOR).toBe("Alice Operator")
  })
})

describe("Activate data is offered only when the backend says it can be requested", () => {
  it("can_request: the action is offered, with where the data stands now", async () => {
    const row = await mount(REQUESTABLE)
    expect(activateButton(row)).toBeInTheDocument()
    expect(within(row).getByTestId(`data-state-${MEMBER}`)).toHaveTextContent(
      "Data not active yet. Now: its data is checked and waiting to be activated.")
    expect(within(row).queryByTestId(`data-activation-blocked-${MEMBER}`)).toBeNull()
  })

  it.each([
    ["blocked", BLOCKED],
    ["queued", QUEUED],
    ["running", RUNNING],
    ["approved", APPROVED],
    ["active", ACTIVE],
    ["refused, not requestable again", REFUSED],
    ["not requestable, no reason given", activation({})],
  ] as const)("%s: not offered", async (_label, state) => {
    const row = await mount(state)
    expect(activateButton(row)).toBeNull()
  })

  it("not requestable with blockers: each blocker named verbatim with its plain words, instead of the button", async () => {
    const row = await mount(BLOCKED)
    const blocked = within(row).getByTestId(`data-activation-blocked-${MEMBER}`)
    expect(blocked).toHaveTextContent("Data activation cannot be requested yet:")
    const items = within(blocked).getAllByRole("listitem")
    expect(items.map((item) => item.getAttribute("data-code"))).toEqual(["tenant_not_ready:SHADOW", "acceptance_not_current"])
    expect(items[0]).toHaveTextContent(
      "tenant_not_ready:SHADOW This account's data is not checked and ready yet, so it cannot be turned on. Now: its first data is staged and being checked.")
    expect(items[1]).toHaveTextContent(
      "acceptance_not_current This account has no current passing acceptance run: none is recorded, or the last one has expired.")
    expect(within(row).getByTestId(`data-state-${MEMBER}`)).toHaveTextContent("Data not active yet. Now: its first data is staged and being checked.")
  })

  it("not requestable with no blocker named: neither the button nor an empty reason list", async () => {
    const row = await mount(activation({}))
    expect(within(row).queryByTestId(`data-activation-blocked-${MEMBER}`)).toBeNull()
    expect(within(row).queryByTestId(`data-activation-progress-${MEMBER}`)).toBeNull()
  })
})

describe("the confirmation says what activating does, and only Activate data sends", () => {
  it("the dialog's five statements; Cancel closes and sends nothing", async () => {
    const row = await mount(REQUESTABLE)
    fireEvent.click(activateButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    const explanation = within(dialog).getByTestId("activate-data-explanation")
    expect(explanation).toHaveTextContent("Cyntro checks this account's latest acceptance run.")
    expect(explanation).toHaveTextContent("If it passes, Cyntro turns on this account's data, so its inventory and systems appear.")
    expect(explanation).toHaveTextContent("Read only: nothing in the account changes.")
    expect(explanation).toHaveTextContent("The decision is recorded under your name.")
    expect(explanation).toHaveTextContent("Activation happens on Cyntro's next processing pass, which takes minutes. It is not instant.")
    expect(posts).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull()
    expect(posts).toHaveLength(0)
  })

  it("Activate data posts to the account's activate-data route with the customer, and 202 shows it queued under the requester", async () => {
    const queued = request("queued")
    const row = await mount(REQUESTABLE, (url) => {
      if (url !== ACTIVATE) return json({ detail: `unexpected POST ${url}` }, 404)
      current = listing(activation({ request: queued }))   // the backend now lists the request it queued
      return json({ request_id: queued.request_id, status: "queued", account_id: MEMBER }, 202)
    })
    fireEvent.click(activateButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    fireEvent.click(within(dialog).getByRole("button", { name: "Activate data" }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: ACTIVATE, body: {} })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull())
    const now = screen.getByTestId(`account-row-${MEMBER}`)
    await waitFor(() => expect(progressOf(now)).toHaveTextContent(`Activation requested by ${OPERATOR} — waiting to be processed`))
    expect(progressOf(now)).toHaveAttribute("data-kind", "QUEUED")
    expect(activateButton(now)).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("409 ACTIVATION_NOT_REQUESTABLE: the dialog names each blocker, nothing was requested, and it cannot be sent again", async () => {
    const blockedBy = ["acceptance_not_current", "lifecycle_unreadable"]
    const row = await mount(REQUESTABLE, () => {
      current = listing(activation({ state: "READY", blocked_by: blockedBy }))
      return json({ detail: { code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: blockedBy } }, 409)
    })
    fireEvent.click(activateButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: dialogName })
    fireEvent.click(within(dialog).getByRole("button", { name: "Activate data" }))
    const refusal = await within(dialog).findByTestId("activate-data-not-requestable")
    expect(refusal).toHaveTextContent("Activation cannot be requested now. Nothing was requested.")
    expect(within(refusal).getAllByRole("listitem").map((item) => item.getAttribute("data-code"))).toEqual(blockedBy)
    expect(refusal).toHaveTextContent("lifecycle_unreadable Cyntro could not read where this account's data stands.")
    expect(within(dialog).getByRole("button", { name: "Activate data" })).toBeDisabled()
    expect(posts).toHaveLength(1)
    // The page read the list again: the row now shows the backend's own blockers.
    await waitFor(() => expect(within(screen.getByTestId(`account-row-${MEMBER}`)).getByTestId(`data-activation-blocked-${MEMBER}`))
      .toBeInTheDocument())
  })

  // The contract names this 409 but not its body; the detail sentence here is a stand-in, said as the backend sends it.
  it("409 for a request already open: said in the page's error banner, and the list is read again", async () => {
    const row = await mount(REQUESTABLE, () => {
      current = listing(activation({ request: request("queued") }))
      return json({ detail: "an activation request is already open for this account" }, 409)
    })
    const before = lists
    fireEvent.click(activateButton(row) as HTMLElement)
    fireEvent.click(within(await screen.findByRole("dialog", { name: dialogName })).getByRole("button", { name: "Activate data" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Activate data failed (HTTP 409): an activation request is already open for this account")
    await waitFor(() => expect(lists).toBeGreaterThan(before))
    await waitFor(() => expect(progressOf(screen.getByTestId(`account-row-${MEMBER}`))).toHaveAttribute("data-kind", "QUEUED"))
  })
})

describe("progress is the backend's request and state, in words -- never guessed", () => {
  it.each([
    ["queued", QUEUED, "QUEUED", `Activation requested by ${OPERATOR} — waiting to be processed`],
    ["running", RUNNING, "RUNNING", "Checking acceptance…"],
    ["completed, permit granted, not active yet", APPROVED, "APPROVED", "Approved — data is being activated"],
    ["active", ACTIVE, "ACTIVE", "Data active"],
    ["refused", REFUSED, "REFUSED", "Activation refused"],
  ] as const)("%s", async (_label, state, kind, text) => {
    const row = await mount(state)
    expect(progressOf(row)).toHaveAttribute("data-kind", kind)
    expect(progressOf(row)).toHaveTextContent(text)
  })

  it("approved but not active is never 'Data active'", async () => {
    const row = await mount(APPROVED)
    expect(row).not.toHaveTextContent("Data active")
    expect(within(row).getByTestId(`data-state-${MEMBER}`)).toHaveTextContent("Data not active yet.")
  })

  it("active says only that the data is active: no 'not active yet', no action, no blockers", async () => {
    const row = await mount(ACTIVE)
    expect(within(row).queryByTestId(`data-state-${MEMBER}`)).toBeNull()
    expect(row).not.toHaveTextContent(/not active|Approved|cannot be requested/)
  })

  it("a completed request with another outcome is said by its own outcome, never as approved", async () => {
    const row = await mount(activation({ request: request("completed", { completed_at: CAPTURED, outcome: "an_outcome_this_page_does_not_know" }) }))
    expect(progressOf(row)).toHaveTextContent("Activation request completed: an_outcome_this_page_does_not_know")
    expect(row).not.toHaveTextContent(/Approved|Data active/)
  })

  it("refused: every code verbatim -- an unknown one included -- with plain words for the known ones", async () => {
    const row = await mount(REFUSED)
    const list = within(row).getByTestId(`data-activation-refusals-${MEMBER}`)
    const items = within(list).getAllByRole("listitem")
    expect(items.map((item) => item.getAttribute("data-code"))).toEqual(REFUSAL_CODES)
    expect(items.map((item) => item.querySelector("code")?.textContent)).toEqual(REFUSAL_CODES)
    expect(items[0]).toHaveTextContent("Cyntro could not verify the person who asked.")
    expect(items[1]).toHaveTextContent("This installation's own account is not operational yet; an account's data can be turned on only once it is.")
    expect(items[2]).toHaveTextContent("This account has no current passing acceptance run")
    expect(items[3]).toHaveTextContent("This account's data is not checked and ready yet, so it cannot be turned on. Now: its first data is staged and being checked.")
    expect(items[4]).toHaveTextContent("Cyntro could not read where this account's data stands.")
    expect(items[5].textContent).toBe("a_code_this_page_does_not_know:x")
  })

  it("an open request keeps the page re-reading through its existing poll; a settled one does not", () => {
    const row = base.body.accounts.find((account) => account.account_id === MEMBER) as Record<string, any>
    expect(accountNeedsPolling({ ...row, data_activation: QUEUED } as any)).toBe(true)
    expect(accountNeedsPolling({ ...row, data_activation: RUNNING } as any)).toBe(true)
    for (const settled of [REQUESTABLE, BLOCKED, APPROVED, ACTIVE, REFUSED]) {
      expect(accountNeedsPolling({ ...row, data_activation: settled } as any)).toBe(false)
    }
  })

  it("the page follows queued -> running -> approved -> active through that poll, with no Refresh", async () => {
    const row = await mount(QUEUED)
    expect(progressOf(row)).toHaveAttribute("data-kind", "QUEUED")
    current = listing(RUNNING)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(progressOf(screen.getByTestId(`account-row-${MEMBER}`))).toHaveAttribute("data-kind", "RUNNING"))
    current = listing(APPROVED)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(progressOf(screen.getByTestId(`account-row-${MEMBER}`))).toHaveAttribute("data-kind", "APPROVED"))
    // Approved is settled: the poll stops, and "Data active" arrives with the page's Refresh.
    current = listing(ACTIVE)
    const before = lists
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(lists).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Refresh accounts" }))
    await waitFor(() => expect(progressOf(screen.getByTestId(`account-row-${MEMBER}`))).toHaveTextContent("Data active"))
    expect(posts).toHaveLength(0)
  })
})

describe("the platform account has no data activation", () => {
  it("its row (data_activation null) shows nothing of it, beside a member row that does", async () => {
    const row = await mount(REQUESTABLE, undefined, true)
    expect(activateButton(row)).toBeInTheDocument()
    const platform = screen.getByTestId(`account-row-${PLATFORM.account_id}`)
    expect(within(platform).queryByTestId(`data-activation-${PLATFORM.account_id}`)).toBeNull()
    expect(platform).not.toHaveTextContent(/Activate data|Data active|Data not active|Activation/)
  })
})

describe("the words and the refusal shape", () => {
  it("each known code has its line; an unknown code has none (it is shown verbatim instead)", () => {
    for (const code of ["requester_not_verified", "platform_not_ready", "acceptance_not_current", "tenant_not_ready", "lifecycle_unreadable"]) {
      expect(dataActivationCodeText(code)).toEqual(expect.any(String))
    }
    expect(dataActivationCodeText("tenant_not_ready:NOT_A_STATE")).toBe(
      "This account's data is not checked and ready yet, so it cannot be turned on.")
    expect(dataActivationCodeText("a_code_this_page_does_not_know")).toBeNull()
  })

  it("ACTIVATION_NOT_REQUESTABLE is read wrapped in detail or at the top level; any other 409 is not it", () => {
    expect(dataActivationNotRequestable({ detail: { code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: ["x"] } })).toEqual(["x"])
    expect(dataActivationNotRequestable({ code: "ACTIVATION_NOT_REQUESTABLE", blocked_by: ["y"] })).toEqual(["y"])
    expect(dataActivationNotRequestable({ detail: "an activation request is already open" })).toBeNull()
    expect(dataActivationNotRequestable(null)).toBeNull()
  })
})
