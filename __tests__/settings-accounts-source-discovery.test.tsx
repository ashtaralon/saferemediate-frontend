/**
 * Settings > Accounts: per-region source discovery, per-feature coverage and the scoped
 * AWS Config enablement (backend contract: GET /api/admin/accounts/{id}/connect `notes.regions`,
 * GET /api/admin/accounts rows' `coverage`).
 *
 * Every row below is a TEST INPUT shaped like that contract, with plainly synthetic values
 * (accounts 111111111111 / 222222222222, customer "test-customer"); the panel and the page
 * render only what fetch returns.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/account-scope-context", () => ({
  useAccountScope: () => ({ customerId: "test-customer", refresh: vi.fn() }),
}))
vi.mock("@/components/left-sidebar-nav", () => ({ LeftSidebarNav: () => null }))

import AccountSettingsPage from "@/app/settings/accounts/page"
import { ConnectAccountPanel } from "@/components/settings/connect-account-panel"

const CUSTOMER = "test-customer"
const PLATFORM_ID = "111111111111"
const MEMBER_ID = "222222222222"
const CONNECT_URL = `/api/proxy/admin/accounts/${MEMBER_ID}/connect?customer_id=${CUSTOMER}`
const LIST_URL = `/api/proxy/admin/accounts?customer_id=${CUSTOMER}`
const VALIDATE_URL = `/api/proxy/admin/accounts/${MEMBER_ID}/validate?customer_id=${CUSTOMER}`
const CONFIG_CONSOLE = "https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/create"

const INVENTORY = "Inventory, Systems and All Services"
const OBSERVED = "Observed traffic and dependency maps"
const IAM_USAGE = "IAM usage evidence (least privilege)"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const ALL_COVERED = [
  { feature: "inventory", label: INVENTORY, status: "COVERED", lacking: [] },
  { feature: "observed_traffic", label: OBSERVED, status: "COVERED", lacking: [] },
  { feature: "iam_usage", label: IAM_USAGE, status: "COVERED", lacking: [] },
]

const NONE_NEEDED = {
  offer: "NONE_NEEDED",
  detail: "Recorder default already records network interfaces in this Region.",
  instructions: [],
  features_affected: [],
  scope_statement: null,
  extracted_fields: [],
}

/** Recording, baseline complete: the backend stamps the proven start. */
const REGION_PROVEN = {
  region: "eu-central-1",
  discovered_at: "2026-10-01T20:40:00+00:00",
  features: ALL_COVERED,
  sources: {
    vpc_flow: {
      status: "PRESENT",
      detail: "2 of 2 VPCs have a usable flow log",
      usable_groups: ["/vpc/flowlogs/test-central"],
      vpcs_without: [],
    },
    cloudtrail: {
      status: "PRESENT",
      detail: "Trail test-trail (multi-Region) is logging",
      trail: `arn:aws:cloudtrail:eu-central-1:${MEMBER_ID}:trail/test-trail`,
      lookup_events: "READABLE",
    },
    config_eni: {
      status: "RECORDING",
      detail: "Recorder default records all supported types continuously",
      recorder: "default",
      managed_by: "CUSTOMER",
      proven_coverage_start: "2026-10-01T20:31:12+00:00",
      baseline: { interfaces: 14, recorded: 14, complete: true },
    },
  },
  config_enablement: NONE_NEEDED,
}

/** Recording, baseline NOT complete: no proven start, and the panel must not make one up. */
const REGION_RECORDING_UNPROVEN = {
  region: "eu-north-1",
  discovered_at: "2026-10-01T20:40:00+00:00",
  features: ALL_COVERED,
  sources: {
    vpc_flow: { status: "PRESENT", detail: "1 of 1 VPCs has a usable flow log", usable_groups: ["/vpc/flowlogs/test-north"], vpcs_without: [] },
    cloudtrail: { status: "PRESENT", detail: "Trail test-trail (multi-Region) is logging", trail: null, lookup_events: "READABLE" },
    config_eni: {
      status: "RECORDING",
      detail: "Recorder default records network interfaces; 9 of 14 interfaces have a configuration item so far",
      recorder: "default",
      managed_by: "CUSTOMER",
      proven_coverage_start: null,
      baseline: { interfaces: 14, recorded: 9, complete: false },
    },
  },
  config_enablement: NONE_NEEDED,
}

