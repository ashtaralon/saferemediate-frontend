import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BusinessImpactWorkspace } from "@/components/business-impact/business-impact-workspace"

vi.mock("@/components/business-impact/business-impact-panel", () => ({
  BusinessImpactPanel: ({ systemName }: { systemName: string }) => <div>Scenario detail for {systemName}</div>,
}))

vi.mock("@/components/business-impact/business-impact-settings", () => ({
  BusinessImpactSettings: ({ open, initialSystem }: { open: boolean; initialSystem?: string | null }) => open ? <div>Definitions for {initialSystem}</div> : null,
}))

const systemsPayload = {
  systems: [
    { SystemName: "payments-prod", environment: "Production", criticality: "MISSION CRITICAL" },
    { SystemName: "analytics-dev", environment: "Development", criticality: "IMPORTANT" },
  ],
}

const portfolioPayload = {
  model_version: "biq-conditional-v1.1",
  annualized_loss_available: false,
  annualized_loss_reason: "Not calibrated",
  systems: 2,
  paths_collapsed: 2,
  scenarios_with_estimates: 1,
  regulatory_exposures_mapped: 1,
  regulatory_exposures_calculated: 1,
  top_missing_inputs: ["regulations"],
  definitions_complete: false,
  scenarios: [
    { scenario_id: "one", system_name: "payments-prod", path_ids: ["path-1", "path-2"], conditional_loss: { currency: "USD", p10: 1, p50: 2, p90: 3, components: [], method: "customer inputs", statement: "conditional" } },
    { scenario_id: "two", system_name: "ANALYTICS-DEV", path_ids: ["path-2"], conditional_loss: null },
  ],
  system_regulatory_summaries: [
    { system_name: "payments-prod", obligations_selected: ["GDPR"], applicability_confirmed: ["GDPR"], scenario_count: 1, exposures: [], calculated_count: 1, missing_inputs: [], status: "CALCULATED" },
    { system_name: "analytics-dev", obligations_selected: [], applicability_confirmed: [], scenario_count: 1, exposures: [], calculated_count: 0, missing_inputs: ["regulations"], status: "NO_RULES_SELECTED" },
  ],
}

describe("BusinessImpactWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url === "/api/proxy/systems" ? systemsPayload : portfolioPayload
      return { ok: true, json: async () => payload } as Response
    }))
  })

  it("shows organization readiness and opens the selected system detail", async () => {
    render(<BusinessImpactWorkspace initialSystem="payments-prod" />)

    expect(await screen.findByRole("heading", { name: "Translate attack paths into business consequences" })).toBeInTheDocument()
    expect(screen.getAllByText("payments-prod").length).toBeGreaterThan(0)
    expect(screen.getAllByText("analytics-dev").length).toBeGreaterThan(0)
    expect(screen.getByText("1/2")).toBeInTheDocument()
    expect(screen.getByText("Scenario detail for payments-prod")).toBeInTheDocument()
    expect(screen.getByText("Obligations required")).toBeInTheDocument()
    expect(screen.getByText("0/1 calculated")).toBeInTheDocument()
  })

  it("uses reported environment filters and configures the exact system", async () => {
    render(<BusinessImpactWorkspace />)
    await screen.findByText("Scenario detail for analytics-dev")

    fireEvent.click(screen.getByRole("button", { name: "Production" }))
    await waitFor(() => expect(screen.queryAllByText("analytics-dev")).toHaveLength(0))
    expect(screen.getAllByText("payments-prod").length).toBeGreaterThan(0)

    const defineButtons = screen.getAllByRole("button", { name: "Define" })
    expect(defineButtons).toHaveLength(1)
    fireEvent.click(defineButtons[0])
    expect(screen.getByText("Definitions for payments-prod")).toBeInTheDocument()
  })
})
