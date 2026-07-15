/**
 * Topology v0.2 — TypeScript types matching the backend contract.
 * Source of truth: docs/topology-v0.2-risk-contract.md.
 *
 * Do not duplicate these in other files; import from here.
 */

import type { EvidenceTier, TenantOwnership } from "@/lib/types/scope"

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
  /**
   * All subnets this workload occupies (BE >= estate-honesty deploy). A Multi-AZ
   * resource (e.g. an RDS instance with standby, or a service spread across AZ
   * subnets) carries every IN_SUBNET edge here; `subnet_id` stays the primary.
   * When present with length > 1 the grid places ONE instance into every
   * matching AZ×tier cell so a real Multi-AZ DB never leaves a cell falsely
   * empty. Counts still dedupe by node id — two cells, one database.
   */
  subnet_ids?: string[]
  vpc_id?: string | null
  account_id?: string | null
  region?: string | null
  /** Canvas row override from BE — beats subnet.tier when subnets are misclassified. */
  placement_tier?: SubnetTier | null
  score: NodeScore | null
  stale: { since: string | null; reason: string } | null
  is_jewel: boolean
  // Phase B addition — present on responses from BE >= phase-b deploy.
  security_group_ids?: string[]
  // Operator-trust addition — for edge-service nodes (S3/DDB/KMS/Secret) only:
  // observed access counts from ANY principal (visible chips, hidden Lambdas,
  // IAMRoles, STSSessions). Lets the FE badge "in use vs idle" without
  // depending on whether the source side has a drawable chip.
  observed_edge_count?: number
  observed_source_count?: number
  // Per-bucket classification of observed sources by kind. Feeds the tooltip
  // so the operator can see WHY a bucket has many sources but few drawn
  // arrows (e.g. all sources are STS sessions, which live in evidence views
  // not as topology chips).
  source_breakdown?: {
    visible_chip: number
    hidden_workload: number
    iam_role: number
    iam_user: number
    sts_session: number
    other: number
    top_sources: Array<{
      id: string | null
      name: string | null
      kind: "visible_chip" | "hidden_workload" | "iam_role" | "iam_user" | "sts_session" | "other"
      edge_count: number
    }>
  }
  /** Foreign systems with observed/declared edges into this shared resource. */
  foreign_consumer_system_count?: number
  foreign_consumer_systems?: string[]
  foreign_shared_access_count?: number
  /**
   * Co-location ownership (BE >= ownership-clarity deploy).
   * `owner_system_name`: node's own SystemName tag.
   * `is_foreign`: true when this system's map admits a node that also
   * BELONGS_TO_SYSTEM one of the customer's OTHER systems — i.e. a SHARED
   * resource, not another tenant. The chip renders "shared · <system>", never
   * "foreign". Untagged nodes stay is_foreign=false — unknown, not a claim.
   * `owner_systems`: the OTHER systems this resource belongs to (BE >=
   * estate-honesty deploy). `owner_systems[0]` names the sharing peer on the
   * chip; falls back to `owner_system_name` on older payloads.
   */
  owner_system_name?: string | null
  owner_systems?: string[]
  is_foreign?: boolean
}

/** Cross-system consumption of this system's shared S3/RDS/DDB (not co-location). */
export interface ForeignSharedAccessEdge {
  foreign_system: string
  consumer_id: string
  consumer_name: string
  consumer_kind: string
  shared_resource_id: string
  shared_resource_name: string
  resource_kind: "S3" | "RDS" | "DDB" | string
  rel_type: string
  evidence_tier: "observed" | "declared"
  last_seen: string | null
}

export type SubnetTier = "web" | "app" | "data" | "unknown"

export interface SubnetMeta {
  id: string
  name: string
  az: string | null
  cidr: string | null
  tier: SubnetTier
  tier_source: "property" | "name" | "default_vpc_cidr" | "unknown"
  vpc_id?: string | null
  // Provenance (BE >= per-vpc-frames deploy) — older BE deploys omit these.
  // `owner_system_name`: the subnet's own SystemName tag.
  // `is_foreign`: true when THIS system's workloads occupy the subnet but it is
  // tagged for a DIFFERENT system (a co-tenant's shared-VPC subnet). The merged
  // Estate Map renders such a subnet in its real VPC frame and badges it, never
  // silently reattributing it.
  owner_system_name?: string | null
  is_foreign?: boolean
}

export interface EdgeIgw {
  id: string
  name: string
  // Owning VPC (BE >= #305) — older BE deploys may omit this.
  vpc_id?: string | null
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
  /** Owning VPC — required for scoped Estate Map frames (Alon, 2026-07-10). */
  vpc_id?: string | null
}

export interface SecurityGroupMeta {
  id: string
  name: string
  description: string | null
  has_public_ingress: boolean
}

export type IamCorrelationState =
  | "correlated"
  | "not_correlated"
  | "deleted_in_aws"
  | "stale_rollup"

