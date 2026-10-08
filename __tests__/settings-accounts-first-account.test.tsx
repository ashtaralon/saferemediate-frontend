/**
 * Settings > Accounts, option C (S4): the first account's journey on the page -- check access, the explicit confirmation,
 * the first collection while it is pending or blocked, the dated last check, and the recovery its states need (retry,
 * release). Every row below is the REAL backend's listing, captured by executing the producer at saferemediate-backend
 * b7a01033 (__tests__/fixtures/settings-c-producer/README.md); nothing is hand-written. The page sends only the requests
 * asserted here, each naming exactly the registration and version the row shows.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import { ACTIVATION_CHECK_MAX_AGE_MS, accountNeedsPolling, firstInventoryOutcomeText, formatUtcInstantExact } from "@/lib/account-admin"
import pending from "@/__tests__/fixtures/settings-c-producer/01_pending_unverified.json"
import refused from "@/__tests__/fixtures/settings-c-producer/02_access_refused.json"
import checking from "@/__tests__/fixtures/settings-c-producer/03_checking.json"
import confirmable from "@/__tests__/fixtures/settings-c-producer/04_access_confirmable.json"
import activating from "@/__tests__/fixtures/settings-c-producer/05_activating.json"
import partially from "@/__tests__/fixtures/settings-c-producer/06_connected_partially_queued.json"
import allQueued from "@/__tests__/fixtures/settings-c-producer/07_connected_all_queued.json"
import blocked from "@/__tests__/fixtures/settings-c-producer/08_connected_blocked.json"
import activationFailed from "@/__tests__/fixtures/settings-c-producer/09_activation_failed.json"
import held from "@/__tests__/fixtures/settings-c-producer/10_held_owner.json"
import released from "@/__tests__/fixtures/settings-c-producer/11_released.json"
import connectPending from "@/__tests__/fixtures/settings-c-producer/12_connect_pending.json"
import firstCheck from "@/__tests__/fixtures/settings-c-producer/13a_access_confirmable_first.json"
import recheck from "@/__tests__/fixtures/settings-c-producer/13b_access_confirmable_rechecked.json"
import listedPending from "@/__tests__/fixtures/settings-c-producer/14_listed_pending.json"
import listedAdmitted from "@/__tests__/fixtures/settings-c-producer/15_listed_admitted.json"
import k2Queued from "@/__tests__/fixtures/settings-c-producer/16_k2_queued.json"
import k2Collecting from "@/__tests__/fixtures/settings-c-producer/17_k2_collecting.json"
import k2Collected from "@/__tests__/fixtures/settings-c-producer/18_k2_collected.json"
import k2Failed from "@/__tests__/fixtures/settings-c-producer/19_k2_failed.json"
import k2Unavailable from "@/__tests__/fixtures/settings-c-producer/20_k2_run_store_not_configured.json"
import gateClosed from "@/__tests__/fixtures/settings-c-producer/21_gate_closed_refusal.json"
import historyPresent from "@/__tests__/fixtures/settings-c-producer/22_history_present_refusal.json"
import k2Blocked from "@/__tests__/fixtures/settings-c-producer/23_k2_partially_blocked.json"
import withdrawRequested from "@/__tests__/fixtures/settings-c-producer/24_withdraw_requested.json"
import withdrawn from "@/__tests__/fixtures/settings-c-producer/25_withdrawn.json"
import withdrawRefused from "@/__tests__/fixtures/settings-c-producer/26_withdraw_refused_state_changed.json"
import k2Measured from "@/__tests__/fixtures/settings-c-producer/27_k2_collected_measured.json"
import k2ZeroFacts from "@/__tests__/fixtures/settings-c-producer/28_k2_collected_zero_facts.json"
import k8sHeld from "@/__tests__/fixtures/settings-c-producer/49_k2_k8s_source_held.json"
import k8sLegacy from "@/__tests__/fixtures/settings-c-producer/50_k2_k8s_legacy_no_scope_committed.json"
import k8sPartly from "@/__tests__/fixtures/settings-c-producer/51_k2_k8s_partly_held.json"
import offActivated from "@/__tests__/fixtures/settings-c-producer/38_activated_listing.json"
import offRequested from "@/__tests__/fixtures/settings-c-producer/39_offboard_requested.json"
import offPending from "@/__tests__/fixtures/settings-c-producer/40_offboard_pending_listing.json"
import offDone from "@/__tests__/fixtures/settings-c-producer/41_offboarded_listing.json"
import offStale from "@/__tests__/fixtures/settings-c-producer/43_offboard_refused_state_changed.json"
import reAdded from "@/__tests__/fixtures/settings-c-producer/45_re_added_listing.json"
import reAddGateClosed from "@/__tests__/fixtures/settings-c-producer/46_re_add_refused_gate_closed.json"

const CUSTOMER = "acme"
const MEMBER = "222222222222"
const LIST = `/api/proxy/admin/accounts?customer_id=${CUSTOMER}`

type Capture = { name: string; captured_at: string; body: { accounts: Array<Record<string, any>> } & Record<string, any> } & Record<string, any>

const rowOf = (capture: Capture) => capture.body.accounts.find((account) => account.account_id === MEMBER) as Record<string, any>
const registrationOf = (capture: Capture) => rowOf(capture).registration as Record<string, any>

let fetchMock: ReturnType<typeof vi.fn>
let current: Capture
const posts: Array<{ url: string; body: Record<string, unknown> }> = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function install(capture: Capture, answer?: (url: string) => Response, connect?: Capture) {
  current = capture
  posts.length = 0
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    if (url === LIST && method === "GET") return json(current.body)
    if (url === `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}` && method === "GET") {
      return json({ customer_id: CUSTOMER, state: "NOT_RUN" })
    }
    if (connect && url === `/api/proxy/admin/accounts/${MEMBER}/connect?customer_id=${CUSTOMER}` && method === "GET") {
      return json(connect.connect_response.body)
    }
    if (method === "POST") {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} })
      return answer ? answer(url) : json({ customer_id: CUSTOMER, account_id: MEMBER, request_status: "queued", already_open: false }, 202)
    }
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
}

async function mount(capture: Capture, now: number, answer?: (url: string) => Response, connect?: Capture) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now })
  install(capture, answer, connect)
  render(<AccountSettingsPage />)
  return screen.findByTestId(`account-row-${MEMBER}`)
}

const at = (capture: Capture) => Date.parse(capture.captured_at)
const step = (row: HTMLElement) => within(row).getByTestId(`registration-step-${MEMBER}`)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the producer's captures are what this suite renders", () => {
  it.each([pending, refused, checking, confirmable, activating, partially, allQueued, blocked, activationFailed, held, released,
             firstCheck, recheck] as Capture[])(
    "$name carries the member row with its registration progress", (capture) => {
      expect(rowOf(capture).collection_mode).toBe("MEMBER_READ_ROLE")
      expect(registrationOf(capture).registration_id).toMatch(/^[0-9a-f]{32}$/)
    })
})

describe("pending: nothing is read until access is checked", () => {
  it("an unverified registration says so, offers Connect and Check access, never Check connection", async () => {
    const row = await mount(pending as Capture, at(pending as Capture))
    expect(step(row)).toHaveAttribute("data-step", "CHECK_ACCESS")
    expect(step(row)).toHaveTextContent("Not verified: Cyntro has read nothing in this account.")
    expect(step(row)).toHaveTextContent("Cyntro assumes CyntroRead-acme there and asks AWS which account answered, and its name.")
    expect(within(row).getByRole("button", { name: `Connect ${MEMBER}` })).toBeInTheDocument()
    expect(within(row).queryByRole("button", { name: /Check connection/ })).toBeNull()
    expect(within(row).queryByTestId(`first-collection-${MEMBER}`)).toBeNull()
  })

  it("Check access sends exactly the registration and version the row shows, to the access-check route", async () => {
    const row = await mount(pending as Capture, at(pending as Capture))
    fireEvent.click(within(row).getByRole("button", { name: `Check access to ${MEMBER}` }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(pending as Capture)
    expect(posts[0]).toEqual({
      url: `/api/proxy/admin/accounts/${MEMBER}/access-check?customer_id=${CUSTOMER}`,
      body: { registration_id: registration.registration_id, registration_version: registration.registration_version },
    })
  })

  it("a refused check is named, and the next step is checking again", async () => {
    const row = await mount(refused as Capture, at(refused as Capture))
    expect(within(row).getByTestId(`access-refused-${MEMBER}`)).toHaveTextContent(
      `Cyntro could not use CyntroRead-acme in account ${MEMBER} (AccessDenied). The connection stack must be deployed in ${MEMBER} ` +
      "itself: sign in, check the account ID at the top right of the AWS console, and create the stack there if it is not. A stack " +
      "in any other account does not count. Then check access again.")
    expect(within(row).getByRole("button", { name: `Check access to ${MEMBER}` })).toHaveTextContent("Check access again")
  })

  it("the producer's own 409 for a held step is said in its words, and nothing else is sent", async () => {
    const refusal = (held as Capture).refused_post
    const row = await mount(pending as Capture, at(pending as Capture), () => json(refusal.body, refusal.status))
    fireEvent.click(within(row).getByRole("button", { name: `Check access to ${MEMBER}` }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Check access failed (HTTP 409): ${refusal.body.detail.reason}`)
    expect(posts).toHaveLength(1)
  })
})

describe("while the connector works, nothing is offered", () => {
  it.each([[checking, "CHECKING"], [activating, "ACTIVATING"]] as const)("%#: %s", async (capture, kind) => {
    const row = await mount(capture as Capture, at(capture as Capture))
    expect(step(row)).toHaveAttribute("data-step", kind)
    expect(within(step(row)).queryAllByRole("button")).toHaveLength(0)
  })
})

describe("confirmation: the check reached, the operator confirms THAT check", () => {
  const check = registrationOf(confirmable as Capture).access_check
  const observed = Date.parse(check.identity_observed_at)

  it("shows what was reached, the name AWS holds and until when it can be confirmed; confirming sends that check", async () => {
    const row = await mount(confirmable as Capture, observed + 60_000)
    expect(step(row)).toHaveAttribute("data-step", "CONFIRM")
    expect(step(row)).toHaveTextContent(`Cyntro reached account ${MEMBER} through CyntroRead-acme, which trusts this installation`)
    expect(step(row)).toHaveTextContent("Name in AWS: prod-payments")
    expect(step(row)).toHaveTextContent(
      `Confirm before ${formatUtcInstantExact(new Date(observed + ACTIVATION_CHECK_MAX_AGE_MS).toISOString())}`)
    fireEvent.click(within(row).getByRole("button", { name: `Confirm account ${MEMBER}` }))
    const dialog = await screen.findByRole("dialog", { name: `Start collecting from ${MEMBER}?` })
    expect(within(dialog).getByTestId("confirm-name")).toHaveTextContent("Name in AWS: prod-payments")
    expect(dialog).toHaveTextContent("It does not prove who owns the account")
    expect(posts).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm and start collecting/ }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(confirmable as Capture)
    expect(posts[0]).toEqual({
      url: `/api/proxy/admin/accounts/${MEMBER}/activate?customer_id=${CUSTOMER}`,
      body: { registration_id: registration.registration_id, registration_version: registration.registration_version,
              check_id: check.check_id },
    })
  })

  it("a check exactly 15 minutes old is not confirmable: the page offers checking again instead", async () => {
    const row = await mount(confirmable as Capture, observed + ACTIVATION_CHECK_MAX_AGE_MS)
    expect(step(row)).toHaveAttribute("data-step", "CHECK_EXPIRED")
    expect(within(row).queryByRole("button", { name: `Confirm account ${MEMBER}` })).toBeNull()
    expect(within(row).getByRole("button", { name: `Check access to ${MEMBER}` })).toHaveTextContent("Check access again")
  })

  it("an open confirmation reads the wall clock again at the click: a check that expired sends nothing", async () => {
    const row = await mount(confirmable as Capture, observed + ACTIVATION_CHECK_MAX_AGE_MS - 1_000)
    fireEvent.click(within(row).getByRole("button", { name: `Confirm account ${MEMBER}` }))
    const dialog = await screen.findByRole("dialog", { name: `Start collecting from ${MEMBER}?` })
    vi.setSystemTime(observed + ACTIVATION_CHECK_MAX_AGE_MS)       // the clock moves; no timer has run
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm and start collecting/ }))
    expect(await within(dialog).findByTestId("confirm-stale")).toHaveTextContent("Nothing was sent.")
    expect(posts).toHaveLength(0)
  })

  it("an open page turns a confirmable check into check-again on its own when it expires", async () => {
    const row = await mount(confirmable as Capture, observed + ACTIVATION_CHECK_MAX_AGE_MS - 1_000)
    expect(step(row)).toHaveAttribute("data-step", "CONFIRM")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(step(row)).toHaveAttribute("data-step", "CHECK_EXPIRED")
  })
})

describe("a result arriving on the open page is judged by the clock NOW (Codex S4 20fc F1)", () => {
  const observedOf = (capture: Capture) => Date.parse(registrationOf(capture).access_check.identity_observed_at)
  const refresh = () => fireEvent.click(screen.getByRole("button", { name: "Refresh accounts" }))
  const stepNow = () => step(screen.getByTestId(`account-row-${MEMBER}`))

  it("pending -> a check that reached, published through Refresh on the same mounted page, is confirmable", async () => {
    const observed = observedOf(confirmable as Capture)
    const row = await mount(pending as Capture, observed - 60_000)
    expect(step(row)).toHaveAttribute("data-step", "CHECK_ACCESS")
    vi.setSystemTime(observed + 1_000)
    current = confirmable as Capture
    refresh()
    await waitFor(() => expect(stepNow()).toHaveAttribute("data-step", "CONFIRM"))
  })

  it("a page opened long before the check (the stack deployed meanwhile) shows Confirm when the result arrives", async () => {
    // More than the 15-minute bound between the page's first render and the check: no clock-boundary wake-up can bridge
    // that, so only judging every render by the current clock shows the fresh check as confirmable.
    const observed = observedOf(confirmable as Capture)
    const row = await mount(pending as Capture, observed - 20 * 60_000)
    expect(step(row)).toHaveAttribute("data-step", "CHECK_ACCESS")
    vi.setSystemTime(observed + 1_000)
    current = confirmable as Capture
    refresh()
    await waitFor(() => expect(stepNow()).toHaveAttribute("data-step", "CONFIRM"))
    expect(stepNow()).not.toHaveTextContent("ahead of this browser's clock")
  })

  it("checking -> confirmable arrives through the page's own poll, with no Refresh and no remount", async () => {
    const observed = observedOf(confirmable as Capture)
    const row = await mount(checking as Capture, observed - 30_000)     // its open request keeps the page polling
    expect(step(row)).toHaveAttribute("data-step", "CHECKING")
    vi.setSystemTime(observed + 2_000)
    current = confirmable as Capture
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500)
    })
    await waitFor(() => expect(stepNow()).toHaveAttribute("data-step", "CONFIRM"))
  })

  it("expiry -> a fresh re-check on the same page is confirmable again, and confirming sends the NEW check", async () => {
    const first = observedOf(firstCheck as Capture)
    const row = await mount(firstCheck as Capture, first + 60_000)
    expect(step(row)).toHaveAttribute("data-step", "CONFIRM")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVATION_CHECK_MAX_AGE_MS)
    })
    expect(stepNow()).toHaveAttribute("data-step", "CHECK_EXPIRED")
    vi.setSystemTime(observedOf(recheck as Capture) + 30_000)
    current = recheck as Capture
    refresh()
    await waitFor(() => expect(stepNow()).toHaveAttribute("data-step", "CONFIRM"))
    fireEvent.click(screen.getByRole("button", { name: `Confirm account ${MEMBER}` }))
    const dialog = await screen.findByRole("dialog", { name: `Start collecting from ${MEMBER}?` })
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm and start collecting/ }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(recheck as Capture)
    expect(registration.access_check.check_id).not.toBe(registrationOf(firstCheck as Capture).access_check.check_id)
    expect(posts[0].body).toEqual({ registration_id: registration.registration_id,
                                    registration_version: registration.registration_version,
                                    check_id: registration.access_check.check_id })
  })

  it("a check recorded ahead of this browser's clock says so, then becomes confirmable on its own", async () => {
    const observed = observedOf(confirmable as Capture)
    const row = await mount(confirmable as Capture, observed - 2_000)
    expect(step(row)).toHaveAttribute("data-step", "CHECK_EXPIRED")
    expect(step(row)).toHaveTextContent("ahead of this browser's clock; it can be confirmed once the clock reaches it.")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(stepNow()).toHaveAttribute("data-step", "CONFIRM")
  })
})

describe("collection starts: pending or blocked, never 'collected'", () => {
  it.each([
    [partially, "First collection being queued: 10 of 31 inventory work items queued."],
    [blocked, "First collection blocked: 0 of 31 inventory work items queued; this installation has no inventory queue configured; an installation administrator must configure one."],
  ] as const)("%#: the first collection is said as the queue holds it", async (capture, text) => {
    const row = await mount(capture as Capture, at(capture as Capture))
    expect(within(row).getByTestId(`first-collection-${MEMBER}`)).toHaveTextContent(text)
  })

  it("all queued is dispatch, not collection, and the date is the queue's", async () => {
    const row = await mount(allQueued as Capture, at(allQueued as Capture))
    const dispatch = registrationOf(allQueued as Capture).first_inventory_dispatch
    expect(within(row).getByTestId(`first-collection-${MEMBER}`)).toHaveTextContent(
      `First collection queued: the queue accepted all 31 inventory work items on ${formatUtcInstantExact(dispatch.completed_at)}. Queued is not collected yet.`)
  })

  it.each([partially, allQueued, blocked] as const)("%#: CONNECTED is dated by its last check and never said to be live", async (capture) => {
    const row = await mount(capture as Capture, at(capture as Capture))
    expect(within(row).getByTestId(`last-check-${MEMBER}`)).toHaveTextContent(
      `Last connection check ${formatUtcInstantExact(rowOf(capture as Capture).last_validated_at)} reached the account. ` +
      "That is when access was last proven, not a live check.")
    expect(row).not.toHaveTextContent(/fully collected|collection complete|access verified now/i)
    expect(within(row).getByRole("button", { name: /Check connection/ })).toBeInTheDocument()   // the connected lifecycle's own check
  })
})

describe("recovery the journey's states need", () => {
  it("a failed activation names its step and retries the SAME confirmed check", async () => {
    const row = await mount(activationFailed as Capture, at(activationFailed as Capture))
    expect(step(row)).toHaveTextContent("Activation failed: Cyntro could not use its read role in the account (MEMBER_ROLE_UNAVAILABLE).")
    expect(step(row)).toHaveTextContent("Nothing is collected and reads are off.")
    expect(within(row).queryByTestId(`first-collection-${MEMBER}`)).toBeNull()          // no first collection before activation
    fireEvent.click(within(row).getByRole("button", { name: `Retry activation of ${MEMBER}` }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(activationFailed as Capture)
    expect(posts[0]).toEqual({
      url: `/api/proxy/admin/accounts/${MEMBER}/activate?customer_id=${CUSTOMER}`,
      body: { registration_id: registration.registration_id, registration_version: registration.registration_version,
              check_id: registration.activation.check_id },
    })
  })

  it("a held step says why and that releasing reads nothing; Release sends the registration and version", async () => {
    const row = await mount(held as Capture, at(held as Capture))
    expect(step(row)).toHaveAttribute("data-step", "HELD")
    expect(step(row)).toHaveTextContent("The access check could not record its result or move the account on.")
    expect(step(row)).toHaveTextContent("Releasing makes no AWS call: the account goes back to a pending account whose access can be checked again, with reads off.")
    expect(screen.getByText(/could not be moved out of CHECKING/)).toBeInTheDocument()     // the producer's failed-request detail
    fireEvent.click(within(row).getByRole("button", { name: `Release account ${MEMBER}` }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(held as Capture)
    expect(posts[0]).toEqual({
      url: `/api/proxy/admin/accounts/${MEMBER}/release?customer_id=${CUSTOMER}`,
      body: { registration_id: registration.registration_id, registration_version: registration.registration_version },
    })
  })

  it("after a release the account is pending again, and its access can be checked", async () => {
    const row = await mount(released as Capture, at(released as Capture))
    expect(step(row)).toHaveAttribute("data-step", "CHECK_ACCESS")
    expect(within(row).getByRole("button", { name: `Check access to ${MEMBER}` })).toBeEnabled()
  })
})

describe("the Connect panel of a pending account", () => {
  it("shows the stack, and its last step is the access check -- never Check connection", async () => {
    const row = await mount(connectPending as Capture, at(connectPending as Capture), undefined, connectPending as Capture)
    fireEvent.click(within(row).getByRole("button", { name: `Connect ${MEMBER}` }))
    const panel = await screen.findByRole("dialog", { name: MEMBER })
    expect(await within(panel).findByText("Check access, then confirm")).toBeInTheDocument()
    expect(within(panel).getByTestId("connect-parameter-ExternalId")).toBeInTheDocument()
    expect(within(panel).queryByRole("button", { name: "Check connection" })).toBeNull()
    fireEvent.click(within(panel).getByRole("button", { name: `Check access to ${MEMBER}` }))
    await waitFor(() => expect(posts.map((post) => post.url)).toEqual([`/api/proxy/admin/accounts/${MEMBER}/access-check?customer_id=${CUSTOMER}`]))
  })
})


// ── Stage1B (1B-3): a listed account waits for its check and confirmation (G9); the first inventory from its own runs (K2);
// refusals worded by their stable codes. Every row below is the producer's own (fixtures 14-22, backend 28b2b7d9).

const firstInventoryOutcomeOf = (capture: Capture) => registrationOf(capture).first_inventory as Record<string, any>
const asOf = (capture: Capture) => `(as of ${formatUtcInstantExact(firstInventoryOutcomeOf(capture).observed_at)})`

describe("1B-3: the producer's new captures are what this suite renders", () => {
  it.each([listedPending, k2Queued, k2Collecting, k2Collected, k2Failed, k2Unavailable] as Capture[])(
    "$name carries this registration's evidence and first inventory, bound to it", (capture) => {
      expect(registrationOf(capture).listed_evidence.kind).toBe("ORGANIZATION_LIST")
      expect(firstInventoryOutcomeOf(capture).registration_id).toBe(registrationOf(capture).registration_id)
      expect(firstInventoryOutcomeOf(capture).scope).toBe("INVENTORY_BOOTSTRAP")
    })
})

describe("G9: a listed account is checked and confirmed like any other", () => {
  it("found in the list is said with its date, never as verified access; Check access is the next step", async () => {
    const row = await mount(listedPending as Capture, at(listedPending as Capture))
    const evidence = registrationOf(listedPending as Capture).listed_evidence
    expect(step(row)).toHaveAttribute("data-step", "CHECK_ACCESS")
    expect(within(row).getByTestId(`listed-evidence-${MEMBER}`)).toHaveTextContent(
      `Found in your organization's list on ${formatUtcInstantExact(evidence.at)}.`)
    expect(step(row)).toHaveTextContent("Cyntro has read nothing in this account yet.")
    expect(step(row)).toHaveTextContent("Collection starts only when you confirm.")
    expect(step(row)).not.toHaveTextContent(/Not verified|connected|collecting/)
    expect(within(row).getByRole("button", { name: `Check access to ${MEMBER}` })).toHaveTextContent("Check access")
    expect(within(row).queryByTestId(`first-collection-${MEMBER}`)).toBeNull()
  })

  it("while it is being recorded nothing is offered, and the page's own poll shows it pending with no Refresh", async () => {
    const row = await mount(listedAdmitted as Capture, at(listedAdmitted as Capture))
    expect(step(row)).toHaveAttribute("data-step", "RECORDING_LISTED")
    expect(step(row)).toHaveTextContent(
      "Recording this account from your organization's list. Nothing is read in it; you check access and confirm next.")
    expect(within(row).queryByRole("button", { name: /Check access|Confirm/ })).toBeNull()
    current = listedPending as Capture
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(step(screen.getByTestId(`account-row-${MEMBER}`))).toHaveAttribute("data-step", "CHECK_ACCESS"))
    expect(posts).toHaveLength(0)
  })
})

describe("K2: the first inventory, from the runs of exactly this registration's work", () => {
  const text = async (capture: Capture) => {
    const row = await mount(capture, at(capture))
    const status = within(row).getByTestId(`first-collection-${MEMBER}`)
    expect(status).toHaveAttribute("data-source", "runs")
    expect(row).toHaveTextContent("Inventory only: CloudTrail and VPC flow logs are collected on their own schedule and are not part of this status.")
    return status
  }

  it("queued is said as queued, never collected", async () => {
    expect(await text(k2Queued as Capture)).toHaveTextContent(
      `First inventory queued: 31 work items waiting to start, 0 collected ${asOf(k2Queued as Capture)}. Queued is not collected.`)
  })

  it("one run collecting is counted from the runs", async () => {
    expect(await text(k2Collecting as Capture)).toHaveTextContent(
      `First inventory collecting: 0 of 31 work items collected, 1 in progress, 30 waiting ${asOf(k2Collecting as Capture)}.`)
  })

  it("collected means the evidence is committed: never completed, never in the map, never empty, never a count", async () => {
    const status = await text(k2Collected as Capture)
    expect(status).toHaveTextContent(
      `First inventory collected: the evidence of all 31 work items is committed ${asOf(k2Collected as Capture)}. ` +
      "Whether it appears in the map yet is not part of this status.")
    expect(status).not.toHaveTextContent(/complete|finished|empty|nothing found|zero|facts|resource record/i)
  })

  it("a failed run outranks the rest and its class is said verbatim, with who can act -- never a role inferred from it", async () => {
    const classes = (firstInventoryOutcomeOf(k2Failed as Capture).items as Array<Record<string, any>>)
      .filter((item) => item.state === "FAILED").map((item) => item.error_class)
    expect(classes).toEqual(["ACCESS_DENIED"])
    const status = await text(k2Failed as Capture)
    expect(status).toHaveTextContent(
      `First inventory failed for 1 work item (ACCESS_DENIED); your installer or Cyntro support can act on it ${asOf(k2Failed as Capture)}.`)
    expect(status).not.toHaveTextContent(/CyntroRead|retries|will retry/)
  })

  it("work the queue refused is blocked by the dispatch's reason, with what was queued counted beside it", async () => {
    const outcome = firstInventoryOutcomeOf(k2Blocked as Capture)
    expect([outcome.counts.collected, outcome.counts.intended]).toEqual([10, 21])
    const status = await text(k2Blocked as Capture)
    expect(status).toHaveTextContent(
      `First inventory blocked: 21 of 31 work items could not be queued; the queue refused the work (${outcome.reason}).`)
    expect(outcome.reason).toMatch(/^SEND_FAILED:/)
  })

  it("a status that cannot be read is said so, and is never a result", async () => {
    const status = await text(k2Unavailable as Capture)
    expect(status).toHaveTextContent(
      "First inventory status cannot be read now: this installation's console cannot read collection runs. This is not a result.")
    expect(status).not.toHaveTextContent(/queued|collected|collecting/)
  })
})

describe("refusals are worded by their stable codes: what happened, who acts, what to do", () => {
  it.each([
    [gateClosed, "This installation is not verified for new accounts. Your Cyntro installer finishes or re-runs the install; then try again. Nothing was changed."],
    [historyPresent, "This account already has collection history in this installation, so it cannot be connected here as a new account. Do not register it again; contact Cyntro support. Nothing was changed."],
  ] as const)("%#: the code's words lead, and the connector's own detail follows", async (capture, words) => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(capture as Capture) })
    install(capture as Capture)
    render(<AccountSettingsPage />)
    const outcome = await screen.findByTestId(`failure-outcome-${MEMBER}`)
    expect(outcome).toHaveTextContent(words)
    const failure = (capture as Capture).body.failed_requests[0]
    expect(outcome.closest("[role=alert]")).toHaveTextContent(failure.detail)
  })
})


// ── Gaps (Alon 2026-10-05): removing a registration that was never activated; the first inventory's measured count; the
// page's poll rule. Rows 24-28 are the producer's own (backend c51a8075, fixtures README).

const removeButton = (row: HTMLElement) => within(row).queryByRole("button", { name: `Remove account ${MEMBER}` })

describe("Remove: only a registration that was never activated, after saying what removing does", () => {
  it.each([
    ["pending", pending, 0],
    ["confirmable", confirmable, 0],
    ["confirmable no longer (checked more than 15 minutes ago)", confirmable, ACTIVATION_CHECK_MAX_AGE_MS + 60_000],
  ] as const)("%s: the dialog says it, and Remove sends exactly the row's registration and version", async (_label, capture, later) => {
    const row = await mount(capture as Capture, at(capture as Capture) + later)
    fireEvent.click(removeButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: `Remove ${MEMBER} from Cyntro?` })
    expect(dialog).toHaveTextContent("This account was never confirmed: reading is off and nothing has been collected from it.")
    expect(dialog).toHaveTextContent(
      "Removing makes no AWS call and changes nothing in the account. A connection stack deployed there stays until it is deleted in that account.")
    expect(dialog).toHaveTextContent("The account leaves this list. Cyntro keeps the registration as a record of who removed it and when.")
    expect(dialog).toHaveTextContent("You can add the account again later; it starts as a new registration.")
    expect(posts).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove account" }))
    await waitFor(() => expect(posts).toHaveLength(1))
    const registration = registrationOf(capture as Capture)
    expect(posts[0]).toEqual({
      url: `/api/proxy/admin/accounts/${MEMBER}/withdraw?customer_id=${CUSTOMER}`,
      body: { registration_id: registration.registration_id, registration_version: registration.registration_version },
    })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: `Remove ${MEMBER} from Cyntro?` })).toBeNull())
  })

  it("Cancel sends nothing", async () => {
    const row = await mount(pending as Capture, at(pending as Capture))
    fireEvent.click(removeButton(row) as HTMLElement)
    const dialog = await screen.findByRole("dialog", { name: `Remove ${MEMBER} from Cyntro?` })
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog", { name: `Remove ${MEMBER} from Cyntro?` })).toBeNull()
    expect(posts).toHaveLength(0)
  })

  it.each([checking, activating, held, listedAdmitted] as Capture[])(
    "$name: not offered (checking, activating, held or being recorded)", async (capture) => {
      const row = await mount(capture, at(capture))
      expect(removeButton(row)).toBeNull()
    })

  it.each([activationFailed, allQueued, k2Collected] as Capture[])(
    "$name: an activated account is removed by the offboarding dialog, never by this one", async (capture) => {
      const row = await mount(capture, at(capture))
      fireEvent.click(removeButton(row) as HTMLElement)
      expect(await screen.findByRole("dialog", { name: /^Remove .*222222222222.* from Cyntro\?$/ })).toHaveTextContent(
        "Type the account ID to confirm")
      expect(screen.queryByText("This account was never confirmed: reading is off and nothing has been collected from it.")).toBeNull()
    })

  it("while the removal is open the row says so and offers nothing; once recorded the account leaves the list", async () => {
    expect((withdrawRequested as Capture).withdraw_response.status).toBe(202)
    const row = await mount(withdrawRequested as Capture, at(withdrawRequested as Capture))
    expect(row).toHaveTextContent("Removal queued")
    expect(removeButton(row)).toBeDisabled()
    expect(within(row).getByRole("button", { name: `Check access to ${MEMBER}` })).toBeDisabled()
    expect((withdrawn as Capture).body.accounts.some((account) => account.account_id === MEMBER)).toBe(false)
    current = withdrawn as Capture
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(screen.queryByTestId(`account-row-${MEMBER}`)).toBeNull())
    expect(posts).toHaveLength(0)
  })

  it("a removal overtaken by an access check is said by its own reason; the account stays, confirmable", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(withdrawRefused as Capture) })
    install(withdrawRefused as Capture)
    render(<AccountSettingsPage />)
    const failure = (withdrawRefused as Capture).body.failed_requests[0]
    const alert = (await screen.findByText(`Removal for ${MEMBER} failed`)).closest("[role=alert]") as HTMLElement
    expect(alert).toHaveTextContent(failure.detail)
    expect(failure.detail).toMatch(/^account 222222222222 changed after the removal was asked for \(version 1, now 3\)/)
    const row = screen.getByTestId(`account-row-${MEMBER}`)
    expect(step(row)).toHaveAttribute("data-step", "CONFIRM")
    expect(removeButton(row)).toBeEnabled()
  })
})

describe("K2: a count only from runs that measured it", () => {
  const status = async (capture: Capture) => {
    const row = await mount(capture, at(capture))
    return within(row).getByTestId(`first-collection-${MEMBER}`)
  }

  it("every item measured by the inventory handler itself: the resource records it emitted are counted", async () => {
    const outcome = firstInventoryOutcomeOf(k2Measured as Capture)
    const items = outcome.items as Array<Record<string, any>>
    expect(items.every((item) => typeof item.facts_emitted === "number")).toBe(true)
    expect(outcome.facts_emitted_total).toBe(items.reduce((sum, item) => sum + item.facts_emitted, 0))
    expect(await status(k2Measured as Capture)).toHaveTextContent(
      `First inventory collected: the evidence of all 31 work items is committed, ${outcome.facts_emitted_total} resource records ` +
      `${asOf(k2Measured as Capture)}. Whether it appears in the map yet is not part of this status.`)
  })

  it("all measured at zero is said as what the reads returned, never as an empty account", async () => {
    expect(firstInventoryOutcomeOf(k2ZeroFacts as Capture).state).toBe("COLLECTED_ZERO_FACTS")
    const text = await status(k2ZeroFacts as Capture)
    expect(text).toHaveTextContent(
      `First inventory collected: all 31 work items committed their evidence and recorded no resources ${asOf(k2ZeroFacts as Capture)}. ` +
      "That is what these inventory reads returned in the account's Regions, not a claim that the account holds nothing.")
    expect(text).not.toHaveTextContent(/state Cyntro does not know|is empty|nothing found/)
  })
})

// ── First-account QA M1 (Alon 2026-10-08): held, partly collected, collected and empty are four answers, never one ──────
describe("M1: a source Cyntro could not read is never said as collected", () => {
  const status = async (capture: Capture) => {
    const row = await mount(capture, at(capture))
    const node = within(row).getByTestId(`first-collection-${MEMBER}`)
    expect(node).toHaveAttribute("data-source", "runs")
    return node
  }
  const k8sItem = (capture: Capture) =>
    (firstInventoryOutcomeOf(capture).items as Array<Record<string, any>>).find((item) => item.source_type === "k8s_objects")!
  const collectedCount = (capture: Capture) =>
    (firstInventoryOutcomeOf(capture).items as Array<Record<string, any>>).filter((item) => item.state === "COLLECTED").length

  it("the producer's captures are the corrected backend's: SOURCE_HELD by its class, SOURCE_HELD by what an earlier run proves, PARTIAL", () => {
    expect([k8sHeld, k8sLegacy, k8sPartly].map((c) => [firstInventoryOutcomeOf(c as Capture).state, k8sItem(c as Capture).state]))
      .toEqual([["SOURCE_HELD", "SOURCE_HELD"], ["SOURCE_HELD", "SOURCE_HELD"], ["PARTIAL", "PARTIAL"]])
    expect(k8sItem(k8sHeld as Capture).error_class).toMatch(/^SOURCE_HELD:K8S_CLUSTERS_UNREADABLE:1\/1:cyntro-k8s-test=api:/)
    expect([k8sItem(k8sLegacy as Capture).run_status, k8sItem(k8sLegacy as Capture).reason]).toEqual(["EVIDENCE_COMMITTED", "NO_SCOPE_COMMITTED"])
    expect(k8sItem(k8sPartly as Capture).error_class).toMatch(/^K8S_CLUSTERS_PARTLY_HELD:1\/2:cyntro-k8s-test=api:/)
    for (const capture of [k8sHeld, k8sLegacy, k8sPartly] as Capture[]) {
      expect(firstInventoryOutcomeOf(capture).facts_emitted_total).toBeNull()
      expect(k8sItem(capture)).not.toHaveProperty("facts_emitted")
    }
  })

  it("held: incomplete, the collected count beside it, the held item by name with its run's own class -- never 'all committed'", async () => {
    const node = await status(k8sHeld as Capture)
    const klass = k8sItem(k8sHeld as Capture).error_class
    expect(node).toHaveTextContent(
      `First inventory incomplete: ${collectedCount(k8sHeld as Capture)} of 31 work items collected; 1 work item could not read its ` +
      `source and committed nothing: Kubernetes objects (${klass}) ${asOf(k8sHeld as Capture)}.`)
    expect(node).not.toHaveTextContent(/evidence of all|resource record|state Cyntro does not know/)
  })

  it("an earlier run of a held cluster says what it proves, not a class it never recorded", async () => {
    const node = await status(k8sLegacy as Capture)
    expect(node).toHaveTextContent(
      "1 work item could not read its source and committed nothing: Kubernetes objects (its run committed no cluster; " +
      "it was recorded before Cyntro recorded why)")
    expect(node).toHaveTextContent(/^First inventory incomplete: 30 of 31 work items collected/)
    expect(node).not.toHaveTextContent(/evidence of all|no class recorded|NO_SCOPE_COMMITTED/)
  })

  it("partly held: partly collected, by its class", async () => {
    const node = await status(k8sPartly as Capture)
    expect(node).toHaveTextContent(
      `First inventory partly collected: 1 work item ended partial (${k8sItem(k8sPartly as Capture).error_class}) ${asOf(k8sPartly as Capture)}.`)
    expect(node).not.toHaveTextContent(/evidence of all|incomplete/)
  })

  it("held, partly collected, collected and empty are four different answers", () => {
    const said = ([k8sHeld, k8sPartly, k2Measured, k2ZeroFacts] as Capture[]).map((capture) =>
      firstInventoryOutcomeText(firstInventoryOutcomeOf(capture) as never)!)
    expect(said.map((s) => s.text.split(":")[0])).toEqual([
      "First inventory incomplete", "First inventory partly collected", "First inventory collected", "First inventory collected"])
    expect(said.map((s) => s.tone)).toEqual(["blocked", "blocked", "done", "done"])
    // Collected and empty differ by what was measured: a count, or what the reads returned.
    expect(said[2].text).toMatch(/is committed, \d+ resource records/)
    expect(said[3].text).toContain("recorded no resources")
  })
})

describe("the page's poll rule (accountNeedsPolling)", () => {
  const WORKING = ["REGISTERING", "LISTED_ADMITTED", "CHECKING", "ACTIVATING"]
  const SETTLED = ["PENDING_UNVERIFIED", "ACCESS_CONFIRMABLE", "ACTIVATION_FAILED", "AWAITING_CONNECTION", "CONNECTION_FAILED",
                   "CONNECTED", "READY", "DEGRADED", "VALIDATION_HELD", "DISCOVERED"]

  it.each(WORKING)("%s is polled with or without an open request", (status) => {
    expect(accountNeedsPolling({ onboarding_status: status, pending_request: null })).toBe(true)
    expect(accountNeedsPolling({ onboarding_status: status, pending_request: { action: "register", status: "queued" } })).toBe(true)
  })

  it.each([k2Queued, k2Collecting] as Capture[])("$name: a first inventory still being collected keeps the page re-reading", (capture) => {
    const row = rowOf(capture)
    expect([row.onboarding_status, row.pending_request ?? null]).toEqual(["CONNECTED", null])
    expect(accountNeedsPolling(row as any)).toBe(true)
  })

  it.each([k2Collected, k2Failed, k2Blocked, k2Unavailable, k2Measured, k2ZeroFacts] as Capture[])(
    "$name: a first inventory that has stopped moving is not polled", (capture) => {
      expect(accountNeedsPolling(rowOf(capture) as any)).toBe(false)
    })

  it("the page itself follows a first inventory from queued to collected with no Refresh", async () => {
    const row = await mount(k2Queued as Capture, at(k2Queued as Capture))
    expect(within(row).getByTestId(`first-collection-${MEMBER}`)).toHaveTextContent("First inventory queued")
    current = k2Collected as Capture
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(within(screen.getByTestId(`account-row-${MEMBER}`)).getByTestId(`first-collection-${MEMBER}`))
      .toHaveTextContent("First inventory collected"))
    expect(posts).toHaveLength(0)
  })

  it.each(SETTLED)("%s is polled only while a request for it is open", (status) => {
    expect(accountNeedsPolling({ onboarding_status: status, pending_request: null })).toBe(false)
    expect(accountNeedsPolling({ onboarding_status: status })).toBe(false)
    expect(accountNeedsPolling({ onboarding_status: status, pending_request: { action: "withdraw", status: "queued" } })).toBe(true)
  })
})

describe("each member account opens its own page", () => {
  it("the account's name links to /accounts/{id} and Inventory to its Inventory tab; the platform account has neither", async () => {
    const row = await mount(k2Measured as Capture, at(k2Measured as Capture))
    expect(within(row).getByRole("link", { name: `Open account ${MEMBER}` })).toHaveAttribute("href", `/accounts/${MEMBER}`)
    expect(within(row).getByRole("link", { name: `Inventory of ${MEMBER}` })).toHaveAttribute("href", `/accounts/${MEMBER}?tab=inventory`)
    const platform = (k2Measured as Capture).body.accounts.find((account) => account.is_platform_account)
    if (platform) {
      const platformRow = screen.getByTestId(`account-row-${platform.account_id}`)
      expect(within(platformRow).queryByRole("link", { name: /Open account|Inventory of/ })).toBeNull()
    }
  })
})


// ── Offboarding (Alon 2026-10-06 sign-off): removing an ACTIVATED account. Rows 38-45 are the producer's own (backend
// d7b46ae7, fixtures README).

describe("Remove an activated account: what removing does, the account id typed, and the removed audit", () => {
  const dialogOf = () => screen.findByRole("dialog", { name: "Remove prod-payments (222222222222) from Cyntro?" })

  it("the dialog says what removing does; Remove waits for the account id typed exactly, then sends exactly the row's", async () => {
    const row = await mount(offActivated as Capture, at(offActivated as Capture))
    expect(rowOf(offActivated as Capture).onboarding_status).toBe("CONNECTED")
    fireEvent.click(removeButton(row) as HTMLElement)
    const dialog = await dialogOf()
    const explanation = within(dialog).getByTestId(`offboard-explanation-${MEMBER}`)
    expect(explanation).toHaveTextContent("Stops reading it: reading is turned off, and nothing more is collected or queued for it.")
    expect(explanation).toHaveTextContent("Takes its data out of Cyntro: it no longer appears in systems, maps or inventory.")
    expect(explanation).toHaveTextContent("Keeps what was collected as a record. Nothing is deleted.")
    expect(explanation).toHaveTextContent(
      "Changes nothing in the AWS account. The connection stack stays there and still trusts this installation: delete it in that account to revoke Cyntro's access.")
    const remove = within(dialog).getByRole("button", { name: "Remove account" })
    const input = within(dialog).getByRole("textbox", { name: `Type ${MEMBER} to confirm` })
    expect(remove).toBeDisabled()
    fireEvent.change(input, { target: { value: "22222222222" } })
    expect(remove).toBeDisabled()
    fireEvent.change(input, { target: { value: ` ${MEMBER} ` } })
    expect(remove).toBeEnabled()
    fireEvent.click(remove)
    await waitFor(() => expect(posts).toHaveLength(1))
    const sent = (offRequested as unknown as { request: { json: Record<string, unknown> } }).request
    expect(posts[0]).toEqual({ url: `/api/proxy/admin/accounts/${MEMBER}/offboard?customer_id=${CUSTOMER}`, body: sent.json })
    expect(sent.json.registration_version).toBe(registrationOf(offActivated as Capture).registration_version)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /from Cyntro\?$/ })).toBeNull())
  })

  it("Cancel sends nothing", async () => {
    const row = await mount(offActivated as Capture, at(offActivated as Capture))
    fireEvent.click(removeButton(row) as HTMLElement)
    const dialog = await dialogOf()
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(posts).toHaveLength(0)
  })

  it("while the removal is queued nothing is offered; once recorded the account leaves the list for the removed audit", async () => {
    const row = await mount(offPending as Capture, at(offPending as Capture))
    expect(row).toHaveTextContent("Removal queued")
    expect(removeButton(row)).toBeNull()
    current = offDone as Capture
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(screen.queryByTestId(`account-row-${MEMBER}`)).toBeNull())
    const removed = (offDone as Capture).body.removed[0]
    const audit = screen.getByTestId("removed-accounts")
    expect(audit).toHaveTextContent("Removed accounts (1)")
    expect(within(audit).getByTestId(`removed-${MEMBER}`)).toHaveTextContent(
      `prod-payments · ${MEMBER}Removed after it was connected by Alice Operator · ${formatUtcInstantExact(removed.at)}. ` +
      "Its collected evidence is kept; its connection stack may still be in the account.")
    expect(posts).toHaveLength(0)
  })

  it("a removal asked for an older version is said by its own reason; the account stays, removable", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(offStale as Capture) })
    install(offStale as Capture)
    render(<AccountSettingsPage />)
    const failure = (offStale as Capture).body.failed_requests[0]
    const alert = (await screen.findByText(`Removal for prod-payments (${MEMBER}) failed`)).closest("[role=alert]") as HTMLElement
    expect(alert).toHaveTextContent(failure.detail)
    expect(failure.outcome).toBe("REGISTRATION_STATE_CHANGED")
    // QA-05c: the finish time reads in UTC with its zone, like every other time on the page -- not the browser's local time.
    expect(alert).toHaveTextContent(`Finished ${formatUtcInstantExact(failure.finished_at)}`)
    expect(formatUtcInstantExact(failure.finished_at)).toMatch(/ UTC$/)
    expect(removeButton(screen.getByTestId(`account-row-${MEMBER}`))).toBeEnabled()
  })

  it("a removed account is added again at once: it is listed as a new registration and its removal stays in the audit (QA-11)",
    async () => {
      const row = await mount(reAdded as Capture, at(reAdded as Capture))
      expect(rowOf(reAdded as Capture).onboarding_status).toBe("PENDING_UNVERIFIED")
      expect(row).toHaveTextContent(MEMBER)
      const removed = (reAdded as Capture).body.removed[0]
      expect(removed.status).toBe("OFFBOARDED")
      const audit = screen.getByTestId("removed-accounts")
      expect(audit).toHaveTextContent("Removed accounts (1)")
      // This removal carried no name (the remover's token named nobody): the actor is shown, as before.
      expect(removed.by_display ?? null).toBeNull()
      expect(within(audit).getByTestId(`removed-${MEMBER}`)).toHaveTextContent(
        `Removed after it was connected by ${removed.by} · ${formatUtcInstantExact(removed.at)}.`)
    })

  it("an Add of a removed account refused for another reason names the account as its removal does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(reAddGateClosed as Capture) })
    install(reAddGateClosed as Capture)
    render(<AccountSettingsPage />)
    const failure = (reAddGateClosed as Capture).body.failed_requests[0]
    expect(failure.outcome).toBe("INSTALLATION_GATE_CLOSED")
    const alert = (await screen.findByText(`Registration for prod-payments (${MEMBER}) failed`)).closest("[role=alert]") as HTMLElement
    expect(within(alert).getByTestId(`failure-outcome-${MEMBER}`)).toHaveTextContent("This installation is not verified for new accounts.")
    expect(alert).toHaveTextContent(failure.detail)
    expect(screen.queryByTestId(`account-row-${MEMBER}`)).toBeNull()
    expect(within(screen.getByTestId("removed-accounts")).getByTestId(`removed-${MEMBER}`)).toBeInTheDocument()
  })
})
