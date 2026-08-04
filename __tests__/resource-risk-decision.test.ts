import { describe, expect, it } from 'vitest'

import {
  belongsInOpenRiskQueue,
  resourceRiskDecision,
  resourceRiskDecisionLabel,
} from '@/lib/resource-risk-decision'
import { normalizeGapResource, normalizeLPResponse } from '@/lib/lp-normalize'

describe('Resource Risk decision presentation', () => {
  it('uses the canonical backend decision when present', () => {
    const row = { decisionCanonical: 'CANARY_FIRST' as const, isRemediable: true }
    expect(resourceRiskDecision(row)).toBe('CANARY_FIRST')
    expect(resourceRiskDecisionLabel(row)).toBe('Canary first')
  })

  it('fails closed for coverage rows and unsupported actions', () => {
    expect(resourceRiskDecision({ category: 'coverage', isRemediable: true })).toBe('BLOCK')
    expect(resourceRiskDecision({ category: 'removable', isRemediable: false })).toBe('MANUAL_REVIEW')
  })

  it('does not invent an execution tier before simulation', () => {
    expect(resourceRiskDecision({ category: 'removable', isRemediable: true })).toBe('PENDING')
  })

  it('keeps evidence gaps in the open queue without inflating measured risk', () => {
    expect(belongsInOpenRiskQueue({ category: 'coverage', countsTowardSummary: false })).toBe(true)
    expect(belongsInOpenRiskQueue({ category: 'audit', countsTowardSummary: false })).toBe(false)
  })
})

describe('Resource Risk wire normalization', () => {
  it('preserves finding identity, decision, reason, and evidence coverage', () => {
    const row = normalizeGapResource({
      id: 'db-1',
      resourceType: 'RDSInstance',
      resourceName: 'db-1',
      findingId: 'finding-1',
      decision_canonical: 'MANUAL_REVIEW',
      decisionReason: 'No safe automated plan.',
      coverageState: 'COMPLETE',
    })
    expect(row.decisionCanonical).toBe('MANUAL_REVIEW')
    expect(row.findingId).toBe('finding-1')
    expect(row.decisionReason).toBe('No safe automated plan.')
    expect(row.coverageState).toBe('COMPLETE')
  })

  it('preserves capabilities and decision summary counts', () => {
    const response = normalizeLPResponse({
      resources: [],
      summary: {
        openRiskCount: 4,
        evidenceBlockedCount: 2,
        manualReviewCount: 1,
        safetyReviewPendingCount: 1,
      },
      capabilities: [
        {
          resource_type: 'RDSInstance',
          display_name: 'RDS Instances',
          family: 'Data',
          analyzers: ['rds_instance'],
          required_evidence: ['RDS configuration'],
          preview_supported: false,
          apply_supported: false,
          rollback_supported: false,
        },
      ],
    })
    expect(response.summary.evidenceBlockedCount).toBe(2)
    expect(response.capabilities[0].resource_type).toBe('RDSInstance')
  })
})
