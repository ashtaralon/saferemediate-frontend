/**
 * "Observed <from> → <to>" chips on Systems, All Services and the maps.
 * Observation blocks below are TEST INPUTS shaped like the backend's
 * `observation` contract; nothing is rendered that the response did not carry.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const accountScope = {
  customerId: "tenant-a",
  groupId: "all",
  accountId: "all",
  region: "all",
  options: {
    customer_id: "tenant-a",
    accounts: [{ account_id: "111122223333", display_name: "Platform", regions: ["eu-west-1"], group_ids: [], status: "active" }],
    groups: [],
  },
  customers: [{ customer_id: "tenant-a", display_name: "Tenant A" }],
  loading: false,
  error: null,
  scopeNotices: [] as string[],
  dismissScopeNotices: vi.fn(),
  setCustomerId: vi.fn(),
  setGroupId: vi.fn(),
  setAccountId: vi.fn(),
  setRegion: vi.fn(),
  refresh: vi.fn(),
}

vi.mock("@/lib/account-scope-context", () => ({ useAccountScope: () => accountScope }))
vi.mock("@/components/back-to-dashboard", () => ({ BackToDashboard: () => null }))
vi.mock("@/components/ui/page-header", () => ({ PageHeader: () => null }))
vi.mock("@/components/new-systems-modal", () => ({ NewSystemsModal: () => null }))
vi.mock("@/components/RefreshEvidenceButton", () => ({ RefreshEvidenceButton: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import { ObservationChip } from "@/components/coverage/observation-chip"
import { SystemsView } from "@/components/systems-view"
import AllServicesInventory from "@/components/all-services-inventory"
import { readObservation } from "@/lib/observation-coverage"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const OBSERVATION = {
  from: "2026-09-24T00:00:00Z",
  to: "2026-10-01T00:00:00Z",
  sources: [
    {
      source: "vpc_flow_logs",
      account_id: "111122223333",
      region: "eu-west-1",
      earliest_verified_at: "2026-09-20T00:00:00Z",
      verified_through: "2026-10-01T00:00:00Z",
      gaps: [{ from: "2026-09-25T00:00:00Z", to: "2026-09-25T06:00:00Z", reason: "delivery delay" }],
    },
    {
      source: "cloudtrail",
      account_id: "444455556666",
      region: "eu-west-1",
      earliest_verified_at: "2026-09-22T00:00:00Z",
      verified_through: "2026-10-01T00:00:00Z",
      gaps: [],
    },
  ],
}

const SYSTEM_ROW = {
  name: "webshop", displayName: "webshop", SystemName: "webshop",
  resourceCount: 3, resource_count: 3, account_id: "111122223333", region: "eu-west-1",
  environment: null, owner: null, criticality: null,
  health_score: null, healthScore: null,
  critical_count: null, criticalIssues: null, high_count: null, highIssues: null,
  lastScan: "Unknown", lastScanAt: null,
}

describe("ObservationChip", () => {
  it("shows the exact observed range and expands to each source's range and gaps", () => {
    render(<ObservationChip observation={readObservation({ observation: OBSERVATION })} />)

    const chip = screen.getByTestId("observation-chip")
    expect(chip).toHaveAttribute("data-observation", "present")
    const button = within(chip).getByRole("button")
    expect(button).toHaveTextContent("Observed 2026-09-24 00:00 UTC → 2026-10-01 00:00 UTC")
    expect(button).toHaveTextContent("· 1 gap")
    // Hover title carries the sources too.
    expect(button.getAttribute("title")).toContain("VPC Flow Logs · 111122223333 · eu-west-1: verified 2026-09-20 00:00 UTC → 2026-10-01 00:00 UTC, 1 gap")

    fireEvent.click(button)
    const panel = screen.getByRole("region", { name: "Observation sources" })
    expect(panel).toHaveTextContent("VPC Flow Logs · 111122223333 · eu-west-1")
    expect(panel).toHaveTextContent("Gap 2026-09-25 00:00 UTC → 2026-09-25 06:00 UTC — delivery delay")
    expect(panel).toHaveTextContent("CloudTrail · 444455556666 · eu-west-1")
    expect(panel).toHaveTextContent("Earlier activity is unknown, not absent.")
    expect(within(panel).getByRole("link", { name: "Per-source coverage" })).toHaveAttribute("href", "/settings/coverage")
  })

  it("says 'Observation not recorded yet' when the response carries no observation", () => {
    render(<ObservationChip observation={readObservation({ systems: [] })} />)
    const chip = screen.getByTestId("observation-chip")
    expect(chip).toHaveAttribute("data-observation", "absent")
    expect(chip).toHaveTextContent("Observation not recorded yet")
    expect(within(chip).queryByRole("button")).not.toBeInTheDocument()
  })

  it("names what was observed when labelled, and waits honestly while pending", () => {
    const { rerender } = render(<ObservationChip observation={null} label="Flows" />)
    expect(screen.getByTestId("observation-chip")).toHaveTextContent("Flows: observation not recorded yet")
    rerender(<ObservationChip observation={undefined} pending />)
    expect(screen.getByTestId("observation-chip")).toHaveTextContent("Checking observation range")
  })
})

describe("Systems and All Services render the response's own observation", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("Systems: chip from /api/proxy/systems, plus a link to per-source coverage", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return json({ success: true, systems: [SYSTEM_ROW], observation: OBSERVATION })
      return json({})
    }))

    render(<SystemsView />)

    const chip = await screen.findByTestId("systems-observation")
    await vi.waitFor(() => expect(chip).toHaveAttribute("data-observation", "present"))
    expect(chip).toHaveTextContent("Observed 2026-09-24 00:00 UTC → 2026-10-01 00:00 UTC")
    expect(screen.getByRole("link", { name: "Evidence coverage" })).toHaveAttribute("href", "/settings/coverage")
  })

  it("Systems: 'Observation not recorded yet' when the systems response has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/systems")) return json({ success: true, systems: [SYSTEM_ROW], observation: null })
      return json({})
    }))

    render(<SystemsView />)

    const chip = await screen.findByTestId("systems-observation")
    await vi.waitFor(() => expect(chip).toHaveTextContent("Observation not recorded yet"))
  })

  it("All Services: chip from /api/proxy/resources/all", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/resources/all")) {
        return json({
          resources: { lambda_functions: [{ arn: "arn:aws:lambda:eu-west-1:111122223333:function:checkout", name: "checkout", region: "eu-west-1", account_id: "111122223333" }] },
          observation: OBSERVATION,
        })
      }
      return json({ items: [] })
    }))

    render(<AllServicesInventory systemName="webshop" />)

    const chip = await screen.findByTestId("inventory-observation")
    expect(chip).toHaveTextContent("Observed 2026-09-24 00:00 UTC → 2026-10-01 00:00 UTC")
  })

  it("All Services: 'Observation not recorded yet' when /resources/all carries none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/resources/all")) return json({ resources: {} })
      return json({ items: [] })
    }))

    render(<AllServicesInventory systemName="webshop" />)

    expect(await screen.findByTestId("inventory-observation")).toHaveTextContent("Observation not recorded yet")
  })
})
