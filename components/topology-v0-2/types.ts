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
  // Phase B addition — present on responses from BE >= phase-b deploy.
  security_group_ids?: string[]
}

export type SubnetTier = "web" | "app" | "data" | "unknown"

export interface SubnetMeta {
  id: string
  name: string
  az: string | null
  cidr: string | null
  tier: SubnetTier
  tier_source: "property" | "name" | "default_vpc_cidr" | "unknown"
}

export interface EdgeIgw {
  id: string
  name: string
}

export interface EdgeNatGw {
  id: string
  name: string
  subnet_id: string | null
}

export interface EdgeVpce {
  id: string
  service_name: string | null
  endpoint_type: string | null
}

export interface SecurityGroupMeta {
  id: string
  name: string
  description: string | null
  has_public_ingress: boolean
}

export interface IamRoleRollup {
  name: string
  role_arn: string | null
  allowed_actions: number
  used_actions: number
  unused_actions: number
  gap_percentage: number
  last_remediated_at: string | null
  workload_ids: string[]
  attachment_modes: ("instance_profile" | "direct" | string)[]
}

export type TrafficEdgeClass = "internal" | "edge_service" | "vpce" | "egress" | "database"

export interface TrafficEdge {
  source_id: string
  // For egress edges this is the sentinel "__igw__" — the FE terminates
  // the arrow at the IGW perimeter icon rather than at a chip.
  target_id: string
  port: number | null
  // For edge_service edges, protocol carries the Cypher relationship type
  // (e.g. "WRITES_TO" / "READS_FROM" / "ACTUAL_S3_ACCESS") so the FE can
  // color the line by intent.
  protocol: string | null
  last_seen: string | null
  // Phase B-2 additions — older BE deploys may omit these.
  edge_class?: TrafficEdgeClass
  external_destinations?: number | null
  // S3 / DDB edge_service edges get these populated when a Gateway VPCE
  // exists in the source workload's VPC. The FE renders the arrow as a
  // two-segment path through that VPCE chip so the visual matches the
  // real AWS network path. Null when the workload isn't in a VPC, has no
  // matching Gateway VPCE, or the destination isn't S3/DDB.
  via_vpce_id?: string | null
  via_vpce_service_name?: string | null
}

export interface VpcTopology {
  region: string | null
  account_id: string | null
  vpc_id: string | null
  azs: string[]
  subnets: SubnetMeta[]
  edges: {
    igws: EdgeIgw[]
    nat_gws: EdgeNatGw[]
    vpces: EdgeVpce[]
  }
  unknown_subnet_count: number
  // Phase B additions — present in responses from BE >= phase-b deploy.
  security_groups?: SecurityGroupMeta[]
  iam_roles?: IamRoleRollup[]
}

export interface TopologyRiskResponse {
  system: string
  scored_at: string
  scoring_window_days: number
  vpc_id: string | null
  system_kpis: SystemKpis | null
  nodes: TopologyNode[]
  vpc_topology?: VpcTopology | null
  // Phase B addition — present on responses from BE >= phase-b deploy.
  traffic_edges?: TrafficEdge[]
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
