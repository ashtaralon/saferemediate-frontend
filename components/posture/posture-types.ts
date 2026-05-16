// Shared types between PostureDashboard, WorkloadCard and WorkloadDrillDown.
// Mirrors the backend's posture_visibility.py shape so the contract is
// single-sourced — backend changes that drop fields surface as TypeScript
// errors here, not as silent render bugs.

export type ExposureState = "EXPOSED" | "LATENT_EXPOSURE" | "CONTAINED"

export type PostureVerdict =
  | "EXPOSED_SENSITIVE"
  | "EXPOSED"
  | "LATENT_SENSITIVE"
  | "LATENT"
  | "MISROUTED"
  | "CORRECT"

export type InternetDependencyTier = "NONE" | "MINIMAL" | "MODERATE" | "FULL"

export interface WorkloadSummary {
  id: string
  name: string
  labels: string[]
  system_name: string | null
  vpc_id: string | null
  subnet_id: string | null
  subnet_is_public: boolean | null
  is_sensitive: boolean
  sensitivity_evidence: string[]
  is_edge: boolean
  exposure_state: ExposureState
  posture_verdict: PostureVerdict
  posture_verdict_priority: number
  direct_path_count: number
  lb_chain_count: number
  observed_inbound_from_public_365d: boolean
  observed_inbound_unique_sources_365d: number
  internet_dependency_tier: InternetDependencyTier
  internet_dependency_destination_count: number
  internet_dependency_aws_via_nat_count: number
  vpce_coverage_gap_services: string[]
  posture_evidence_version: string
  posture_correlated_at: string
}

export interface PostureSummaryResponse {
  ready: boolean
  synced_at: string | null
  workload_count: number
  by_verdict: Record<string, number>
  by_exposure_state: Record<string, number>
  by_internet_dependency_tier?: Record<string, number>
  workloads_with_vpce_coverage_gap?: number
  message?: string
}

export interface PostureWorkloadsResponse {
  ready: boolean
  synced_at: string | null
  filter?: Record<string, unknown>
  count?: number
  workloads: WorkloadSummary[]
  message?: string
}

export interface DirectPathEvidence {
  eni_id: string | null
  public_ip: string | null
  eip_allocation_id: string | null
  subnet_id: string | null
  subnet_is_public: boolean | null
  igw_id: string | null
  permissive_sg_id: string | null
  permissive_sg_port: string | null
  nacl_blocks: boolean
  nacl_id: string | null
}

export interface LBChainEvidence {
  lb_arn: string
  lb_name: string
  lb_scheme: string
  lb_type: string
  target_group_arn: string
  listener_sg_id: string | null
  listener_port: number | null
  lb_listener_allows_internet: boolean
}

export interface InternetDependencyDetail {
  tier: InternetDependencyTier
  distinct_destination_count: number
  aws_via_nat_count: number
  non_aws_count: number
  aws_services_via_nat: string[]
  aws_services_with_vpce: string[]
  vpce_gap_services: string[]
  sample_destinations: string[]
  observation_window_days: number
}

export interface PostureWorkloadDetailResponse {
  ready: boolean
  summary: WorkloadSummary | null
  workload?: {
    id: string
    name: string
    labels: string[]
    system_name: string | null
    vpc_id: string | null
    subnet_id: string | null
    exposure_state: ExposureState
    posture_verdict: PostureVerdict
    posture_verdict_priority: number
    evidence_version: string | null
    posture_correlated_at: string | null
  }
  evidence: {
    exposure_state: ExposureState
    direct_paths: DirectPathEvidence[]
    lb_chains: LBChainEvidence[]
    observed_inbound_from_public_365d: boolean
    observed_inbound_unique_sources_365d: number
    sensitivity_evidence: string[]
    is_edge: boolean
    internet_dependency?: InternetDependencyDetail
  } | null
  warning?: string
}

// Internet Dependency tier UI metadata.
export const DEPENDENCY_TIER_META: Record<
  InternetDependencyTier,
  { label: string; tone: "ok" | "info" | "warning" | "critical"; oneLiner: string }
> = {
  NONE: {
    label: "No internet",
    tone: "ok",
    oneLiner: "No external destinations observed in 365 days — candidate to remove NAT egress entirely",
  },
  MINIMAL: {
    label: "Minimal",
    tone: "info",
    oneLiner: "Fewer than 5 external destinations in 365 days — tight allowlist or PrivateLink candidate",
  },
  MODERATE: {
    label: "Moderate",
    tone: "warning",
    oneLiner: "5–49 external destinations — review whether each is required",
  },
  FULL: {
    label: "Full internet",
    tone: "critical",
    oneLiner: "50+ external destinations — likely a build / proxy / generalist; justify the surface",
  },
}

// Posture recommendation envelope returned by /workloads/{id}/recommendations.
export interface PostureRecommendation {
  proposal_id: string
  action:
    | "SG_RULE_DELETE_PUBLIC_INGRESS"
    | "ADD_VPC_ENDPOINT"
    | "MOVE_WORKLOAD_TO_PRIVATE"
    | "REMOVE_PUBLIC_IP"
    | "CLOSE_NAT_EGRESS"
  auto_eligible: boolean
  resource_type: string
  resource_id: string
  parameters: Record<string, unknown>
  summary: string
  rationale: string
  manual_reason?: string
}

export interface PostureRecommendationsResponse {
  workload_id: string
  workload_name: string
  posture_verdict: PostureVerdict
  exposure_state: ExposureState
  internet_dependency_tier: InternetDependencyTier
  correlated_at: string | null
  recommendations: PostureRecommendation[]
  auto_eligible_count: number
  manual_count: number
}

export interface PostureExecuteResponse {
  proposal_id: string
  pipeline_id: string
  stage: string
  status: string
  change_results: Array<{
    change_id: string
    success: boolean
    action: string
    snapshot_id: string | null
    error: string | null
    aws_calls: string[]
  }>
  errors: string[]
}

// Verdict UI metadata — keep this co-located with the type so the
// dashboard, card, and drill-down all read from the same source.
export const VERDICT_META: Record<
  PostureVerdict,
  {
    label: string
    oneLiner: string
    tone: "critical" | "warning" | "info" | "ok"
    priorityCode: string
  }
> = {
  EXPOSED_SENSITIVE: {
    label: "Sensitive data exposed",
    oneLiner: "Sensitive workload with an internet-capable path AND observed inbound from the internet",
    tone: "critical",
    priorityCode: "P0",
  },
  EXPOSED: {
    label: "Exposed to internet",
    oneLiner: "Internet-capable path AND observed inbound from the internet in 365 days",
    tone: "critical",
    priorityCode: "P1",
  },
  LATENT_SENSITIVE: {
    label: "Sensitive · latent exposure",
    oneLiner: "Sensitive workload with an internet-capable path but no observed inbound — close the path",
    tone: "warning",
    priorityCode: "P2",
  },
  LATENT: {
    label: "Latent exposure",
    oneLiner: "Internet-capable path exists but no observed inbound in 365 days — close it",
    tone: "warning",
    priorityCode: "P3",
  },
  MISROUTED: {
    label: "Edge workload in private subnet",
    oneLiner: "Looks like an edge / proxy but sits in a private subnet — verify intent",
    tone: "info",
    priorityCode: "P5",
  },
  CORRECT: {
    label: "Correctly placed",
    oneLiner: "No reachable internet path; placement matches workload kind",
    tone: "ok",
    priorityCode: "OK",
  },
}
