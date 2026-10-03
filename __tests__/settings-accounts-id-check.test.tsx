/**
 * Settings > Accounts, Add an AWS account: the account ID is checked as it is typed or chosen (Alon, 2026-10-03; the
 * working default Codex stated to him: codex-settings-account-validation-2026-10-03.txt).
 *
 * Only an ID found in this customer's organization list from the last 24 hours, with nothing ruling it out, can be
 * reviewed and added; any other well-formed ID cannot be verified -- never said not to exist. The responses below are
 * TEST INPUTS shaped like the backend contract (api/account_registry.py `_member_listing`;
 * cyntro_data/accounts/org_discovery.py read_state). Nothing is asked for an ID: the only organization request a test
 * may see is the GET read.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme-prod", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import { useOrganizationDiscovery } from "@/components/settings/organization-account-picker"
import {
  ORGANIZATION_LIST_MAX_AGE_MS,
  checkAccountId,
  organizationListing,
  organizationListingBoundary,
  type AccountIdContext,
  type OrganizationDiscovery,
} from "@/lib/account-admin"

const CUSTOMER = "acme-prod"
const ORGANIZATION_GET = `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}`
const DISCOVER_POST = `/api/proxy/admin/accounts/organization/discover?customer_id=${CUSTOMER}`
const CLOCK = Date.parse("2026-10-03T09:20:00Z")
const MINUTE = 60_000
/** The well-formed ID Alon typed in the local preview: nothing anywhere says it is an account of this organization. */
const UNKNOWN = "454545454545"

const PLATFORM = {
  customer_id: CUSTOMER, account_id: "111122223333", display_name: "Cyntro platform account", environment: "SHARED_SERVICES",
  regions: ["eu-west-1"], onboarding_status: "REGISTERED", collection_mode: "LOCAL_CUSTOMER_PLANE", read_enabled: true,
  verification_enabled: true, mutation_enabled: false, sources: {}, pending_request: null, is_platform_account: true,
}
const MEMBER = (account_id: string, fields: Record<string, unknown> = {}) => ({
  ...PLATFORM, account_id, display_name: account_id, environment: "UNCLASSIFIED", collection_mode: "MEMBER_READ_ROLE",
  onboarding_status: "CONNECTED", is_platform_account: false, aws_account_name: null, ...fields,
})
const CONNECTED = MEMBER("777788889999", { aws_account_name: "Data platform" })
const REGISTERING = MEMBER("333344445555", {
  onboarding_status: "REGISTERING",
  pending_request: { action: "register", status: "queued", requested_at: "2026-10-03T09:00:00.000000+00:00" },
})

function memberList(accounts: Record<string, unknown>[]) {
  return {
    customer_id: CUSTOMER, mode: "MEMBER_ACCOUNTS", accounts, total: accounts.length, registry_available: true,
    member_trust: { platform_account_id: "111122223333", organization_id: "o-a1b2c3d4e5", ready: true },
    failed_requests: [], summary: { connected: 1, needs_attention: 0, discovered: 0, mutation_enabled: 0 },
  }
}

/** An AVAILABLE answer listed `age` ms before `at`. */
function listing(at: number, age = MINUTE, extra: Partial<OrganizationDiscovery> = {}): OrganizationDiscovery {
  return {
    customer_id: CUSTOMER,
    state: "AVAILABLE",
    discovered_at: new Date(at - age).toISOString(),
    organization_id: "o-a1b2c3d4e5",
    management_account_id: "999988887777",
    truncated: false,
    accounts: [
      { account_id: "111122223333", name: "Security tooling", state: "ACTIVE", selectable: false, why_not: "PLATFORM_ACCOUNT" },
      { account_id: "999988887777", name: "Management", state: "ACTIVE", selectable: false, why_not: "MANAGEMENT_ACCOUNT" },
      { account_id: "555566667777", name: "Old sandbox", state: "SUSPENDED", selectable: false, why_not: "STATE_SUSPENDED" },
      { account_id: "222233334444", name: "Checkout staging", state: "ACTIVE", selectable: true },
      // Offered by an older list, but added since: the registry knows better.
      { account_id: "777788889999", name: "Data platform", state: "ACTIVE", selectable: true },
    ],
    ...extra,
  }
}

