export interface InfrastructureResource {
  id: string
  name: string
  type: string
  provider: string
  region: string
  status: "running" | "stopped" | "terminated" | "pending"
  healthScore: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  complianceScore: number
  tags: Record<string, string>
  lastScanned: string
  owner?: string
}

export interface InfrastructureStats {
  avgHealthScore: number
  healthTrend: number
  needsAttention: number
  totalIssues: number
  criticalIssues: number
  avgScore: number
  scoreTrend: number
  lastScanTime: string
}

export interface InfrastructureSummary {
  containerClusters: number
  kubernetesWorkloads: number
  vms: number
  vmScalingGroups: number
  databases: number
  blockStorage: number
  fileStorage: number
  objectStorage: number
}

export interface ComplianceIssue {
  systemName: string
  systemId: string
  criticalGaps: number
  totalControls: number
  owner: string
  complianceScore: number
}

export interface SecurityFinding {
  id: string
  finding_id?: string // Real finding ID from backend
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  title: string
  resource: string
  resourceType: string
  resourceId?: string
  description: string
  remediation?: string
  category: string
  discoveredAt: string
  status: "open" | "simulated" | "approved" | "executing" | "remediated" | "failed" | "rolled_back" | "resolved" | "suppressed"
  // Backend fields for simulation
  role_name?: string
  unused_actions?: string[]
  unused_actions_count?: number
  allowed_actions?: string[]
  allowed_actions_count?: number
  used_actions?: string[]
  used_actions_count?: number
  confidence?: number
  observation_days?: number
  [key: string]: any // Allow additional fields from backend
}

export interface SecurityData {
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  findings: SecurityFinding[]
}

export interface InfrastructureData {
  stats: InfrastructureStats
  summary: InfrastructureSummary
  resources: InfrastructureResource[]
  complianceIssues: ComplianceIssue[]
  securityIssues: {
    critical: number
    high: number
    medium: number
    low: number
  }
  securityFindings?: SecurityFinding[]
  trendsData: {
    newIssues: Array<{ date: string; count: number }>
    resolvedIssues: Array<{ date: string; count: number }>
    openIssues: Array<{ date: string; count: number }>
  }
}

// ============================================================================
// REMEDIATION DECISION ENGINE TYPES
// ============================================================================

export type RemediationAction = "AUTO_REMEDIATE" | "CANARY" | "REQUIRE_APPROVAL" | "BLOCK"

export interface DecisionBreakdown {
  simulation: number
  usage: number
  data: number
  dependency: number
  historical: number
}

export interface RemediationDecision {
  confidence: number
  safety: number
  action: RemediationAction
  auto_allowed: boolean
  reasons: string[]
  breakdown: DecisionBreakdown
  warnings: string[]
}

// ============================================================================
// AGENT 5 — CONFIDENCE SCORE (remediation_confidence.py)
// ============================================================================

export type ConfidenceRouting =
  | "auto_execute"
  | "human_approval"
  | "manual_review"
  | "blocked"

export interface ConfidenceGateFailure {
  gate: string
  severity: "hard_block" | "warn"
  detail: string
}

export interface ConfidenceSignals {
  control_plane_telemetry: boolean
  data_plane_telemetry: boolean
  usage_telemetry: boolean
  runtime_telemetry: boolean
  execution_triggers: boolean
  trust_graph: boolean
  resource_metadata: boolean
}

export interface RoleTags {
  environment: string
  owner: string
  system: string
  cost_center: string
  compliance: string
}

export type LLMReviewVerdict = "agree" | "escalate" | "block"

export interface LLMReview {
  verdict: LLMReviewVerdict
  reason: string
}

