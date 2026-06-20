export interface SeverityBreakdown {
  overall_score: number
  severity: string
  impact: number
  internet_exposure: number
  permission_breadth: number
  data_sensitivity: number
  identity_chain: number
  network_controls: number
  weights: {
    impact: number
    internet_exposure: number
    permission_breadth: number
    data_sensitivity: number
    identity_chain: number
    network_controls: number
  }
  // Damage-driven floor — set when the path's actual reachability
  // (admin verbs, destructive scale, service breadth) lifted the score
  // above the 6-factor result. Surfaces "why" in the operator UI.
  damage_floor?: number
  damage_floor_applied?: boolean
  damage_rationale?: string[]
}

export interface NodeRemediation {
  service: string
  actions: string[]
  priority: string
}

// Remediation execution state
export type RemediationStatus = "idle" | "previewing" | "confirming" | "executing" | "success" | "error"

export interface RemediationPreview {
  node_id: string
  node_type: string
  node_name: string
  service: string
  preview_message: string
  permissions_to_remove?: string[]
  unused_permissions?: number
  total_permissions?: number
  unused_rules?: any[]
  [key: string]: any
}

export interface RemediationResult {
  success: boolean
  node_id: string
  message: string
  snapshot_id?: string
  rollback_available?: boolean
  permissions_removed?: number
  blocked?: boolean
  block_reason?: string
  summary?: {
    before_total: number
    after_total: number
  }
}

export interface InternetExposureAlert {
  is_exposed: boolean
  open_ports: number[]
  observed_ports: number[]
  recommended_ports: number[]
  controls: {
    nacl: boolean
    security_group: boolean
    waf: boolean
    private_subnet: boolean
  }
  message: string
}

// -- Enriched fields (new backend shape) --

export interface NodePermissions {
  total: number
  used: number
  unused: number
  high_risk: string[]
}

export interface NodePolicyDetails {
  inline_policies: number
  managed_policies: number
  wildcards: string[]
}

export interface NodeRules {
  inbound_count: number
  outbound_count: number
  open_to_internet: boolean
}

export interface NodeAccessSummary {
  total_accessors: number
  api_calls: number
  data_volume_bytes: number
}

export interface NodeEncryption {
  at_rest: boolean
  in_transit: boolean
}

export interface NodeTrafficSummary {
  inbound_bytes: number
  outbound_bytes: number
  api_calls: number
}

// The 6 severity factors, keyed so the UI can look up weights + deltas
export type SeverityFactor =
  | "impact"
  | "internet_exposure"
  | "permission_breadth"
  | "data_sensitivity"
  | "identity_chain"
  | "network_controls"

// Principal-like node types that show up as the entry-tier "who is
// authenticating" wrapper on an attack path. As of 2026-05-22 the IAP
// backend serializes path-node `type` from Neo4j labels rather than
// the collector-written `n.type` property — so an STS-derived session
// that the harness sees as labels=[AWSPrincipal, Principal] now arrives
// here as type="AWSPrincipal" (was "CloudTrailPrincipal" previously),
// and an STS session whose labels include IAMRole arrives as
// type="IAMRole". This set lets any code that needs to detect the
// "entry principal" widen the check without duplicating the list.
// "CloudTrailPrincipal" is retained for back-compat in case future
// nodes lack a more-specific label.
export const PRINCIPAL_NODE_TYPES = new Set<string>([
  "CloudTrailPrincipal",
  "AWSPrincipal",
  "Principal",
  "Root",
])

export function isPrincipalNodeType(type: string | undefined | null): boolean {
  return !!type && PRINCIPAL_NODE_TYPES.has(type)
}

export const FACTOR_LABELS: Record<SeverityFactor, string> = {
  impact: "Impact Severity",
  internet_exposure: "Internet Exposure",
  permission_breadth: "Permission Breadth",
  data_sensitivity: "Data Sensitivity",
  identity_chain: "Identity Chain",
  network_controls: "Network Controls",
}

