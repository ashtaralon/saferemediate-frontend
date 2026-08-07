import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BusinessImpactPanel } from "@/components/business-impact/business-impact-panel"
import { BusinessImpactReportSection } from "@/components/business-impact/business-impact-report-section"
import { BusinessImpactSettings } from "@/components/business-impact/business-impact-settings"

afterEach(cleanup)

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model_version: "biq-conditional-v1.0",
      annualized_loss_available: false,
      annualized_loss_reason: "Conditional only",
      systems: 1,
      paths_collapsed: 1,
      scenarios_with_estimates: 1,
      system_regulatory_summaries: [],
      regulatory_exposures_mapped: 0,
      regulatory_exposures_calculated: 0,
      top_missing_inputs: [],
      definitions_complete: true,
      scenarios: [{
        scenario_id: "biq-test",
        scenario_type: "DATA_EXFILTRATION",
        title: "Sensitive data disclosure",
        business_effect: "An attacker could remove customer data.",
        system_name: "payments-prod",
        business_service: "Customer payments",
        crown_jewel_id: "customer-db",
        crown_jewel_name: "customer-db",
        crown_jewel_type: "RDSInstance",
        path_ids: ["path-1"],
        path_count: 1,
        technical_exposure: "OBSERVED",
        technical_exposure_basis: "Observed gate evidence; not a probability.",
        impact_buckets: ["EXFIL"],
        conditional_loss: {
          currency: "USD",
          p10: 100000,
          p50: 250000,
          p90: 900000,
          components: [],
          method: "comonotonic_triangular_v1",
          statement: "Estimated loss if this scenario occurs.",
        },
        regulatory_exposure: [],
        comparable_incidents: [],
        missing_inputs: [],
        assumptions: ["Conditional only"],
        confidence: "HIGH",
        model_version: "biq-conditional-v1.0",
      }],
    }),
  }) as unknown as typeof fetch
})