const CONFIG_COST = {
  price: {
    usd_per_item: "0.003",
    unit: "configuration item recorded (continuous)",
    usage_type: "EU-ConfigurationItemRecorded",
    effective: "2026-06-01T00:00:00Z",
    source: "AWS Price List API (AWSConfig)",
  },
  baseline_items: 14,
  baseline_usd: "0.04",
  changes_last_7_days: 40,
  changes_complete: false,
  monthly_items_estimate: 171,
  monthly_usd_estimate: "0.51",
  basis: "One configuration item per network-interface change; the monthly figure scales the last 7 days to 30 days.",
}

function cyntroStack(overrides: Record<string, unknown> = {}) {
  return {
    offer: "CYNTRO_STACK",
    detail: "No configuration recorder exists in eu-west-1. A Cyntro stack can record network interfaces only, in this Region only.",
    instructions: [],
    features_affected: [OBSERVED],
    scope_statement: `Records every AWS::EC2::NetworkInterface in account ${MEMBER_ID}, eu-west-1 (continuous recording). Cyntro reads only the fields listed.`,
    extracted_fields: ["interface id", "attached security groups", "attachment (instance / service)", "subnet and VPC", "private IP addresses", "configuration capture time"],
    stack_name: "cyntro-eni-config-eu-west-1",
    template_path: "/api/admin/accounts/connect/config-template",
    console_url: CONFIG_CONSOLE,
    parameters: { CustomerId: CUSTOMER, DeliveryRetentionDays: "90" },
    cli: "aws cloudformation deploy --stack-name cyntro-eni-config-eu-west-1 --region eu-west-1 --template-file account-eni-config-recorder.yaml --parameter-overrides CustomerId=test-customer DeliveryRetentionDays=90",
    cost: CONFIG_COST,
    ...overrides,
  }
}

/** No recorder: observed traffic lacks coverage; the backend offers the optional Cyntro stack. */
function regionLacking(configEnablement: Record<string, unknown> = cyntroStack()) {
  return {
    region: "eu-west-1",
    discovered_at: "2026-10-01T20:40:00+00:00",
    features: [
      { feature: "inventory", label: INVENTORY, status: "COVERED", lacking: [] },
      {
        feature: "observed_traffic",
        label: OBSERVED,
        status: "LACKING",
        lacking: [
          { source: "config_eni", reason: "No AWS Config recorder in this Region" },
          { source: "vpc_flow", reason: "1 of 2 VPCs has no usable flow log" },
        ],
      },
      { feature: "iam_usage", label: IAM_USAGE, status: "COVERED", lacking: [] },
    ],
    sources: {
      vpc_flow: {
        status: "PARTIAL",
        detail: "1 of 2 VPCs has a usable flow log",
        usable_groups: ["/vpc/flowlogs/test-west"],
        vpcs_without: ["vpc-0test0000000001"],
      },
      cloudtrail: { status: "PRESENT", detail: "Trail test-trail (multi-Region) is logging", trail: null, lookup_events: "READABLE" },
      config_eni: {
        status: "NO_RECORDER",
        detail: "No configuration recorder in eu-west-1",
        recorder: null,
        managed_by: null,
        proven_coverage_start: null,
        baseline: null,
      },
    },
    config_enablement: configEnablement,
  }
}

