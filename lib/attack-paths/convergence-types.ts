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
  routes_via: string[]
  role_assumption_observed: boolean
  cj_target_id?: string | null
  hops: ConvergenceHop[]
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
