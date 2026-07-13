// =============================================================================
// AttackPathReport — the deterministic contract between the backend
// Attack-Path Compiler and the frontend narrative renderer.
// =============================================================================
//
// Architecture line (ratified 2026-06-10, Alon):
//   backend Attack-Path Compiler → AttackPathReport → AttackerNarrative(report)
//
// The backend owns: claim construction, evidence grading, gate derivation,
// damage mapping, GAP calculation, recommended fix, verification target.
// The frontend owns: layout, copy hierarchy, conditional display.
// The React layer must NEVER derive security meaning from raw fields once
// the backend emits this object.
//
// Vocabulary law — ONE taxonomy, not two:
//   * Claim `EvidenceGrade` is ATOMIC (authored by the compiler per claim).
//   * `GateState` is DERIVED from the grades of the gate's required claims —
//     never independently authored. identity_gate = OPEN_OBSERVED only if its
//     required claims include observed identity evidence on THIS gate (an
//     observed hop elsewhere on the path proves nothing about this gate).
//
// INFERRED constraint (ratified):
//   * INFERRED claims MAY appear in the attacker narrative.
//   * INFERRED claims CANNOT authorize damage cells.
//   * INFERRED claims CANNOT authorize remediation diffs.
//   * INFERRED claims CANNOT make anything AUTO-eligible.
//   The compiler enforces this via `can_drive_damage` / `can_drive_remediation`
//   (always false for INFERRED); the frontend renders but never overrides.
//
// NO MOCK DATA — every value comes from the live graph via the compiler.
// Absent signal → the claim is absent AND listed in `missing_evidence`
// (silent dropping hides collection gaps; surfacing them is the feature).

import type {
  LayerEvidence,
  ReachableDamageBucket,
} from "./reachable-damage-priority"

export type EvidenceGrade =
  | "OBSERVED" // proven in telemetry (CloudTrail / VPC Flow / data events)
  | "CONFIGURED" // config allows it; no behavior observed
  | "INFERRED" // valid model inference (e.g. IMDS creds reachable if box popped)
  | "UNKNOWN" // required signal missing — verification gap, never a free pass
  | "BLOCKED" // a control provably breaks it

export interface ClaimSourceRef {
  kind:
    | "neo4j_node"
    | "neo4j_edge"
    | "collector_property"
    | "closure_preview"
    | "model_rule"
  id?: string
  property?: string
  value?: unknown
}

export interface Claim {
  id: string
  text: string
  grade: EvidenceGrade
  source_refs: ClaimSourceRef[]
  /** Compiler-enforced: false whenever grade === "INFERRED" | "UNKNOWN". */
  can_drive_damage: boolean
  /** Compiler-enforced: false whenever grade === "INFERRED" | "UNKNOWN". */
  can_drive_remediation: boolean
}

// Derived — same enum family the graph speaks (AttackPath gate states).
export type GateState =
  | "OPEN_OBSERVED"
  | "OPEN_CONFIG"
  | "UNKNOWN"
  | "CLOSED"
  | "BLOCKED"

export type AttackerPhase =
  | "LAND_ON_FOOTHOLD"
  | "BECOME_IDENTITY"
  | "REACH_JEWEL"
  | "EXPLOIT_GAP"
  | "HIT_CROWN_JEWEL"
  | "EXFILTRATE_OR_DESTROY"

export interface AttackerStep {
  phase: AttackerPhase
  title: string
  /** Compiler-authored prose, grounded ONLY in the referenced claims. */
  body: string
  claim_ids: string[]
}

export type DamageCategory = "READ" | "WRITE" | "DELETE" | "ADMIN" | "EXFIL" | "DECRYPT"

