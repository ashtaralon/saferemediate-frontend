/** GET /api/attack-paths/{system}/by-crown-jewel response shape. */

export interface ConvergenceHop {
  node_id: string
  node_type: string
  name?: string | null
  plane: string
  subnet_id?: string | null
  subnet_public?: boolean | null
  az?: string | null
  security_groups: string[]
  is_crown_jewel: boolean
  /** Real Neo4j edge type linking this hop to the prior hop in the
   *  rendered chain (e.g. IN_SUBNET, ROUTES_VIA, USES_ROLE,
   *  ACCESSES_RESOURCE). null when no single direct raw edge connects
   *  the two consecutive hops — honest "no labeled relationship".
   *  Leading "~" marks a reversed lookup (raw edge encoded in opposite
   *  direction of rendered walk). Field is additive; older backends
   *  that don't emit it simply leave it undefined. */
  edge_type_from_prev?: string | null
}

/** ATT&CK Initial Access edge per path (BE-A.3 / alon@2026-06-20).
 *  IAM role is the credential the attacker steals, NOT the entry —
 *  so for paths starting on an identity, `pivot_node_id` points at
 *  the BACK-STEP workload the attacker reaches first (EC2 with IMDSv1,
 *  exposed S3 bucket, public RDS snapshot, etc.). `via_role_id`
 *  records the lateral hop. The FE topology canvas narrative-strip
 *  START chip reads `pivot_name` so the role never appears as the
 *  attacker's entry point. */
export interface InitialAccessEdge {
  category: string
  pivot_node_id?: string | null
  pivot_name?: string | null
  via_role_id?: string | null
  attacker_narrative?: string | null
  verdict_confidence?: "observed" | "config" | "inferred" | null
}

export type PathEvidence =
  | "observed"
  | "configured"
  | "unverified"
  | "blocked"
  | string

export interface ConvergencePath {
  path_id: string
  source?: string | null
  source_kind?: string | null
  workload_arn?: string | null
  identity?: string | null
  identity_name?: string | null
  damage: string[]
  score: number
  severity?: string | null
  severity_label?: string | null
  /** Full-path evidence from identity+route+data_plane gates. */
  evidence?: PathEvidence
  /** Legacy alias kept in sync with evidence by the server. */
  confidence: string
  identity_gate?: string | null
  route_gate?: string | null
  data_plane_gate?: string | null
  path_status?: string | null
  hop_count: number
  routes_via?: string[]
  role_assumption_observed?: boolean
  cj_target_id?: string | null
  hops?: ConvergenceHop[]
  /**
   * Hop DTO load state from the convergence model.
   * - pending: summary only — do NOT treat empty hops as "no network"
   * - ready: /detail settled (hops may still be [] when the path has none)
   * - error: detail fetch failed
   */
  hops_load_state?: "pending" | "ready" | "error" | "fallback"
  /** Multi-edge: one entry per category. Empty list when classifier
   *  hasn't run for this system yet (migration window). */
  initial_access?: InitialAccessEdge[]
  /** AC-1+ attack class tag from materializer (e.g. AC-1 / Capital One). */
  attack_class?: string | null
  catalog_name?: string | null
  catalog_title?: string | null
  impact_headline?: string | null
  business_sentence?: string | null
  closure_recommendation?: Record<string, unknown> | null
  computed_at?: string | null
  schema_version?: string | null
}

/** One server-picked path used in the jewel header. */
export interface PathRiskRef {
  path_id?: string | null
  evidence: PathEvidence
  identity_gate?: string | null
  route_gate?: string | null
  data_plane_gate?: string | null
  severity_label?: string | null
  impact_headline?: string | null
  business_sentence?: string | null
  damage_types: string[]
  mitigation_hint?: string | null
  closure_recommendation?: Record<string, unknown> | null
  identity?: string | null
  identity_name?: string | null
  score?: number
}

/** Server-owned jewel header — FE must not invent state/risk/mitigation. */
export interface JewelRiskSummary {
  serve_state?: "ACTIVE" | "NOT_READY" | string
  coverage_state?:
    | "NOT_READY"
    | "READY_ZERO"
    | "PARTIAL"
    | "READY"
    | "ERROR"
    | string
  generation?: string | null
  as_of?: string | null
  current_state?: PathRiskRef | null
  top_risk?: PathRiskRef | null
  top_observed_risk?: PathRiskRef | null
  observed_paths: number
  configured_paths: number
  unverified_paths?: number
  /** Flat compat — mirrors current_state.evidence / top_risk fields. */
  path_id?: string | null
  evidence: PathEvidence
  severity_label?: string | null
  impact_headline?: string | null
  business_sentence?: string | null
  damage_types: string[]
  mitigation_hint?: string | null
  closure_recommendation?: Record<string, unknown> | null
  identity?: string | null
  identity_name?: string | null
}

export interface CrownJewelConvergenceSummary {
  system: string
  cj_arn?: string | null
  cj_name?: string | null
  cj_type?: string | null
  paths_total: number
  observed_paths: number
  choke_points: Record<string, number>
  paths: ConvergencePath[]
  risk_summary?: JewelRiskSummary | null
  serve_state?: string
  coverage_state?: string
  generation?: string | null
  as_of?: string | null
  endpoint?: string
}

export interface CrownJewelConvergence {
  system: string
  cj_arn?: string | null
  cj_name?: string | null
  cj_type?: string | null
  paths_total: number
  observed_paths: number
  choke_points: Record<string, number>
  paths: ConvergencePath[]
  risk_summary?: JewelRiskSummary | null
  serve_state?: string
  coverage_state?: string
  generation?: string | null
  as_of?: string | null
}
