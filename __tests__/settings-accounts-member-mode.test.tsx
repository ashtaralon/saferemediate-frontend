/**
 * Settings > Accounts on a customer-resident install (member-account mode).
 *
 * The rows below are TEST INPUTS shaped exactly like the backend contract
 * (saferemediate-backend api/account_registry.py `_member_listing` and
 * `connection_instructions`); the page renders only what fetch returns.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "acme-prod", refresh }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"

const CUSTOMER = "acme-prod"
/** The read role ARN the connection stack's Outputs name in account `id` (Alon 2026-10-05: an account is added by it). */
const readRoleArn = (id: string) => `arn:aws:iam::${id}:role/CyntroRead-${CUSTOMER}`

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

const AWAITING = {
  customer_id: CUSTOMER,
  account_id: "444455556666",
  display_name: "444455556666",
  environment: "PRODUCTION",
  regions: ["eu-west-1"],
  onboarding_status: "AWAITING_CONNECTION",
  collection_mode: "MEMBER_READ_ROLE",
  read_enabled: true,
  verification_enabled: false,
  mutation_enabled: false,
  validation_message: "Waiting for the Cyntro connection stack in this account",
  last_validated_at: null,
  sources: {},
  pending_request: null,
  is_platform_account: false,
}

const CONNECTED_SOURCES = {
  regions: ["eu-west-1"],
  trails: [
    {
      name: "org-trail",
      arn: "arn:aws:cloudtrail:eu-west-1:777788889999:trail/org-trail",
      home_region: "eu-west-1",
      bucket: "acme-org-trail-logs",
      prefix: "",
      is_organization_trail: true,
      is_multi_region: true,
      kms_key_id: null,
    },
    {
      name: "data-platform-trail",
      arn: "arn:aws:cloudtrail:eu-west-1:777788889999:trail/data-platform-trail",
      home_region: "eu-west-1",
      bucket: "acme-data-platform-trail",
      prefix: "cloudtrail",
      is_organization_trail: false,
      is_multi_region: false,
      kms_key_id: null,
    },
  ],
  flow_log_groups: [
    {
      name: "/vpc/data-platform-flow",
      arn: "arn:aws:logs:eu-west-1:777788889999:log-group:/vpc/data-platform-flow",
      region: "eu-west-1",
      vpc_ids: ["vpc-0a1b2c3d4e5f60718"],
      log_format: "${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} ${tcp-flags} ${flow-direction}",
      certified_format: true,
    },
    {
      name: "/vpc/legacy-flow",
      arn: "arn:aws:logs:eu-west-1:777788889999:log-group:/vpc/legacy-flow",
      region: "eu-west-1",
      vpc_ids: ["vpc-09f8e7d6c5b4a3921"],
      log_format: null,
      certified_format: false,
    },
  ],
  eks_clusters: [
    {
      name: "data-platform",
      region: "eu-west-1",
      endpoint_public_access: false,
      endpoint_private_access: true,
      public_access_cidrs: [],
      authentication_mode: "API_AND_CONFIG_MAP",
    },
  ],
  evidence_role: true,
  discovery_errors: [],
}

const CONNECTED = {
  customer_id: CUSTOMER,
  account_id: "777788889999",
  display_name: "Data platform",
  aws_account_name: "Data platform",
  environment: "PRODUCTION",
  regions: ["eu-west-1"],
  onboarding_status: "CONNECTED",
  collection_mode: "MEMBER_READ_ROLE",
  read_enabled: true,
  verification_enabled: false,
  mutation_enabled: false,
  validation_message: "Connected. Found 2 CloudTrail trail(s), 1 usable flow-log group(s) of 2, 1 EKS cluster(s).",
  last_validated_at: "2026-10-01T09:12:44.512331+00:00",
  sources: CONNECTED_SOURCES,
  pending_request: null,
  is_platform_account: false,
}

const EXTERNAL_ID = "5f0c2a9e7d3b4c61a8e2f9d04b7c1e36"
const CONSOLE_URL = "https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/create"

function connectFor(account: { account_id: string }, overrides: Record<string, unknown> = {}) {
  const parameters = {
    CustomerId: CUSTOMER,
    SecurityToolingAccountId: "111122223333",
    ExternalId: EXTERNAL_ID,
    OrganizationId: "o-a1b2c3d4e5",
    ExistingFlowLogGroupArns: "",
    FlowLogVpcId: "",
    EksClusterName: "",
    ...((overrides.parameters as Record<string, string>) || {}),
  }
  const cli =
    "aws cloudformation deploy --stack-name cyntro-account-connection --region eu-west-1 " +
    "--template-file cyntro-account-connection.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides " +
    Object.entries(parameters).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(" ")
  return {
    customer_id: CUSTOMER,
    account_id: account.account_id,
    stack_name: "cyntro-account-connection",
    region: "eu-west-1",
    template_path: "/api/admin/accounts/connect/template",
    console_url: CONSOLE_URL,
    parameters,
    cli,
    notes: {
      flow_log_groups_found: 0,
      flow_log_groups_usable: 0,
      flow_log_groups_without_required_fields: [],
      eks_clusters: [],
      discovered: false,
      ...((overrides.notes as Record<string, unknown>) || {}),
    },
  }
}

type Account = typeof PLATFORM | typeof AWAITING | typeof CONNECTED | Record<string, unknown>