export interface RiskReductionAction {
  action: string
  impact: number
  // New fields from weight-correct simulation (optional for back-compat)
  action_type?: string
  node_name?: string
  node_type?: string
  dominant_factor?: SeverityFactor | null
  delta_by_factor?: Partial<Record<SeverityFactor, number>>
  weights?: Partial<Record<SeverityFactor, number>>
  // True when this node is on the path but we can't remediate it (e.g. AWS
  // service-linked roles). The row renders a locked state — Preview disabled,
  // no score projection, badge explains why.
  not_remediable?: boolean
  not_remediable_reason?: string | null
  // Phase 2: which remediation plane this action belongs to. Drives the
  // 3-column "fix this path" panel.
  plane?: "iam" | "network" | "data" | "other"
}

// Phase 2: per-plane remediation rollup. Backend at risk_reduction.by_plane.
// Each plane bucket carries its own action list + simulated joint delta.
// action_count = actionable_count + locked_count, so locked-only planes
// still show as "1 action" in the rollup (matches the visible list below).
export interface PlaneRemediationBucket {
  actions: RiskReductionAction[]
  action_count: number
  actionable_count?: number
  locked_count?: number
  achievable_score: number
  delta: number
}

export interface RiskReduction {
  current_score: number
  achievable_score: number
  top_actions: RiskReductionAction[]
  total_reduction?: number
  weights?: Partial<Record<SeverityFactor, number>>
  by_plane?: {
    iam: PlaneRemediationBucket
    network: PlaneRemediationBucket
    data: PlaneRemediationBucket
  }
  // Deterministic, data-derived "what Cyntro will actually do for this
  // path" sentence. Built from the real top_actions list — names and
  // counts only, no marketing copy. Always present when there are
  // candidate actions. Replaces the prior hardcoded "After Cyntro"
  // sentence in the UI.
  reduction_summary?: string
}

// "More services in the flow" — for each IAM role on the path, the list
// of OTHER resources the role touches (sibling neighbors not already on
// this path). Drives the "Reachable Services" expansion below the diagram.
export interface ReachableNeighbor {
  id: string
  name: string
  type: string
  is_internet_exposed: boolean
  edge_types: string[]
  edge_count: number
}

export interface ReachableNeighborsByRole {
  role_id: string
  role_name?: string
  neighbor_count: number
  neighbors_returned: number
  by_type: Record<string, number>
  neighbors: ReachableNeighbor[]
}

// 1-hop infrastructure context per node. Each bucket lists related neighbors
// (VPC, Subnet, SecurityGroup, IAM role, KMS, ALB, etc.) discovered via
// canonical edge types. Used to render related-service chips inline in the
// lateral movement diagram per CISO ask "show all services in each path".
export interface InfraNeighbor {
  id: string
  name: string
  type: string
  edge_type: string  // canonical edge name that linked us (e.g. SECURED_BY)
}
export interface InfraContext {
  vpcs?: InfraNeighbor[]
  subnets?: InfraNeighbor[]
  security_groups?: InfraNeighbor[]
  nacls?: InfraNeighbor[]
  iam_roles?: InfraNeighbor[]
  iam_policies?: InfraNeighbor[]
  instance_profiles?: InfraNeighbor[]
  kms_keys?: InfraNeighbor[]
  bucket_policies?: InfraNeighbor[]
  load_balancers?: InfraNeighbor[]
  target_groups?: InfraNeighbor[]
  log_groups?: InfraNeighbor[]
  monitors?: InfraNeighbor[]
}

