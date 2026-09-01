/**
 * Dependency pair projection — workplan v1.3 §5.5.
 *
 * "The Dependencies tab normally renders one resource-pair row with separate
 * axes for configuration assertion [and] runtime assertion." This module is
 * that projection, kept pure and DOM-free so its grouping, alias collapsing and
 * perspective assignment can be executed directly rather than only rendered.
 */

import { resolveRelation, type Perspective, type ResolvedRelation } from "@/lib/dependency-relations"
import { canonicalDependencyIdentity, displayIdentity } from "@/lib/dependency-identity"
import type { BasisClass, Dependency, EvidenceBinding, SourceGenerationRef } from "@/lib/resource-dossier-types"

/** Derived rows are admitted only with their derivation exposed (§5.5). */
export const DERIVED_RELATIONSHIPS = new Set(["CAN_REACH", "MAY_ACCESS"])

export interface RelationFact {
  resolved: ResolvedRelation
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

export interface PairRow {
  key: string
  identity: string | null
  label: string
  counterpartyType: string | null
  perspective: Perspective
  facts: RelationFact[]
}

/**
 * Evidence pointers are content-addressed, and two collector generations can
 * return the same object for two spellings of one relationship (the workplan
 * §3.3 measured exactly that: 40 unique links returned twice). Deduplicate on
 * the identity the renderer keys on, so a repeat cannot become a second row.
 */
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

/**
 * Merge freshness across collapsed spellings of one attachment.
 *
 * A stale signal from any writer survives — masking it behind another writer's
 * "current" would be the freshness lie `pattern_silent_regression_via_timestamp
 * _preservation` warns about. Silence (UNKNOWN) never downgrades a positive
 * currency signal: missing observation is not evidence of staleness.
 */
function mergeFreshness(left: string, right: string): string {
  if (left === "STALE" || right === "STALE") return "STALE"
  if (left === "CURRENT" || right === "CURRENT") return "CURRENT"
  return left || right || "UNKNOWN"
}

function latest(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  const a = Date.parse(left)
  const b = Date.parse(right)
  if (Number.isNaN(a)) return right
  if (Number.isNaN(b)) return left
  return b > a ? right : left
}

/** Fold one ledger row into the fact it duplicates, losing nothing. */
function absorb(fact: RelationFact, dependency: Dependency, rawRelationship: string) {
  if (rawRelationship !== fact.resolved.rawRelationship
    && !fact.aliasesCollapsed.includes(rawRelationship)) {
    fact.aliasesCollapsed.push(rawRelationship)
  }
  fact.freshness = mergeFreshness(fact.freshness, dependency.freshness)
  fact.actions = [...new Set([...fact.actions, ...(dependency.actions ?? [])])]
  fact.observationDays = Math.max(
    fact.observationDays ?? 0,
    dependency.observation_days ?? 0,
  ) || null
  fact.lastSeen = latest(fact.lastSeen, dependency.last_seen ?? null)
  fact.viaVpce = fact.viaVpce ?? dependency.via_vpce ?? null
  fact.evidenceRefs = dedupeEvidenceRefs([...fact.evidenceRefs, ...(dependency.evidence_refs ?? [])])
  fact.sourceGenerationRefs = dedupeSourceRefs(
    [...fact.sourceGenerationRefs, ...(dependency.source_generation_refs ?? [])],
  )
}

export function buildPairs(ledger: Dependency[]) {
  const pairs = new Map<string, PairRow>()
  const derived: Dependency[] = []
  const unregistered = new Set<string>()
  const generic = new Set<string>()
  // Keyed by pair, not by row: one endpoint reached through three relationships
  // is one unresolved endpoint, and reporting three would be a fabricated count.
  const unresolved = new Set<string>()

  for (const dependency of ledger) {
    if (DERIVED_RELATIONSHIPS.has(String(dependency.relationship ?? ""))) {
      derived.push(dependency)
      continue
    }
    const resolved = resolveRelation(dependency.relationship, dependency.direction)
    if (!resolved.registered) unregistered.add(resolved.rawRelationship || "unnamed relationship")
    if (resolved.generic) generic.add(resolved.rawRelationship)

    const identity = canonicalDependencyIdentity(dependency)
    const label = displayIdentity(dependency)
    const counterpartyType = dependency.principal_type ?? dependency.target_type ?? null
    const endpoint = identity ?? `${counterpartyType ?? "unknown"}:${label}`
    if (!identity) unresolved.add(endpoint)

    const key = `${resolved.perspective}::${endpoint}`
    const existing = pairs.get(key) ?? {
      key, identity, label, counterpartyType, perspective: resolved.perspective, facts: [],
    }

    // §5.5: one pair row. Legacy spellings of one relationship collapse onto
    // the canonical name instead of showing the same attachment twice.
    const twin = existing.facts.find(fact =>
      fact.resolved.canonicalRelationship === resolved.canonicalRelationship
      && fact.basisClass === dependency.basis_class)
    if (twin) {
      absorb(twin, dependency, resolved.rawRelationship)
    } else {
      existing.facts.push({
        resolved,
        basisClass: dependency.basis_class,
        freshness: dependency.freshness,
        actions: [...new Set(dependency.actions ?? [])],
        observationDays: dependency.observation_days ?? null,
        lastSeen: dependency.last_seen ?? null,
        viaVpce: dependency.via_vpce ?? null,
        evidenceRefs: dedupeEvidenceRefs(dependency.evidence_refs ?? []),
        sourceGenerationRefs: dedupeSourceRefs(dependency.source_generation_refs ?? []),
        aliasesCollapsed: [],
      })
    }
    pairs.set(key, existing)
  }

  const rows = [...pairs.values()].sort((a, b) => a.label.localeCompare(b.label))
  return {
    rows,
    derived,
    unregistered: [...unregistered],
    generic: [...generic],
    unresolvedIdentities: [...unresolved],
  }
}
