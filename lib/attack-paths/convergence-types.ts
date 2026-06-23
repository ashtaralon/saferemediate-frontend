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

export interface ConvergencePath {
  path_id: string
  source?: string | null
  source_kind?: string | null
  identity?: string | null
  identity_name?: string | null
  damage: string[]
  score: number
  severity?: string | null
  confidence: string
  hop_count: number
  routes_via?: string[]
  role_assumption_observed?: boolean
  cj_target_id?: string | null
  hops?: ConvergenceHop[]
  /** Multi-edge: one entry per category. Empty list when classifier
   *  hasn't run for this system yet (migration window). */
  initial_access?: InitialAccessEdge[]
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
}
