/**
 * Attack Canvas DTO — TypeScript mirror of the canonical Pydantic
 * contract in `saferemediate-backend/api/attack_canvas_types.py`.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHITECTURAL INVARIANT (non-negotiable, do NOT weaken)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  The frontend does NO inference. Every node, every edge, every
 *  group, every binding on screen came directly from the backend
 *  producer, which built it from explicit Neo4j relationships.
 *
 *  Renderer pattern:
 *    dto.nodes    → <NodeCard /> per type
 *    dto.edges    → <EdgeLine />
 *    dto.groups   → <ContainerBox />
 *    dto.bindings → <CompositeOverlay />
 *
 *  Forbidden patterns (each one is a contract violation):
 *    ❌ addAsX helpers that bucket by type / regex / name
 *    ❌ bucketForGraphType fallback chains
 *    ❌ `n.id.includes("instance-profile")` — type lives in the dto
 *    ❌ `r.name.toLowerCase()` fuzzy matching
 *    ❌ "neighbor implies related" inference
 *    ❌ visual-proximity grouping (use dto.groups instead)
 *    ❌ frontend fallback counts (e.g. total_rules ?? inb_count ?? arr.length)
 *
 *  If you find yourself reaching for one of these, the bug is
 *  upstream in the producer — fix it there.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Why v2 exists
 * ═══════════════════════════════════════════════════════════════════
 *
 *  v1's `attacker-view-panel.tsx` ran 1200 lines of bucketing +
 *  fuzzy matching + synthesis to reconstruct meaning from an
 *  unconstrained backend dict. Every audit found new "the renderer
 *  re-derived a relationship and got it wrong" bugs:
 *
 *    - Internet rendered as Principal (category error)
 *    - InstanceProfile attributed to the wrong role
 *    - IGW + S3 engulfed by the VPC bounding box (visual proximity)
 *    - "1/7 perms" comparing sts:AssumeRole to s3:* (semantic mismatch)
 *    - NACL "0 rules" hiding ALLOW ALL from 0.0.0.0/0
 *
 *  Each bug was distinct but architecturally identical: the
 *  frontend was re-deriving relationships the backend already had.
 *  v2 stops the re-derivation. Producer is verbose and explicit;
 *  consumer is dumb and trusts the wire.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Coordination with the Pydantic source
 * ═══════════════════════════════════════════════════════════════════
 *
 *  The Pydantic file is the SOURCE OF TRUTH. This file mirrors it.
 *  Any field change requires a coordinated PR across both repos with
 *  a matching `schema_version` bump.
 */

/**
 * Why a CanvasNode appears on the canvas. Every node MUST declare
 * exactly one. Adding a fifth value is a contract change — see the
 * Pydantic source for the per-value semantics.
 */
export type IncludedReason =
  | "PATH_NODE"
  | "DIRECT_PROOF_EDGE"
  | "CONTEXT_CONTAINER"
  | "REMEDIATION_TARGET"

/**
 * AWS resource types the canvas can render. Adding a new type
 * requires (1) a frontend renderer for it, (2) per-type whitelist
 * decision in the backend producer.
 */
export type CanvasNodeType =
  // Compute
  | "EC2Instance"
  | "LambdaFunction"
  | "ECSTask"
  | "FargateTask"
  // Network — VPC-scoped
  | "VPC"
  | "Subnet"
  | "NetworkInterface"
  | "SecurityGroup"
  | "NetworkACL"
  | "RouteTable"
  | "VPCEndpoint"
  // Network — boundary / not VPC-scoped
  | "InternetGateway"
  | "NATGateway"
  | "EgressOnlyInternetGateway"
  | "TransitGateway"
  // Identity — account-level (NOT in any VPC)
  | "IAMRole"
  | "IAMUser"
  | "InstanceProfile"
  | "IAMPolicy"
  | "AWSPrincipal"
  | "CloudTrailPrincipal"
  // Data resources
  | "S3Bucket"
  | "DynamoDBTable"
  | "RDSInstance"
  | "KMSKey"
  | "Secret"

export type CanvasRelationshipType =
  // Identity / IAM
  | "USES_ROLE"
  | "ASSUMES_ROLE"
  | "ASSUMES_ROLE_ACTUAL"
  | "HAS_INSTANCE_PROFILE"
  | "HAS_POLICY"
  // Network attachment / containment
  | "SECURED_BY"
  | "HAS_NETWORK_INTERFACE"
  | "IN_SUBNET"
  | "IN_VPC"
  | "RUNS_IN_VPC"
  | "ASSOCIATED_WITH"
  | "ROUTES_VIA"
  | "BELONGS_TO"
  // Observed access (CloudTrail / VPC Flow / X-Ray)
  | "ACCESSES_RESOURCE"
  | "ACTUAL_TRAFFIC"
  | "ACTUAL_API_CALL"
  | "ACTUAL_S3_ACCESS"
  | "READS_FROM"
  | "WRITES_TO"
  | "RUNTIME_CALLS"