// Shape of the pipeline_agreement block returned by /api/confidence/check
// when the caller has passed pipeline_decision. The UI renders this to
// explain the verdict; it's the ONLY Agent-5 field that should drive
// copy like "AI reviewer agrees: BLOCK" or "AI reviewer subordinated".
export interface ConfidencePipelineAgreement {
  pipeline_decision_canonical: DecisionOutcomeCanonical | null
  pipeline_decision: string | null
  reviewer_verdict: "agrees" | "subordinated"
  agent5_routing: ConfidenceRouting
  final_routing: ConfidenceRouting
  caps_applied: Array<{ from: ConfidenceRouting; to: ConfidenceRouting; reason: string }>
  signals: {
    observation_days: number | null
    telemetry_coverage: number | null
    consumer_count: number | null
    shared: boolean | null
    completeness: "complete" | "partial" | "unknown" | null
    unsafe_reasons: string[]
  }
}

export interface ConfidenceScore {
  confidence: number // 0-100
  routing: ConfidenceRouting // final routing (may be bumped by LLM reviewer)
  resource_type?: "iam_role" | "security_group" | "s3_bucket"
  resource_id?: string
  // Below fields are only populated when the resource exists and scoring completes.
  // Error/early-exit responses (resource_not_found, no_neo4j) omit them.
  routing_deterministic?: ConfidenceRouting // routing the deterministic scorer chose
  visibility_integrity?: number // 0.0-1.0
  visibility_reasons?: string[]
  gates_failed?: ConfidenceGateFailure[]
  can_auto_execute?: boolean
  needs_human_approval?: boolean
  signals_available?: Partial<ConfidenceSignals> & Record<string, boolean>
  data_plane_enabled_domains?: string[]
  external_principals?: unknown[]
  llm_review?: LLMReview | null
  llm_explanation?: string | null
  role_tags?: RoleTags | null
  resource_tags?: RoleTags | null
  // Present only when caller passed pipeline_decision. See Layer 2 in
  // backend api/remediation_confidence.py.
  pipeline_agreement?: ConfidencePipelineAgreement
}

// ============================================================================
// BLAST RADIUS SYSTEM SCORE (BRSS v1) — system-level posture primitive
// ============================================================================

export interface BrssFactorBreakdown {
  severity_weight: number
  data_criticality: number
  reachability: number
  privilege_capability: number
  likelihood: number
  base_risk: number
  usage_confidence: number                 // ∈ [0.55, 1.0]
  exposure_uncertainty_penalty: number     // ∈ [0, EXPOSURE_PENALTY_MAX]
  adjusted_risk: number
  rank: number
  rank_weight: number
  final_contribution: number
}

export interface BrssDriver {
  resource_id: string
  resource_type: string
  resource_name: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  family: "iam" | "network" | "data" | "secrets" | "compute" | "other"
  factors: BrssFactorBreakdown
  lift_if_fixed: number              // score gain if this resource were fully remediated
}

export interface BrssCoverage {
  ratio: number                    // 0.0–1.0, feeds score ceiling
  scanned_types: string[]
  excluded_types: string[]
  scanned_instance_count: number
  known_instance_count: number
  registry_total: number
}

export interface BrssDelta {
  score_delta: number
  state_change: number
  scope_expansion: number
  resources_added: string[]
  resources_removed: string[]
  resources_changed: Array<{
    resource_id: string
    prev_adjusted_risk: number
    curr_adjusted_risk: number
    delta_adjusted_risk: number
    prev_rank: number
    curr_rank: number
  }>
  previous_score: number | null
  current_score: number
  previous_timestamp: string | null
}

export interface BlastRadiusScore {
  score: number                        // coverage-bounded final (BASE)
  score_raw: number                    // before coverage ceiling
  coverage_ceiling: number
  coverage_ratio: number
  coverage_excluded_types: string[]
  total_contribution: number
  scaled_contribution: number
  tail_contribution: number
  resource_count: number
  per_family: Partial<Record<BrssDriver["family"], number>>
  top_drivers: BrssDriver[]
  coverage: BrssCoverage
  delta: BrssDelta
  snapshot_persisted: boolean
  version: "brss-v1"
  // Phase 3 — per-system convergence overlay. Optional because the
  // backend wraps the overlay computation in its own try/except so a
  // failure there can't break the base BRSS payload. When present
  // the operator-facing score is overlay.score (post-multiplier);
  // the legacy ``score`` field is the pre-overlay base.
  overlay?: {
    score: number
    score_base: number
    convergence_multiplier: number
    convergence_load: number
    weak_planes: string[]
    visibility_penalty: number
    visibility_ratio: number
    environment: string
    base_breakdown?: unknown
    version?: string
    error?: string
  }
}