// Per-action → damage-class cell. The crown-jewel asset: s3:DeleteObject is
// object-delete, NOT bucket-destroy — `not_equivalent_to` makes the
// non-equivalence machine-checkable.
export interface DamageCell {
  cell_id: string // e.g. "s3.object_delete"
  category: DamageCategory
  label: string // e.g. "Delete objects"
  status: "ALLOWED" | "BLOCKED" | "UNKNOWN"
  actions: string[] // exact IAM actions, e.g. ["s3:DeleteObject"]
  evidence_grade: EvidenceGrade
  scope?: {
    type: "bucket" | "prefix" | "object" | "service" | "unknown"
    values: string[]
  }
  not_equivalent_to?: string[] // e.g. ["s3.bucket_delete"]
  caused_by_claim_ids: string[]
}

export interface CapabilityBehaviorGap {
  observed_actions: string[]
  observed_scopes: string[]
  unused_dangerous_actions: string[]
  evidence_window?: {
    days_observed: number
    complete: boolean
  }
  claim_ids: string[]
}

export interface RemediationDiffRef {
  diff_id: string
  /** The human approves THIS hash, not the prose. */
  diff_hash: string
  delivered_as: "IAM_POLICY_PATCH" | "TERRAFORM_PR" | "MANUAL_REVIEW" | string
  keep_actions: string[]
  remove_actions: string[]
  scope_to?: string[]
  rollback_snapshot_id?: string
  /** S3 correctness split (compiler-authored): bucket-level actions bind to
   *  arn:aws:s3:::bucket; object-level to bucket/<prefix>/*. ListBucket is
   *  bucket-level with an s3:prefix condition — materialized by the plan
   *  engine, rendered from this split. */
  keep_bucket_level?: string[]
  keep_object_level?: string[]
  /** Approval context — what the change touches, shown before the diff. */
  role?: string | null
  consumers?: number
}

export interface SafetyDecision {
  gate: "AUTO_ELIGIBLE" | "REVIEW_REQUIRED" | "BLOCKED"
  reasons: string[]
}

export interface VerificationTarget {
  preserve: string[] // behaviors that must keep working
  remove_damage_cells: string[] // cell_ids that must be gone post-apply
  expected_result: string
}

export interface MissingEvidence {
  signal: string // e.g. "bucket policy status"
  why_it_matters: string
  collector_or_field?: string
  /** Does this gap block the proposed approval, or only affect severity? */
  blocks_approval?: boolean
}

// Micro-enforcement (Cyntro term) — least-privilege on every plane. Three
// planes, one idea: narrow each to what's provably used.
export type MicroPlane = "micro_permissions" | "micro_segmentation" | "micro_access"

export type RiskReduction =
  | "FOOTHOLD_EXPOSURE"
  | "DATA_READ_EXPOSURE"
  | "DATA_DELETE_DAMAGE"
  | "DATA_ADMIN_DAMAGE"
  | "BLAST_RADIUS"
  | "EXFIL_PORTABILITY"

export const RISK_REDUCTION_LABEL: Record<RiskReduction, string> = {
  FOOTHOLD_EXPOSURE: "foothold exposure",
  DATA_READ_EXPOSURE: "whole-bucket read surface",
  DATA_DELETE_DAMAGE: "delete damage",
  DATA_ADMIN_DAMAGE: "admin damage",
  BLAST_RADIUS: "blast radius",
  EXFIL_PORTABILITY: "credential portability",
}

export interface MicroEnforcement {
  plane: MicroPlane
  title: string
  layer: "IAM" | "NETWORK" | "DATA"
  evidence_grade: EvidenceGrade
  summary: string
  remove: string[]
  keep: string[]
  scope_to: string[]
  claim_ids: string[]
  /** Set when the plane is below OBSERVED grade — names the missing signal
   *  (e.g. per-port flow for segmentation) instead of overclaiming. */
  pending_signal?: string | null
  /** What THIS plane reduces — different per plane (network ≠ data damage). */
  reduces?: RiskReduction[]
  /** Per-plane safety unit — one OBSERVED plane must not green-light the bundle. */
  safety_gate?: "AUTO_ELIGIBLE" | "REVIEW_REQUIRED" | "BLOCKED"
  approval_scope?: "STANDALONE" | "BUNDLE_MEMBER"
}

