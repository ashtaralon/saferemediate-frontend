import { describe, expect, it } from 'vitest'

import {
  automationReadiness,
  previewEvidenceNeeds,
  previewPermissionCounts,
  safetyHoldReasons,
  simulationPlanCounts,
} from '@/lib/resource-risk-preview-summary'
import type { SimulateFixSafety } from '@/lib/types'

const baseSafety: SimulateFixSafety = {
  decision: 'blocked',
  decision_canonical: 'BLOCK',
  rollback_available: true,
  snapshot_required: true,
  preflight_required: true,
  unsafe_reasons: [],
}

describe('Resource Risk Preview plain-language summary', () => {
  it('uses the state-bound Preview counts instead of stale gap-analysis counts', () => {
    expect(previewPermissionCounts({
      summary: '22 unused permissions',
      gap_percent: 82,
      unused_count: 22,
      used_count: 5,
      top_risk_reasons: [],
    }, {
      usedCount: 0,
      unusedCount: 27,
      totalCount: 27,
    })).toEqual({
      usedCount: 5,
      unusedCount: 22,
      totalCount: 27,
      unusedPercent: 82,
    })
  })

  it('falls back to gap-analysis counts when Preview has no problem snapshot', () => {
    expect(previewPermissionCounts(null, {
      usedCount: 4,
      unusedCount: 6,
      totalCount: 10,
    })).toEqual({
      usedCount: 4,
      unusedCount: 6,
      totalCount: 10,
      unusedPercent: 60,
    })
  })

  it('separates the proposed removal plan from observed permission usage', () => {
    expect(simulationPlanCounts({
      summary: '22 unused permissions',
      gap_percent: 82,
      unused_count: 22,
      used_count: 5,
      top_risk_reasons: [],
    }, 13, {
      usedCount: 4,
      unusedCount: 23,
      totalCount: 27,
    })).toEqual({
      removeCount: 13,
      remainCount: 14,
      observedUsedCount: 5,
      totalCount: 27,
    })
  })

  it('explains that automation readiness is not confidence in the finding', () => {
    expect(automationReadiness('BLOCK')).toEqual(expect.objectContaining({
      label: 'Not ready',
      headline: 'Cyntro will not change this role yet',
      detail: expect.stringContaining('over-permission finding is separate'),
    }))
  })

  it('names exact missing evidence planes and suppresses the generic umbrella', () => {
    const needs = previewEvidenceNeeds({
      ...baseSafety,
      missing_evidence_sources: ['TELEMETRY_PLANES'],
      telemetry_planes_missing: ['access_advisor', 'behavioral_pu'],
    })

    expect(needs.map((need) => need.label)).toEqual([
      'IAM Access Advisor usage',
      'Behavioral permission-usage evidence',
    ])
  })

  it('turns sharing and shadow-mode reason codes into actions instead of enums', () => {
    const needs = previewEvidenceNeeds({
      ...baseSafety,
      consumer_count: 3,
      decision_reason_codes: [
        'CUSTOMER_IN_SHADOW_BOOTSTRAP',
        'SHARED_ROLE_WITHOUT_SPLIT_PLAN',
      ],
    })

    expect(needs.map((need) => need.label)).toEqual([
      'This role is shared by 3 systems',
      'This environment is preview-only',
    ])
    expect(needs[0].action).toContain('split the role')
  })

  it('preserves every distinct backend safety hold for the operator', () => {
    expect(safetyHoldReasons({
      unsafe_reasons: [
        'Incomplete evidence — not all telemetry planes active',
        'Role is managed by terraform; remediate the infrastructure-as-code source to avoid configuration drift.',
        'Incomplete evidence — not all telemetry planes active',
        '  ',
      ],
    })).toEqual([
      'Incomplete evidence — not all telemetry planes active',
      'Role is managed by terraform; remediate the infrastructure-as-code source to avoid configuration drift.',
    ])
  })
})
