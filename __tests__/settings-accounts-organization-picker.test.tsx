/**
 * Settings > Accounts, Add an AWS account > "Choose from your organization" (O2d).
 *
 * The responses below are TEST INPUTS shaped exactly like the backend contract (saferemediate-backend
 * api/account_registry.py organization_discovery = cyntro_data/accounts/org_discovery.py read_state +
 * setup_parameters). The picker renders only what fetch returns; choosing an account only fills the Add form.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme-prod", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"

const CUSTOMER = "acme-prod"
const ORGANIZATION_GET = `/api/proxy/admin/accounts/organization?customer_id=${CUSTOMER}`
const DISCOVER_POST = `/api/proxy/admin/accounts/organization/discover?customer_id=${CUSTOMER}`

const PLATFORM = {
  customer_id: CUSTOMER,
  account_id: "111122223333",
  display_name: "Security tooling",
  environment: "SHARED_SERVICES",
  regions: ["eu-central-1"],
  onboarding_status: "REGISTERED",
  collection_mode: "LOCAL_CUSTOMER_PLANE",
  read_enabled: true,
  verification_enabled: true,
  mutation_enabled: false,
  validation_message: null,
  last_validated_at: null,
  sources: {},
  pending_request: null,
  is_platform_account: true,
}

const LIST = {
  customer_id: CUSTOMER,
  mode: "MEMBER_ACCOUNTS",
  accounts: [PLATFORM],
  total: 1,
  registry_available: true,
  member_trust: { platform_account_id: "111122223333", organization_id: "o-a1b2c3d4e5", ready: true },
  failed_requests: [],
  summary: { connected: 0, needs_attention: 0, discovered: 0, mutation_enabled: 0 },
}

const AVAILABLE = {
  customer_id: CUSTOMER,
  state: "AVAILABLE",
  discovered_at: "2026-10-03T09:15:02.123456+00:00",
  organization_id: "o-a1b2c3d4e5",
  management_account_id: "999988887777",
  truncated: false,
  accounts: [
    { account_id: "111122223333", name: "Security tooling", state: "ACTIVE", selectable: false, why_not: "PLATFORM_ACCOUNT" },
    { account_id: "999988887777", name: "Management", state: "ACTIVE", selectable: false, why_not: "MANAGEMENT_ACCOUNT" },
    { account_id: "444455556666", name: "Payments production", state: "ACTIVE", selectable: false, why_not: "ALREADY_ADDED" },
    { account_id: "222233334444", name: "Checkout staging", state: "ACTIVE", selectable: true },
    { account_id: "555566667777", name: "Old sandbox", state: "SUSPENDED", selectable: false, why_not: "STATE_SUSPENDED" },
  ],
}

const SETUP = {
  template: "deploy/organizations/cyntro-organizations-discovery.yaml",
  parameters: {
    TenantId: CUSTOMER,
    AccountConnectorRoleArn: "arn:aws:iam::111122223333:role/cyntro-orchestrator-acme-prod-AccountConnectorRole-1A2B3C4D",
    ExternalId: "5f0c2a9e7d3b4c61a8e2f9d04b7c1e365f0c2a9e7d3b4c61a8e2f9d04b7c1e36",
  },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: {
  organization: () => Response
  discover?: () => Response
  register?: (body: Record<string, unknown>) => Response
}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    if (url === ORGANIZATION_GET && method === "GET") return handlers.organization()
    if (url === DISCOVER_POST && method === "POST" && handlers.discover) return handlers.discover()
    if (url === "/api/proxy/admin/accounts" && method === "POST" && handlers.register) {
      return handlers.register(JSON.parse(String(init?.body)))
    }
    if (url === `/api/proxy/admin/accounts?customer_id=${CUSTOMER}` && method === "GET") return json(LIST)
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
}

function calls(predicate: (url: string, method: string) => boolean) {
  return fetchMock.mock.calls.filter(([input, init]) => predicate(String(input), (init as RequestInit | undefined)?.method || "GET"))
}

const organizationReads = () => calls((url, method) => url === ORGANIZATION_GET && method === "GET")
const discoverPosts = () => calls((url, method) => url === DISCOVER_POST && method === "POST")
const registrations = () => calls((url, method) => url === "/api/proxy/admin/accounts" && method === "POST")

async function openDialog() {
  render(<AccountSettingsPage />)
  await screen.findAllByTestId(/^account-row-/)
  fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
  return screen.findByRole("dialog", { name: "Add an AWS account" })
}

async function openPicker() {
  const dialog = await openDialog()
  fireEvent.click(within(dialog).getByRole("tab", { name: "Choose from your organization" }))
  const picker = await within(dialog).findByTestId("organization-picker")
  return { dialog, picker }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Settings > Accounts — choose from your organization", () => {
  it("manual entry stays the default and opening the dialog asks nothing about the organization", async () => {
    installFetch({ organization: () => json(AVAILABLE) })
    const dialog = await openDialog()
    expect(within(dialog).getByRole("tab", { name: "Enter account ID" })).toHaveAttribute("aria-selected", "true")
    expect(within(dialog).getByRole("tab", { name: "Choose from your organization" })).toHaveAttribute("aria-selected", "false")
    expect(within(dialog).getByLabelText("AWS account ID")).toBeInTheDocument()
    expect(within(dialog).queryByTestId("organization-picker")).toBeNull()
    expect(organizationReads()).toHaveLength(0)
    expect(discoverPosts()).toHaveLength(0)
  })

  it("NOT_RUN offers Find accounts, which asks once, waits for the connector, shows the list, then stops reading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let answer: Record<string, unknown> = { customer_id: CUSTOMER, state: "NOT_RUN" }
    installFetch({
      organization: () => json(answer),
      discover: () => {
        answer = { customer_id: CUSTOMER, state: "RUNNING", requested_at: "2026-10-03T09:15:00.000000+00:00" }
        return json({ customer_id: CUSTOMER, request_status: "queued", requested_at: "2026-10-03T09:15:00.000000+00:00", already_open: false }, 202)
      },
    })
    const { picker } = await openPicker()
    await within(picker).findByText("Your organization's accounts have not been listed for this installation yet.")
    expect(discoverPosts()).toHaveLength(0)

    fireEvent.click(within(picker).getByRole("button", { name: "Find accounts" }))
    await within(picker).findByText(/Listing your organization's accounts/)
    expect(discoverPosts()).toHaveLength(1)

    answer = AVAILABLE
    const before = organizationReads().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(organizationReads().length).toBe(before + 1)
    await within(picker).findByTestId("organization-account-222233334444")

    const settled = organizationReads().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(organizationReads().length).toBe(settled)
    expect(discoverPosts()).toHaveLength(1)
    expect(registrations()).toHaveLength(0)
  })

  it("only an ACTIVE account the backend offers can be chosen; every other row says why", async () => {
    installFetch({ organization: () => json(AVAILABLE) })
    const { dialog, picker } = await openPicker()
    await within(picker).findByTestId("organization-account-222233334444")
    expect(picker).toHaveTextContent("Organization o-a1b2c3d4e5, listed 2026-10-03 09:15:02.123 UTC.")
    // Browsing is not adding: nothing can be reviewed or added from the list itself.
    expect(within(dialog).queryByRole("button", { name: "Review" })).toBeNull()
    expect(within(dialog).queryByRole("button", { name: /Add account/ })).toBeNull()

    const row = (id: string) => within(picker).getByTestId(`organization-account-${id}`)
    expect(within(row("222233334444")).getByRole("button", { name: "Use Checkout staging (222233334444)" })).toBeInTheDocument()
    expect(row("111122223333")).toHaveTextContent("The account Cyntro runs in")
    expect(row("999988887777")).toHaveTextContent("The organization's management account")
    expect(row("444455556666")).toHaveTextContent("Already added")
    expect(row("555566667777")).toHaveTextContent("Not active (SUSPENDED)")
    expect(within(picker).getAllByRole("button", { name: /^Use / })).toHaveLength(1)
  })

  it("a row the backend contradicts fails closed: offered but not ACTIVE, or ACTIVE but not offered", async () => {
    installFetch({
      organization: () => json({
        ...AVAILABLE,
        accounts: [
          { account_id: "666677778888", name: "Offered but suspended", state: "SUSPENDED", selectable: true },
          { account_id: "777788889999", name: "Active but withheld", state: "ACTIVE", selectable: false },
          { account_id: "888899990000", name: "Lower-case state", state: "active", selectable: true },
        ],
      }),
    })
    const { picker } = await openPicker()
    await within(picker).findByTestId("organization-account-666677778888")
    expect(within(picker).queryAllByRole("button", { name: /^Use / })).toHaveLength(0)
    expect(within(picker).getByTestId("organization-account-666677778888")).toHaveTextContent("Not offered (SUSPENDED)")
  })

  it("choosing an account only fills the form; Review and then Add account register it, once", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      organization: () => json(AVAILABLE),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-03T09:20:00.000000+00:00" }, 202)
      },
    })
    const { dialog, picker } = await openPicker()
    await within(picker).findByTestId("organization-account-222233334444")
    fireEvent.click(within(picker).getByRole("button", { name: "Use Checkout staging (222233334444)" }))

    expect(within(dialog).getByRole("tab", { name: "Enter account ID" })).toHaveAttribute("aria-selected", "true")
    expect(within(dialog).getByLabelText("Account name")).toHaveValue("Checkout staging")
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveValue("222233334444")
    expect(within(dialog).getByTestId("chosen-from-organization")).toHaveTextContent(
      "Filled from your organization: Checkout staging (222233334444). Nothing has been added.")
    expect(registrations()).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole("button", { name: "Review" }))
    expect(within(dialog).getByTestId("add-account-confirmation")).toHaveTextContent("Add Checkout staging (222233334444)?")
    expect(registrations()).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0]).toMatchObject({ account_id: "222233334444", display_name: "Checkout staging", environment: "UNCLASSIFIED" })
  })

  it("search narrows the list by name or account ID", async () => {
    installFetch({ organization: () => json(AVAILABLE) })
    const { picker } = await openPicker()
    await within(picker).findByTestId("organization-account-222233334444")
    fireEvent.change(within(picker).getByLabelText("Search accounts"), { target: { value: "checkout" } })
    expect(within(picker).getAllByTestId(/^organization-account-/).map((row) => row.dataset.testid)).toEqual([
      "organization-account-222233334444"])
    fireEvent.change(within(picker).getByLabelText("Search accounts"), { target: { value: "6677" } })
    expect(within(picker).getAllByTestId(/^organization-account-/).map((row) => row.dataset.testid)).toEqual([
      "organization-account-555566667777"])
  })

  it("a list cut short says so, and an empty one says nothing was listed", async () => {
    let answer: Record<string, unknown> = { ...AVAILABLE, truncated: true }
    installFetch({
      organization: () => json(answer),
      discover: () => json({ customer_id: CUSTOMER, request_status: "queued", requested_at: "2026-10-03T09:16:00.000000+00:00", already_open: false }, 202),
    })
    const { picker } = await openPicker()
    await within(picker).findByText("The list was cut short at 5 accounts; enter the ID of any account not shown.")

    answer = { ...AVAILABLE, accounts: [] }
    fireEvent.click(within(picker).getByRole("button", { name: "Find accounts again" }))
    await within(picker).findByText("No accounts were listed.")
  })

  it("not configured shows the backend's setup values exactly as returned, each copyable", async () => {
    installFetch({
      organization: () => json({ customer_id: CUSTOMER, state: "UNAVAILABLE", reason: "NOT_CONFIGURED", requested_at: "2026-10-03T09:15:00.000000+00:00", setup: SETUP }),
      discover: () => json({ customer_id: CUSTOMER, request_status: "queued", requested_at: "2026-10-03T09:16:00.000000+00:00", already_open: false }, 202),
    })
    const { picker } = await openPicker()
    const setup = await within(picker).findByTestId("organization-setup")
    expect(picker).toHaveTextContent("Choosing from your organization is not set up for this installation.")
    expect(setup).toHaveTextContent(SETUP.template)
    for (const [name, value] of Object.entries(SETUP.parameters)) {
      expect(setup).toHaveTextContent(name)
      expect(setup).toHaveTextContent(value)
      expect(within(setup).getByRole("button", { name: `Copy ${name}` })).toBeInTheDocument()
    }
    expect(within(setup).getAllByRole("button", { name: /^Copy / })).toHaveLength(3)
    expect(setup).toHaveTextContent("ORG_DISCOVERY_ROLE_ARN")

    fireEvent.click(within(picker).getByRole("button", { name: "Check again" }))
    await waitFor(() => expect(discoverPosts()).toHaveLength(1))
    expect(registrations()).toHaveLength(0)
  })

  it("without setup values from the backend, none are shown or made up", async () => {
    installFetch({ organization: () => json({ customer_id: CUSTOMER, state: "UNAVAILABLE", reason: "NOT_CONFIGURED" }) })
    const { picker } = await openPicker()
    await within(picker).findByText("Choosing from your organization is not set up for this installation.")
    expect(within(picker).queryByTestId("organization-setup")).toBeNull()
    expect(picker).not.toHaveTextContent(/ExternalId|AccountConnectorRoleArn|TenantId/)
    expect(picker).toHaveTextContent("see INSTALL.md, section 8")
  })

  it.each([
    ["INSTALL_ORGANIZATION_UNKNOWN", "Cyntro could not read which AWS Organization this installation belongs to"],
    ["ROLE_NOT_USABLE", "Cyntro could not use the organization discovery role."],
    ["NOT_PERMITTED", "The organization discovery role is not allowed to list the organization's accounts."],
    ["OTHER_ORGANIZATION", "answers for a different AWS Organization than this installation's"],
    ["DISCOVERY_FAILED", "Listing the organization's accounts failed."],
    ["SOMETHING_NEW", "The organization's accounts cannot be listed (SOMETHING_NEW)."],
  ])("UNAVAILABLE %s is said in words, with no rows and manual entry one click away", async (reason, words) => {
    installFetch({ organization: () => json({ customer_id: CUSTOMER, state: "UNAVAILABLE", reason }) })
    const { dialog, picker } = await openPicker()
    await within(picker).findByText(new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    expect(within(picker).queryAllByTestId(/^organization-account-/)).toHaveLength(0)
    fireEvent.click(within(picker).getByRole("button", { name: "Enter an account ID instead" }))
    expect(within(dialog).getByLabelText("AWS account ID")).toBeInTheDocument()
  })

  it("an expired list is not offered, even rows sent with it; a fresh one can be asked for", async () => {
    installFetch({
      organization: () => json({ customer_id: CUSTOMER, state: "EXPIRED", discovered_at: "2026-10-01T08:00:00.000000+00:00",
                                 accounts: AVAILABLE.accounts }),
      discover: () => json({ customer_id: CUSTOMER, request_status: "queued", requested_at: "2026-10-03T09:15:00.000000+00:00", already_open: false }, 202),
    })
    const { picker } = await openPicker()
    await within(picker).findByText("The last list is more than 24 hours old, so it is not offered.")
    expect(within(picker).queryAllByTestId(/^organization-account-/)).toHaveLength(0)
    fireEvent.click(within(picker).getByRole("button", { name: "Find accounts" }))
    await waitFor(() => expect(discoverPosts()).toHaveLength(1))
  })

  it("a refused read says why, and the account ID can still be entered", async () => {
    installFetch({ organization: () => json({ detail: { code: "PERSON_NOT_AUTHORIZED" } }, 403) })
    const { dialog, picker } = await openPicker()
    const alert = await within(picker).findByRole("alert")
    expect(alert).toHaveTextContent("Organization accounts refused (HTTP 403): Your sign-in is not permitted to administer this account.")
    fireEvent.click(within(picker).getByRole("button", { name: "Enter an account ID instead" }))
    expect(within(dialog).getByLabelText("AWS account ID")).toBeInTheDocument()
  })

  it("a refused Find accounts says so and changes nothing", async () => {
    installFetch({
      organization: () => json({ customer_id: CUSTOMER, state: "NOT_RUN" }),
      discover: () => json({ detail: { code: "PERSON_TOKEN_INVALID" } }, 401),
    })
    const { picker } = await openPicker()
    fireEvent.click(await within(picker).findByRole("button", { name: "Find accounts" }))
    const alert = await within(picker).findByRole("alert")
    expect(alert).toHaveTextContent("Finding accounts refused (HTTP 401): Your sign-in could not be verified")
    expect(within(picker).getByText("Your organization's accounts have not been listed for this installation yet.")).toBeInTheDocument()
    expect(registrations()).toHaveLength(0)
  })
})
