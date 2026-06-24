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
  narration_source?: "llm" | "template" | "business_sentence_floor" | null
  narration_l3_ok?: boolean | null
  narration_generated_at?: string | null
}

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