/**
 * Composite proofs that need >1 Neo4j edge to be sound. Each kind
 * has documented semantics — see the Pydantic source for required
 * edges per kind.
 */
export type CanvasBindingKind =
  | "ip_binds_role"
  | "subnet_routes_via_gateway"
  | "subnet_associated_nacl"
  | "role_policy_reaches_jewel"

/**
 * A single node on the attacker-view canvas.
 *
 * Contract: every CanvasNode corresponds to an actual Neo4j node
 * with `aws_id` matching `n.id` or `n.arn`. Properties come from
 * Neo4j (whitelisted per type) — never synthesized, never derived.
 */
export interface CanvasNode {
  /** Actual AWS resource id (ARN, instance-id, sg-id, etc.). Canvas
   *  key + Neo4j lookup key. Never synthesized. */
  aws_id: string
  type: CanvasNodeType
  /** Human-friendly name from `n.name`. Null when collector didn't
   *  populate; renderer falls back to displaying aws_id. NEVER
   *  inferred from siblings. */
  name: string | null
  included_reason: IncludedReason
  /** CanvasEdge.id values that prove this node belongs on the canvas.
   *  Empty array allowed ONLY for PATH_NODE (self-proven by IAP path).
   *  For any other reason, MUST contain ≥1 edge id. */
  proof_edge_ids: string[]
  /** Whitelisted Neo4j properties for this node type, passed through
   *  verbatim. Renderer never derives new fields from these. */
  properties: Record<string, unknown>
}

/**
 * A relationship between two CanvasNodes, proven by a Neo4j edge.
 *
 * Contract: every CanvasEdge corresponds to an actual Neo4j
 * relationship between source_aws_id and target_aws_id with type
 * `relationship`. Producer NEVER synthesizes edges; if the graph
 * doesn't have it, the canvas doesn't draw the line.
 */
export interface CanvasEdge {
  /** Stable id, format: `${source_aws_id}|${relationship}|${target_aws_id}` */
  id: string
  source_aws_id: string
  target_aws_id: string
  relationship: CanvasRelationshipType
  /** Was this edge actually traversed (CloudTrail / VPC Flow / X-Ray)?
   *  null when the relationship type is config-only (e.g. SECURED_BY,
   *  HAS_POLICY). true / false when the type carries observation. */
  observed: boolean | null
  hit_count: number | null
  bytes: number | null
  first_seen: string | null
  last_seen: string | null
  port: number | null
  protocol: string | null
}

/**
 * A composite relationship requiring >1 Neo4j edge to be sound.
 * Defends against the "one edge misread as a complete relationship"
 * bug class (v1's wrong-role InstanceProfile bug).
 */
export interface CanvasBinding {
  kind: CanvasBindingKind
  /** Participating CanvasNode aws_ids in the order they appear in
   *  the proof chain. See Pydantic source for per-kind required order. */
  member_aws_ids: string[]
  /** CanvasEdge.id values that constitute the proof. Empty array is
   *  a contract violation. */
  proof_edge_ids: string[]
}

/**
 * Explicit containment — VPC contains Subnet contains EC2/ENI/etc.
 * The container's bounding box on the canvas is computed from the
 * explicit `member_aws_ids` set — NEVER from visual proximity. */
export interface CanvasGroup {
  container_aws_id: string
  container_type: CanvasNodeType
  member_aws_ids: string[]
  proof_relationship: CanvasRelationshipType
}

/**
 * The complete typed payload that drives the Attacker View v2.
 * Renderer iterates each array and draws — no transformation,
 * no inference.
 */
export interface AttackCanvas {
  schema_version: "1.0"
  system_name: string
  path_id: string
  generated_at: string  // ISO 8601

  nodes: CanvasNode[]
  edges: CanvasEdge[]
  bindings: CanvasBinding[]
  groups: CanvasGroup[]

  /** Producer-side diagnostic context (timing, dropped-input nids,
   *  proof-query counts). For debug panel only. NEVER carries
   *  inference results — only verifiable producer-run facts. */
  diagnostics: Record<string, unknown>
}