export interface AttackPathReport {
  report_id: string
  report_version: string
  compiler_version: string
  /** Hash of the evidence pack this report was compiled from — binds the
   *  narrative + diff to an immutable input for the audit line. */
  evidence_pack_hash?: string
  path_id: string

  current_state: {
    status: "OPEN_TODAY" | "PARTIALLY_BLOCKED" | "BLOCKED" | "UNKNOWN"
    exposure_score?: number
    severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    source_label: string
    target_label: string
    summary: string
    /** Path shape the narrative was composed against (spec §1):
     *  A = compute-excess, B = assume-chain, C = zero-excess reach. */
    shape?: "A" | "B" | "C"
    /** Shape-aware executive headline composed by the compiler from structured
     *  fields (never by string-splitting business_sentence). The renderer
     *  prefers this over its Shape-A-only fallback. */
    headline?: string
    /** Three-node attacker spine (#453). Prefer over collapsed source_label. */
    spine?: Zoom1Spine | null
  }

  claims: Claim[]

  gates: {
    entry?: GateState
    identity?: GateState
    network?: GateState
    data_plane?: GateState
    exfil?: GateState
  }

  attacker_steps: AttackerStep[]

  damage_matrix: DamageCell[]

  gap: CapabilityBehaviorGap | null

  blast_radius?: {
    brs?: number
    band?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    headline?: string
    claim_ids?: string[]
  } | null

  remediation_diff: RemediationDiffRef | null

  safety_decision: SafetyDecision | null

  verification_target: VerificationTarget | null

  missing_evidence: MissingEvidence[]

  /** The fix, decomposed across the three enforcement planes. */
  micro_enforcement?: MicroEnforcement[]

  /** Narration provenance (L2). Present when a narration has been generated and
   *  surfaced via /report. Absent (null) → the card uses the deterministic floor
   *  (business_sentence / computed lede), which is itself deterministic. */
  narration_json?: NarrationJson | null
  narration_source?: "llm" | "template" | "business_sentence_floor" | null
  narration_l3_ok?: boolean | null
  narration_generated_at?: string | null
}

/** Backend Zoom1Spine DTO (#453 flat shape on current_state.spine). */
export interface SpineNode {
  id: string
  name: string
  kind: string
}

export type SpineOriginConfidence =
  | "observed_complete"
  | "config_complete"
  | "origin_unresolved"

export interface IdentityHop {
  via: string
  from_node: SpineNode
  to_node: SpineNode
  observed?: boolean
}

export interface Zoom1Spine {
  origin_node?: SpineNode | null
  origin_category?: string | null
  origin_confidence: SpineOriginConfidence
  identity_hops: IdentityHop[]
  effective_principal: SpineNode
  impact_target: SpineNode
  identity_gate?: string | null
  route_gate?: string | null
  data_plane_gate?: string | null
  damage_verbs?: string[]
  damage_scoped_to?: string
  identity_pivots?: SpineNode[]
  excess_service_reach?: number
}

/** Stored L2 narration payload (from :AttackPath.narration_json). */
export interface NarrationJson {
  executive?: string
  operator?: string
  remediation_intent?: string
  source?: string
  l3_ok?: boolean
  l3_reason?: string
  generated_at?: string
}