export interface ResourceChange {
  resource_id: string
  resource_type: string
  change_type: string
  before: string
  after: string
}

export interface TemporalInfo {
  start_time: string
  estimated_completion: string
}

export interface SimulationResponse {
  success: boolean
  confidence: number // Legacy 0-100 scale
  before_state: string
  after_state: string
  estimated_time: string
  temporal_info: TemporalInfo
  warnings: string[]
  resource_changes: ResourceChange[]
  impact_summary: string
  decision?: RemediationDecision
}

// Action colors and labels for UI
export const REMEDIATION_ACTION_CONFIG: Record<RemediationAction, { label: string; color: string; bgColor: string; icon: string }> = {
  AUTO_REMEDIATE: {
    label: "Auto-Remediate",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: "✅"
  },
  CANARY: {
    label: "Canary Deploy",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    icon: "🐤"
  },
  REQUIRE_APPROVAL: {
    label: "Requires Approval",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
    icon: "⚠️"
  },
  BLOCK: {
    label: "Blocked",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    icon: "🚫"
  }
}

// Score breakdown labels for UI
export const SCORE_BREAKDOWN_LABELS: Record<keyof DecisionBreakdown, { label: string; description: string }> = {
  simulation: {
    label: "Simulation",
    description: "Results from dry-run simulation"
  },
  usage: {
    label: "Usage",
    description: "Permission usage patterns"
  },
  data: {
    label: "Data Quality",
    description: "Observation coverage & sources"
  },
  dependency: {
    label: "Dependencies",
    description: "Resource graph analysis"
  },
  historical: {
    label: "Historical",
    description: "Past remediation success rate"
  }
}

// ============================================================================
// SIMULATE-FIX ENDPOINT TYPES (POST /api/least-privilege/simulate-fix)
// ============================================================================

export interface SimulateFixConsumer {
  type: string
  id: string
  name?: string
}

export interface SimulateFixResource {
  id: string
  type: string
  system: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  shared: boolean
  shared_confidence: "high" | "medium" | "low" | "unknown"
  consumers: SimulateFixConsumer[]
}

export interface SimulateFixProblem {
  summary: string
  gap_percent: number
  unused_count: number
  used_count: number
  top_risk_reasons: string[]
}

export interface SimulateFixVisibilitySignals {
  cloudtrail: boolean
  flowlogs: boolean
  xray: boolean
  s3_access_logs: boolean
  [key: string]: boolean
}

export interface SimulateFixEvidence {
  observation_window_days: number
  evidence_sources: string[]
  confidence: "high" | "medium" | "low" | "unknown"
  completeness: "complete" | "partial" | "unknown"
  caveats: string[]
  visibility_signals: SimulateFixVisibilitySignals
}

export interface SimulateFixSimulation {
  action_type: string
  summary: string
  kept_permissions: number
  removed_permissions: number
  kept_examples: string[]
  removed_examples: string[]
}

export interface SimulateFixProjectedEffect {
  blast_radius_score_before: number
  blast_radius_score_after: number
  blast_radius_score_delta: number
  family_scores_before: Record<string, number>
  family_scores_after: Record<string, number>
  resource_risk_contribution_before: number
  resource_risk_contribution_after: number
}

export type SimulateFixSafetyDecision = "auto_eligible" | "approval_required" | "blocked"

// Canonical DecisionOutcome from unified pipeline. Source of truth going
// forward — the legacy lowercase `decision` field is kept for backcompat
// but the UI should read `decision_canonical` when present.
export type DecisionOutcomeCanonical =
  | "AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "MANUAL_REVIEW"
  | "BLOCK"
  | "CANARY_FIRST"
  | "EXCLUDE"