function connectBody(notes: Record<string, unknown> = {}) {
  return {
    customer_id: CUSTOMER,
    account_id: MEMBER_ID,
    stack_name: "cyntro-account-connection",
    region: "eu-west-1",
    template_path: "/api/admin/accounts/connect/template",
    console_url: CONFIG_CONSOLE,
    parameters: {
      CustomerId: CUSTOMER,
      SecurityToolingAccountId: PLATFORM_ID,
      ExternalId: "00000000000000000000000000000000",
      OrganizationId: "o-test000000",
      ExistingFlowLogGroupArns: "",
      FlowLogVpcId: "",
      EksClusterName: "",
    },
    cli: "aws cloudformation deploy --stack-name cyntro-account-connection --region eu-west-1",
    notes: {
      flow_log_groups_found: 0,
      flow_log_groups_usable: 0,
      flow_log_groups_without_required_fields: [],
      eks_clusters: [],
      discovered: true,
      ...notes,
    },
  }
}

const MEMBER_ROW = {
  customer_id: CUSTOMER,
  account_id: MEMBER_ID,
  display_name: "Test workload",
  environment: "PRODUCTION",
  regions: ["eu-west-1"],
  onboarding_status: "CONNECTED",
  collection_mode: "MEMBER_READ_ROLE",
  read_enabled: true,
  verification_enabled: false,
  mutation_enabled: false,
  validation_message: "Connected.",
  last_validated_at: "2026-10-01T09:00:00+00:00",
  sources: {},
  pending_request: null,
  is_platform_account: false,
}

const PLATFORM_ROW = {
  ...MEMBER_ROW,
  account_id: PLATFORM_ID,
  display_name: "Test platform",
  environment: "SHARED_SERVICES",
  onboarding_status: "REGISTERED",
  collection_mode: "LOCAL_CUSTOMER_PLANE",
  validation_message: null,
  last_validated_at: null,
  is_platform_account: true,
}

function memberList(accounts: Array<Record<string, unknown>>) {
  return {
    customer_id: CUSTOMER,
    mode: "MEMBER_ACCOUNTS",
    accounts,
    total: accounts.length,
    registry_available: true,
    member_trust: { platform_account_id: PLATFORM_ID, organization_id: "o-test000000", ready: true },
    failed_requests: [],
    summary: { connected: 1, needs_attention: 0, discovered: 0, mutation_enabled: 0 },
  }
}

let fetchMock: ReturnType<typeof vi.fn>

async function openPanel(body: unknown) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input) === CONNECT_URL ? json(body) : json({ detail: `unexpected ${String(input)}` }, 404),
  )
  vi.stubGlobal("fetch", fetchMock)
  render(
    <ConnectAccountPanel
      customerId={CUSTOMER}
      accountId={MEMBER_ID}
      account={MEMBER_ROW}
      failedRequests={[]}
      onClose={() => {}}
      onCheckConnection={async () => "2026-10-01T21:00:00+00:00"}
    />,
  )
  const dialog = await screen.findByRole("dialog", { name: "Test workload" })
  await within(dialog).findByText("Download the connection stack")
  return dialog
}