// Phase 1: damage capability — what an attacker reaching the end of the
// path can actually DO (read N tables, delete K objects, etc.). Three-state
// per feedback_no_mock_numbers_in_ui — never fabricated numbers.
//
// 2026-05-11 rewrite: damage is now PATH-AWARE. Legacy `verbs` /
// `reachable_services` keys still populated for back-compat but now mean
// DIRECT damage on the crown jewel (not the role's global ceiling). New
// `direct_*` / `lateral_*` / `gates` fields make the split explicit and
// `effective_damage` surfaces network/data-plane blocks.
export interface DamageVerbs { read: number; write: number; delete: number; admin: number }
export interface DamageGates {
  network_reachable: boolean
  network_reason?: string | null
  data_plane_reachable: boolean
  data_plane_reason?: string | null
}
export type EffectiveDamage = "live" | "network_blocked" | "data_plane_blocked" | "no_jewel_perms"
export interface DamageCapability {
  state: "live" | "not_applicable" | "not_wired" | "error"
  reason?: string
  role_name?: string
  role_arn?: string
  jewel_name?: string
  jewel_service?: string  // s3, dynamodb, kms, …
  total_allowed_actions?: number
  // Legacy keys — now reflect DIRECT damage on the jewel (back-compat).
  verbs?: DamageVerbs
  reachable_services?: Record<string, number>
  observed_resources_accessed?: number
  destructive_capable?: boolean
  summary?: string
  // Path-aware split (new 2026-05-11)
  direct_verbs?: DamageVerbs
  direct_action_count?: number
  direct_actions?: string[]  // e.g. ["s3:GetObject", "s3:PutObject"] — capped at 50
  lateral_verbs?: DamageVerbs
  lateral_action_count?: number
  lateral_services?: Record<string, number>
  gates?: DamageGates
  effective_damage?: EffectiveDamage
  // Accuracy-audit reconciliation (2026-06-11): when the backend matched
  // this path to a materialized :AttackPath node, the graph's
  // damage_types replace the grant-ceiling heuristics as the source of
  // truth for the damage chip (F2/F3). damage_source flags the override.
  materialized_damage_types?: string[]
  damage_source?: "materialized_attack_path"
}

// Gate/damage summary of the materialized :AttackPath node backing a
// synthesized list path. Same vocabulary as the chains-for-cj endpoint.
export interface MaterializedPathSummary {
  id: string
  path_status: "OBSERVED" | "POTENTIAL_EXCESS" | "UNVERIFIED" | "BLOCKED"
  damage_types: string[]
  identity_gate: string
  route_gate: string
  data_plane_gate: string
  role_name?: string | null
  workload_name?: string | null
}

// BRS v1.1 — per-jewel Blast Radius Score (attached to each path)
export interface TargetBlastRadius {
  brs: number
  band: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  components: {
    doc: number
    ips: number
    nes: number
    lms: number
  }
  amplifier: number
  doc_floor_applied: boolean
  rationale: string[]
}

export interface LaneDefinition {
  id: string
  label: string
  icon: string
}

// -- Node types --

// Tier-1 enrichment (2026-05-19): SecurityFinding annotation attached
// per node. Backend joins SecurityFinding.resourceArn to node.id in one
// batch Cypher round-trip — caps at 10 findings per node to keep
// response size sane.
export interface NodeFinding {
  id: string
  title: string
  // Lowercase (matches backend SecurityFinding.severity convention)
  severity: "critical" | "high" | "medium" | "low"
  type?: string | null
  category?: string | null
  description?: string | null
  remediation?: string | null
  can_auto_remediate?: boolean
  status?: string | null
  confidence?: number | null
  source?: string | null
  discovered_at?: string | null
}

