/**
 * Topology v0.2 — TypeScript types matching the backend contract.
 * Source of truth: docs/topology-v0.2-risk-contract.md.
 *
 * Do not duplicate these in other files; import from here.
 */

export type ScoreTier = "WORST" | "HIGH" | "ELEVATED" | "QUIET"
export type ConfidenceTier = "FULL" | "DEGRADED" | "LOW"

export interface PostureFreshness {
  most_recent_run: string | null
  age_days: number | null
  threshold_days: number
  is_fresh: boolean
  auto_resolves_when: string
}

export interface PostureCoverage {
  scored: number
  total: number
  by_type: Record<string, { scored: number; total: number }>
}

export interface SystemKpis {
  workloads_total: number
  workloads_by_type: Record<string, number>
  flagged_count: number
  stale_workloads_count: number
  posture_coverage: PostureCoverage
  posture_freshness: PostureFreshness
}

export interface ContributorFreshness {
  source: string
  as_of: string | null
  age_days?: number | null
  is_fresh: boolean
  threshold_days?: number
}

export interface ContributorWarning {
  code: string
  message: string
  auto_resolves_when: string
}

export interface Contributor {
  signal: "network_exposure" | "internet_dependency" | "iam_gap" | "jewel_adjacency"
  weight: number
  value: number
  evidence: Record<string, unknown>
  freshness: ContributorFreshness
  warnings?: ContributorWarning[]
}

export interface ConfidenceReason {
  signal: string
  is_fresh: boolean
  age_days: number | null
  threshold_days: number
  auto_resolves_when: string
}

export interface NodeScore {
  value: number
  tier: ScoreTier
  rank: number | null
  confidence: {
    value: number
    tier: ConfidenceTier
    reasons: ConfidenceReason[]
  }
  contributors: Contributor[]
}

export interface TopologyNode {
  id: string
  name: string
  type: string | null
  subnet_id: string | null
  score: NodeScore | null
  stale: { since: string | null; reason: string } | null
  is_jewel: boolean
}

export interface TopologyRiskResponse {
  system: string
  scored_at: string
  scoring_window_days: number
  vpc_id: string | null
  system_kpis: SystemKpis | null
  nodes: TopologyNode[]
  error?: string
  fromStaleCache?: boolean
}

export const SCORE_TIER_LABEL: Record<ScoreTier, string> = {
  WORST: "Worst",
  HIGH: "High",
  ELEVATED: "Elevated",
  QUIET: "Quiet",
}

export const CONFIDENCE_TIER_LABEL: Record<ConfidenceTier, string> = {
  FULL: "Full",
  DEGRADED: "Degraded",
  LOW: "Low",
}

export const SIGNAL_LABEL: Record<Contributor["signal"], string> = {
  network_exposure: "Network exposure",
  internet_dependency: "Internet dependency",
  iam_gap: "IAM gap",
  jewel_adjacency: "Crown-jewel adjacency",
}