export interface SimulateFixSafety {
  decision: SimulateFixSafetyDecision
  decision_canonical?: DecisionOutcomeCanonical | null
  rollback_available: boolean
  snapshot_required: boolean
  preflight_required: boolean
  unsafe_reasons: string[]
  // Exposed so the modal can render Agent 5 as an *explainer* of this
  // decision instead of an independent verdict. See backend
  // api/least_privilege.py SimulateFixSafety for field semantics.
  consumer_count?: number
  observation_days?: number | null   // effective window actually measured
  telemetry_coverage?: number | null // 0.0–1.0 over 4 planes
  shared?: boolean | null            // null = couldn't measure
  shared_confidence?: "high" | "medium" | "unknown" | null
  completeness?: "complete" | "partial" | "unknown" | null
  // Populated on rollback / BLOCK responses (backend 95d3e5e). Type catches up
  // to fields the modal already reads.
  block_reason?: string | null
  message?: string | null
}

export interface SimulateFixResponse {
  resource: SimulateFixResource
  problem: SimulateFixProblem
  evidence: SimulateFixEvidence
  simulation: SimulateFixSimulation
  projected_effect: SimulateFixProjectedEffect
  safety: SimulateFixSafety
}

// ============================================================================
// DATA LEAK PATHS — backed by GET /api/data-leak-paths?systemName=<>
// ============================================================================
//
// One path per (internet-capable workload → accessible crown jewel) pair.
// Each path carries dual-plane state (data-plane access + network-plane reach)
// and the four available mitigations. Mutation flows through the existing
// UnifiedPipeline endpoints listed in `availableMitigations[].execution`.

export type DataLeakInternetDependencyLevel = "NONE" | "MIN" | "MOD" | "FULL"
export type DataLeakRiskBand = "low" | "moderate" | "high" | "critical"
export type DataLeakBucket =
  | "ISOLATED"
  | "AWS_REDIRECTABLE"
  | "ACTIVE_INTERNET"
  | "LATENT_EXPOSURE"

export type DataLeakMitigationType =
  | "vpc_endpoint"
  | "remove_iam_permission"
  | "tighten_sg_egress"
  | "move_to_private_subnet"

export type DataLeakFieldState = "wired" | "partial" | "loading" | "not_wired"

export interface DataLeakEgressGate {
  kind: string                 // "InternetGateway" | "NATGateway" | ...
  id: string | null
  name?: string | null
  cidr?: string | null
  routeTableId?: string | null
}

export interface DataLeakWorkloadSnapshot {
  id: string
  name: string
  type: string                 // EC2Instance | Lambda | ECSTask | ...
  subnet: { id: string | null; name?: string | null; isPublic?: boolean | null }
  securityGroup: {
    id: string | null
    name?: string | null
    hasPublicEgress?: boolean | null
    additionalCount?: number
  }
  nacl: { id?: string | null; isDefault?: boolean | null } | null
  routeTable: { id: string | null; egressGate: DataLeakEgressGate | null }
  iamRole: { id: string | null; name: string | null }
  instanceProfile: { name?: string | null } | null
  bucket: DataLeakBucket
}

export interface DataLeakStoreSnapshot {
  id: string
  name: string
  arn?: string | null
  type: string                  // Neo4j label: S3Bucket | RDSInstance | ...
  crownJewelClass: string       // vendor-neutral: "Object storage" | "Managed database" | ...
}

export interface DataLeakObservedApiCalls {
  _state: DataLeakFieldState
  copy?: string                 // shown when _state === "not_wired"
  totalEvents?: number
  totalBytes?: number
  lastSeen?: string | null
  edgeTypes?: string[]
  actions?: string[]
}

export interface DataLeakIamPermissions {
  _state: DataLeakFieldState
  observedActions?: string[]
  deeplinkSuggestion?: string
}

