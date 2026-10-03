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
  display_name: "Payments production",
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
  connect?: (accountId: string) => Response
  validate?: (accountId: string) => Response
  register?: (body: Record<string, unknown>) => Response
}

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(handlers: Handlers) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
    const connect = url.match(/^\/api\/proxy\/admin\/accounts\/(\d{12})\/connect\?customer_id=acme-prod$/)
    if (connect && method === "GET" && handlers.connect) return handlers.connect(connect[1])
    const validate = url.match(/^\/api\/proxy\/admin\/accounts\/(\d{12})\/validate\?customer_id=acme-prod$/)
    if (validate && method === "POST" && handlers.validate) return handlers.validate(validate[1])
    if (url === "/api/proxy/admin/accounts" && method === "POST" && handlers.register) {
      return handlers.register(JSON.parse(String(init?.body)))
    }
    if (url === "/api/proxy/admin/accounts?customer_id=acme-prod" && method === "GET") return handlers.list()
    return json({ detail: `unexpected ${method} ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)
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
    expect(within(awaiting).getByRole("button", { name: "Connect Payments production" })).toBeInTheDocument()

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

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for Payments production" }))
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
          display_name: "Checkout staging",
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
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    expect(within(dialog).queryByText(/StackSet/)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Regions/)).toHaveValue("eu-central-1") // the platform account's region

    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Checkout staging" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "2222-3333-4444" } })
    fireEvent.change(within(dialog).getByLabelText("Environment"), { target: { value: "STAGING" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))

    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0]).toEqual({
      customer_id: CUSTOMER,
      account_id: "222233334444",
      display_name: "Checkout staging",
      environment: "STAGING",
      regions: ["eu-central-1"],
    })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add an AWS account" })).not.toBeInTheDocument())
    const row = await screen.findByTestId("account-row-222233334444")
    expect(within(row).getByText("Registering")).toBeInTheDocument()
    expect(within(row).getByText("Registration queued")).toBeInTheDocument()
    expect(within(row).queryAllByRole("button")).toHaveLength(0)
  })

  it("B3: Environment defaults to Unclassified -- an untouched form registers UNCLASSIFIED, never PRODUCTION", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      list: () => json(memberList([PLATFORM, CONNECTED])),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)
    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    const environment = within(dialog).getByLabelText("Environment")
    expect(environment).toHaveValue("UNCLASSIFIED")
    expect(within(environment).getAllByRole("option").map((option) => [(option as HTMLOptionElement).value, option.textContent])).toEqual([
      ["UNCLASSIFIED", "Unclassified"], ["PRODUCTION", "Production"], ["STAGING", "Staging"], ["DEVELOPMENT", "Development"],
      ["TEST", "Test"], ["SANDBOX", "Sandbox"], ["SHARED_SERVICES", "Shared services"], ["MIXED", "Mixed"],
    ])
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Ledger" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "555566667777" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0].environment).toBe("UNCLASSIFIED")
  })

  it("B3: a stored environment -- a custom one included -- is shown as recorded, never remapped", async () => {
    installFetch({ list: () => json(memberList([PLATFORM, { ...CONNECTED, environment: "PCI_ZONE" }])) })
    render(<AccountSettingsPage />)
    const row = await screen.findByTestId(`account-row-${CONNECTED.account_id}`)
    expect(within(row).getByText("PCI_ZONE")).toBeInTheDocument()
    expect(within(row).queryByText("UNCLASSIFIED")).not.toBeInTheDocument()
  })

  it("B3: a chosen environment from the new list is sent as its registry token", async () => {
    const registered: Record<string, unknown>[] = []
    installFetch({
      list: () => json(memberList([PLATFORM, CONNECTED])),
      register: (body) => {
        registered.push(body)
        return json({ customer_id: CUSTOMER, account_id: body.account_id, action: "register", request_status: "queued", already_open: false, requested_at: "2026-10-01T10:00:00.000000+00:00" }, 202)
      },
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)
    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Mixed estate" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "555566668888" } })
    fireEvent.change(within(dialog).getByLabelText("Environment"), { target: { value: "MIXED" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await waitFor(() => expect(registered).toHaveLength(1))
    expect(registered[0].environment).toBe("MIXED")
  })

  it("polls every 4 s while an account is REGISTERING, opens Connect once it is AWAITING_CONNECTION, then stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const NEW = { ...AWAITING, account_id: "222233334444", display_name: "Checkout staging" }
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
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: NEW.display_name } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: NEW.account_id } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))
    await screen.findByTestId("account-row-222233334444")
    expect(screen.queryByRole("dialog", { name: "Checkout staging" })).not.toBeInTheDocument()

    // The connector created the row: the next poll finds it waiting for its stack.
    list = memberList([PLATFORM, NEW])
    const before = listCalls().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(listCalls().length).toBe(before + 1)
    const panel = await screen.findByRole("dialog", { name: "Checkout staging" })
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

    fireEvent.click(await screen.findByRole("button", { name: "Connect Payments production" }))
    const panel = await screen.findByRole("dialog", { name: "Payments production" })
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

    const notice = await screen.findByText("Connection check for Payments production (444455556666) failed")
    const alert = notice.closest("[role=alert]") as HTMLElement
    expect(within(alert).getByText("ValueError: account 444455556666 is not a registered member account")).toBeInTheDocument()
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss failed connection check for 444455556666" }))
    expect(screen.queryByText("Connection check for Payments production (444455556666) failed")).not.toBeInTheDocument()
  })
})

describe("Settings > Accounts — backend errors carry the backend's detail", () => {
  it("shows detail.message when the add dialog is refused (platform account)", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      register: () => json({
        detail: {
          error: "platform_account_is_not_a_member",
          message: "This is the account Cyntro is installed in; it is read as itself and needs no connection stack.",
        },
      }, 422),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Security tooling" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "111122223333" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("HTTP 422")
    expect(alert).toHaveTextContent("This is the account Cyntro is installed in; it is read as itself and needs no connection stack.")
  })

  it("shows a pydantic validation list as field: message", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      register: () => json({
        detail: [{ type: "string_too_long", loc: ["body", "display_name"], msg: "String should have at most 120 characters", input: "x" }],
      }, 422),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Checkout" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "222233334444" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))

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

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for Payments production" }))
    expect(await screen.findByText("Check connection failed (HTTP 422): account_id must be a 12-digit AWS account ID")).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for Payments production" }))
    expect(await screen.findByText(`Check connection refused (HTTP ${status}): ${words} Nothing was changed.`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(code))).not.toBeInTheDocument()
  })

  it("a registration refused for the person says so in the add dialog", async () => {
    installFetch({
      list: () => json(memberList([PLATFORM])),
      register: () => json({ detail: { code: "PERSON_NOT_AUTHORIZED" } }, 403),
    })
    render(<AccountSettingsPage />)
    await screen.findAllByTestId(/^account-row-/)

    fireEvent.click(screen.getByRole("button", { name: /Add AWS account/ }))
    const dialog = await screen.findByRole("dialog", { name: "Add an AWS account" })
    fireEvent.change(within(dialog).getByLabelText("Account name"), { target: { value: "Security tooling" } })
    fireEvent.change(within(dialog).getByLabelText("AWS account ID"), { target: { value: "111122223333" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /Add account/ }))

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

    fireEvent.click(await screen.findByRole("button", { name: "Check connection for Payments production" }))
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

    fireEvent.click(await screen.findByRole("button", { name: "Connect Payments production" }))
    const panel = await screen.findByRole("dialog", { name: "Payments production" })
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