export interface PathNodeDetail {
  id: string
  /** ARN preferred for canvas / graph-view backend lookups (PR #63). */
  canonical_id?: string | null
  name: string
  type: string
  tier: "entry" | "identity" | "network_control" | "crown_jewel"
  lane?: "entry" | "compute" | "security_group" | "nacl" | "subnet" | "vpc" | "iam" | "pivot" | "crown_jewel"
  is_internet_exposed: boolean
  lp_score: number | null
  gap_count: number
  remediation: NodeRemediation | null
  internet_exposure_alert: InternetExposureAlert | null
  // Tier-1: identity-protection three-state on IAMUser / IAMRole
  // nodes — `true` = MFA enabled, `false` = explicitly disabled,
  // `null` / undefined = unknown (collector hasn't observed this user).
  // Frontend renders an "MFA OFF" / "MFA ON" / "MFA unknown" pill on
  // identity-tier cards. IAMRole rarely needs MFA so the badge stays
  // muted for roles; IAMUser without MFA is a HARD signal.
  has_mfa?: boolean | null
  has_console_access?: boolean | null
  // BE-2: role injected into the spine because an observed role→role assume
  // edge reached it (lateral movement); it is the assume edge's *target*, not
  // the path's entry. Used to keep spine ordering honest (BE-9).
  assume_escalation?: boolean
  // BE-2: terminal jewel node synthesized from a dangling edge target (orphan-
  // role / chain paths omit it from nodes[]). tier is "crown_jewel" here.
  synthesized_terminal?: boolean
  // 2026-05-23: soft-delete flag surfaced through the response so the
  // frontend's client-side stale gate (lib/active-filters.ts) can drop
  // paths through inactive nodes even when localStorage SWR serves a
  // cached IAP response from before backend hardening. `false` = node
  // is_active=false in Neo4j (soft-deleted by reconciliation pass).
  // `true` / `null` / undefined = node is renderable.
  is_active?: boolean | null
  // Tier-1: SecurityFinding nodes whose resourceArn === this node.id.
  // Empty array when no findings reference this node. Backend caps at
  // 10 per node — operator drills in via the detail panel for the rest.
  findings?: NodeFinding[]
  // Enriched fields (optional for backward compat)
  permissions?: NodePermissions | null
  policy_details?: NodePolicyDetails | null
  rules?: NodeRules | null
  open_ports?: number[]
  observed_ports?: number[]
  unused_ports?: number[]
  data_classification?: string | null
  access_summary?: NodeAccessSummary | null
  encryption?: NodeEncryption | null
  traffic_summary?: NodeTrafficSummary | null
  recommendations?: string[]
  // 1-hop infrastructure context (VPC, Subnet, SG, IAM role, KMS, etc.).
  // Each bucket lists 0..N related neighbors discovered via canonical edges.
  infra_context?: InfraContext
  // Subnet.public flag from the subnet_visibility_collector. Meaningful in
  // two cases: when this node IS a Subnet (its own classification), and
  // when this node is an EC2/Lambda (the public flag of its containing
  // subnet, surfaced inline to save a round-trip). null = unknown.
  subnet_is_public?: boolean | null
  // NetworkEndpoint enrichment (org, country, asn, AWS service hint).
  ip_metadata?: {
    kind?: "internal" | "aws" | "external" | "unknown"
    org?: string
    isp?: string
    asn?: string
    country?: string
    country_name?: string
    city?: string
    aws?: { service?: string; region?: string; network_border_group?: string } | null
  }
  // ── Tier-1 enrichment Part 2 fields (proxy ?enriched=true) ───────
  // Each field only appears when backend `_apply_enriched_supplements`
  // resolved a relevant graph fact for THIS node. Frontend renders the
  // section conditionally — `node.<field>` truthy → show section,
  // otherwise drop silently (no empty-state spam).
  //
  // Per `feedback_remediation_safety_signals.md` these ARE evidence
  // signals next to the recommendation — render them on the node
  // detail panel so the operator sees WHY a recommendation routed
  // the way it did (e.g. mitigation_history showing a prior rollback).
  egress_destinations?: EgressDestinationEntry[]
  eni_count?: number
  mitigation_history?: MitigationEvent[]
  target_groups?: TargetGroupEntry[]
  s3_prefixes?: S3PrefixEntry[]
  /** Singular: each Subnet has exactly one effective RouteTable. Matches
   * the backend `_fetch_route_tables` shape (chip item 8). Frontend
   * renders this as a small annotation on the Subnet card and as a
   * grouped list in the node detail panel. */
  route_table?: RouteTableInfo
  /** Legacy plural — kept so older callers reading `node.route_tables`
   * don't crash. New code should read `node.route_table` directly.
   * Removed in a follow-up once all readers migrate. */
  route_tables?: RouteTableInfo[]
  load_balancer_targets?: Array<{
    instance_id: string
    az?: string | null
    health?: string | null
  }>
  lambda_invocation_count?: number
  lambda_invocations?: number
}