// =============================================================================
// PathListRow — IR for the list/comparison consumers (PR 2 / task #34).
// =============================================================================
//
// The per-path AttackPathReport above is heavy (claims[], damage_matrix[],
// remediation_diff, etc.) and authored by a backend compiler — perfect for
// detail surfaces, wrong shape for a scannable list. PathListRow is the lite
// projection list/comparison renderers consume.
//
// Same vocabulary law as AttackPathReport: components MUST NOT re-derive
// security meaning from raw `IdentityAttackPath` once the row is compiled.
// All selectors live in `compile-path-list-row.ts` and run ONCE per render.
//
// Today (2026-06-25): the row is FE-compiled from the existing
// IdentityAttackPath the IAP endpoint returns. There is no
// `/api/attack-paths/list-projection` yet; #33 was marked complete without a
// backend contract. When that endpoint lands, swap the compile call for a
// direct deserialize — the row shape is the same.

/** Evidence-of-real-traffic class for a path. Phase A of #58. */
export type PathObservedE2EClass = "live_exfil" | "recon" | "capability"

// =============================================================================
// Sprint 0 impact taxonomy (PR 1 backend writer @ 0fa11f73, PR 2 FE reader).
// =============================================================================
// Backend writes these on every (:AttackPath) node alongside the legacy
// damage_types. See docs/specs/sprint_0_damage_taxonomy.md (backend repo)
// and unified/materialization/impact_taxonomy.py for the verb→bucket table.

export type ImpactBucket =
  | "READ"
  | "WRITE"
  | "EXFIL"
  | "DESTRUCTIVE"
  | "PRIV_ESC"
  | "PERSISTENCE"
  | "EVASION"
  | "SECRET_EXPOSURE"
  | "EXECUTION"
  | "UNKNOWN"

export type HeadlineTag =
  | "CATASTROPHIC"
  | "TAKEOVER"
  | "SECRET LEAK"
  | "DATA BREACH"
  | "DESTRUCTIVE ACCESS"
  | "EVASION ENABLED"
  | "EXPOSURE"
  | "CONFIGURED RISK"

export type ImpactConfidence = "HIGH" | "MEDIUM" | "LOW"

export interface ImpactReason {
  action: string
  bucket: ImpactBucket
  confidence: ImpactConfidence
}

export interface PathListRow {
  /** Path id — used for selection + React keys. Matches `IdentityAttackPath.id`. */
  id: string

  // ---- Identity / context ---------------------------------------------------

  /** Operator-meaningful "where the attacker starts" (first non-principal
   *  node, then assume-edge source — see compileSourceLabel for the BE-10
   *  rules). */
  source_label: string

  /** The IAM role that actually reaches the crown jewel (assume-chain aware). */
  identity_label: string

  /** Display labels for the chain head/tail — what the list shows as
   *  `start → target`. `target` resolves the canonical crown jewel
   *  (Bug #209: avoid KMSKey-terminus mislabel). */
  start_label: string | null
  target_label: string | null

  /** Crown jewel canonical id this path terminates at. Mirrors
   *  `IdentityAttackPath.crown_jewel_id`. */
  crown_jewel_id: string

  // ---- Severity + traffic ---------------------------------------------------

  /** Severity for the list-row chip. `null` when the path didn't carry a
   *  severity record — render "—" rather than fabricating. */
  severity_label: string | null
  severity_score: number | null

  /** Sum of `hit_count` across every observed edge on this path. The
   *  operator-meaningful "real traffic on this attack route" — used for
   *  sort, hit chip, and top-of-bucket marker. */
  observed_hits: number

  /** Hop count for the "N hops" chip. */
  hop_count: number

  /** True iff at least one edge is is_observed=true (regardless of hits). */
  has_observed_edge: boolean

  /** PR 1 / IAP `evidence_type` — observed vs configured. Kept for the
   *  "observed (no hit count)" badge case. */
  evidence_type: "observed" | "configured"

  // ---- Classifications ------------------------------------------------------

  /** ATT&CK Initial Access bucket. Uses the backend-emitted category when
   *  present (`path.initial_access.category`), falls back to the legacy
   *  inline derivation otherwise. The fallback path is shrinking — once
   *  the backend writes the edge for every system we delete it. */
  initial_access_category: InitialAccessCategoryLite

