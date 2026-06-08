/** Wire contract for GET /api/exposure/findings/sg/{sg_id} */

export interface DamageStatementWire {
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

export interface ExposureFindingWire {
  finding_id: string
  layer: string
  category: string
  severity: string
  system_name?: string | null
  workload_id: string
  workload_name?: string | null
  sg_id?: string | null
  rule_key?: string | null
  observation_window_days: number
  has_observed_terminal_activity: boolean
  recommendation_hint: string
  signals?: Record<string, unknown>
}

export interface ExposureFindingsMeta {
  total: number
  by_severity: Record<string, number>
  by_layer: Record<string, number>
  include_low: boolean
  filtered_low_count: number
  observation_window_days: number
}

export interface ExposureFindingsResponse {
  sg_id: string
  findings: Array<{
    finding: ExposureFindingWire
    statement: DamageStatementWire
  }>
  meta: ExposureFindingsMeta
}