const ONLY_LISTED = "Only an account in your organization's account list from the last 24 hours can be added here."

// ── the check itself ────────────────────────────────────────────────────────────────────────────────────────────

describe("checkAccountId", () => {
  const context = (organization: AccountIdContext["organization"], now = CLOCK): AccountIdContext => ({
    accounts: [PLATFORM, CONNECTED, REGISTERING], platformAccountId: "111122223333", organization, now,
  })
  const read = (answer: OrganizationDiscovery | null, state: { reading?: boolean; failed?: boolean } = {}) =>
    ({ answer, reading: state.reading ?? false, failed: state.failed ?? false })
  const current = context(read(listing(CLOCK)))

  it.each([
    ["4545454545454", "An AWS account ID has 12 digits; this has 13."],
    ["45454545454a", "An AWS account ID is 12 digits; this contains letters or other characters."],
    ["ACCOUNT", "An AWS account ID is 12 digits; this contains letters or other characters."],
    ["4545-4545-4545", "Enter the 12 digits only, without spaces or hyphens."],
    ["4545 4545 4545", "Enter the 12 digits only, without spaces or hyphens."],
    [" 222233334444", "Enter the 12 digits only, without spaces or hyphens."],
    ["222233334444 ", "Enter the 12 digits only, without spaces or hyphens."],
  ])("%j is refused as typed, never repaired into another ID", (raw, problem) => {
    expect(checkAccountId(raw, current)).toEqual({ state: "MALFORMED", problem, incomplete: false })
  })

  it("a short ID is still being typed, and nothing is typed is empty", () => {
    expect(checkAccountId("4545", current)).toEqual({ state: "MALFORMED", problem: "An AWS account ID has 12 digits; 4 entered so far.", incomplete: true })
    expect(checkAccountId("", current)).toEqual({ state: "EMPTY" })
  })

  it.each([
    ["the platform account", "111122223333", "This is the account Cyntro runs in; it is part of this installation already and is not added."],
    ["an added account", "777788889999", "This account is added already (Data platform)."],
    ["an account being added", "333344445555", "This account is being added already: Cyntro is still working on its registration."],
  ])("%s is refused by name, whatever the organization list says", (_label, id, reason) => {
    for (const organization of [read(listing(CLOCK)), read(null), read(null, { failed: true })]) {
      expect(checkAccountId(id, context(organization))).toMatchObject({ state: "INELIGIBLE", accountId: id, reason })
    }
  })

  it("the platform account is refused even when only the platform row names it", () => {
    expect(checkAccountId("111122223333", { ...current, platformAccountId: null }))
      .toMatchObject({ state: "INELIGIBLE", short: "The account Cyntro runs in" })
  })

  it("an added account with a connection check open is added, not being added", () => {
    const checking = MEMBER("246824682468", { pending_request: { action: "validate", status: "queued" } })
    expect(checkAccountId("246824682468", { ...current, accounts: [checking] })).toMatchObject({ state: "INELIGIBLE", short: "Already added" })
  })

  it.each([
    ["999988887777", "The organization's management account, according to your organization's list from 2026-10-03 09:19:00 UTC; it cannot be added."],
    ["555566667777", "Not active (SUSPENDED), according to your organization's list from 2026-10-03 09:19:00 UTC; it cannot be added."],
  ])("the organization's own restriction on %s holds for a typed ID", (id, reason) => {
    expect(checkAccountId(id, current)).toMatchObject({ state: "INELIGIBLE", reason })
  })

  it("a management account the list reports but does not list is still refused", () => {
    const answer = listing(CLOCK, MINUTE, { accounts: [] })
    expect(checkAccountId("999988887777", context(read(answer))))
      .toMatchObject({ state: "INELIGIBLE", short: "The organization's management account" })
  })

  it("an ACTIVE account the current list offers is found -- by name, with the listing time", () => {
    expect(checkAccountId("222233334444", current)).toEqual({
      state: "LISTED", accountId: "222233334444", name: "Checkout staging", listedAt: new Date(CLOCK - MINUTE).toISOString(),
    })
  })

  it("an ID the complete list does not hold cannot be verified -- not found in that list, never said not to exist", () => {
    const check = checkAccountId(UNKNOWN, current)
    expect(check).toEqual({
      state: "CANNOT_VERIFY", accountId: UNKNOWN, short: "Cannot be verified",
      reason: `Cannot verify this account. Not found in your organization's last list (listed 2026-10-03 09:19:00 UTC). ${ONLY_LISTED}`,
    })
    expect(JSON.stringify(check)).not.toMatch(/does not exist|not exist|invalid|no such/i)
  })

  it("an ID a list cut short does not hold cannot be verified, and the list is said to be cut short", () => {
    const answer = listing(CLOCK, MINUTE, { truncated: true })
    expect(checkAccountId(UNKNOWN, context(read(answer)))).toMatchObject({
      state: "CANNOT_VERIFY",
      reason: `Cannot verify this account. Your organization's last list (listed 2026-10-03 09:19:00 UTC) was cut short and does not include it. ${ONLY_LISTED}`,
    })
    // A row the cut-short list does hold is still found.
    expect(checkAccountId("222233334444", context(read(answer)))).toMatchObject({ state: "LISTED" })
  })

  it.each([
    ["nothing read yet", null, "Cyntro is reading your organization's account list."],
    ["a read in flight", read(listing(CLOCK), { reading: true }), "Cyntro is reading your organization's account list."],
    ["a failed read, even after a good one", read(listing(CLOCK), { failed: true }), "Cyntro could not read your organization's account list."],
    ["no answer", read(null), "Cyntro has not read your organization's account list."],
    ["NOT_RUN", read({ state: "NOT_RUN" }), "Your organization's accounts have not been listed for this installation."],
    ["RUNNING", read({ state: "RUNNING" }), "Your organization's accounts are still being listed."],
    ["EXPIRED", read({ state: "EXPIRED", accounts: listing(CLOCK).accounts }), "Your organization's last list is more than 24 hours old."],
    ["UNAVAILABLE", read({ state: "UNAVAILABLE", reason: "NOT_CONFIGURED" }), "Choosing from your organization is not set up for this installation."],
    ["an unknown state", read({ state: "SOMETHING_NEW", accounts: listing(CLOCK).accounts }), "Your organization's account list is in a state Cyntro does not know (SOMETHING_NEW)."],
  ])("%s: the ID cannot be verified, and the reason is the list's, not the ID's", (_label, organization, why) => {
    for (const id of ["222233334444", UNKNOWN]) {
      expect(checkAccountId(id, context(organization))).toMatchObject({
        state: "CANNOT_VERIFY", reason: `Cannot verify this account. ${why} ${ONLY_LISTED}`,
      })
    }
  })

  it.each([
    ["missing", undefined, "Your organization's last list has no valid listing time."],
    ["not a time", "yesterday", "Your organization's last list has no valid listing time."],
    ["a date without a time", "2026-10-03", "Your organization's last list has no valid listing time."],
    ["a time without a zone", "2026-10-03T09:19:00", "Your organization's last list has no valid listing time."],
    ["impossible", "2026-13-45T99:00:00Z", "Your organization's last list has no valid listing time."],
    ["in the future", "2026-10-03T09:21:00.000Z", "Your organization's last list has a listing time in the future (2026-10-03 09:21:00 UTC)."],
    ["exactly 24 hours old", new Date(CLOCK - ORGANIZATION_LIST_MAX_AGE_MS).toISOString(),
      "Your organization's last list (listed 2026-10-02 09:20:00 UTC) is more than 24 hours old."],
    ["older than 24 hours", "2026-10-01T08:00:00.000000+00:00",
      "Your organization's last list (listed 2026-10-01 08:00:00 UTC) is more than 24 hours old."],
  ])("a listing time that is %s never verifies a listed ID", (_label, discoveredAt, why) => {
    const answer = { ...listing(CLOCK), discovered_at: discoveredAt as string }
    expect(checkAccountId("222233334444", context(read(answer)))).toMatchObject({
      state: "CANNOT_VERIFY", reason: `Cannot verify this account. ${why} ${ONLY_LISTED}`,
    })
  })

  it("a listing one millisecond inside 24 hours still verifies; the wall clock decides", () => {
    const answer = listing(CLOCK, ORGANIZATION_LIST_MAX_AGE_MS - 1)
    expect(checkAccountId("222233334444", context(read(answer)))).toMatchObject({ state: "LISTED" })
    expect(checkAccountId("222233334444", context(read(answer), CLOCK + 1))).toMatchObject({ state: "CANNOT_VERIFY" })
  })

  it("organizationListing names the usable list; the boundary is when that changes", () => {
    const answer = listing(CLOCK)
    expect(organizationListing(read(answer), CLOCK)).toEqual({ listing: answer, listedAt: answer.discovered_at })
    expect(organizationListingBoundary(answer, CLOCK)).toBe(CLOCK - MINUTE + ORGANIZATION_LIST_MAX_AGE_MS)
    expect(organizationListingBoundary({ ...answer, discovered_at: new Date(CLOCK + MINUTE).toISOString() }, CLOCK)).toBe(CLOCK + MINUTE)
    expect(organizationListingBoundary({ ...answer, discovered_at: "2027-10-03T09:20:00Z" }, CLOCK)).toBeNull()   // never in range
    expect(organizationListingBoundary(listing(CLOCK, ORGANIZATION_LIST_MAX_AGE_MS), CLOCK)).toBeNull()
    expect(organizationListingBoundary({ ...answer, discovered_at: "yesterday" }, CLOCK)).toBeNull()
    expect(organizationListingBoundary({ state: "EXPIRED" }, CLOCK)).toBeNull()
  })
})