/** ── Tier-1 expanded supplements (?enriched=true) ─────────────────
 * Per-node arrays attached by backend `_apply_enriched_supplements`.
 * Each interface mirrors the backend Cypher's RETURN shape. All fields
 * optional — backend tolerates missing graph data; frontend renders the
 * three-state contract per `feedback_no_mock_numbers_in_ui`.
 */

export interface EgressDestinationEntry {
  destination_ip: string
  destination_class?: string
  bytes?: number
  hits?: number
  org?: string | null
  aws_service?: string | null
  domain?: string | null
}

export interface S3PrefixEntry {
  id: string
  prefix: string
  hits: number
  bytes?: number
  last_seen?: string | null
  access?: Array<{
    principal_id: string
    operation: string
    hits: number
    last_seen?: string | null
  }>
}

export interface TargetGroupEntry {
  id: string
  name: string
  protocol?: string | null
  port?: number | null
  target_type?: string | null
  targets: Array<{
    id: string
    name: string
    type?: string | null
  }>
}

/** Subnet → RouteTable + per-route target. Backend's `_fetch_route_tables`.
 * Per-Subnet (singular) because each Subnet has exactly one effective
 * RouteTable in AWS. `routes` denormalizes the (Subnet)-[:ROUTES_VIA]
 * edges keyed on destination CIDR. */
export interface RouteTableInfo {
  rtb_id: string
  rtb_name: string
  /** True when this RouteTable is the VPC's Main RT. Frontend prefixes
   * the annotation with "Main · " for operator-clarity. */
  is_main?: boolean | null
  /** AWS-reported route count on the RouteTable (may exceed `routes`
   * length if some routes target a CIDR-only NextHop the collector
   * couldn't tie back to a typed node). */
  route_count: number
  routes: Array<{
    destination: string  // CIDR or prefix-list
    target_id: string
    target_name: string
    target_kind:
      | "InternetGateway"
      | "NATGateway"
      | "VPCEndpoint"
      | "TransitGateway"
      | "VPCPeeringConnection"
      | "EgressOnlyInternetGateway"
      | null
  }>
}

export type MitigationKind =
  | "RemediationEvent"
  | "OverrideEvent"
  | "MutationEvent"
  | "RollbackEvent"
  | "QuarantineRecord"

export interface MitigationEvent {
  id: string
  kind: MitigationKind
  rel_type?: string
  event_type?: string
  status?: string | null
  success?: boolean | null
  confidence?: number | null
  rollback_available?: boolean | null
  rolled_back_at?: string | null
  rolled_back_by?: string | null
  overridden_by?: string | null
  rationale?: string | null
  resource_type?: string | null
  initiated_by?: string | null
  quarantined_at?: string | null
  restored_at?: string | null
  at: string
}

export interface PathEdgeDetail {
  source: string
  target: string
  type: string
  label: string
  port: number | null
  protocol: string | null
  is_observed: boolean
  traffic_bytes?: number
  hit_count?: number
}