function regionGroup(dialog: HTMLElement, region: string) {
  return within(dialog).getByRole("group", { name: `Data sources in ${region}` })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Connect panel — Data sources by Region", () => {
  it("renders each region's features, the backend's source details, and the proven start only where the backend set it", async () => {
    const dialog = await openPanel(connectBody({ regions: [REGION_PROVEN, REGION_RECORDING_UNPROVEN, regionLacking()] }))

    const section = within(dialog).getByTestId("data-sources-by-region")
    expect(within(section).getByRole("heading", { name: "Data sources by Region" })).toBeInTheDocument()
    expect(within(section).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "Data sources in eu-central-1",
      "Data sources in eu-north-1",
      "Data sources in eu-west-1",
    ])

    // Proven region: every feature covered, each source line is the backend's own sentence.
    const proven = regionGroup(dialog, "eu-central-1")
    for (const label of [INVENTORY, OBSERVED, IAM_USAGE]) {
      const feature = within(proven).getByText(label).closest("li") as HTMLElement
      expect(within(feature).getByText("Covered")).toBeInTheDocument()
    }
    expect(within(proven).getByTestId("region-source-eu-central-1-vpc_flow")).toHaveTextContent("VPC Flow Logs")
    expect(within(proven).getByText("2 of 2 VPCs have a usable flow log")).toBeInTheDocument()
    expect(within(proven).getByText("Trail test-trail (multi-Region) is logging")).toBeInTheDocument()
    expect(within(proven).getByText("Recorder default records all supported types continuously")).toBeInTheDocument()
    expect(within(proven).getByTestId("config-eni-proven-start")).toHaveTextContent("Recording proven since 2026-10-01 20:31:12 UTC")
    expect(within(proven).getByText("Read 2026-10-01 20:40 UTC")).toBeInTheDocument()
    // NONE_NEEDED: nothing beyond the config_eni source line.
    expect(within(proven).queryByTestId("config-enablement-eu-central-1")).not.toBeInTheDocument()
    expect(within(proven).queryByText(/Recorder default already records/)).not.toBeInTheDocument()

    // RECORDING with an incomplete baseline: no proven start is shown or inferred.
    const unproven = regionGroup(dialog, "eu-north-1")
    expect(within(unproven).getByText("RECORDING")).toBeInTheDocument()
    expect(
      within(unproven).getByText("Recorder default records network interfaces; 9 of 14 interfaces have a configuration item so far"),
    ).toBeInTheDocument()
    expect(within(unproven).getByText("Baseline: 9 of 14 network interfaces recorded")).toBeInTheDocument()
    expect(within(unproven).queryByTestId("config-eni-proven-start")).not.toBeInTheDocument()
    expect(within(unproven).queryByText(/proven since/i)).not.toBeInTheDocument()

    // Lacking region: the feature names each missing source and the backend's reason.
    const lacking = regionGroup(dialog, "eu-west-1")
    const observed = within(lacking).getByTestId("region-feature-eu-west-1-observed_traffic")
    expect(within(observed).getByText("Lacking coverage")).toBeInTheDocument()
    expect(observed).toHaveTextContent("AWS Config (network interfaces): No AWS Config recorder in this Region")
    expect(observed).toHaveTextContent("VPC Flow Logs: 1 of 2 VPCs has no usable flow log")
    expect(within(within(lacking).getByTestId("region-feature-eu-west-1-inventory")).getByText("Covered")).toBeInTheDocument()
    expect(within(lacking).getByText("1 of 2 VPCs has a usable flow log")).toBeInTheDocument()
    expect(within(lacking).getByTestId("region-source-eu-west-1-vpc_flow")).toHaveTextContent("Without a usable flow log: vpc-0test0000000001")
    expect(within(lacking).getByText("No configuration recorder in eu-west-1")).toBeInTheDocument()
    expect(within(lacking).queryByTestId("config-eni-proven-start")).not.toBeInTheDocument()

    expect(dialog).not.toHaveTextContent(/unknown/i)
  })

  it("offers the CYNTRO_STACK Config recorder collapsed by default, and shows cost, template, console and parameters when expanded", async () => {
    const dialog = await openPanel(connectBody({ regions: [regionLacking()] }))
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")

    const toggle = within(block).getByRole("button", { name: "Enable AWS Config for network interfaces in eu-west-1 (optional)" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    // Optional and declinable, visible while collapsed.
    expect(block).toHaveTextContent("Optional: nothing is enabled unless you deploy this stack.")
    expect(block).toHaveTextContent(`Declining leaves the account connected, with ${OBSERVED} lacking coverage in eu-west-1.`)
    // Collapsed: no stack controls, no cost, nothing pre-selected.
    expect(within(block).queryByRole("link")).not.toBeInTheDocument()
    expect(within(block).queryByTestId("config-cost")).not.toBeInTheDocument()
    expect(within(block).queryByText("cyntro-eni-config-eu-west-1")).not.toBeInTheDocument()
    expect(within(block).queryByRole("checkbox")).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    expect(within(block).getByText("Features that need it").nextElementSibling).toHaveTextContent(OBSERVED)
    expect(within(block).getByText(cyntroStack().scope_statement as string)).toBeInTheDocument()
    for (const field of cyntroStack().extracted_fields as string[]) {
      expect(within(block).getByText(field)).toBeInTheDocument()
    }

    const cost = within(block).getByTestId("config-cost")
    expect(cost).toHaveTextContent(
      "Price: $0.003 per configuration item recorded (continuous) (EU-ConfigurationItemRecorded) · AWS Price List API (AWSConfig), effective 2026-06-01 00:00 UTC",
    )
    expect(cost).toHaveTextContent("One-time baseline: 14 configuration items (one per current network interface) — $0.04")
    expect(cost).toHaveTextContent("Last 7 days: at least 40 network-interface changes in CloudTrail")
    // Derived from the incomplete 7-day count, so the monthly items and USD are floors too.
    expect(within(cost).getByTestId("config-cost-monthly")).toHaveTextContent(
      "Estimated ongoing: at least 171 configuration items per month — at least $0.51 per month",
    )
    expect(within(cost).getByText(CONFIG_COST.basis)).toBeInTheDocument()

    const download = within(block).getByRole("link", { name: /Download template/ })
    expect(download).toHaveAttribute("href", "/api/proxy/admin/accounts/connect/config-template")
    expect(download).toHaveAttribute("download")
    const consoleLink = within(block).getByRole("link", { name: /Open CloudFormation in eu-west-1/ })
    expect(consoleLink).toHaveAttribute("href", CONFIG_CONSOLE)
    expect(consoleLink).toHaveAttribute("target", "_blank")
    expect(consoleLink.getAttribute("rel")).toContain("noopener")

    expect(within(block).getByText("cyntro-eni-config-eu-west-1")).toBeInTheDocument()
    expect(within(block).getByRole("button", { name: "Copy stack name for the eu-west-1 Config stack" })).toBeInTheDocument()
    for (const [name, value] of Object.entries({ CustomerId: CUSTOMER, DeliveryRetentionDays: "90" })) {
      const row = within(block).getByTestId(`config-parameter-eu-west-1-${name}`)
      expect(row).toHaveTextContent(name)
      expect(row).toHaveTextContent(value)
      expect(within(row).getByRole("button", { name: `Copy ${name} for the eu-west-1 Config stack` })).toBeInTheDocument()
    }
    expect(within(block).getByText(cyntroStack().cli as string)).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(within(block).queryByRole("link")).not.toBeInTheDocument()
  })

  it("states an exact 7-day count and monthly estimate only when the backend says the count is complete", async () => {
    const dialog = await openPanel(
      connectBody({ regions: [regionLacking(cyntroStack({ cost: { ...CONFIG_COST, changes_complete: true } }))] }),
    )
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
    fireEvent.click(within(block).getByRole("button", { name: /Enable AWS Config/ }))
    const cost = within(block).getByTestId("config-cost")
    expect(cost).toHaveTextContent("Last 7 days: 40 network-interface changes in CloudTrail")
    expect(within(cost).getByTestId("config-cost-monthly")).toHaveTextContent(
      "Estimated ongoing: 171 configuration items per month — $0.51 per month",
    )
    expect(cost).not.toHaveTextContent("at least")
  })

  it("treats a missing changes_complete as incomplete: the 7-day count and the monthly estimate are floors", async () => {
    const { changes_complete: _omitted, ...withoutCompleteness } = CONFIG_COST
    const dialog = await openPanel(connectBody({ regions: [regionLacking(cyntroStack({ cost: withoutCompleteness }))] }))
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
    fireEvent.click(within(block).getByRole("button", { name: /Enable AWS Config/ }))
    const cost = within(block).getByTestId("config-cost")
    expect(cost).toHaveTextContent("Last 7 days: at least 40 network-interface changes in CloudTrail")
    expect(within(cost).getByTestId("config-cost-monthly")).toHaveTextContent(
      "Estimated ongoing: at least 171 configuration items per month — at least $0.51 per month",
    )
  })

  it("with cost.price null shows price_unavailable verbatim and no dollar amount at all", async () => {
    const unavailable = "AWS Price List API could not be read from this install: EndpointConnectionError"
    const dialog = await openPanel(
      connectBody({
        regions: [
          regionLacking(
            cyntroStack({ cost: { ...CONFIG_COST, price: null, price_unavailable: unavailable, changes_complete: true } }),
          ),
        ],
      }),
    )
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
    fireEvent.click(within(block).getByRole("button", { name: /Enable AWS Config/ }))

    expect(within(block).getByTestId("config-cost-price-unavailable")).toHaveTextContent(unavailable)
    expect(block.textContent).not.toContain("$")
    // The backend's USD fields are not shown without the price they were computed from.
    expect(block.textContent).not.toContain("0.04")
    expect(block.textContent).not.toContain("0.51")
    expect(block.textContent).not.toContain("0.003")
    // Item counts are not dollar amounts and stay.
    const cost = within(block).getByTestId("config-cost")
    expect(cost).toHaveTextContent("One-time baseline: 14 configuration items (one per current network interface)")
    expect(within(cost).getByTestId("config-cost-monthly")).toHaveTextContent(/^Estimated ongoing: 171 configuration items per month$/)
  })

  it("with cost.price null and an incomplete count, the monthly item estimate is a floor and still has no dollar amount", async () => {
    const dialog = await openPanel(
      connectBody({
        regions: [
          regionLacking(
            cyntroStack({ cost: { ...CONFIG_COST, price: null, price_unavailable: "No price for this Region", changes_complete: false } }),
          ),
        ],
      }),
    )
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
    fireEvent.click(within(block).getByRole("button", { name: /Enable AWS Config/ }))
    expect(within(block).getByTestId("config-cost-monthly")).toHaveTextContent(
      /^Estimated ongoing: at least 171 configuration items per month$/,
    )
    expect(block.textContent).not.toContain("$")
  })

  it("offers no Download template link when the backend named no Config template (never the connection template)", async () => {
    const dialog = await openPanel(connectBody({ regions: [regionLacking(cyntroStack({ template_path: null }))] }))
    const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
    fireEvent.click(within(block).getByRole("button", { name: /Enable AWS Config/ }))
    expect(within(block).queryByRole("link", { name: /Download template/ })).not.toBeInTheDocument()
    expect(within(block).getByRole("link", { name: /Open CloudFormation in eu-west-1/ })).toBeInTheDocument()
  })

  it.each(["ADJUST_EXISTING_RECORDER", "CONTROL_TOWER_MANAGED", "UNREADABLE"])(
    "%s renders the backend's detail and numbered instructions, with no stack controls",
    async (offer) => {
      const steps = [
        `Open AWS Config in eu-west-1 in account ${MEMBER_ID}.`,
        "Add AWS::EC2::NetworkInterface to the recorder's resource types.",
        "Return here and press Check connection.",
      ]
      const detail = `Recorder default in eu-west-1 records a fixed list of resource types without AWS::EC2::NetworkInterface (${offer}).`
      const dialog = await openPanel(
        connectBody({
          regions: [
            regionLacking({
              offer,
              detail,
              instructions: steps,
              features_affected: [OBSERVED],
              // Stack fields on a non-stack offer are ignored.
              template_path: "/api/admin/accounts/connect/config-template",
              stack_name: "cyntro-eni-config-eu-west-1",
              console_url: CONFIG_CONSOLE,
              parameters: { CustomerId: CUSTOMER },
              cli: "aws cloudformation deploy --stack-name cyntro-eni-config-eu-west-1",
            }),
          ],
        }),
      )
      const block = within(regionGroup(dialog, "eu-west-1")).getByTestId("config-enablement-eu-west-1")
      expect(within(block).getByText(detail)).toBeInTheDocument()
      const list = within(block).getByRole("list")
      expect(list.tagName).toBe("OL")
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(steps)

      expect(within(block).queryByRole("link", { name: /Download template/ })).not.toBeInTheDocument()
      expect(within(block).queryByRole("link")).not.toBeInTheDocument()
      expect(within(block).queryByRole("button")).not.toBeInTheDocument()
      expect(within(block).queryByText("cyntro-eni-config-eu-west-1")).not.toBeInTheDocument()
      expect(within(block).queryByTestId(/^config-parameter-/)).not.toBeInTheDocument()
      // The only Download template link in the panel is the connection stack's own (Step 1).
      expect(within(dialog).getAllByRole("link", { name: /Download template/ })).toHaveLength(1)
    },
  )

  it("an older response without notes.regions (or with an empty list) renders the panel exactly as before", async () => {
    const legacy = connectBody()
    delete (legacy.notes as Record<string, unknown>).regions
    const dialog = await openPanel(legacy)
    expect(within(dialog).queryByText("Data sources by Region")).not.toBeInTheDocument()
    expect(within(dialog).queryByTestId("data-sources-by-region")).not.toBeInTheDocument()
    for (const title of ["Download the connection stack", "Create the stack", "Check connection"]) {
      expect(within(dialog).getAllByText(title).length).toBeGreaterThan(0)
    }
    expect(within(dialog).getAllByRole("link", { name: /Download template/ })).toHaveLength(1)
    expect(within(dialog).getAllByRole("link", { name: /Open CloudFormation/ })).toHaveLength(1)
  })

  it("an empty notes.regions list renders no section", async () => {
    const dialog = await openPanel(connectBody({ regions: [] }))
    expect(within(dialog).queryByTestId("data-sources-by-region")).not.toBeInTheDocument()
  })
})