// ── the dialog ──────────────────────────────────────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: {
  list?: () => Record<string, unknown>
  organization: () => Response | Promise<Response>
  discover?: () => Response
  register?: (body: Record<string, unknown>) => Response
}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    if (url === ORGANIZATION_GET && method === "GET") return handlers.organization()
    if (url === DISCOVER_POST && method === "POST" && handlers.discover) return handlers.discover()
    if (url === "/api/proxy/admin/accounts" && method === "POST" && handlers.register) return handlers.register(JSON.parse(String(init?.body)))
    if (url === `/api/proxy/admin/accounts?customer_id=${CUSTOMER}` && method === "GET") {
      return json(handlers.list ? handlers.list() : memberList([PLATFORM, CONNECTED, REGISTERING]))
    }
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const calls = (predicate: (url: string, method: string) => boolean) =>
  fetchMock.mock.calls.filter(([input, init]) => predicate(String(input), (init as RequestInit | undefined)?.method || "GET"))
const writes = () => calls((_url, method) => method !== "GET")
const organizationReads = () => calls((url, method) => url === ORGANIZATION_GET && method === "GET")

async function openDialog() {
  render(<AccountSettingsPage />)
  await screen.findAllByTestId(/^account-row-/)
  fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
  return screen.findByRole("dialog", { name: "Add an AWS account" })
}

