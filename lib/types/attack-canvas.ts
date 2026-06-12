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
 * Which conceptual plane an edge belongs to. Cyntro analyzes posture
 * across two orthogonal planes (plus a data lane for observed traffic
 * BETWEEN resources):
 *
 *   identity — IAM grants. Does Principal X have permission to call
 *              API Y on resource Z? Independent of network reachability.
 *   network  — packet/connection routing. Can host X reach host/endpoint
 *              Y? Independent of who's authorized.
 *   data     — observed access events that bind the two: an actual
 *              CloudTrail call, S3 object read, or VPC Flow record where
 *              identity-plane authorization AND network-plane reach both
 *              held at observation time.
 *
 * Renderers MUST NOT route a single SVG polyline through checkpoints
 * from more than one plane — that visually implies a serial dependency
 * that the data does not say. Use the plane to color edges and to
 * decide which segments animate (only `data` plane edges should
 * animate when observed).
 *
 * Added 2026-05-25 after the audit caught attacker-view-panel routing
 * one EC2→S3 flow through both Role (identity) and IGW (network) on a
 * single line. See feedback_test_both_sides_of_a_partition.md.
 */
export type EdgePlane = "identity" | "network" | "data"

/**
 * Maps a Neo4j relationship type to its conceptual plane. Closed
 * mapping — adding a new relationship to CanvasRelationshipType
 * requires adding it here too (TypeScript exhaustiveness check will
 * fire if you forget).
 */
export function planeFor(relationship: CanvasRelationshipType): EdgePlane {
  switch (relationship) {
    // Identity plane — IAM permission/binding edges
    case "USES_ROLE":
    case "ASSUMES_ROLE":
    case "ASSUMES_ROLE_ACTUAL":
    case "HAS_INSTANCE_PROFILE":
    case "HAS_POLICY":
      return "identity"
    // Network plane — VPC topology + reachability edges
    case "SECURED_BY":
    case "HAS_NETWORK_INTERFACE":
    case "IN_SUBNET":
    case "IN_VPC":
    case "RUNS_IN_VPC":
    case "ASSOCIATED_WITH":
    case "ROUTES_VIA":
    case "BELONGS_TO":
    case "ACTUAL_TRAFFIC":
      return "network"
    // Data plane — observed API calls + object access (binds identity + network)
    case "ACCESSES_RESOURCE":
    case "ACTUAL_API_CALL":
    case "ACTUAL_S3_ACCESS":
    case "READS_FROM":
    case "WRITES_TO":
    case "RUNTIME_CALLS":
      return "data"
  }
}

/**
 * String-keyed planeFor, for callers that have a raw `string`
 * relationship type (e.g. `PathEdgeDetail.type` from the IAP
 * response, where the type is `string` not the narrowed enum). Falls
 * back to "network" for unknown types — most config relationships
 * the IAP surfaces fall into this bucket — but the fallback is
 * intentionally conservative: it MUST NOT default to "identity" or
 * "data" because misclassifying a config edge as identity would
 * resurrect the cross-plane drawing bug.
 */
export function planeForString(relationship: string): EdgePlane {
  const r = relationship.toUpperCase()
  // Identity
  if (
    r === "USES_ROLE" ||
    r === "ASSUMES_ROLE" ||
    r === "ASSUMES_ROLE_ACTUAL" ||
    r === "HAS_INSTANCE_PROFILE" ||
    r === "HAS_POLICY"
  )
    return "identity"
  // Data (observed access events)
  if (
    r === "ACCESSES_RESOURCE" ||
    r === "ACTUAL_API_CALL" ||
    r === "ACTUAL_S3_ACCESS" ||
    r === "READS_FROM" ||
    r === "WRITES_TO" ||
    r === "RUNTIME_CALLS"
  )
    return "data"
  // Network (everything else is network/containment)
  return "network"
}

/**
 * Plane palette — matches the editorial-style design language. Three
 * distinct hues so operators read "identity" vs "network" vs "data"
 * without needing the legend. Avoid red — that's reserved for attack
 * paths in AnimatedTrafficLine.
 *
 * 500-level hues — saturated enough to read on the light theme,
 * still structural (not alarmist) on the dark navy surface.
 */
export const PLANE_COLOR: Record<EdgePlane, string> = {
  identity: "#8b5cf6", // violet-500
  network: "#14b8a6", // teal-500
  data: "#f97316", // orange-500 — warm
}