function memberList(accounts: Account[], extra: Record<string, unknown> = {}) {
  return {
    customer_id: CUSTOMER,
    mode: "MEMBER_ACCOUNTS",
    accounts,
    total: accounts.length,
    registry_available: true,
    member_trust: { platform_account_id: "111122223333", organization_id: "o-a1b2c3d4e5", ready: true },
    failed_requests: [],
    summary: {
      connected: accounts.filter((a) => a.onboarding_status === "CONNECTED").length,
      needs_attention: accounts.filter((a) => ["CONNECTION_FAILED", "AWAITING_CONNECTION"].includes(String(a.onboarding_status))).length,
      discovered: 0,
      mutation_enabled: 0,
    },
    ...extra,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

interface Handlers {
  list: () => Response
  /** GET /api/admin/accounts/organization; absent, the read fails and no ID can be verified. */
  organization?: () => Response
  connect?: (accountId: string) => Response
  validate?: (accountId: string) => Response
  register?: (body: Record<string, unknown>) => Response
  groups?: () => Response
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: Handlers) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) {
      return handlers.groups ? handlers.groups() : json({ customer_id: CUSTOMER, groups: [] })
    }
    const connect = url.match(/^\/api\/proxy\/admin\/accounts\/(\d{12})\/connect\?customer_id=acme-prod$/)
    if (connect && method === "GET" && handlers.connect) return handlers.connect(connect[1])
    const validate = url.match(/^\/api\/proxy\/admin\/accounts\/(\d{12})\/validate\?customer_id=acme-prod$/)
    if (validate && method === "POST" && handlers.validate) return handlers.validate(validate[1])
    if (url === "/api/proxy/admin/accounts" && method === "POST" && handlers.register) {
      return handlers.register(JSON.parse(String(init?.body)))
    }
    if (url === "/api/proxy/admin/accounts?customer_id=acme-prod" && method === "GET") return handlers.list()
    if (url === "/api/proxy/admin/accounts/organization?customer_id=acme-prod" && method === "GET" && handlers.organization) {
      return handlers.organization()
    }
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
}

/**
 * The organization's account list as the backend's read_state answers it (AVAILABLE), listed a minute before the
 * test's clock so it is current whatever that clock says. Each account is ACTIVE and offered unless it says otherwise.
 */
function listing(accounts: Array<Record<string, unknown> & { account_id: string }>, extra: Record<string, unknown> = {}) {
  return {
    customer_id: CUSTOMER,
    state: "AVAILABLE",
    discovered_at: new Date(Date.now() - 60_000).toISOString(),
    organization_id: "o-a1b2c3d4e5",
    management_account_id: "999988887777",
    truncated: false,
    accounts: accounts.map((account) => ({ name: `Account ${account.account_id}`, state: "ACTIVE", selectable: true, ...account })),
    ...extra,
  }
}

/** The Add dialog is two steps: Review shows what adding does; only "Add account" there submits. Review opens once
 *  the dialog's organization read has found the ID. */
async function reviewAndAdd(dialog: HTMLElement) {
  const review = within(dialog).getByRole("button", { name: "Review" })
  await waitFor(() => expect(review).toBeEnabled())
  fireEvent.click(review)
  fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
}

function calls(predicate: (url: string, method: string) => boolean) {
  return fetchMock.mock.calls.filter(([input, init]) => predicate(String(input), (init as RequestInit | undefined)?.method || "GET"))
}

const listCalls = () => calls((url, method) => url === "/api/proxy/admin/accounts?customer_id=acme-prod" && method === "GET")