const typeId = (dialog: HTMLElement, value: string) =>
  fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value } })
const feedback = (dialog: HTMLElement) => within(dialog).getByTestId("account-id-check")
const review = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Review" })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: CLOCK })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Add AWS account — the ID is checked before Review", () => {
  it("Alon's 454545454545 with no organization answer (the local preview): cannot verify, Review off, nothing sent", async () => {
    installFetch({ organization: () => json({ detail: { code: "PREVIEW_CAPTURE_UNAVAILABLE" } }, 503) })
    const dialog = await openDialog()
    typeId(dialog, UNKNOWN)
    await waitFor(() => expect(feedback(dialog)).toHaveTextContent(
      `Cannot verify this account. Cyntro could not read your organization's account list. ${ONLY_LISTED}`))
    expect(review(dialog)).toBeDisabled()
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveAttribute("aria-invalid", "true")
    expect(within(dialog).getByLabelText("AWS account ID").getAttribute("aria-describedby")).toContain("add-account-id-check")
    fireEvent.click(review(dialog))
    expect(within(dialog).queryByTestId("add-account-confirmation")).toBeNull()
    expect(writes()).toHaveLength(0)
  })

  it("454545454545 when the current list does not hold it: not found in that list, Review off", async () => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    typeId(dialog, UNKNOWN)
    await waitFor(() => expect(feedback(dialog)).toHaveTextContent(
      `Cannot verify this account. Not found in your organization's last list (listed 2026-10-03 09:19:00 UTC). ${ONLY_LISTED}`))
    expect(review(dialog)).toBeDisabled()
    expect(writes()).toHaveLength(0)
  })

  it.each([
    ["13 digits", "4545454545454", "An AWS account ID has 12 digits; this has 13."],
    ["a letter", "45454545454a", "An AWS account ID is 12 digits; this contains letters or other characters."],
    ["hyphens", "2222-3333-4444", "Enter the 12 digits only, without spaces or hyphens."],
  ])("%s is shown exactly as typed and refused -- never trimmed into a listed ID", async (_label, raw, problem) => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    await waitFor(() => expect(organizationReads()).toHaveLength(1))
    typeId(dialog, raw)
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveValue(raw)
    expect(feedback(dialog)).toHaveTextContent(problem)
    expect(review(dialog)).toBeDisabled()
  })

  it("the platform account, an added one and one being added are refused by name before Review", async () => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    await waitFor(() => expect(organizationReads()).toHaveLength(1))
    for (const [id, reason] of [
      ["111122223333", "This is the account Cyntro runs in; it is part of this installation already and is not added."],
      ["777788889999", "This account is added already (Data platform)."],
      ["333344445555", "This account is being added already: Cyntro is still working on its registration."],
      ["999988887777", "The organization's management account, according to your organization's list from 2026-10-03 09:19:00 UTC; it cannot be added."],
      ["555566667777", "Not active (SUSPENDED), according to your organization's list from 2026-10-03 09:19:00 UTC; it cannot be added."],
    ]) {
      typeId(dialog, id)
      expect(feedback(dialog)).toHaveTextContent(reason)
      expect(review(dialog)).toBeDisabled()
    }
    expect(writes()).toHaveLength(0)
  })

  it("an eligible listed ID is found -- not connected -- and only Add account sends it, once", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      organization: () => json(listing(CLOCK)),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-03T09:20:01.000000+00:00" }, 202)
      },
    })
    const dialog = await openDialog()
    typeId(dialog, "222233334444")
    await waitFor(() => expect(review(dialog)).toBeEnabled())
    expect(feedback(dialog)).toHaveTextContent(
      "Found in your organization's account list from 2026-10-03 09:19:00 UTC, named “Checkout staging”. That shows it is in your organization, not that Cyntro can connect to it: the connection is checked after it is added.")
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveAttribute("aria-invalid", "false")
    fireEvent.click(review(dialog))
    expect(within(dialog).getByTestId("add-account-confirmation")).toHaveTextContent("Name in AWS OrganizationsCheckout staging")
    expect(registered).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await waitFor(() => expect(registered).toEqual([{ customer_id: CUSTOMER, account_id: "222233334444" }]))
    expect(calls((url) => url === DISCOVER_POST)).toHaveLength(0)
  })

  it("the organization path is held to the same check: an account the registry has added is not offered, whatever the list says", async () => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole("tab", { name: "Choose from your organization" }))
    const option = (id: string) => within(dialog).getByTestId(`organization-account-${id}`) as HTMLOptionElement
    await within(dialog).findByTestId("organization-account-777788889999")
    expect(option("777788889999")).toHaveTextContent("Data platform — 777788889999 (Already added)")
    expect(option("777788889999").disabled).toBe(true)
    expect(option("999988887777").disabled).toBe(true)
    expect(option("222233334444").disabled).toBe(false)
    fireEvent.change(within(dialog).getByLabelText("AWS account"), { target: { value: "777788889999" } })
    expect(within(dialog).getByRole("button", { name: "Use this account" })).toBeDisabled()
    expect(organizationReads()).toHaveLength(1)
    expect(writes()).toHaveLength(0)
  })

  it("an ID chosen from the list and then edited loses the list's evidence", async () => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole("tab", { name: "Choose from your organization" }))
    await within(dialog).findByTestId("organization-account-222233334444")
    fireEvent.change(within(dialog).getByLabelText("AWS account"), { target: { value: "222233334444" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Use this account" }))
    expect(within(dialog).getByTestId("chosen-from-organization")).toBeInTheDocument()
    expect(review(dialog)).toBeEnabled()

    typeId(dialog, UNKNOWN)
    expect(within(dialog).queryByTestId("chosen-from-organization")).toBeNull()
    expect(feedback(dialog)).toHaveTextContent("Cannot verify this account. Not found in your organization's last list")
    expect(review(dialog)).toBeDisabled()
    typeId(dialog, "2222333344445")
    expect(review(dialog)).toBeDisabled()
  })

  it("a refresh that fails takes back what the earlier list allowed", async () => {
    let fail = false
    installFetch({
      organization: () => (fail ? new Response("upstream unavailable", { status: 503 }) : json(listing(CLOCK))),
      discover: () => json({ customer_id: CUSTOMER, request_status: "queued", requested_at: "2026-10-03T09:20:01.000000+00:00", already_open: false }, 202),
    })
    const dialog = await openDialog()
    typeId(dialog, "222233334444")
    await waitFor(() => expect(review(dialog)).toBeEnabled())

    fail = true
    fireEvent.click(within(dialog).getByRole("tab", { name: "Choose from your organization" }))
    fireEvent.click(await within(dialog).findByRole("button", { name: "Find accounts again" }))   // an explicit ask
    await waitFor(() => expect(organizationReads()).toHaveLength(2))
    fireEvent.click(within(dialog).getByRole("button", { name: "Enter an account ID instead" }))
    await waitFor(() => expect(feedback(dialog)).toHaveTextContent(
      `Cannot verify this account. Cyntro could not read your organization's account list. ${ONLY_LISTED}`))
    expect(review(dialog)).toBeDisabled()
    expect(calls((url) => url === DISCOVER_POST)).toHaveLength(1)
  })

  it("a list that expires while the review is open stops the add; the wall clock is read again at Add account", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      organization: () => json(listing(CLOCK, ORGANIZATION_LIST_MAX_AGE_MS - 10_000)),   // 10 s left
      register: (body) => {
        registered.push(body)
        return json({}, 202)
      },
    })
    const dialog = await openDialog()
    typeId(dialog, "222233334444")
    await waitFor(() => expect(review(dialog)).toBeEnabled())
    fireEvent.click(review(dialog))
    expect(within(dialog).getByTestId("add-account-confirmation")).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
    expect(within(dialog).queryByTestId("add-account-confirmation")).toBeNull()
    expect(within(dialog).getByTestId("account-id-recheck")).toHaveTextContent(
      "is more than 24 hours old. Only an account in your organization's account list from the last 24 hours can be added here. Nothing was added.")
    expect(within(dialog).getByRole("button", { name: /Add account/ })).toBeDisabled()
    expect(registered).toHaveLength(0)
  })

  it("Review reads the wall clock itself: a list that expired without any timer firing opens no review", async () => {
    installFetch({ organization: () => json(listing(CLOCK)) })
    const dialog = await openDialog()
    typeId(dialog, "222233334444")
    await waitFor(() => expect(review(dialog)).toBeEnabled())
    vi.setSystemTime(CLOCK + ORGANIZATION_LIST_MAX_AGE_MS)   // the clock moves; no timer has run
    fireEvent.click(review(dialog))
    expect(within(dialog).queryByTestId("add-account-confirmation")).toBeNull()
    await waitFor(() => expect(feedback(dialog)).toHaveTextContent("is more than 24 hours old."))
    expect(writes()).toHaveLength(0)
  })

  it("the picker offers nothing from a list the backend still calls AVAILABLE but this page's clock finds 24 hours old", async () => {
    installFetch({ organization: () => json(listing(CLOCK, ORGANIZATION_LIST_MAX_AGE_MS + MINUTE)) })
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole("tab", { name: "Choose from your organization" }))
    const offered = await within(dialog).findByTestId("organization-account-222233334444") as HTMLOptionElement
    expect(offered.disabled).toBe(true)
    expect(offered).toHaveTextContent("Checkout staging — 222233334444 (Cannot be verified)")
    fireEvent.change(within(dialog).getByLabelText("AWS account"), { target: { value: "222233334444" } })
    expect(within(dialog).getByRole("button", { name: "Use this account" })).toBeDisabled()
  })

  it("Add account reads the wall clock itself: a list that expired without any timer firing sends nothing", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      organization: () => json(listing(CLOCK)),
      register: (body) => {
        registered.push(body)
        return json({}, 202)
      },
    })
    const dialog = await openDialog()
    typeId(dialog, "222233334444")
    await waitFor(() => expect(review(dialog)).toBeEnabled())
    fireEvent.click(review(dialog))
    vi.setSystemTime(CLOCK + ORGANIZATION_LIST_MAX_AGE_MS)   // the clock moves; no timer has run
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(registered).toHaveLength(0)
    expect(writes()).toHaveLength(0)
  })
})