export interface DataLeakInternetDestinations {
  _state: DataLeakFieldState
  totalDistinct: number
  byClass: { aws: number; external: number; unknown: number }
  signals: string[]
  topDestinations: Array<{
    ip?: string | null
    kind?: string | null
    org?: string | null
    service?: string | null
    country?: string | null
    bytes?: number | null
    hits?: number | null
    firstSeen?: string | null
    signals?: string[]
  }>
}

export interface DataLeakMitigationExecutionEndpoint {
  method: "POST" | "GET"
  path: string
  body?: Record<string, unknown>
}

export interface DataLeakMitigation {
  type: DataLeakMitigationType
  title: string
  explanation: string
  applicable: boolean
  requiresPlanning?: boolean
  requiresOverrideLineage?: boolean
  blockingReason?: string
  manualReason?: string
  params?: Record<string, unknown>
  execution: {
    simulate?: DataLeakMitigationExecutionEndpoint
    stage?: DataLeakMitigationExecutionEndpoint
    full?: DataLeakMitigationExecutionEndpoint
  } | null
  safetySignals?: {
    canRemediate: boolean
    confidenceQualitative?: "high" | "medium" | "low" | "n/a"
    evidence?: string
  }
}

export interface DataLeakPath {
  pathId: string
  riskScore: number             // 0-100
  riskBand: DataLeakRiskBand
  riskExplanation: string       // plain English, backend-composed
  workload: DataLeakWorkloadSnapshot
  dataStore: DataLeakStoreSnapshot
  dataPlane: {
    iamPermissions: DataLeakIamPermissions
    observedApiCalls: DataLeakObservedApiCalls
  }
  networkPlane: {
    bucket: DataLeakBucket
    egressGate: DataLeakEgressGate | null
    internetDestinations: DataLeakInternetDestinations
  }
  availableMitigations: DataLeakMitigation[]
}

export interface DataLeakPathsResponse {
  systemName: string
  exposedStores: number         // distinct stores reached by internet-capable workloads
  accessibleStores: number      // distinct stores reached by ANY workload
  totalStores: number           // total crown-jewel candidates in system
  pathCount: number
  internetDependency: {
    level: DataLeakInternetDependencyLevel
    summary: string
  }
  evidenceAge: {
    egressLookbackDays: number
    computedAt: string
  }
  paths: DataLeakPath[]
}

// Vendor-neutral display config for the four mitigations + risk-band visuals.
export const DATA_LEAK_RISK_BAND_CONFIG: Record<DataLeakRiskBand, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: "Critical", color: "#DC2626", bgColor: "rgba(220, 38, 38, 0.10)",  borderColor: "#DC2626" },
  high:     { label: "High",     color: "#EA580C", bgColor: "rgba(234, 88, 12, 0.10)",  borderColor: "#EA580C" },
  moderate: { label: "Moderate", color: "#CA8A04", bgColor: "rgba(202, 138, 4, 0.10)",  borderColor: "#CA8A04" },
  low:      { label: "Low",      color: "#0284C7", bgColor: "rgba(2, 132, 199, 0.10)",  borderColor: "#0284C7" },
}

export const DATA_LEAK_BUCKET_LABEL: Record<DataLeakBucket, string> = {
  ISOLATED:         "Cannot reach internet",
  LATENT_EXPOSURE:  "Internet path open · no traffic observed",
  AWS_REDIRECTABLE: "Reaches managed cloud via public route",
  ACTIVE_INTERNET:  "Actively reaching external destinations",
}

export const DATA_LEAK_DEPENDENCY_LABEL: Record<DataLeakInternetDependencyLevel, { label: string; tone: "ok" | "warn" | "bad" }> = {
  NONE: { label: "None",     tone: "ok"   },
  MIN:  { label: "Minimal",  tone: "ok"   },
  MOD:  { label: "Moderate", tone: "warn" },
  FULL: { label: "Full",     tone: "bad"  },
}