  /** Phase-A FE-derived class — answers "is this a real exfil route, just
   *  recon, or paper capability?" (#58). */
  observed_e2e_class: PathObservedE2EClass

  // ---- Stale / lifecycle ----------------------------------------------------

  is_materialized_stale: boolean
  stale_reason: string | null

  // ---- Damage + fix summaries (pre-resolved strings) -----------------------

  /** Operator-readable damage summary (e.g. "DELETE · WRITE · READ"). */
  damage_summary: string

  /** Top recommended fix label (capped at 72 chars) or "—". */
  top_fix_label: string

  // ---- Sprint 0 impact taxonomy --------------------------------------------
  // Backend writes these on every (:AttackPath) — additive, legacy
  // damage_summary above kept for one release while consumers migrate.

  /** Orthogonal impact buckets (e.g. ["DESTRUCTIVE", "READ", "WRITE"]).
   *  Each chip is rendered by impact-chip-row.tsx with the path-level
   *  confidence dot. Falls back to legacy damage_types-derived buckets
   *  when the backend hasn't written impact_buckets yet. */
  impact_buckets: ImpactBucket[]

  /** Composite one-tag headline ("CATASTROPHIC", "DESTRUCTIVE ACCESS", etc.).
   *  See spec §3 for the priority rules. Falls back to "CONFIGURED RISK"
   *  when the backend hasn't written impact_headline. */
  impact_headline: HeadlineTag

  /** Path-level confidence = min of chip confidences. HIGH = literal-ARN
   *  policy scope + no conditions. MEDIUM = wildcards or conditions.
   *  LOW = service skips scope filter (KMS/DDB today) or wildcard
   *  Resource. */
  impact_confidence: ImpactConfidence

  /** Per-verb evidence breakdown — present when backend wrote it. Sprint 0
   *  does not render this (drawer is PR 3 follow-up). Kept on the row so
   *  the headline derivation predicate has access to verb-level service
   *  info (e.g. TAKEOVER vs SECRET LEAK nuance — §3.1). */
  impact_reasons: ImpactReason[]

  // ---- Zoom 0 attacker-lens contract (PRD-attacker-lens-three-zoom) --------

  /** Headline sentence first on the row (never a badge pile). */
  attacker_headline: string

  /** P / N / D evidence chips — observed ≠ config; N may be na-standing. */
  layer_permissions: LayerEvidence
  layer_network: LayerEvidence
  layer_data: LayerEvidence

  /** Damage verbs for the row chip (DELETE, EXFIL, …). */
  damage_verbs: string[]

  /** Lateral reach count from identity (0 when unknown). */
  lateral_count: number

  /** Reachable Damage Priority — UI bucket + two-axis sort keys. */
  reachable_damage_bucket: ReachableDamageBucket
  /** Composite impact*100 + origin_confidence (lower = higher priority). */
  reachable_damage_rank: number
  impact_tier: number
  origin_confidence_rank: number

  /** Weak fix-readiness signal for triage tie-break. */
  fix_ready: boolean
}

/** Lightweight alias — we don't import the full
 *  identity-attack-paths/types InitialAccessCategory here to keep this
 *  module's import surface aligned with PR 1's "no raw IAP imports in the
 *  IR layer" intent. The runtime values are identical. */
export type InitialAccessCategoryLite =
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

/** Lookup helper — renderer resolves a step's claims for grade chips. */
export function claimsById(report: AttackPathReport): Map<string, Claim> {
  return new Map(report.claims.map((c) => [c.id, c]))
}

/** Worst (most-proven-open) grade across a set of claims — for step chips. */
export function dominantGrade(claims: Claim[]): EvidenceGrade {
  const order: EvidenceGrade[] = ["OBSERVED", "CONFIGURED", "INFERRED", "UNKNOWN", "BLOCKED"]
  for (const g of order) if (claims.some((c) => c.grade === g)) return g
  return "UNKNOWN"
}
