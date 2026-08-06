export type MoneyRange = { low: number; likely: number; high: number }

export type OrganizationImpactProfile = {
  organization_name?: string | null
  industry?: string | null
  headquarters_country?: string | null
  operating_countries: string[]
  organization_type?: string | null
  currency: "USD" | "EUR" | "GBP" | "ILS" | "CAD" | "AUD" | "JPY" | "OTHER"
  annual_revenue?: number | null
  annual_revenue_eur?: number | null
  employee_count?: number | null
  model_version?: string
}

export type SystemImpactProfile = {
  system_name: string
  business_service?: string | null
  environment?: string | null
  business_criticality?: string | null
  owner?: string | null
  jurisdictions: string[]
  regulations: string[]
  data_categories: string[]
  record_count?: number | null
  record_count_source: "CUSTOMER_DECLARED" | "COLLECTED_PROXY" | "CLASS_DEFAULT" | "UNKNOWN"
  affected_people?: number | null
  revenue_per_hour?: number | null
  outage_hours?: MoneyRange | null
  response_cost?: MoneyRange | null
  restoration_cost?: MoneyRange | null
  legal_advisory_cost?: MoneyRange | null
  notification_cost_per_person?: MoneyRange | null
  contractual_loss?: MoneyRange | null
  customer_reputation_loss?: MoneyRange | null
  fraud_or_theft_loss?: MoneyRange | null
  extortion_payment?: MoneyRange | null
  ccpa_private_action_eligible: boolean
  notes?: string | null
  model_version?: string
}

export type LossComponent = {
  key: string
  label: string
  source: string
  low: number
  likely: number
  high: number
}

export type RegulatoryExposure = {
  regime: string
  exposure_type: string
  currency?: string | null
  low?: number | null
  high?: number | null
  amount?: number | null
  formula?: string | null
  conditions: string[]
  source_url: string
  included_in_conditional_loss: boolean
  rule_version: string
  source_checked_at: string
}

export type ComparableIncident = {
  incident_id: string
  title: string
  organization: string
  industry: string
  country: string
  scenario_types: string[]
  regulations: string[]
  affected_population?: number | null
  financial_outcome: string
  outcome_type: string
  source_url: string
  source_kind: string
  similarity_reasons: string[]
  use_note: string
}

export type BusinessImpactScenario = {
  scenario_id: string
  scenario_type: string
  title: string
  business_effect: string
  system_name: string
  business_service?: string | null
  crown_jewel_id?: string | null
  crown_jewel_name?: string | null
  crown_jewel_type?: string | null
  data_classification?: string | null
  path_ids: string[]
  path_count: number
  technical_exposure: string
  technical_exposure_basis: string
  impact_buckets: string[]
  conditional_loss?: {
    currency: OrganizationImpactProfile["currency"]
    p10: number
    p50: number
    p90: number
    components: LossComponent[]
    method: string
    statement: string
  } | null
  regulatory_exposure: RegulatoryExposure[]
  comparable_incidents: ComparableIncident[]
  missing_inputs: string[]
  assumptions: string[]
  confidence: "HIGH" | "MEDIUM" | "LOW"
  model_version: string
}

export type BusinessImpactResponse = {
  model_version: string
  annualized_loss_available: false
  annualized_loss_reason: string
  scenarios: BusinessImpactScenario[]
  systems: number
  paths_collapsed: number
  scenarios_with_estimates: number
  definitions_complete: boolean
  organization?: OrganizationImpactProfile
  profile?: SystemImpactProfile
  profiles?: Record<string, SystemImpactProfile>
  definition_status?: Record<string, unknown>
  error?: string
}

export function formatImpactMoney(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—"
  const maximumFractionDigits = value >= 1_000_000 ? 1 : value >= 10_000 ? 0 : 2
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency === "OTHER" ? "USD" : currency,
      notation: value >= 1_000_000 ? "compact" : "standard",
      maximumFractionDigits,
    }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString()}`
  }
}

export function emptySystemImpactProfile(systemName: string): SystemImpactProfile {
  return {
    system_name: systemName,
    jurisdictions: [],
    regulations: [],
    data_categories: [],
    record_count_source: "UNKNOWN",
    ccpa_private_action_eligible: false,
  }
}

export function emptyOrganizationImpactProfile(): OrganizationImpactProfile {
  return {
    operating_countries: [],
    currency: "USD",
  }
}
