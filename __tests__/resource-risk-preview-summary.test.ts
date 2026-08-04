import { describe, expect, it } from 'vitest'

import {
  automationReadiness,
  previewEvidenceNeeds,
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
      'A safe plan for all 3 dependent systems',
      'Completed automation onboarding',
    ])
    expect(needs[0].action).toContain('split the shared role')
  })
})