/** Slightly brighter glow companion to PLANE_COLOR for active particles. */
export const PLANE_GLOW: Record<EdgePlane, string> = {
  identity: "#a78bfa", // violet-400
  network: "#2dd4bf", // teal-400
  data: "#fb923c", // orange-400
}

/**
 * Where the canvas path came from. Today only one source exists;
 * future producers may support user-defined paths, what-if
 * simulations, etc. Adding a value is a coordinated schema change.
 */
export type PathSource = "iap_existing"

/**
 * How well the IAP-claimed path survives re-verification against
 * Neo4j. Renderer behavior:
 *   verified: render canvas normally
 *   partial:  render the verified subset; surface warnings to operator
 *   failed:   refuse to render; show error state with warnings list
 */
export type PathIntegrity = "verified" | "partial" | "failed"

/**
 * Producer-emitted warning codes. Closed enum — adding a value is a
 * coordinated schema change. See Pydantic source for per-code
 * semantics.
 */
export type WarningCode =
  | "IAP_NODE_NOT_FOUND_IN_GRAPH"
  | "IAP_NODE_TYPE_MISMATCH"
  | "PATH_EDGE_NOT_FOUND_IN_GRAPH"
  | "POLICY_DOCUMENT_PARSE_FAILED"
  | "MULTI_NODE_FOR_INPUT_ID"

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
  /**
   * Service-plane inferred edge (2026-05-30). True when the edge is NOT
   * present in Neo4j as a real (n)-[r]-(m) row but is derived from a
   * structural fact (e.g. VPCEndpoint.service_name = "*.s3" + path
   * target is an S3Bucket in same account/region → AWS routes this
   * traffic via the VPCE even though the graph doesn't stamp the edge).
   *
   * Renderer treatment when true:
   *   - Dashed line in the SAME color as the equivalent solid edge
   *     (provenance via line style, not color — operators reading the
   *     direction shouldn't get confused by a palette shift).
   *   - Hover tooltip surfaces `inferred_reason` so the operator can
   *     audit WHY this edge was synthesized.
   *
   * Renderer auto-graduates when the underlying graph fact lands:
   * inference is skipped if a real (non-inferred) edge with the same
   * source/target already exists in the edge set. Option B (collector
   * writes `(VPCEndpoint)-[:SERVES]->(S3Bucket)`) is the durable
   * follow-up; once shipped this flag stops getting set for that pair.
   */
  inferred?: boolean
  /** Operator-visible explanation of how this inferred edge was
   *  derived. Example: "VPCEndpoint serves com.amazonaws.eu-west-1.s3;
   *  S3Bucket is in same account/region — AWS routes via VPCE." */
  inferred_reason?: string
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
 * A single producer-emitted warning, surfaced to the renderer for
 * display + to operators for data-quality investigation. Severity
 * drives renderer behavior:
 *   block_render → renderer refuses to draw canvas; shows warning
 *   hide_node    → renderer omits the affected node/edge, draws rest
 *   info         → renderer logs to debug panel; canvas draws normally
 */
export interface CanvasWarning {
  code: WarningCode
  severity: "block_render" | "hide_node" | "info"
  /** aws_id of the node the warning is about. null for non-node-scoped
   *  warnings (e.g. global policy-parse failures). */
  node_id: string | null
  /** CanvasEdge id (proposed) for edge-scoped warnings. null otherwise. */
  edge_id: string | null
  /** Human-readable explanation with specific evidence (actual values
   *  from Neo4j, NOT templated). */
  message: string
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

  /** Where the path nodes came from. Today always 'iap_existing'. */
  path_source: PathSource
  /** How well the IAP path survived re-verification against Neo4j.
   *  Renderer consults this to decide whether to draw, draw-partial,
   *  or refuse-and-show-warnings. */
  path_integrity: PathIntegrity

  nodes: CanvasNode[]
  edges: CanvasEdge[]
  bindings: CanvasBinding[]
  groups: CanvasGroup[]

  /** Producer-emitted warnings (missing nodes, type mismatches,
   *  missing edges). Renderer uses each warning's severity to decide
   *  block-render vs hide-node vs log-only. */
  warnings: CanvasWarning[]

  /** Producer-side diagnostic context (timing, dropped-input nids,
   *  proof-query counts). For debug panel only. NEVER carries
   *  inference results — only verifiable producer-run facts. */
  diagnostics: Record<string, unknown>
}
