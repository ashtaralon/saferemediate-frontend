/**
 * Wire types matching the backend /api/exposure/findings/sg/{sg_id}
 * response shape. Generated from the structured DamageStatement +
 * ExposureFinding contracts in unified.exposure.
 *
 * Severity values match unified.decisions.enums.RiskSeverity.
 * Layer/category values match unified.exposure.FindingLayer/FindingCategory.
 */

export type ExposureSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export type ExposureLayer =
  | "SG_RULE"
  | "SUBNET_PLACEMENT"
  | "EGRESS_CAPABILITY"

export type ExposureCategory =
  | "SG_RULE_OPEN_TO_INTERNET"
  | "WORKLOAD_IN_PUBLIC_SUBNET_UNUSED"
  | "WORKLOAD_DIRECT_EGRESS_UNUSED"

export interface ReachableResource {
  resource_type: string
  resource_id: string
  resource_name: string | null
  observed_hit_count: number
  actions: string[]
  is_public?: boolean | null
  is_data_class?: boolean | null
}

export interface ChainHop {
  node_kind: string
  node_label: string
  node_id: string
  node_name?: string | null
  edge_in?: string | null
}

export interface ExposureFinding {
  finding_id: string
  layer: ExposureLayer
  category: ExposureCategory
  severity: ExposureSeverity
  system_name: string | null
  workload_id: string
  workload_name: string | null
  sg_id: string | null
  rule_key: string | null
  chain: ChainHop[]
  reachable_resources: ReachableResource[]
  observation_window_days: number
  has_observed_terminal_activity: boolean
  recommendation_hint: string
  signals: Record<string, unknown>
}

export interface DamageStatement {
  layer_chip: string
  category_label: string
  source_label: string
  observed_pill: string
  headline: string
  supporting: string
  evidence_lines: string[]
  evidence_summary: string
  recommendation_label: string
  recommendation_prompt: string
}

export interface ExposureFindingEntry {
  finding: ExposureFinding
  statement: DamageStatement
}

export interface ExposureFindingsMeta {
  total: number
  by_severity: Partial<Record<ExposureSeverity, number>>
  by_layer: Partial<Record<ExposureLayer, number>>
  include_low: boolean
  filtered_low_count: number
  observation_window_days: number
}

export interface ExposureFindingsResponse {
  sg_id: string
  findings: ExposureFindingEntry[]
  meta: ExposureFindingsMeta
}

export interface ExposureFindingsErrorResponse {
  error: string
  detail?: string
}