/** ATT&CK-style Initial Access category — how an attacker first reaches
 *  the workload/identity that starts an attack path. Categories follow
 *  alon@2026-06-20 taxonomy; backend authoritative source is the
 *  `initial_access_classifier.py` that writes (ap:AttackPath)-[:INITIAL_ACCESS_VIA]->().
 *
 *  Mapping to AWS surfaces:
 *    LEAKED_ACCESS_KEY        — IAM long-term key in code/Slack/repo
 *    IMDS_CREDENTIAL_THEFT    — EC2 IMDSv1 + reachable workload SSRF
 *    EXPOSED_S3_BUCKET        — bucket policy/ACL allows anonymous
 *    EXPOSED_RDS_SNAPSHOT     — public RDS / EBS snapshot
 *    EXPOSED_K8S_WORKLOAD     — EKS/Fargate public ingress
 *    EXPOSED_ECR_IMAGE        — public ECR registry
 *    EXPOSED_WORKLOAD_RCE     — Lambda URL / ALB-fronted workload reachable to internet
 *    COGNITO_OR_FEDERATED_IDP — OIDC/SAML/Cognito trust path
 *    CONSOLE_OR_CLOUDSHELL    — human session via AWS Console / CloudShell
 *    CROSS_ACCOUNT_TRUST      — role trusts external AWS account
 *    UNKNOWN                  — no identified initial access in graph today (honest)
 */
export type InitialAccessCategory =
  | "LEAKED_ACCESS_KEY"
  | "IMDS_CREDENTIAL_THEFT"
  | "EXPOSED_S3_BUCKET"
  | "EXPOSED_RDS_SNAPSHOT"
  | "EXPOSED_K8S_WORKLOAD"
  | "EXPOSED_ECR_IMAGE"
  | "EXPOSED_WORKLOAD_RCE"
  | "COGNITO_OR_FEDERATED_IDP"
  | "CONSOLE_OR_CLOUDSHELL"
  | "CROSS_ACCOUNT_TRUST"
  | "UNKNOWN"

/** Backend-emitted Initial Access classification per attack path.
 *  Single source of truth lives in Neo4j as INITIAL_ACCESS_VIA edge.
 *  FE falls back to inline derivation from node enrichment when this
 *  field is absent (migration window before BE-A.2 lands). */
export interface InitialAccess {
  category: InitialAccessCategory
  /** Node id of the pivot — the chip the attacker first lands on
   *  (workload, IDP, console session, external account). Null when
   *  category is UNKNOWN or category is identity-level (e.g. leaked key). */
  pivot_node_id?: string | null
  /** Plain-English attacker narrative — one sentence. */
  attacker_narrative?: string | null
  /** observed = CloudTrail-evidenced; config = graph-state-derived;
   *  inferred = heuristic match (e.g. IMDSv1 + public IP). */
  confidence?: "observed" | "config" | "inferred"
  /** Structured evidence facts — schema depends on category. */
  evidence?: Record<string, unknown>
}