export interface IamRoleRollup {
  name: string
  role_arn: string | null
  allowed_actions: number
  used_actions: number
  unused_actions: number
  /** null when correlation_state !== 'correlated' — never a fabricated 100% */
  gap_percentage: number | null
  correlation_state?: IamCorrelationState
  last_remediated_at: string | null
  workload_ids?: string[]
  attachment_modes?: ("instance_profile" | "direct" | string)[]
  scope_mode?: "vpc" | "system"
}

export type TrafficEdgeClass = "internal" | "edge_service" | "vpce" | "egress" | "database"

/** Destination kind rollup on egress / public-path S3 edges (Phase 1 full-path). */
export interface EgressBreakdownBucket {
  kind: "s3" | "ntp" | "other_aws" | "external" | string
  count: number
  sample_hosts?: string[]
}

export interface TrafficEdge {
  source_id: string
  // For egress edges this is the sentinel "__igw__" — the FE terminates
  // the arrow at the IGW perimeter icon rather than at a chip.
  // "__aws_s3__" / "__aws_api__" are regional-rail sentinels for observed
  // ACTUAL_TRAFFIC → NetworkEndpoint (aws_service) when no named bucket/API
  // chip is in the topology payload — projected from Neo4j, not FE-invented.
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
  /** DB flow-edge contract (Alon, 2026-07-10) — older BE may omit. */
  engine?: string | null
  internal_hits?: number | null
  /** Distinct public source IPs from Flow Logs on the engine port — not systems. */
  external_sources?: number | null
  external_hits?: number | null
  publicly_accessible?: boolean | null
  is_exposed?: boolean | null
  port_anomaly?: { ports: number[]; hits: number } | null
  // S3 / DDB edge_service edges get these populated when a Gateway VPCE
  // exists in the source workload's VPC. The FE renders the arrow as a
  // two-segment path through that VPCE chip so the visual matches the
  // real AWS network path. Null when the workload isn't in a VPC, has no
  // matching Gateway VPCE, or the destination isn't S3/DDB.
  via_vpce_id?: string | null
  via_vpce_service_name?: string | null
  /** Gateway S3/DDB path: vpce | public (prefer VPCE even if missing). */
  egress_path?: "vpce" | "public" | null
  /**
   * When true (or egress_path=public), FE routes the edge through the IGW
   * chip: workload → IGW → destination (full A→B for public-path AWS).
   */
  via_igw?: boolean | null
  /** Kind rollup for IGW / public-path edges (s3, ntp, …). */
  egress_breakdown?: EgressBreakdownBucket[] | null
  /** Lane 3 — attack-path overlay uses IAP PathEdgeDetail rows. */
  flow_highlight?: "attack_path" | null
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

export interface AvailableVpc {
  vpc_id: string
  name: string
  workload_count: number
  /** Own-tagged subnet count when BE provides it (optional). */
  tagged_subnet_count?: number
}

export interface AvailableAccount {
  account_id: string
  name: string
  workload_count: number
  regions?: string[]
  evidence_tier: EvidenceTier
  evidence_tier_by_region?: Record<string, EvidenceTier>
  tenant_ownership?: TenantOwnership
  last_sync_at?: string | null
  onboarded: boolean
}

/**
 * This system's workloads that live OUTSIDE the currently-scoped VPC (BE >=
 * estate-honesty deploy). Lets the scoped canvas admit "there is more of this
 * system elsewhere" with one honest chrome line instead of silently implying
 * the scoped VPC is the whole system. The backend already excludes null-vpc_id
 * ghosts from `count`, so the FE renders `count` verbatim — never recomputes.
 */
export interface OutOfScopeWorkloads {
  count: number
  by_vpc: { vpc_id: string; count: number }[]
  sample_names: string[]
}

export interface TopologyRiskResponse {
  system: string
  scored_at: string
  scoring_window_days: number
  vpc_id: string | null
  selected_vpc_id?: string | null
  account_id?: string | null
  selected_account_id?: string | null
  region?: string | null
  selected_region_id?: string | null
  available_vpcs?: AvailableVpc[]
  available_accounts?: AvailableAccount[]
  available_regions?: string[]
  system_kpis: SystemKpis | null
  nodes: TopologyNode[]
  vpc_topology?: VpcTopology | null
  // Phase B addition — present on responses from BE >= phase-b deploy.
  traffic_edges?: TrafficEdge[]
  /** External systems consuming this system's shared data (observed/declared). */
  foreign_shared_access?: ForeignSharedAccessEdge[]
  /** This system's workloads outside the scoped VPC — drives the overflow line. */
  out_of_scope_workloads?: OutOfScopeWorkloads
  error?: string
  fromStaleCache?: boolean
  /** Wave D proxy computing envelope — not a finished topology-risk payload. */
  status?: "computing" | string
  staleReason?: string
  computing_started_at?: string
  compute_deadline_at?: string
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