describe("Connect panel — Check connection re-reads the regions", () => {
  it("after a finished check the panel re-reads /connect and shows the newly proven Config start", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const requestedAt = "2026-10-01T21:00:00.000000+00:00"
    const before = regionLacking()
    const after = {
      ...REGION_PROVEN,
      region: "eu-west-1",
      sources: {
        ...REGION_PROVEN.sources,
        config_eni: {
          ...REGION_PROVEN.sources.config_eni,
          recorder: "cyntro-eni-config",
          managed_by: "CYNTRO",
          detail: "Recorder cyntro-eni-config records network interfaces continuously",
          proven_coverage_start: "2026-10-01T21:00:41+00:00",
        },
      },
    }
    let connectReads = 0
    let list = memberList([PLATFORM_ROW, MEMBER_ROW])
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || "GET"
      if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
      if (url === LIST_URL && method === "GET") return json(list)
      if (url === CONNECT_URL && method === "GET") {
        connectReads += 1
        return json(connectBody({ regions: [connectReads === 1 ? before : after] }))
      }
      if (url === VALIDATE_URL && method === "POST") {
        list = memberList([PLATFORM_ROW, { ...MEMBER_ROW, pending_request: { action: "validate", status: "queued", requested_at: requestedAt } }])
        return json({ customer_id: CUSTOMER, account_id: MEMBER_ID, action: "validate", request_status: "queued", already_open: false, requested_at: requestedAt }, 202)
      }
      return json({ detail: `unexpected ${method} ${url}` }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AccountSettingsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Connect Test workload" }))
    const panel = await screen.findByRole("dialog", { name: "Test workload" })
    const firstRead = await within(panel).findByRole("group", { name: "Data sources in eu-west-1" })
    expect(within(firstRead).queryByTestId("config-eni-proven-start")).not.toBeInTheDocument()

    fireEvent.click(within(panel).getByRole("button", { name: "Check connection" }))
    expect(await within(panel).findByText(/Waiting for the account connector/)).toBeInTheDocument()

    list = memberList([PLATFORM_ROW, { ...MEMBER_ROW, last_validated_at: "2026-10-01T21:00:44.000000+00:00", pending_request: null }])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    const proven = await within(panel).findByTestId("config-eni-proven-start")
    expect(proven).toHaveTextContent("Recording proven since 2026-10-01 21:00:41 UTC")
    expect(within(panel).getByText("Recorder cyntro-eni-config records network interfaces continuously")).toBeInTheDocument()
    expect(connectReads).toBe(2)
    // The status area still shows the finished check (the re-read is quiet, not a reload).
    expect(within(within(panel).getByRole("status")).getByText("Connected")).toBeInTheDocument()
  })
})