// ── the reader ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("useOrganizationDiscovery", () => {
  it("an answer for the previous customer, arriving after the scope changed, is never kept", async () => {
    let release: (value: Response) => void = () => {}
    const slow = new Promise<Response>((resolve) => {
      release = resolve
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).includes("customer_id=acme-prod") ? slow : json({ customer_id: "other-co", state: "NOT_RUN" }))
    vi.stubGlobal("fetch", fetcher)
    const { result, rerender } = renderHook(({ customer }) => useOrganizationDiscovery(customer), { initialProps: { customer: CUSTOMER } })
    rerender({ customer: "other-co" })
    await waitFor(() => expect(result.current.answer).toEqual({ customer_id: "other-co", state: "NOT_RUN" }))
    release(json(listing(CLOCK)))
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve()
    })
    expect(result.current.answer).toEqual({ customer_id: "other-co", state: "NOT_RUN" })
    expect(fetcher.mock.calls.every(([, init]) => ((init as RequestInit | undefined)?.method || "GET") === "GET")).toBe(true)
  })

  it("an answer arriving after the scope was cleared is never kept", async () => {
    let release: (value: Response) => void = () => {}
    vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>((resolve) => {
      release = resolve
    })))
    const { result, rerender } = renderHook(({ customer }: { customer: string | null }) => useOrganizationDiscovery(customer),
      { initialProps: { customer: CUSTOMER as string | null } })
    rerender({ customer: null })
    release(json(listing(CLOCK)))
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve()
    })
    expect(result.current.answer).toBeNull()
    expect(organizationListing(result.current, CLOCK)).toHaveProperty("cannotVerify")
  })

  it("an answer that names another customer is refused, and nothing it lists counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...listing(CLOCK), customer_id: "other-co" })))
    const { result } = renderHook(() => useOrganizationDiscovery(CUSTOMER))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.answer).toBeNull()
    expect(result.current.error?.detail).toBe("Organization accounts answered for another customer (other-co), so the answer is not used.")
  })

  it("a read in flight takes back the previous answer until it answers", async () => {
    let release: (value: Response) => void = () => {}
    let first = true
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (first) {
        first = false
        return json(listing(CLOCK))
      }
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    }))
    const { result } = renderHook(() => useOrganizationDiscovery(CUSTOMER))
    await waitFor(() => expect(result.current.answer?.state).toBe("AVAILABLE"))
    expect(organizationListing(result.current, CLOCK)).toHaveProperty("listing")
    act(() => {
      void result.current.reload()
    })
    await waitFor(() => expect(result.current.reading).toBe(true))
    expect(organizationListing(result.current, CLOCK)).toEqual({ cannotVerify: "Cyntro is reading your organization's account list." })
    release(json(listing(CLOCK)))
    await waitFor(() => expect(result.current.reading).toBe(false))
    expect(organizationListing(result.current, CLOCK)).toHaveProperty("listing")
  })
})