// Safety decision UI config
export const SAFETY_DECISION_CONFIG: Record<SimulateFixSafetyDecision, { label: string; color: string; bgColor: string; icon: string }> = {
  auto_eligible: {
    label: "Auto-Eligible",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: "✅"
  },
  approval_required: {
    label: "Approval Required",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
    icon: "⚠️"
  },
  blocked: {
    label: "Blocked",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    icon: "🚫"
  }
}

// =============================================================================
// Attack Chains v2 — hop-reified attack-path model (v0.2 §3)
// =============================================================================
//
// Replaces the column-bucket + checkpoint-route layout with explicit
// ordered hops walked from real Neo4j edges. Each AttackChain object
// is produced by the backend Phase 3 materialization and read via
// /api/attack-chain/chains-for-cj. The v0.3 9-lane Attacker View
// renderer iterates these hops and draws connections directly — no
// inference, no orphan cards.

export type AttackChainEvidence = "observed" | "config" | "unknown"

export interface AttackChainHop {
  /** Drawing order within the chain. */
  ordinal: number
  /** Graph node id of the source side. */
  source_id: string
  /** Neo4j label of the source node (e.g. 'EC2Instance', 'IAMRole'). */
  source_type: string
  /** Human-readable name; falls back to id when unset on the node. */
  source_name: string | null
  target_id: string
  target_type: string
  target_name: string | null
  /** Neo4j relationship type. Some are observation-backed
   *  (HAS_NETWORK_INTERFACE), some are synthetic (EXFILTRATES_VIA). */
  edge_type: string
  /** observed = real traffic / activity data underlies this hop.
   *  config   = the edge exists but no observation data.
   *  unknown  = the hop is referenced but a node didn't resolve. */
  evidence: AttackChainEvidence
  hit_count: number | null
  first_seen: string | null
  last_seen: string | null
}

export type AttackChainStatus =
  | "OBSERVED"
  | "POTENTIAL_EXCESS"
  | "UNVERIFIED"
  | "BLOCKED"

export type AttackChainGate =
  | "OPEN_OBSERVED"
  | "OPEN_CONFIG"
  | "CLOSED"
  | "UNKNOWN"

export type AttackChainDamageType =
  | "read"
  | "write"
  | "delete"
  | "admin"
  | "encrypt"
  | "corrupt"
  | "exfiltrate"

export interface AttackChainClosure {
  remove_actions: string[]
  keep_actions: string[]
  scope_to_prefixes: string[]
  preserve_kms_chain: boolean
  posture_notes: string[]
  remediation_window_days: number
}

export interface AttackChain {
  /** sha256(workload|role|cj) — stable across re-runs. */
  id: string
  cj_arn: string | null
  cj_name: string | null
  cj_type: string
  workload_arn: string | null
  workload_name: string | null
  /** Neo4j label of the workload — 'EC2Instance', 'LambdaFunction', 'ECSService'. */
  workload_kind: string
  role_arn: string | null
  role_name: string | null
  path_status: AttackChainStatus
  damage_types: AttackChainDamageType[]
  observed_actions: string[]
  observed_prefixes: string[]
  observed_object_keys: string[]
  excess_actions: string[]
  identity_gate: AttackChainGate
  route_gate: AttackChainGate
  data_plane_gate: AttackChainGate
  /** v2 §7 killer paragraph rendered from structured fields. */
  business_sentence: string
  closure_recommendation: AttackChainClosure
  hops: AttackChainHop[]
  hop_count: number
  computed_at: string | null
  schema_version: string
}

/** Per-node enrichment surfaced via /chains-for-cj.node_meta.
 *  Backend reads these properties at request time from the live graph
 *  so they reflect the latest collector run without re-materialization
 *  of Phase 3. Every field is optional — null/missing means the
 *  collector hasn't populated that signal yet (itself rendering
 *  information). */
