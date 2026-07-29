// =============================================================================
// TRUST_NARROW types — the frontend view of the backend plan contract.
// Backend spec: saferemediate-backend/docs/specs/trust_narrow_v1.md
// Served by POST /api/attack-paths/<id>/trust-narrow/{plan,simulate,apply}.
// =============================================================================
//
// NO MOCK DATA. Every value here is server-fed. Nothing is derived, defaulted,
// or inferred on the client — when the backend cannot prove something it sends
// null or a refusal, and we render that.
//
// The load-bearing idea: `allowed: false` with a populated `guards[]` is the
// USEFUL answer, not an error state. Cyntro detects over-broad trust
// ("assumable by anyone in the account") and this is the surface that cuts it —
// but the guard that refuses is as much the product as the fix that succeeds.
// A panel that renders a refusal as a generic failure throws away the only
// information the operator can act on.
// =============================================================================

/** Guard outcome. `unverified` BLOCKS exactly like `refuse` — the backend
 *  treats "we could not prove it safe" as "no", and so must the UI. Rendering
 *  it as a soft warning would re-introduce the fail-open the guards exist to
 *  prevent. */
export type GuardVerdict = "pass" | "refuse" | "unverified"

export interface TrustGuard {
  /** e.g. "G1_service_principal_preservation" */
  guard: string
  verdict: GuardVerdict
  reason: string
}

export interface TrustNarrowEvidence {
  /** Workloads assuming the role via instance profile — what G1 protects. */
  workloads_via_instance_profile: string[]
  /** Principals with observed sts:AssumeRole — what G2 protects. */
  observed_assume_principals: string[]
  trust_has_conditions: boolean | null
  /** Requested removals that aren't present in the document. */
  principals_not_found: string[]
  /** Account-wide grants the planner proposed on its own. */
  auto_proposed: string[]
  /** Account-wide grants NOT proposed because something observably uses them. */
  withheld_for_observed_use: string[]
  /** How many paths currently carry the "assumable by anyone" chip. */
  paths_with_account_wide_chip: number | null
  live_doc_hash: string | null
  graph_doc_hash: string | null
  projection_generation: number | null
  customer_id: string | null
}

export interface TrustNarrowPlan {
  role_arn: string
  role_name: string
  path_id: string
  system: string | null
  current_document: Record<string, unknown>
  proposed_document: Record<string, unknown>
  removed_principals: string[]
  kept_principals: string[]
  guards: TrustGuard[]
  evidence: TrustNarrowEvidence
  /** Every guard passed AND something is actually being removed. */
  allowed: boolean
  /** Always true — apply is snapshot-gated. */
  snapshot_required: boolean
  /** Whether apply would be accepted right now: allowed AND a live document
   *  AND the deploy has left SHADOW. False is the normal state today. */
  execute_available: boolean
  decision_tier: string
  /** "live" | "graph" — "graph" means iam:GetRole failed and the plan is
   *  blocked; the operator should see why rather than a green button. */
  document_source: string
  live_fetch_error: string | null
  /** Present only on an allowed plan. Binds role + removals + document hash. */
  plan_token: string | null
  plan_expires_at: string | null
  /** Why no token was minted, when the plan itself was fine — today that means
   *  the deploy has no plan-signing secret. A plan is a read; failing to sign
   *  costs the ability to ACT on it, not the analysis. Surfacing this stops the
   *  Apply button reading as an unexplained dead control. */
  plan_token_error: string | null
  /** Present on the simulate response only. */
  simulation?: TrustNarrowSimulation
}

export interface TrustNarrowSimulation {
  clears_account_wide_chip: boolean
  paths_losing_chip: number
  remaining_account_wide_grants: string[]
  workloads_preserved: string[]
  /** Always true. Acquisition ≠ initial access: narrowing trust explains who
   *  can take the principal once inside, never how they got into the account.
   *  The panel must keep saying so — that split is the whole reason the
   *  acquisition signal exists. */
  initial_access_still_unknown: boolean
  post_apply_refresh: string[]
}

export interface TrustNarrowApplyResult {
  path_id: string
  system: string | null
  role_name: string
  removed_principals: string[]
  kept_principals: string[]
  stage: string
  status: string
  errors: string[]
  snapshot_id: string | null
  applied: boolean
  rollback: { endpoint: string; snapshot_id: string | null }
  post_apply_refresh: string[]
  /** Attached by the proxy — outcome of the FR8 classifier + cache refresh.
   *  A failure here does not mean the cut failed. */
  refresh?: Record<string, string>
}

/** Backend refusal envelope, forwarded verbatim by the proxy so the panel can
 *  explain 403 SHADOW / 400 token / 409 drift distinctly. */
export interface TrustNarrowRefusal {
  error: string
  status?: number
  detail?:
    | string
    | {
        error?: string
        reason?: string
        decision_tier?: string
        guards?: TrustGuard[]
      }
}

/** Short label for a guard id, e.g. "G1_service_principal_preservation" →
 *  "G1 · service principal preservation". */
export function guardLabel(guard: string): string {
  const [code, ...rest] = guard.split("_")
  if (!rest.length) return guard
  return `${code} · ${rest.join(" ")}`
}
