/**
 * Resource Dossier v6 response contract, shared by the dossier panel and its
 * tabs. Mirrors `cyntro_data/contracts/resource_dossier` on the backend — keep
 * the two in step; do not fork a second copy of these shapes.
 */

export type ServeState = "ACTIVE" | "PARTIAL" | "NOT_READY" | "INTEGRITY_HELD" | "NOT_APPLICABLE"
export type AssertionState = "OBSERVED" | "CONFIGURED" | "INFERRED" | "UNKNOWN" | "BLOCKED" | "NOT_APPLICABLE"
export type BasisClass = "OBSERVED" | "CONFIGURED" | "STRUCTURAL"

export interface Coverage {
  state: "FULL" | "PARTIAL" | "NONE" | "UNKNOWN"
  required_sources: string[]
  present_sources: string[]
  missing_sources: string[]
  sufficient_for: string[]
  insufficient_for: string[]
}

export interface EvidenceBinding {
  object_key: string
  version_id: string
  digest: string
}

export interface SourceGenerationRef {
  plane: string
  generation: string
  head_hash: string
  evidence_binding: EvidenceBinding | null
}

export interface Assertion<T = unknown> {
  state: AssertionState
  value: T | null
  basis: string
  sources: string[]
  evidence_refs: EvidenceBinding[]
  authority_basis: string
  as_of: string
  window: { start: string; end: string; days: number } | null
  coverage: Coverage
  source_generation_refs: SourceGenerationRef[]
  policy_version: string | null
}

export interface Dependency {
  direction: "UPSTREAM" | "DOWNSTREAM"
  basis_class: BasisClass
  freshness: string
  relationship: string
  principal_canonical_resource_uid?: string | null
  principal_arn?: string | null
  principal_display_name?: string | null
  principal_type?: string | null
  target_canonical_resource_uid?: string | null
  target_arn?: string | null
  target_display_name?: string | null
  target_type?: string | null
  resource_canonical_resource_uid: string
  first_seen?: string | null
  last_seen?: string | null
  observation_days?: number | null
  actions?: string[]
  read_prefixes?: string[]
  write_prefixes?: string[]
  delete_prefixes?: string[]
  via_vpce?: string | null
  evidence_refs: EvidenceBinding[]
  source_generation_refs: SourceGenerationRef[]
}

export interface DossierSection<T> {
  serve_state: ServeState
  payload: T | null
  coverage: Coverage | null
  notes: string | null
}

export interface DependenciesPayload {
  ledger: Dependency[]
  counts_by_basis: Record<BasisClass, number>
}