export interface IdentityAttackPath {
  id: string
  /** Neo4j :AttackPath id (sha256). Closure-preview expects this, not `id`. */
  attack_path_id?: string | null
  crown_jewel_id: string
  nodes: PathNodeDetail[]
  edges: PathEdgeDetail[]
  severity: SeverityBreakdown
  path_kind: string
  evidence_type: "observed" | "configured"
  hop_count: number
  // Enriched fields (optional for backward compat)
  lanes?: LaneDefinition[]
  risk_reduction?: RiskReduction | null
  target_blast_radius?: TargetBlastRadius | null
  /** ATT&CK Initial Access classification (alon@2026-06-20). Backend
   *  authoritative source: classifiers/initial_access_classifier.py
   *  writes (ap:AttackPath)-[:INITIAL_ACCESS_VIA]->(). Optional —
   *  FE falls back to inline derivation from node enrichment until
   *  the backend classifier ships. */
  initial_access?: InitialAccess | null
  // Phase 0: classifies path as identity / network / hybrid / configured.
  // Replaces the old hard filter that dropped non-identity paths.
  path_kind_tag?: "identity" | "network" | "hybrid" | "configured"
  // Phase 1: per-path damage capability — concrete impact at end of path.
  damage_capability?: DamageCapability | null
  // LLM-generated 1-2 sentence concrete narrative of what an attacker
  // reaching the end of this path could actually do. Opt-in on backend
  // via ENABLE_DAMAGE_NARRATIVE. Null when disabled / no signal /
  // Bedrock call failed. Frontend should fall back to verb chips when
  // null.
  damage_narrative?: string | null
  // LLM-generated 1-2 sentence "what Cyntro will actually do for this
  // path" — grounded in the real top_actions + projection. Same env
  // gate as damage_narrative. Null when LLM is off; frontend falls back
  // to risk_reduction.reduction_summary which is deterministic.
  reduction_narrative?: string | null
  // "All services in the flow" — sibling resources reachable from each
  // IAM role on the path. Renders as the "Reachable Services" expansion.
  reachable_neighbors?: ReachableNeighborsByRole[]
  // Accuracy-audit reconciliation (2026-06-11): true when this path is
  // backed by a materialized :AttackPath node (the same node the
  // closure panel reads). False = pure synthesis; closure-preview may
  // 404 for it.
  materialized?: boolean
  // True when the backing :AttackPath is stale (workload inactive).
  // Shown with honest muted styling — not counted in live graph totals.
  materialized_stale?: boolean
  stale_reason?: string | null
  // Graph damage taxonomy from the materialized node — read/write/
  // delete/admin. Source of truth for the damage chip when present.
  damage_types?: string[]
  // Gates + status of the backing node (drives the evidence summary).
  materialized_path?: MaterializedPathSummary | null
}

export interface CrownJewelSummary {
  id: string
  /** ARN preferred for canvas / graph-view backend lookups (PR #63). */
  canonical_id?: string | null
  name: string
  type: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  path_count: number
  highest_risk_score: number
  is_internet_exposed: boolean
  data_classification: string | null
  priority_score: number
  // "reachable_only" = jewel isn't tagged to this system but the system's
  // IAM roles reach it via observed edges (shared-bucket-across-systems
  // pattern). Absent/null for in-system jewels.
  crown_jewel_source?: "reachable_only" | null
  // Accuracy-audit F1 (2026-06-11): count of materialized :AttackPath
  // nodes reaching this jewel in the graph.
  materialized_path_count?: number
  /** Stale :AttackPath nodes (inactive workload) — not in live graph total. */
  stale_materialized_path_count?: number
  // True when the materializer has run for this account but produced
  // ZERO AttackPath nodes for this jewel — the honest "not computed"
  // state. Synthesized paths are suppressed backend-side; the UI must
  // not render a path count or severity score for this jewel.
  paths_not_computed?: boolean
}

// Tier-1: system-level posture summary attached to the top of the
// response. Lives alongside the path list because PostureRecord is a
// system aggregate, not per-resource — every node on every path in this
// response shares the same posture context. Frontend uses
// `overall_score` to colour the per-node ring (green/amber/red).
// `null` when no PostureRecord exists yet (not-wired three-state).
export interface SystemPosture {
  overall_score: number | null
  grade: string | null
  dimensions: Record<string, number> | null
  last_observed: string | null
}

export interface IdentityAttackPathsResponse {
  system_name: string
  timestamp: string
  crown_jewels: CrownJewelSummary[]
  paths: IdentityAttackPath[]
  total_paths: number
  critical_paths: number
  high_paths: number
  exposed_jewels: number
  total_jewels: number
  error?: string | null
  // Tier-1 enrichment: system-level posture summary (live/loading/not-wired).
  system_posture?: SystemPosture | null
  // True when the response was reconciled against materialized
  // :AttackPath nodes (accuracy audit F1/F2/F3). False = materializer
  // hasn't run; list is pure synthesis.
  materialization_available?: boolean
}

export interface JewelDetailResponse {
  system_name: string
  jewel_id: string
  jewel_name: string
  jewel_type: string
  is_internet_exposed: boolean
  paths: IdentityAttackPath[]
  total_paths: number
  timestamp: string
  error?: string
}