export interface AttackChainNodeMeta {
  labels?: string[]
  // EC2 IMDS state
  imds_http_tokens?: string | null
  imds_http_endpoint?: string | null
  imdsv2_enforced?: boolean | null
  imds_disabled?: boolean | null
  // Subnet posture
  subnet_public?: boolean | null
  subnet_cidr?: string | null
  // Workload-level internet posture
  is_internet_exposed?: boolean | null
  public_ip?: string | null
  internet_dependency_tier?: string | null
  // Security group posture
  sg_total_rules?: number | null
  sg_high_risk?: boolean | null
  sg_public_ingress?: boolean | null
  // S3 / data-plane posture
  bucket_versioning?: string | null
  bucket_object_lock?: string | boolean | null
  bucket_kms_key?: string | null
  bucket_public_access_block?: boolean | null
  // EC2 vuln signals
  cve_count?: number | null
  critical_cves?: number | null
  // IAM role usage signals
  role_allowed_actions?: number | null
  role_used_actions?: number | null
  role_data_events?: string[] | null
  // Synthetic sentinel marker
  is_synthetic?: boolean
  description?: string
}

export interface AttackChainsResponse {
  cj: { id: string; name: string; type: string }
  chains: AttackChain[]
  /** Per-node enrichment keyed by node id. Added 2026-05-23 to surface
   *  IMDS / subnet public/private / internet exposure / SG rules / bucket
   *  posture / role usage on the Phase View v0.3 chips. Optional — older
   *  backends won't include it; renderer should fall back gracefully. */
  node_meta?: Record<string, AttackChainNodeMeta>
  stats: {
    total: number
    by_status: Partial<Record<AttackChainStatus, number>>
    total_hops: number
    avg_hop_count: number
    nodes_enriched?: number
  }
  /** Set when the crown jewel id didn't resolve to a graph node —
   *  chains[] will be empty in that case. */
  note?: string
}

/**
 * v0.3 9-lane attacker-phase taxonomy. Each Neo4j node type maps to
 * exactly one lane via `laneForNodeType()` in the renderer; the same
 * node may participate in multiple lanes across different chains
 * (e.g. KMSKey shows up in 'creds' when read by a workload, and in
 * 'data' when it IS the crown jewel).
 */
export type AttackLane =
  | "entry"      // Internet, ExternalIP, public ALB/NLB/API GW, Lambda URL
  | "reach"      // Subnet, SecurityGroup, NACL, VPCEndpoint, RouteTable
  | "land"       // EC2, Lambda, ECS, NetworkInterface
  | "creds"      // AccessKey, SecretsManagerSecret, KMSKey-as-source
  | "become"     // IAMRole, InstanceProfile, IAMPolicy, PermissionSet, SSOUser/Group
  | "data"       // S3Bucket, DynamoDBTable, RDSInstance, KMSKey-as-target
  | "exfil"      // InternetGateway, NATGateway, VPCEndpoint-as-egress
  | "persist"    // derived from role allowed_actions (iam:Create*, lambda:UpdateFunction*)
  | "defense"    // overlay — VPC Flow Logs present? CloudTrail data events? etc.

export interface AttackLaneConfig {
  id: AttackLane
  label: string
  attackerQuestion: string
  /** Hex color for chip / accent. */
  accent: string
  /** Lucide icon name (resolved in the component). */
  icon: string
}

