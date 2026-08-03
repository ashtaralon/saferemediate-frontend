import type { DecisionOutcomeCanonical } from '@/lib/types'

export type ResourceRiskDecision = DecisionOutcomeCanonical | 'PENDING'

export type ResourceRiskDecisionInput = {
  decisionCanonical?: DecisionOutcomeCanonical | null
  isRemediable?: boolean
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
  if (row.decisionCanonical) return row.decisionCanonical
  if (row.category === 'coverage') return 'BLOCK'
  if (row.isRemediable === false) return 'MANUAL_REVIEW'
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