beforeEach(() => {
  refresh.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Settings > Accounts — member-account mode", () => {
  it("lists the platform account first, labelled, with no actions, and a badge per onboarding status", async () => {
    installFetch({ list: () => json(memberList([CONNECTED, AWAITING, PLATFORM])) })
    render(<AccountSettingsPage />)

    const rows = await screen.findAllByTestId(/^account-row-/)
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "account-row-111122223333",
      "account-row-777788889999",
      "account-row-444455556666",
    ])

    const platform = rows[0]
    expect(within(platform).getByText("Cyntro platform account")).toBeInTheDocument()
    expect(within(platform).queryAllByRole("button")).toHaveLength(0)

    const connected = rows[1]
    expect(within(connected).getByText("Connected")).toBeInTheDocument()
    expect(within(connected).getByText("2 trails · 1 of 2 flow-log groups usable · 1 EKS cluster")).toBeInTheDocument()
    expect(within(connected).getByText(CONNECTED.validation_message)).toBeInTheDocument()
    expect(within(connected).getByRole("button", { name: "Connect Data platform" })).toBeInTheDocument()
    expect(within(connected).getByRole("button", { name: "Check connection for Data platform" })).toBeInTheDocument()

    const awaiting = rows[2]
    expect(within(awaiting).getByText("Waiting for connection stack")).toBeInTheDocument()
    expect(within(awaiting).getByText(AWAITING.validation_message)).toBeInTheDocument()
    expect(within(awaiting).queryByText(/flow-log groups usable/)).not.toBeInTheDocument()
    expect(within(awaiting).getByRole("button", { name: "Connect 444455556666" })).toBeInTheDocument()

    // The registry banner is for an unavailable registry only, never a side effect.
    expect(screen.queryByText("Registry storage is not provisioned")).not.toBeInTheDocument()
    expect(screen.queryByText("Account registry unavailable")).not.toBeInTheDocument()
    // Nothing is open, so nothing polls.
    expect(listCalls()).toHaveLength(1)
  })

  it("Connect fetches /connect and renders every parameter, the template download and the API's console URL", async () => {
    const instructions = connectFor(CONNECTED, {
      parameters: {
        ExistingFlowLogGroupArns: "arn:aws:logs:eu-west-1:777788889999:log-group:/vpc/data-platform-flow",
        EksClusterName: "data-platform",
      },
      notes: {
        flow_log_groups_found: 2,
        flow_log_groups_usable: 1,
        flow_log_groups_without_required_fields: ["/vpc/legacy-flow"],
        eks_clusters: ["data-platform"],
        discovered: true,
      },
    })
    installFetch({ list: () => json(memberList([PLATFORM, CONNECTED])), connect: () => json(instructions) })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Connect Data platform" }))
    const dialog = await screen.findByRole("dialog", { name: "Data platform" })
    await within(dialog).findByText("Download the connection stack")

    expect(calls((url) => url === "/api/proxy/admin/accounts/777788889999/connect?customer_id=acme-prod")).toHaveLength(1)

    const nonEmpty = Object.entries(instructions.parameters).filter(([, value]) => value)
    expect(nonEmpty.map(([name]) => name)).toEqual([
      "CustomerId", "SecurityToolingAccountId", "ExternalId", "OrganizationId", "ExistingFlowLogGroupArns", "EksClusterName",
    ])
    for (const [name, value] of nonEmpty) {
      const row = within(dialog).getByTestId(`connect-parameter-${name}`)
      expect(row).toHaveTextContent(name)
      expect(row).toHaveTextContent(value)
      expect(within(row).getByRole("button", { name: `Copy ${name}` })).toBeInTheDocument()
    }
    expect(within(dialog).queryByTestId("connect-parameter-FlowLogVpcId")).not.toBeInTheDocument()
    expect(within(dialog).getByText("FlowLogVpcId")).toBeInTheDocument()
    expect(within(dialog).getByText(/\/vpc\/legacy-flow lacks the tcp-flags \/ flow-direction fields/)).toBeInTheDocument()

    const consoleLink = within(dialog).getByRole("link", { name: /Open CloudFormation in eu-west-1/ })
    expect(consoleLink).toHaveAttribute("href", CONSOLE_URL)
    expect(consoleLink).toHaveAttribute("target", "_blank")
    expect(consoleLink.getAttribute("rel")).toContain("noopener")

    const download = within(dialog).getByRole("link", { name: /Download template/ })
    expect(download).toHaveAttribute("href", "/api/proxy/admin/accounts/connect/template")
    expect(download).toHaveAttribute("download")

    expect(within(dialog).getByText("cyntro-account-connection")).toBeInTheDocument()
    expect(within(dialog).getByText("Use the AWS CLI instead")).toBeInTheDocument()
    expect(within(dialog).getByText(instructions.cli)).toBeInTheDocument()
  })

  it("Check connection POSTs validate and treats 202 as queued", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING])),
      validate: (accountId) => json({ customer_id: CUSTOMER, account_id: accountId, action: "validate", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202),
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for 444455556666" }))
    await waitFor(() =>
      expect(calls((url, method) => method === "POST" && url === "/api/proxy/admin/accounts/444455556666/validate?customer_id=acme-prod")).toHaveLength(1),
    )
    // The page re-reads the list after queuing the check.
    await waitFor(() => expect(listCalls().length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("the add dialog POSTs only the member fields, treats 202 as success and shows the REGISTERING row", async () => {
    let list = memberList([PLATFORM, CONNECTED])
    const registered: Record<string, unknown>[] = []
    installFetch({
      list: () => json(list),
      register: (body) => {
        registered.push(body)
        list = memberList([PLATFORM, CONNECTED, {
          customer_id: CUSTOMER,
          account_id: "222233334444",
          display_name: "222233334444",
          environment: "STAGING",
          regions: ["eu-central-1"],
          onboarding_status: "REGISTERING",
          collection_mode: "MEMBER_READ_ROLE",
          read_enabled: true,
          verification_enabled: false,
          mutation_enabled: false,
          validation_message: "Registering",
          sources: {},
          group_ids: [],
          tags: {},
          pending_request: { action: "register", status: "queued", requested_at: "2026-10-01T10:00:00.000000+00:00" },
          is_platform_account: false,
        }])
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
      organization: () => json(listing([{ account_id: "222233334444" }])),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    expect(within(dialog).queryByText(/StackSet/)).not.toBeInTheDocument()
    // The account ID is the only input (Alon, 2026-10-03): no name (AWS names the account once it connects), no
    // environment (a business system's, defined after it connects), no Regions (the connector's collection Region).
    expect(within(dialog).queryByLabelText("Account name")).toBeNull()
    expect(within(dialog).queryByLabelText("Environment")).toBeNull()
    expect(within(dialog).queryByLabelText(/Regions/)).toBeNull()
    expect(within(dialog).queryByTestId("install-regions-suggestion")).toBeNull()
    // The read role ARN (from the stack the operator deployed) and the account ID: nothing else is asked for.
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2)
    expect(within(dialog).getByLabelText(/Read role ARN/)).toBeInTheDocument()
    expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0)
    expect(within(dialog).queryByText("The name your team uses for this account.")).toBeNull()
    // A grey hint right under the account ID says where the name comes from (Alon, 2026-10-03): the access check reads it
    // (r41: not "once it connects").
    const hint = within(dialog).getByText("Cyntro reads the account's name from AWS during the access check.")
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveAttribute("aria-describedby", hint.id)
    expect(hint).toHaveClass("text-slate-500")
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    await reviewAndAdd(dialog)

    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0]).toEqual({ customer_id: CUSTOMER, account_id: "222233334444", read_role_arn: readRoleArn("222233334444") })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add an AWS account" })).not.toBeInTheDocument())
    const row = await screen.findByTestId("account-row-222233334444")
    expect(within(row).getByText("Registering")).toBeInTheDocument()
    expect(within(row).getByText("Registration queued")).toBeInTheDocument()
    expect(within(row).queryAllByRole("button")).toHaveLength(0)
  })

  it("a 12-digit account ID found in the current organization list is enough to review and add; nothing else is sent", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      list: () => json(memberList([PLATFORM, CONNECTED])),
      organization: () => json(listing([{ account_id: "555566667777" }])),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)
    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    const review = within(dialog).getByRole("button", { name: "Review" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "55556666777" } })   // 11 digits
    expect(review).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "555566667777" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("555566667777") } })
    await waitFor(() => expect(review).toBeEnabled())
    await reviewAndAdd(dialog)
    await waitFor(() => expect(registered).toHaveLength(1))
    expect(Object.keys(registered[0]).sort()).toEqual(["account_id", "customer_id", "read_role_arn"])
  })

  it("B3: a stored environment -- a custom one included -- is shown as recorded, never remapped", async () => {
    installFetch({ list: () => json(memberList([PLATFORM, { ...CONNECTED, environment: "PCI_ZONE" }])) })
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${CONNECTED.account_id}`)
    expect(within(row).getByText("PCI_ZONE")).toBeInTheDocument()
    expect(within(row).queryByText("UNCLASSIFIED")).not.toBeInTheDocument()
  })

  it("polls every 4 s while an account is REGISTERING, opens Connect once it is AWAITING_CONNECTION, then stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const NEW = { ...AWAITING, account_id: "222233334444", display_name: "222233334444" }
    const registering = {
      ...NEW,
      onboarding_status: "REGISTERING",
      validation_message: "Registering",
      pending_request: { action: "register", status: "queued", requested_at: "2026-10-01T10:00:00.000000+00:00" },
    }
    let list = memberList([PLATFORM])
    installFetch({
      list: () => json(list),
      register: () => {
        list = memberList([PLATFORM, registering])
        return json({ customer_id: CUSTOMER, account_id: NEW.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
      connect: (accountId) => json(connectFor({ account_id: accountId })),
      organization: () => json(listing([{ account_id: NEW.account_id }])),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: NEW.account_id } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn(NEW.account_id) } })
    await reviewAndAdd(dialog)
    await screen.findByTestId("account-row-222233334444")
    expect(screen.queryByRole("dialog", { name: "222233334444" })).not.toBeInTheDocument()

    // The connector created the row: the next poll finds it waiting for its stack.
    list = memberList([PLATFORM, NEW])
    const before = listCalls().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(listCalls().length).toBe(before + 1)
    const panel = await screen.findByRole("dialog", { name: "222233334444" })
    await within(panel).findByText("Download the connection stack")
    expect(calls((url) => url === "/api/proxy/admin/accounts/222233334444/connect?customer_id=acme-prod")).toHaveLength(1)

    // Nothing is open any more: polling stops.
    const settled = listCalls().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(listCalls().length).toBe(settled)
  })

  it("Check connection in the Connect panel waits for the connector and shows its result and discovery", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const requestedAt = "2026-10-01T10:00:00.000000+00:00"
    let list = memberList([PLATFORM, AWAITING])
    installFetch({
      list: () => json(list),
      connect: (accountId) => json(connectFor({ account_id: accountId })),
      validate: (accountId) => {
        list = memberList([PLATFORM, { ...AWAITING, pending_request: { action: "validate", status: "queued", requested_at: requestedAt } }])
        return json({ customer_id: CUSTOMER, account_id: accountId, action: "validate", request_status: "queued", already_open: false, requested_at: requestedAt }, 202)
      },
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Connect 444455556666" }))
    const panel = await screen.findByRole("dialog", { name: "444455556666" })
    fireEvent.click(await within(panel).findByRole("button", { name: "Check connection" }))

    await waitFor(() =>
      expect(calls((url, method) => method === "POST" && url === "/api/proxy/admin/accounts/444455556666/validate?customer_id=acme-prod")).toHaveLength(1),
    )
    expect(await within(panel).findByText(/Waiting for the account connector/)).toBeInTheDocument()

    list = memberList([PLATFORM, {
      ...AWAITING,
      onboarding_status: "CONNECTED",
      validation_message: "Connected. Found 2 CloudTrail trail(s), 1 usable flow-log group(s) of 2, 1 EKS cluster(s).",
      last_validated_at: "2026-10-01T10:00:03.412000+00:00",
      sources: CONNECTED_SOURCES,
      pending_request: null,
    }])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    const status = await within(panel).findByRole("status")
    await waitFor(() => expect(within(status).getByText("Connected")).toBeInTheDocument())
    expect(within(status).getByText(/Connected\. Found 2 CloudTrail trail/)).toBeInTheDocument()
    expect(within(status).getByText("2 trails · 1 of 2 flow-log groups usable · 1 EKS cluster")).toBeInTheDocument()
    expect(within(status).getByRole("button", { name: /Reload parameters/ })).toBeInTheDocument()
  })

  it("shows a failed connector request as a dismissible notice naming the account and its detail", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING], {
        failed_requests: [{
          account_id: "444455556666",
          action: "validate",
          detail: "ValueError: account 444455556666 is not a registered member account",
          finished_at: "2026-10-01T09:58:12.000000+00:00",
        }],
      })),
    })
    render(<AccountSettingsPage />)

    const notice = await screen.findByText("Connection check for 444455556666 failed")
    const alert = notice.closest("[role=alert]") as HTMLElement
    expect(within(alert).getByText("ValueError: account 444455556666 is not a registered member account")).toBeInTheDocument()
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss failed connection check for 444455556666" }))
    expect(screen.queryByText("Connection check for 444455556666 failed")).not.toBeInTheDocument()
  })
})

describe("Settings > Accounts — backend errors carry the backend's detail", () => {
  it("shows detail.message when the add dialog is refused (registry unavailable)", async () => {
    // The platform account never reaches the backend now (refused before Review, below); its 422 stays the backend's.
    const message = "Account registry unavailable. If the registry table has not been provisioned for this customer, provision it; otherwise the reason below is the actual cause."
    installFetch({
      list: () => json(memberList([PLATFORM])),
      organization: () => json(listing([{ account_id: "222233334444" }])),
      register: () => json({ detail: { error: "account_registry_unavailable", message, reason: "ResourceNotFoundException" } }, 503),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    await reviewAndAdd(dialog)

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("HTTP 503")
    expect(alert).toHaveTextContent(message)
  })

  it("shows a pydantic validation list as field: message", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      register: () => json({
        detail: [{ type: "string_too_long", loc: ["body", "display_name"], msg: "String should have at most 120 characters", input: "x" }],
      }, 422),
      organization: () => json(listing([{ account_id: "222233334444" }])),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    await reviewAndAdd(dialog)

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("display_name: String should have at most 120 characters")
  })

  it("a list failure shows its detail and never the registry banner", async () => {
    installFetch({ list: () => json({ detail: "Neptune read timed out after 30s" }, 500) })
    render(<AccountSettingsPage />)

    expect(await screen.findByText("Account registry failed (HTTP 500): Neptune read timed out after 30s")).toBeInTheDocument()
    expect(screen.queryByText("Registry storage is not provisioned")).not.toBeInTheDocument()
    expect(screen.queryByText("Account registry unavailable")).not.toBeInTheDocument()
  })

  it("shows the registry banner only when the list itself answers 503 account_registry_unavailable", async () => {
    installFetch({
      list: () => json({
        detail: {
          error: "account_registry_unavailable",
          message: "Account registry unavailable. If the registry table has not been provisioned for this customer, provision it; otherwise the reason below is the actual cause.",
          reason: "An error occurred (ResourceNotFoundException) when calling the Query operation: Requested resource not found",
        },
      }, 503),
    })
    render(<AccountSettingsPage />)

    expect(await screen.findByText("Account registry unavailable")).toBeInTheDocument()
    expect(screen.getByText(/Requested resource not found/)).toBeInTheDocument()
    expect(screen.queryByText("Registry storage is not provisioned")).not.toBeInTheDocument()
  })

  it("a refused Check connection shows the backend detail", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING])),
      validate: () => json({ detail: "account_id must be a 12-digit AWS account ID" }, 422),
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for 444455556666" }))
    expect(await screen.findByText("Check connection failed (HTTP 422): account_id must be a 12-digit AWS account ID")).toBeInTheDocument()
  })

  // O1: adding an account is a deliberate step -- reviewed with what happens next, then submitted.
  it("Review shows what adding does, sends nothing, and only Add account submits -- once", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      list: () => json(memberList([PLATFORM])),
      organization: () => json(listing([{ account_id: "222233334444", name: "Checkout staging" }])),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    expect(within(dialog).getByRole("button", { name: "Review" })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    expect(within(dialog).queryByRole("button", { name: /Add account/ })).toBeNull()
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Review" })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole("button", { name: "Review" }))

    const confirmation = within(dialog).getByTestId("add-account-confirmation")
    expect(confirmation).toHaveTextContent("Add AWS account 222233334444?")
    // Found in the list is not connected (Codex, 2026-10-03): the evidence is said, and what it does not show.
    expect(within(confirmation).getByTestId("account-id-evidence")).toHaveTextContent(
      /^Found in your organization's account list from .+ UTC, named “Checkout staging”\. That shows it is in your organization, not that Cyntro can connect to it: the connection is checked after it is added\.$/)
    // Stage1B G9: a listed account takes the same journey as any other -- recorded as pending, nothing read; check access;
    // only the operator's confirmation turns reading on and starts collection. Nothing is promised "right away".
    expect(confirmation).toHaveTextContent("Cyntro registers this account with this installation as pending. Nothing in it is read yet.")
    expect(confirmation).toHaveTextContent(
      `The connection stack is deployed in it: Cyntro will use the read role ${readRoleArn("222233334444")}.`)
    expect(confirmation).toHaveTextContent(
      "Then check access: Cyntro assumes its read role there and asks AWS which account answered, and its name. " +
      "AWS may log these calls in that account. Nothing else is read.")
    expect(confirmation).toHaveTextContent(
      "If the check reaches the account, you confirm it. Only your confirmation turns reading on and starts collection: " +
      "its configuration is read and its first inventory is queued.")
    expect(confirmation).toHaveTextContent("Read access only: nothing in the account is changed.")
    // Names and business systems are separate things (Alon, 2026-10-03).
    expect(confirmation).toHaveTextContent(
      "Cyntro shows the account by the name AWS holds for it once it is read; until then, by its ID. " +
      "Business systems in this account are defined after it connects; one account can hold several.")
    expect(confirmation).not.toHaveTextContent(/right away|start immediately|checks again about every 15 minutes|connects only when/)
    expect(confirmation).not.toHaveTextContent(/connects at once|collection starts immediately|the activity logs it has/)
    expect(confirmation).not.toHaveTextContent(/Environment|Regions|Unclassified/)
    expect(registered).toHaveLength(0)
    expect(calls((url, method) => url === "/api/proxy/admin/accounts" && method === "POST")).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0]).toEqual({ customer_id: CUSTOMER, account_id: "222233334444", read_role_arn: readRoleArn("222233334444") })
  })

  it("a member account is listed by the name AWS holds for it, or by its ID with the reason it has none yet", async () => {
    const unnamed = (id: string, fields: Record<string, unknown>) => ({ ...CONNECTED, account_id: id, display_name: id, aws_account_name: null, ...fields })
    installFetch({
      list: () => json(memberList([
        PLATFORM, CONNECTED, AWAITING,
        unnamed("123412341234", { aws_account_name_error: "NOT_PERMITTED" }),
        unnamed("567856785678", { aws_account_name_error: "UNREACHABLE:EndpointConnectionError" }),
        unnamed("901290129012", {}),
        unnamed("345634563456", { aws_account_name_error: "ThrottlingException" }),
        unnamed("135713571357", { display_name: "typed long ago" }),   // a row as an older backend sent it
        unnamed("246824682468", { aws_account_name_error: "NO_NAME" }),
      ])),
    })
    render(<AccountSettingsPage />)
    const row = async (id: string) => screen.findByTestId(`account-row-${id}`)
    const occurrences = (element: HTMLElement, text: string) => (element.textContent || "").split(text).length - 1

    const named = await row(CONNECTED.account_id)
    expect(named).toHaveTextContent("Data platform")
    expect(within(named).queryByTestId(`account-name-note-${CONNECTED.account_id}`)).toBeNull()

    const waiting = await row(AWAITING.account_id)
    expect(occurrences(waiting, AWAITING.account_id)).toBe(1)           // shown by its ID, once
    // A legacy row (no option-C registration) with no name: said plainly, never "once it connects" (r41).
    expect(within(waiting).getByTestId(`account-name-note-${AWAITING.account_id}`)).toHaveTextContent(
      "Name not read from AWS yet.")
    expect(waiting).not.toHaveTextContent("once it connects")
    expect(within(await row("123412341234")).getByTestId("account-name-note-123412341234")).toHaveTextContent(
      "Name not readable from AWS: AWS denied permission to read it. A connection stack deployed before this release may need updating (account:GetAccountInformation).")
    expect(within(await row("246824682468")).getByTestId("account-name-note-246824682468")).toHaveTextContent(
      "Name not readable from AWS: AWS did not return a name.")
    expect(within(await row("567856785678")).getByTestId("account-name-note-567856785678")).toHaveTextContent(
      "Name not readable from AWS: Cyntro could not reach the AWS account API.")
    expect(within(await row("901290129012")).getByTestId("account-name-note-901290129012")).toHaveTextContent(
      "Name not read from AWS yet.")
    expect(within(await row("345634563456")).getByTestId("account-name-note-345634563456")).toHaveTextContent(
      "Name not readable from AWS (ThrottlingException).")
    // Never a typed label for a member account, whatever a backend sends: no AWS name -> its ID.
    const older = await row("135713571357")
    expect(older).not.toHaveTextContent("typed long ago")
    expect(older).toHaveTextContent("135713571357")
    // ...and its actions are named the same way.
    expect(within(older).getByRole("button", { name: "Check connection for 135713571357" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /typed long ago/ })).toBeNull()

    const platform = await row(PLATFORM.account_id)
    expect(platform).toHaveTextContent(PLATFORM.display_name)
    expect(within(platform).queryByTestId(`account-name-note-${PLATFORM.account_id}`)).toBeNull()
  })

  it("Back from the review keeps what was typed and submits nothing", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      organization: () => json(listing([{ account_id: "222233334444" }])),
      register: () => json({}, 500),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Review" })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole("button", { name: "Review" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }))

    expect(within(dialog).queryByTestId("add-account-confirmation")).toBeNull()
    expect(within(dialog).getByLabelText("AWS account ID")).toHaveValue("222233334444")
    expect(calls((url, method) => url === "/api/proxy/admin/accounts" && method === "POST")).toHaveLength(0)
  })

  // The platform row says only what the backend reported about collecting the install's own account.
  it.each([
    [false, "The account Cyntro runs in, control plane only: it is not collected and needs no connection stack.", false],
    [true, "The account Cyntro is installed in; read directly, no connection stack.", true],
    [undefined, "The account Cyntro is installed in; it needs no connection stack.", true],
  ])("the platform row with data_account=%s says so, and links coverage only for a collected account",
    async (dataAccount, note, coverageLink) => {
      installFetch({ list: () => json(memberList([{ ...PLATFORM, data_account: dataAccount }])) })
      render(<AccountSettingsPage />)

      const platform = await screen.findByTestId(`account-row-${PLATFORM.account_id}`)
      expect(within(platform).getByText(note)).toBeInTheDocument()
      expect(Boolean(within(platform).queryByText(/read directly/))).toBe(dataAccount === true)
      expect(Boolean(within(platform).queryByRole("link", { name: `Evidence coverage for ${PLATFORM.account_id}` })))
        .toBe(coverageLink)
    })

  it.each(["READY", "CONNECTED", "REGISTERED"])(
    "a control-plane platform row never links coverage, even when its status is %s (Codex P1 review)",
    async (status) => {
      installFetch({ list: () => json(memberList([
        { ...PLATFORM, data_account: false, onboarding_status: status },
        { ...AWAITING, onboarding_status: "READY" },
      ])) })
      render(<AccountSettingsPage />)

      const platform = await screen.findByTestId(`account-row-${PLATFORM.account_id}`)
      expect(within(platform).queryByRole("link", { name: /^Evidence coverage for/ })).toBeNull()
      const member = screen.getByTestId(`account-row-${AWAITING.account_id}`)
      expect(within(member).getByRole("link", { name: `Evidence coverage for ${AWAITING.account_id}` })).toBeInTheDocument()
    })

  // H5: onboarding needs a verified operator; the backend's typed refusals are words, never a raw {"code": ...}.
  it.each([
    [401, "PERSON_TOKEN_REQUIRED", "Your sign-in did not reach Cyntro. Sign in again."],
    [401, "PERSON_TOKEN_INVALID", "Your sign-in could not be verified; it may have expired. Sign in again."],
    [401, "ALB_IDENTITY_REQUIRED", "This console's signed sign-in was missing from the request. Sign in again."],
    [401, "ALB_IDENTITY_INVALID", "This console's signed sign-in could not be verified. Sign in again."],
    [401, "PERSON_ISSUER_MISMATCH", "The two proofs of your sign-in do not name the same person. Sign in again."],
    [401, "PERSON_CLIENT_MISMATCH", "The two proofs of your sign-in do not name the same person. Sign in again."],
    [401, "PERSON_SUBJECT_MISMATCH", "The two proofs of your sign-in do not name the same person. Sign in again."],
    [403, "PERSON_NOT_AUTHORIZED",
      "Your sign-in is not permitted to administer this account. Your identity provider's administrator grants the Cyntro operator role."],
    [503, "ALB_KEY_UNAVAILABLE", "The sign-in signing key could not be fetched. Retry shortly."],
    [503, "PERSON_KEYS_UNAVAILABLE",
      "Cyntro could not load your identity provider's signing keys, so your sign-in could not be checked. If this continues, ask your installation administrator to check the identity provider's key address and this installation's connection settings."],
    [503, "PERSON_KEYS_INVALID",
      "This installation's sign-in keys for account administration are not usable as configured, so your sign-in could not be checked. Ask your installation administrator to install them again."],
    [503, "PERSON_KEYS_EXPIRED",
      "This installation's sign-in keys for account administration have expired, so your sign-in could not be checked. Ask your installation administrator to install current keys."],
    [503, "PERSON_KEYS_NO_MATCH",
      "Your sign-in uses a key this installation has not installed, so it could not be checked. Ask your installation administrator to install your identity provider's current keys."],
    [503, "ALB_TRUST_REQUIRED",
      "This installation's sign-in trust is not configured, so account administration is refused. This is an installation prerequisite."],
    [503, "ALB_TRUST_MISCONFIGURED",
      "This installation's sign-in trust is misconfigured, so account administration is refused. This is an installation prerequisite."],
    [409, "PERSON_IDENTITY_NOT_ENFORCED",
      "This installation does not require a verified personal sign-in, so account administration is refused."],
    [403, "ACCOUNT_ADMIN_ORIGIN_REFUSED", "The request did not come from this console. Reload the page and try again."],
  ])("a Check connection refused %s %s says why in words", async (status, code, words) => {
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING])),
      validate: () => json({ detail: { code } }, status),
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for 444455556666" }))
    expect(await screen.findByText(`Check connection refused (HTTP ${status}): ${words} Nothing was changed.`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(code))).not.toBeInTheDocument()
  })

  it("a registration refused for the person says so in the add dialog", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      register: () => json({ detail: { code: "PERSON_NOT_AUTHORIZED" } }, 403),
      organization: () => json(listing([{ account_id: "222233334444" }])),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.change(within(dialog).getByLabelText(/Read role ARN/), { target: { value: readRoleArn("222233334444") } })
    await reviewAndAdd(dialog)

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent(
      "Registration refused (HTTP 403): Your sign-in is not permitted to administer this account. " +
      "Your identity provider's administrator grants the Cyntro operator role. Nothing was changed.")
  })

  it.each([
    ["an unknown code", { code: "SOMETHING_NEW" }],
    ["an inherited property name", { code: "toString" }],
  ])("a detail with %s keeps the backend's own detail", async (_label, detail) => {
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING])),
      validate: () => json({ detail }, 403),
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for 444455556666" }))
    expect(await screen.findByText(`Check connection failed (HTTP 403): ${JSON.stringify(detail)}`)).toBeInTheDocument()
  })

  it("Connect before the member trust exists shows the backend message and a Retry that refetches", async () => {
    let ready = false
    installFetch({
      list: () => json(memberList([PLATFORM, AWAITING])),
      connect: (accountId) => ready
        ? json(connectFor({ account_id: accountId }))
        : json({
            detail: {
              error: "member_trust_not_ready",
              message: "The account connector has not established this install's member trust yet (it needs the AWS Organization id). Wait a moment and reload; if it persists, the connector cannot read the Organization.",
            },
          }, 409),
    })
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Connect 444455556666" }))
    const panel = await screen.findByRole("dialog", { name: "444455556666" })
    expect(await within(panel).findByText(/has not established this install's member trust yet/)).toBeInTheDocument()

    ready = true
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }))
    await within(panel).findByText("Download the connection stack")
    expect(calls((url) => url === "/api/proxy/admin/accounts/444455556666/connect?customer_id=acme-prod")).toHaveLength(2)
  })

  it("member-mode group creation shows the backend's 503 message instead of crashing", async () => {
    installFetch({ list: () => json(memberList([PLATFORM, CONNECTED])) })
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/proxy/admin/accounts/groups" && init?.method === "POST") {
        return json({
          detail: {
            error: "account_registry_write_unavailable_on_serving_tier",
            operation: "account-registry/create-group",
            reason: "account administration MERGEs registry nodes into the graph, and this is a Neptune serving tier whose graph credentials are read-only by design (CYNTRO_PROJECTOR_WORKER is not true).",
            what_to_do: "Run account administration where the write-capable identity lives; reads on this router keep working here.",
          },
        }, 503)
      }
      return base(input, init)
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: "Account Groups" }))
    fireEvent.click(screen.getByRole("button", { name: /Create account group/ }))
    const dialog = await screen.findByRole("dialog", { name: "Create account group" })
    fireEvent.change(within(dialog).getByLabelText("Display name"), { target: { value: "Production EU" } })
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Data platform/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: /Create group/ }))

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("Create account group failed (HTTP 503)")
    expect(alert).toHaveTextContent("read-only by design")
    expect(alert).toHaveTextContent("Run account administration where the write-capable identity lives")
  })

  it("the group picker shows an account not yet named by AWS by its ID once, and a named one by its name", async () => {
    installFetch({ list: () => json(memberList([PLATFORM, CONNECTED, { ...CONNECTED, account_id: "123412341234", display_name: "123412341234", aws_account_name: null },
      { ...CONNECTED, account_id: "135713571357", display_name: "typed long ago", aws_account_name: null }])) })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)
    fireEvent.click(screen.getByRole("button", { name: "Account Groups" }))
    fireEvent.click(screen.getByRole("button", { name: /Create account group/ }))
    const dialog = await screen.findByRole("dialog", { name: "Create account group" })
    const unnamed = within(dialog).getByRole("checkbox", { name: /123412341234/ }).closest("label") as HTMLElement
    expect((unnamed.textContent || "").split("123412341234").length - 1).toBe(1)
    // An older member row's typed label is never shown: no AWS name -> its ID (accountLabel).
    expect(dialog).not.toHaveTextContent("typed long ago")
    const older = within(dialog).getByRole("checkbox", { name: /135713571357/ }).closest("label") as HTMLElement
    expect((older.textContent || "").split("135713571357").length - 1).toBe(1)
    const named = within(dialog).getByRole("checkbox", { name: /Data platform/ }).closest("label") as HTMLElement
    expect(named).toHaveTextContent(`Data platform${CONNECTED.account_id}`)
  })
})

describe("Settings > Accounts — an older member row's typed label is never shown", () => {
  const OLDER = { ...AWAITING, account_id: "135713571357", display_name: "typed long ago", aws_account_name: null }

  it("a group's chip names it by its ID", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM, CONNECTED, OLDER])),
      groups: () => json({ customer_id: CUSTOMER, groups: [{ customer_id: CUSTOMER, group_id: "prod-eu", name: "Production EU",
        description: "", account_ids: [OLDER.account_id, CONNECTED.account_id] }] }),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)
    fireEvent.click(screen.getByRole("button", { name: "Account Groups" }))
    const card = (await screen.findByText("Production EU")).closest("div.border-b") as HTMLElement
    expect(card).toHaveTextContent(OLDER.account_id)
    expect(card).toHaveTextContent("Data platform")
    expect(card).not.toHaveTextContent("typed long ago")
  })

  it("the connect panel is titled by its ID", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM, OLDER])),
      connect: () => json({ detail: "not under test" }, 409),
    })
    render(<AccountSettingsPage />)
    fireEvent.click(await screen.findByRole("button", { name: `Connect ${OLDER.account_id}` }))
    const panel = await screen.findByRole("dialog", { name: OLDER.account_id })
    expect(panel).not.toHaveTextContent("typed long ago")
  })
})

describe("Settings > Accounts — legacy (hosted plane) list without `mode`", () => {
  it("B3: the legacy add dialog defaults Environment to Unclassified too", async () => {
    installFetch({
      list: () => json({
        customer_id: CUSTOMER, accounts: [], total: 0, registry_available: false,
        summary: { connected: 0, needs_attention: 0, discovered: 0, mutation_enabled: 0 },
      }),
    })
    render(<AccountSettingsPage />)
    fireEvent.click(await screen.findByRole("button", { name: /Add AWS account/ }))
    await screen.findByText("Add an AWS account")
    expect(screen.getByLabelText("Environment")).toHaveValue("UNCLASSIFIED")
  })

  it("keeps the legacy table, Validate action and registry banner", async () => {
    installFetch({
      list: () => json({
        customer_id: CUSTOMER,
        accounts: [
          {
            customer_id: CUSTOMER,
            account_id: "444455556666",
            display_name: "444455556666",
            environment: "UNCLASSIFIED",
            regions: ["eu-west-1"],
            onboarding_status: "DISCOVERED",
            collection_mode: "OBSERVED_ONLY",
            read_enabled: false,
            verification_enabled: false,
            mutation_enabled: false,
            install_method: "NOT_INSTALLED",
            evidence_source_count: 3,
            last_evidence_at: "2026-09-30T22:10:00+00:00",
          },
        ],
        total: 1,
        registry_available: false,
        summary: { connected: 0, needs_attention: 0, discovered: 1, mutation_enabled: 0 },
      }),
    })
    render(<AccountSettingsPage />)

    expect(await screen.findByText("Registry storage is not provisioned")).toBeInTheDocument()
    expect(screen.getByText("DISCOVERED", { selector: "span.rounded" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Enroll" })).toBeInTheDocument()
    expect(screen.queryByTestId(/^account-row-/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Connect/ })).not.toBeInTheDocument()
  })
})
