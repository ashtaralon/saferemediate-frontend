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

// Layer D Phase 4 verdict literals. Frontend matches on these exact
// strings to derive the ReplayVerifyPanel state. Don't translate or
// normalize — operator copy lives in the component, the contract here
// stays raw.
export type ReplayVerdict =
  | "BYTE_EQUIVALENT"
  | "ENGINE_DRIFT"
  | "PLAN_DRIFT"
  | "SOURCE_MISSING"

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

  // Replay-state fields (PR-A.0 + PR-A.1, 2026-05-31). The
  // ReplayVerifyPanel state machine reads these four to pick its
  // resting state. Historical sims pre-PR-A.0 will have
  // replay_count > 0 + last_verdict IS NULL — render as
  // 'historical_untracked'. Fresh sims will have replay_count = 0
  // via Cypher coalesce — render as 'never_verified'.
  replay_count: number
  last_replayed_at: string | null
  last_verdict: ReplayVerdict | null
  last_replay_id: string | null
}

// Response shape from POST /api/iam/shared-roles/simulate/{sim_id}/replay
// (proxied). Mirrors the unified/iam/shared_roles/replay.py return shape.
export interface ReplayResponse {
  sim_id: string
  replay_id: string
  ran_at: string
  verdict: ReplayVerdict
  catalog_version_then: string | null
  catalog_version_now: string | null
  engine_version_then: string | null
  engine_version_now: string | null
  counterfactual_id_then: string | null
  counterfactual_id_now: string | null
  jewels_total: number
  jewels_byte_equivalent: number
  jewels_drifted: number
  per_jewel_drift: ReplayJewelDrift[]
  triggered_by: string
  notes: string | null
}

export interface ReplayJewelDrift {
  jewel_id: string
  jewel_name?: string
  drift_kind: string
  before_then: number
  before_now: number
  after_then: number
  after_now: number
}
