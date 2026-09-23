import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IAMSimulateFixModal } from '@/components/IAMSimulateFixModal'
import type { SimulateFixResponse } from '@/lib/types'

afterEach(cleanup)

function scopedPreview(dataConfidence: 'UNKNOWN' | 'PARTIAL' | 'OBSERVED'): SimulateFixResponse {
  const measured = dataConfidence === 'OBSERVED'
  return {
    resource: {
      id: 'web-role', type: 'IAMRole', system: 'testbed-webshop', severity: 'INFO',
      shared: false, shared_confidence: 'unknown', consumers: [],
    },
    problem: {
      summary: measured ? 'Observed zero unused permissions.' : 'Usage was not measured for this role.',
      gap_percent: 0, unused_count: 0, used_count: measured ? 5 : 2,
      top_risk_reasons: ['preview_does_not_authorize_removal'],
    },
    evidence: {
      observation_window_days: 12, evidence_sources: [],
      confidence: measured ? 'low' : 'unknown', completeness: measured ? 'partial' : 'unknown',
      caveats: [], visibility_signals: { data_confidence: dataConfidence, lp_score: null },
    },
    simulation: {
      action_type: 'none', summary: 'No removal is authorized by this preview.',
      kept_permissions: measured ? 5 : 2, removed_permissions: 0,
      kept_examples: [], removed_examples: [],
    },
    projected_effect: {
      blast_radius_score_before: null, blast_radius_score_after: null,
      blast_radius_score_delta: null, family_scores_before: null, family_scores_after: null,
      resource_risk_contribution_before: null, resource_risk_contribution_after: null,
      projection_available: false, current_state_available: false,
    },
    safety: {
      decision: 'blocked', decision_canonical: 'BLOCK', rollback_available: false,
      snapshot_required: true, preflight_required: true,
      unsafe_reasons: ['preview_does_not_authorize_removal'],
    },
    decision_persistence: {
      persisted: false, decision_key: '', evaluated_at: '', expires_at: '',
      warning: 'Decision-scoped preview does not persist a removal decision.',
    },
  }
}

function metric(label: string): HTMLElement {
  const heading = screen.getByText(label)
  if (!heading.parentElement) throw new Error(`Metric ${label} has no container`)
  return heading.parentElement
}

describe('IAM scoped Preview truthfulness', () => {
  it.each(['UNKNOWN', 'PARTIAL'] as const)(
    'does not show unmeasured %s usage as clean zero or invent a plan',
    (confidence) => {
      render(<IAMSimulateFixModal isOpen onClose={() => {}} result={scopedPreview(confidence)} />)

      expect(within(metric('Gap %')).getByText('Unknown')).toBeInTheDocument()
      expect(within(metric('Unused Permissions')).getByText('Unknown')).toBeInTheDocument()
      expect(within(metric('Used Permissions')).getByText('Unknown')).toBeInTheDocument()
      expect(screen.queryByText('0%')).not.toBeInTheDocument()
      expect(screen.getByText('No removal plan was issued.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Blocked - Manual Review Required/ })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Evidence' }))
      expect(screen.getByText('No visibility signals reported')).toBeInTheDocument()
      expect(screen.queryByText(/✓ data confidence/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Impact' }))
      expect(screen.getByText('Current score unavailable')).toBeInTheDocument()
      expect(screen.getByText('Current contribution unavailable')).toBeInTheDocument()
      expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
    },
  )

  it('keeps an actually observed zero as zero', () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={scopedPreview('OBSERVED')} />)

    expect(within(metric('Gap %')).getByText('0%')).toBeInTheDocument()
    expect(within(metric('Unused Permissions')).getByText('0')).toBeInTheDocument()
    expect(within(metric('Used Permissions')).getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
  })
})
