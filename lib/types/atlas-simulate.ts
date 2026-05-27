// Layer D — ATLAS simulate types (2026-05-27).
//
// Mirror the backend's (:SimulationRun) + (:SimulationResult) shapes
// from unified/iam/shared_roles/simulate.py. Three states distinguished
// on the UI:
//   RUNNING   → polling continues
//   COMPLETED → render the BEFORE/AFTER aggregate + per-jewel cards
//   FAILED    → render error_message; offer Retry CTA

export interface SimulationManifestFoothold {
  foothold_id: string
  foothold_name: string
  foothold_type: string
}

export interface SimulationManifest {
  sim_id: string
  plan_id: string
  role_arn: string
  status: "RUNNING" | "COMPLETED" | "FAILED"
  catalog_version: string
  engine_version: string
  counterfactual_id: string
  graph_snapshot_id: string
  foothold: SimulationManifestFoothold
  jewels_total: number
}

export interface SimulationResult {
  result_id: string
  sim_id: string
  jewel_id: string
  jewel_name: string
  jewel_type: string
  foothold_id: string
  // Either field can be null when the corresponding ATLAS call failed.
  // The UI distinguishes "0 chains" (engine ran, found none) from
  // null (engine failed) — never collapses them.
  before_chain_count: number | null
  after_chain_count: number | null
  before_dead_end_count: number | null
  after_dead_end_count: number | null
  before_sample_chain_ids: string[]
  after_sample_chain_ids: string[]
  before_elapsed_ms: number | null
  after_elapsed_ms: number | null
  before_failed: boolean
  after_failed: boolean
  evaluated_at: string
}

export interface SimulationAggregate {
  before_chains_total: number
  after_chains_total: number
  jewels_with_zero_after: number
  jewels_with_drop: number
}

export interface SimulationProgress {
  evaluated: number
  total: number
  failed: number
}

export interface SimulationRun {
  sim_id: string
  plan_id: string
  role_arn: string
  system_name: string | null
  started_at: string | null
  completed_at: string | null
  status: "RUNNING" | "COMPLETED" | "FAILED"
  catalog_version: string
  engine_version: string
  counterfactual_id: string | null
  graph_snapshot_id: string
  foothold_id: string
  foothold_name: string
  jewels_total: number
  jewels_evaluated: number
  before_chains_total: number
  after_chains_total: number
  pairs_failed: number
  error_message: string | null
  results: SimulationResult[]
  aggregate: SimulationAggregate
  progress: SimulationProgress
}
