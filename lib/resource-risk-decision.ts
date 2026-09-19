import type { DecisionOutcomeCanonical } from '@/lib/types'

export type ResourceRiskDecision = DecisionOutcomeCanonical | 'PENDING'

export type ResourceRiskDecisionInput = {
  decisionCanonical?: DecisionOutcomeCanonical | null
  isRemediable?: boolean
  /**
   * Whether the BACKEND declared this resource type read-only preview-capable, taken only from an explicit
   * structured `capabilities[].preview_supported === true` entry (see `lib/lp-normalize.ts`). Absent when the
   * response carried no well-shaped capability for the row's type, which keeps the prior behaviour.
   *
   * This is NOT apply authority. `isRemediable` answers "may an APPLY be authorized"; this answers "may a
   * read-only PREVIEW be offered". The backend treats them as separate facts: `unified/lp/capabilities.py`
   * sets `remediable = False` under a not-ready generation or UNKNOWN/MISSING coverage, and in the same pass
   * sets `decision_canonical = None` with the reason "Preview can explain this risk, but no unused candidate
   * is authorized until ...". Collapsing the two made every such row render "Review" with no Preview control
   * while the backend said Preview could explain it.
   */
  isPreviewCapable?: boolean
  category?: 'removable' | 'coverage' | 'audit'
  countsTowardSummary?: boolean
}

const LABELS: Record<ResourceRiskDecision, string> = {
  AUTO_EXECUTE: 'Safe to apply',
  CANARY_FIRST: 'Canary first',
  REQUIRE_APPROVAL: 'Approval required',
  MANUAL_REVIEW: 'Manual review',
  BLOCK: 'Blocked',
  EXCLUDE: 'Excluded',
  PENDING: 'Safety review pending',
}

export function resourceRiskDecision(
  row: ResourceRiskDecisionInput,
): ResourceRiskDecision {
  // A canonical decision always wins, unchanged.
  if (row.decisionCanonical) return row.decisionCanonical
  // A coverage failure is still BLOCK, unchanged — missing evidence is never previewable.
  if (row.category === 'coverage') return 'BLOCK'
  // Not remediable still means manual Review, UNLESS the backend explicitly declared the type read-only
  // preview-capable. `isPreviewCapable` must be strictly true; absent/false/unknown keeps the prior fallback.
  if (row.isRemediable === false && row.isPreviewCapable !== true) return 'MANUAL_REVIEW'
  return 'PENDING'
}

export function resourceRiskDecisionLabel(row: ResourceRiskDecisionInput): string {
  return LABELS[resourceRiskDecision(row)]
}

export function belongsInOpenRiskQueue(row: ResourceRiskDecisionInput): boolean {
  // Coverage failures remain visible even though they do not count as measured
  // risk. A measured low/no-op row may stay out of the default queue.
  return row.category === 'coverage' || row.countsTowardSummary !== false
}