describe("BusinessImpactPanel", () => {
  it("keeps technical exposure separate from conditional loss", async () => {
    render(<BusinessImpactPanel systemName="payments-prod" pathId="path-1" />)

    expect(await screen.findByText("Sensitive data disclosure")).toBeInTheDocument()
    expect(screen.getAllByText(/Technical exposure/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Conditional loss · if this scenario occurs/i)).toBeInTheDocument()
    expect(screen.getByText(/No annual probability is claimed/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Definitions/i })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/business-impact/scenarios/payments-prod?path_id=path-1",
      { cache: "no-store" },
    )
  })

  it("allows organization definitions to be saved before systems are available", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data_categories: [], regimes: [], regulatory_catalog_version: "rules-test" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { operating_countries: [], currency: "USD" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) as unknown as typeof fetch

    render(<BusinessImpactSettings open onClose={() => undefined} systems={[]} />)

    const name = await screen.findByRole("textbox", { name: "Organization name" })
    fireEvent.change(name, { target: { value: "Example Company" } })
    const save = screen.getByRole("button", { name: "Save definitions" })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    expect(global.fetch).toHaveBeenLastCalledWith(
      "/api/proxy/business-impact/organization",
      expect.objectContaining({ method: "PUT" }),
    )
  })

  it("reads obligation and data-category options from the backend catalog", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        data_categories: ["Catalog-only data"],
        regimes: [{ id: "TEST_RULE", label: "Catalog rule", source_url: "https://example.test", scenario_types: [], required_inputs: [] }],
        regulatory_catalog_version: "rules-test",
        source_checked_at: "2026-08-06",
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { operating_countries: [], currency: "USD" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profile: {
        system_name: "payments-prod",
        jurisdictions: [],
        regulations: [],
        regulatory_applicability_confirmed: [],
        data_categories: [],
        record_count_source: "UNKNOWN",
        ccpa_private_action_eligible: false,
      } }) }) as unknown as typeof fetch

    render(<BusinessImpactSettings open onClose={() => undefined} systems={[{ name: "payments-prod" }]} />)

    expect(await screen.findByRole("button", { name: "Catalog rule" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Catalog-only data" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "GDPR" })).not.toBeInTheDocument()
  })

  it("does not refetch the portfolio for an equivalent systems array", async () => {
    const { rerender } = render(
      <BusinessImpactReportSection systems={[{ name: "payments-prod", environment: "Production" }]} />,
    )

    expect(await screen.findByText("Sensitive data disclosure")).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    rerender(
      <BusinessImpactReportSection systems={[{ name: "payments-prod", environment: "Production" }]} />,
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("renders one deduplicated regulatory summary per system", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model_version: "biq-conditional-v1.1",
        annualized_loss_available: false,
        annualized_loss_reason: "Conditional only",
        systems: 1,
        paths_collapsed: 2,
        scenarios_with_estimates: 0,
        regulatory_exposures_mapped: 1,
        regulatory_exposures_calculated: 1,
        top_missing_inputs: [],
        definitions_complete: false,
        scenarios: [],
        system_regulatory_summaries: [{
          system_name: "payments-prod",
          business_service: "Payments",
          obligations_selected: ["GDPR"],
          applicability_confirmed: ["GDPR"],
          scenario_count: 2,
          exposures: [{
            regime: "GDPR",
            exposure_type: "Higher-tier statutory maximum",
            currency: "EUR",
            amount: 40_000_000,
            applicability: "CONFIRMED",
            calculation_status: "CALCULATED",
            missing_inputs: [],
            conditions: [],
            source_url: "https://example.test/gdpr",
            included_in_conditional_loss: false,
            rule_version: "rules-test",
            source_checked_at: "2026-08-07",
          }],
          calculated_count: 1,
          missing_inputs: [],
          status: "CALCULATED",
        }],
      }),
    }) as unknown as typeof fetch

    render(<BusinessImpactReportSection systems={[{ name: "payments-prod" }]} />)

    expect(await screen.findByText("Potential regulatory exposure by system")).toBeInTheDocument()
    expect(screen.getByText("Payments")).toBeInTheDocument()
    expect(screen.getByText("€40.0M")).toBeInTheDocument()
    expect(screen.getByText(/Repeated scenario exposures are collapsed/i)).toBeInTheDocument()
  })

  it("bulk-applies only shared compliance scope and preserves target financial data", async () => {
    global.fetch = vi.fn(async (input, init) => {
      const url = String(input)
      if (url.endsWith("/catalog")) return { ok: true, json: async () => ({
        data_categories: ["Customer data"],
        regimes: [{ id: "CATALOG", label: "Catalog rule", source_url: "https://example.test", scenario_types: [], required_inputs: [] }],
        regulatory_catalog_version: "rules-test",
      }) } as Response
      if (url.endsWith("/organization") && !init?.method) return { ok: true, json: async () => ({ profile: { operating_countries: [], currency: "USD" } }) } as Response
      if (url.includes("profiles/cyntroprod") && !init?.method) return { ok: true, json: async () => ({ profile: {
        ...({ system_name: "cyntroprod", jurisdictions: [], regulations: [], regulatory_applicability_confirmed: [], data_categories: [], record_count_source: "CUSTOMER_DECLARED", ccpa_private_action_eligible: false }),
        record_count: 900,
        response_cost: { low: 10, likely: 20, high: 30 },
      } }) } as Response
      if (url.includes("profiles/")) return { ok: true, json: async () => ({ profile: {
        system_name: "payments-prod", jurisdictions: ["EU"], regulations: [], regulatory_applicability_confirmed: [], data_categories: [], record_count_source: "UNKNOWN", ccpa_private_action_eligible: false,
      } }) } as Response
      return { ok: true, json: async () => ({ success: true }) } as Response
    }) as unknown as typeof fetch

    render(<BusinessImpactSettings open onClose={() => undefined} systems={[{ name: "payments-prod" }, { name: "cyntroprod" }]} />)

    const rule = await screen.findByRole("button", { name: "Catalog rule" })
    fireEvent.click(rule)
    fireEvent.click(screen.getByRole("button", { name: "cyntroprod" }))
    fireEvent.click(screen.getByRole("button", { name: "Save definitions" }))

    await waitFor(() => {
      const targetPut = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) => String(url).includes("profiles/cyntroprod") && init?.method === "PUT")
      expect(targetPut).toBeDefined()
      const body = JSON.parse(String(targetPut?.[1]?.body))
      expect(body.regulations).toEqual(["Catalog rule"])
      expect(body.jurisdictions).toEqual(["EU"])
      expect(body.record_count).toBe(900)
      expect(body.response_cost).toEqual({ low: 10, likely: 20, high: 30 })
    })
  })
})