export const ATTACK_LANES: AttackLaneConfig[] = [
  {
    id: "entry",
    label: "ENTRY POINTS",
    attackerQuestion: "Where can I land?",
    accent: "#ef4444",
    icon: "Globe",
  },
  {
    id: "reach",
    label: "REACH GATES",
    attackerQuestion: "What sits between me and my next hop?",
    accent: "#f97316",
    icon: "Shield",
  },
  {
    id: "land",
    label: "WORKLOADS",
    attackerQuestion: "What did I land on?",
    accent: "#3b82f6",
    icon: "Server",
  },
  {
    id: "creds",
    label: "CREDENTIAL SOURCES",
    attackerQuestion: "What creds can I steal here?",
    accent: "#a855f7",
    icon: "KeyRound",
  },
  {
    id: "become",
    label: "IDENTITIES & ESCALATION",
    attackerQuestion: "Who can I become next?",
    accent: "#ec4899",
    icon: "Key",
  },
  {
    id: "data",
    label: "CROWN JEWELS",
    attackerQuestion: "What's the prize?",
    accent: "#10b981",
    icon: "Database",
  },
  {
    id: "exfil",
    label: "EXFIL CHANNELS",
    attackerQuestion: "How do I get data out?",
    accent: "#f59e0b",
    icon: "ArrowUpRight",
  },
  {
    id: "persist",
    label: "PERSISTENCE",
    attackerQuestion: "How do I stay?",
    accent: "#8b5cf6",
    icon: "Lock",
  },
  {
    id: "defense",
    label: "DEFENSE GAPS",
    attackerQuestion: "What would catch me?",
    accent: "#64748b",
    icon: "Eye",
  },
]

// ─── Shared IAM Roles (discovery — step 1 of refactor) ─────────────
// Wires to backend GET /api/iam/shared-roles. Read-only. Future
// endpoints (split-plan, approve, execute, rollback) add types here.

export interface SharedRole {
  role_arn: string
  role_name: string
  consumer_count: number
  consumer_kinds: Record<string, number>
  system_tags: string[]
  cross_system: boolean
  // Plan store is step 2; until then these are always false / null.
  has_active_plan: boolean
  active_plan_id: string | null
}

export interface SharedRolesFilters {
  min_principals: number
  system_name: string | null
  cross_system_only: boolean
  include_stale: boolean
  include_inactive: boolean
}

export interface SharedRolesResponse {
  shared_roles: SharedRole[]
  as_of: string
  filters: SharedRolesFilters
  count: number
}

// ─── Split plan (step 2 + 5) ───────────────────────────────────────

export type SplitPlanState =
  | "PROPOSED"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "REJECTED"
  | "EXPIRED"

export type EvidenceState =
  | "HIGH"
  | "NONE"
  | "CONFLICTED"
  | "COMPLEX_POLICY"

export interface ConsumerEvidence {
  consumer_id: string
  consumer_type: string | null
  consumer_name: string | null
  system_name: string | null
  observed_actions: string[]
  allowed_intersection: string[]
  evidence_state: EvidenceState
  blockers: string[]
}

export interface GroupingKey {
  account_id: string | null
  region: string | null
  system_name: string | null
  consumer_type: string | null
  trust_policy_hash: string
  permission_boundary: string | null
  proposed_actions_hash: string
  proposed_resource_arns_hash: string
  conditions_hash: string
}

export interface SplitPlanGroup {
  group_id: string
  grouping_key: GroupingKey
  consumers: ConsumerEvidence[]
  proposed_role_name: string
  proposed_policy_document: Record<string, unknown>
  proposed_trust_policy: unknown
  permission_boundary_arn: string | null
}

export interface SplitPlanServerMeta {
  stored_plan_hash: string
  created_at: string
  expires_at: string
}

export interface SplitPlan {
  plan_id: string
  plan_hash: string
  version: number
  state: SplitPlanState
  created_at: string
  expires_at: string
  requested_by: string
  shared_role: {
    role_arn: string
    role_name: string
    account_id: string | null
    region: string
  }
  discovery_facts: {
    consumer_count: number
    consumer_kinds: Record<string, number>
    system_tags: string[]
    cross_system: boolean
  }
  eligible_groups: SplitPlanGroup[]
  blocked_consumers: ConsumerEvidence[]
  execution_modes_available: string[]
  execution_modes_enabled: string[]
  data_caveats: string[]
  // Layered on by GET — absent on POST response
  expired?: boolean
  server_meta?: SplitPlanServerMeta
}

export interface ApprovePlanResponse {
  plan_id: string
  state: SplitPlanState
  approval: {
    event_id: string
    approved_at: string
    approved_by: string
    plan_id: string
    plan_hash_at_approval: string
  }
}
