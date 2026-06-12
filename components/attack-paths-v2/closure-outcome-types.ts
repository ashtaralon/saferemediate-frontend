// =============================================================================
// Closure Outcome types — Slice 5 of the v2 attack-path redesign.
// =============================================================================
//
// The "what you're approving" shape: BEFORE (today) → EXACT DIFF (the change
// you approve, not the story) → AFTER (projected, then verified). This is the
// frontend view of the backend EvidencePack / RemediationDiff contract, served
// by GET /api/attack-paths/<id>/closure-preview.
//
// NO MOCK DATA. This panel renders ONLY real values from that endpoint, which
// reads the live Neo4j AttackPath node. When the data is absent, render an
// honest empty/loading state (per `feedback_no_mock_numbers_in_ui` and
// `feedback_no_mock_data`) — never a fabricated value.
//
// Framing law (Cyntro): damage closed, NOT path closed. We narrow what's
// unused; the app keeps what it uses. So `after.path_open_after` is normally
// true — the headline is "the dangerous, unused capability is gone", never
// "the path is deleted". Never render a removal without the kept set.
// =============================================================================

// Eligibility tier, surfaced to the operator. Mirrors the frontend routing
// vocabulary (auto_eligible = one-click/preapproved; approval_required = human
// must inspect; blocked = not approvable yet). Eligibility != trigger: even
// auto_eligible changes pass the human approval gate in the HITL posture.
export type ClosureVerdict = "auto_eligible" | "approval_required" | "blocked"

// The exact diff the human approves — derived from the deterministic plan.
// Always carries BOTH removed and kept (rule #3: never narrow without showing
// what was kept).
export interface ClosureDiff {
  role: string
  removed_actions: string[]            // the excess (unused / dangerous)
  kept_actions: string[]               // the observed actions preserved
  scoped_to_prefixes: string[]         // object access narrowed to these prefixes
  scoped_resource_count: number        // # of resources the kept access is pinned to
  delivered_as: "IAM_DIFF" | "TERRAFORM_PR" | string
}

// Multi-signal function-preservation proof (ratified edit #2): not just
// "0 denied". Null fields mean "not yet measured" — render honestly.
export interface FunctionPreservationProof {
  newly_denied_calls: number | null    // 0 = nothing legitimate broke
  rollback_triggered: boolean | null   // false = canary stayed healthy
  health_regression: boolean | null    // false = no app/service health drop
  telemetry_sources: string[]          // e.g. ["CloudTrail", "VPC Flow"]
  canary_window: string | null         // e.g. "7d"
  verified: boolean                    // true only when all signals are in
}

export interface ClosureAfterState {
  worst_damage_before: string          // e.g. "admin_access"
  worst_damage_after: string           // e.g. "write"
  excess_removed: boolean
  blast_radius_before: string | null   // e.g. "4 resources · admin"
  blast_radius_after: string | null    // e.g. "4 resources · read/write"
  path_open_after: boolean             // true → "damage closed, not path closed"
}

// The whole preview. `proof` is null in PROPOSE/preview mode (Phase 1) — the
// after-state is *projected* until the pipeline VERIFY stage runs a canary.
export interface ClosurePreview {
  diff: ClosureDiff
  after: ClosureAfterState
  proof: FunctionPreservationProof | null
  verdict: ClosureVerdict
  verdict_reasons: string[]            // e.g. ["shared_role across 2 live workloads"]
  rollback_available: boolean
  mode: "PROPOSE" | "APPLY" | string
}