describe("Settings > Accounts — per-feature coverage chips", () => {
  it("renders COVERED / PARTIAL / LACKING chips with the lacking regions, and nothing for a row without coverage", async () => {
    const withCoverage = {
      ...MEMBER_ROW,
      coverage: [
        { feature: "inventory", label: INVENTORY, status: "COVERED", regions_lacking: [] },
        { feature: "observed_traffic", label: OBSERVED, status: "PARTIAL", regions_lacking: ["eu-west-1"] },
        { feature: "iam_usage", label: IAM_USAGE, status: "LACKING", regions_lacking: ["eu-central-1", "eu-west-1"] },
      ],
    }
    const withoutCoverage = { ...MEMBER_ROW, account_id: "333333333333", display_name: "Test staging" }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith("/api/proxy/admin/accounts/groups/all?")) return json({ customer_id: CUSTOMER, groups: [] })
        if (url === LIST_URL) return json(memberList([PLATFORM_ROW, withCoverage, withoutCoverage]))
        return json({ detail: `unexpected ${url}` }, 404)
      }),
    )
    render(<AccountSettingsPage />)

    const row = await screen.findByTestId(`account-row-${MEMBER_ID}`)
    const chips = within(row).getByRole("list", { name: `Feature coverage for ${MEMBER_ID}` })
    expect(within(chips).getAllByRole("listitem").map((item) => item.getAttribute("data-testid"))).toEqual([
      "coverage-chip-inventory",
      "coverage-chip-observed_traffic",
      "coverage-chip-iam_usage",
    ])
    const inventory = within(chips).getByTestId("coverage-chip-inventory")
    expect(within(inventory).getByText("Covered")).toBeInTheDocument()
    expect(within(inventory).getByText(INVENTORY)).toBeInTheDocument()
    expect(inventory).not.toHaveTextContent("lacking in")

    const observed = within(chips).getByTestId("coverage-chip-observed_traffic")
    expect(within(observed).getByText("Partial")).toBeInTheDocument()
    expect(within(observed).getByText(OBSERVED)).toBeInTheDocument()
    expect(within(observed).getByText("· lacking in eu-west-1")).toBeInTheDocument()

    const iam = within(chips).getByTestId("coverage-chip-iam_usage")
    expect(within(iam).getByText("Lacking coverage")).toBeInTheDocument()
    expect(within(iam).getByText(IAM_USAGE)).toBeInTheDocument()
    expect(within(iam).getByText("· lacking in eu-central-1, eu-west-1")).toBeInTheDocument()

    const bare = screen.getByTestId("account-row-333333333333")
    expect(within(bare).queryByRole("list", { name: /Feature coverage/ })).not.toBeInTheDocument()
    expect(within(bare).queryByTestId(/^coverage-chip-/)).not.toBeInTheDocument()
    expect(within(screen.getByTestId(`account-row-${PLATFORM_ID}`)).queryByTestId(/^coverage-chip-/)).not.toBeInTheDocument()
  })
})
