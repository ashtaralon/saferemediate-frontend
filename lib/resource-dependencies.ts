/**
 * Resource-anchored dependency read model (DE-305).
 *
 * The backend at GET /api/resource-dependencies/{system} already coalesces
 * pairs, resolves relation roles/labels, and reports completeness. This
 * module only types that payload and maps it into the tab's view model.
 * There is no frontend relation registry — that twin is deleted.
 */

import { typedAwsIdentity } from "@/lib/dependency-identity"
import type { BasisClass, Coverage, EvidenceBinding, SourceGenerationRef } from "@/lib/resource-dossier-types"

export function dedupeEvidenceRefs(refs: EvidenceBinding[]): EvidenceBinding[] {
  const seen = new Map<string, EvidenceBinding>()
  for (const ref of refs) seen.set(`${ref.object_key}:${ref.version_id}`, ref)
  return [...seen.values()]
}

export function dedupeSourceRefs(refs: SourceGenerationRef[]): SourceGenerationRef[] {
  const seen = new Map<string, SourceGenerationRef>()
  for (const ref of refs) seen.set(`${ref.plane}:${ref.generation}`, ref)
  return [...seen.values()]
}

export type Perspective = "USES" | "USED_BY" | "PEER"

export interface ResolvedRelationView {
  registered: boolean
  generic: boolean
  label: string
  perspective: Perspective
  mechanism: string | null
  mechanismLabel: string | null
  capability: string | null
  canonicalRelationship: string
  rawRelationship: string
}

export interface RelationFactView {
  factId: string
  resolved: ResolvedRelationView
  basisClass: BasisClass
  freshness: string
  actions: string[]
  observationDays: number | null
  lastSeen: string | null
  viaVpce: string | null
  evidenceRefs: EvidenceBinding[]
  sourceGenerationRefs: SourceGenerationRef[]
  aliasesCollapsed: string[]
}

export interface PairRowView {
  key: string
  identity: string | null
  label: string
  counterpartyType: string | null
  perspective: Perspective
  facts: RelationFactView[]
}

export interface DependencyCounterparty {
  identity: string | null
  label: string
  type: string | null
  account_id: string | null
  region: string | null
  scope: "UNKNOWN" | "EXTERNAL" | "IN_ACCOUNT"
}

export interface DependencyApiFact {
  registered: boolean
  generic: boolean
  label: string
  perspective: Perspective
  mechanism: string | null
  mechanism_label: string | null
  capability: string | null
  canonical_relationship: string
  raw_relationship: string
  fact_id: string
  basis_class: BasisClass
  freshness: string
  actions: string[]
  observation_days: number | null
  first_seen: string | null
  last_seen: string | null
  via_vpce: string | null
  evidence_refs: EvidenceBinding[]
  source_generation_refs: SourceGenerationRef[]
  aliases_collapsed: string[]
}

export interface DependencyApiPair {
  pair_key: string
  perspective: Perspective
  counterparty: DependencyCounterparty
  facts: DependencyApiFact[]
}

export interface ResourceDependenciesResponse {
  schema: "resource-dependencies/v1"
  scope: {
    tenant: string
    account_id: string
    system_name: string
    anchor_uid: string
    generation: string
  }
  page: {
    rows: DependencyApiPair[]
    returned: number
    total: number
    offset: number
    next_cursor: string | null
  }
  filters_applied: {
    perspective: string | null
    mechanism: string | null
    basis: string | null
    include_stale: boolean
  }
  counts: {
    by_perspective: Record<Perspective, number>
    external_counterparties: number
    unresolved_counterparties: number
    unregistered_relationships: Record<string, number>
    excluded: Record<string, number>
    ledger_rows_read: number
    completeness: "COMPLETE" | "TRUNCATED"
    matching_filters?: number
    all_perspectives?: number
  }
  assembly?: { latency_ms: number }
}

export function isResourceDependenciesResponse(
  value: unknown,
): value is ResourceDependenciesResponse {
  if (!value || typeof value !== "object") return false
  const body = value as { schema?: unknown; page?: unknown; counts?: unknown }
  return body.schema === "resource-dependencies/v1" && Boolean(body.page) && Boolean(body.counts)
}

function isNetworkAddress(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || (value.includes(":") && !value.startsWith("arn:"))
}

export function displayCounterparty(counterparty: DependencyCounterparty): string {
  const identity = counterparty.identity
  const resolved = counterparty.label
  if (resolved && resolved !== identity && !resolved.startsWith("arn:")) {
    return !identity && isNetworkAddress(resolved) ? `Network endpoint · ${resolved}` : resolved
  }
  if (identity) return typedAwsIdentity(identity, counterparty.type)
  return resolved || "Relationship endpoint"
}

export function mapApiPair(row: DependencyApiPair): PairRowView {
  return {
    key: row.pair_key,
    identity: row.counterparty.identity,
    label: displayCounterparty(row.counterparty),
    counterpartyType: row.counterparty.type,
    perspective: row.perspective,
    facts: row.facts.map(fact => ({
      factId: fact.fact_id,
      resolved: {
        registered: fact.registered,
        generic: fact.generic,
        label: fact.label,
        perspective: fact.perspective,
        mechanism: fact.mechanism,
        mechanismLabel: fact.mechanism_label,
        capability: fact.capability,
        canonicalRelationship: fact.canonical_relationship,
        rawRelationship: fact.raw_relationship,
      },
      basisClass: fact.basis_class,
      freshness: fact.freshness,
      actions: [...fact.actions],
      observationDays: fact.observation_days,
      lastSeen: fact.last_seen,
      viaVpce: fact.via_vpce,
      evidenceRefs: fact.evidence_refs ?? [],
      sourceGenerationRefs: fact.source_generation_refs ?? [],
      aliasesCollapsed: [...(fact.aliases_collapsed ?? [])],
    })),
  }
}

export function emptyDependenciesResponse(
  overrides: Partial<ResourceDependenciesResponse> = {},
): ResourceDependenciesResponse {
  return {
    schema: "resource-dependencies/v1",
    scope: {
      tenant: "unknown",
      account_id: "000000000000",
      system_name: "unknown",
      anchor_uid: "unknown",
      generation: "UNKNOWN",
    },
    page: { rows: [], returned: 0, total: 0, offset: 0, next_cursor: null },
    filters_applied: {
      perspective: null,
      mechanism: null,
      basis: null,
      include_stale: true,
    },
    counts: {
      by_perspective: { USES: 0, USED_BY: 0, PEER: 0 },
      external_counterparties: 0,
      unresolved_counterparties: 0,
      unregistered_relationships: {},
      excluded: {},
      ledger_rows_read: 0,
      completeness: "COMPLETE",
      matching_filters: 0,
      all_perspectives: 0,
    },
    ...overrides,
  }
}
