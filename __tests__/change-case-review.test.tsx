import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChangeCaseReview, type ChangeCaseArtifact } from '@/components/change-case-review'


function artifact(): ChangeCaseArtifact {
  return {
    schema_version: 'change-case/v2', case_id: 'cc-download', generated_at: '2026-08-12T00:00:00Z',
    scope: { system_name: 'prod', resource_id: 'i-1', resource_name: 'app', resource_type: 'EC2', sg_id: 'sg-1' },
    decision: { state: 'APPROVAL_REQUIRED', domain_decision: 'PORT_NARROWABLE', readiness: 'APPROVAL_REQUIRED', override_eligible: false, override_does_not_change_evidence_truth: true },
    authoritative_plan: { scheme: 'SIGNED_OPERATIONAL_PLAN_V1', plan_hash: 'abcdef012345', plan_token: 'signed', expires_at_epoch: 1800000000, case_id_is_mutation_authority: false },
    execution_request: { rules: [], create_snapshot: true, dry_run: false, force: false, mode: 'auto' },
    proposed_change: { kind: 'NARROW_PORTS', before: [], after: [], untouched: ['IAM permissions'], claim: 'Reduces reachability', cves_fixed: 0, findings_attributable_to_removed_paths: 'UNKNOWN' },
    evidence: { observed_traffic_records: 0, observed_events_are_verified_application_use: false, rule_unique_source_count: null, rule_unique_source_count_kind: 'UNKNOWN', rule_unique_source_count_display: 'Unknown', requested_days: 90, effective_days: 90, complete: true, gaps: [] },
    blast_radius: { direct: ['i-1'], transitive: 'UNKNOWN', shared_substrate: [], shared_substrate_complete: false },
    simulation: { performed: true, rules_to_change: 1, warnings: [], potential_impact_count: 0 },
    rollout: { strategy: 'EXISTING_SG_REMEDIATION_PIPELINE', steps: ['Snapshot'], stop_conditions: ['Drift'] },
    rollback: { available: true, summary: 'Restore snapshot', preserves_original_aws_rule_id: false },
    iac_reconciliation: { status: 'UNKNOWN', instruction: 'Reconcile IaC' },
    residual_risk: ['Software remains vulnerable'],
    narrative: { executive_summary: 'Reduce reachability', operator_summary: 'No admitted records', risk_summary: 'Review risk', decision_request: 'Approve or reject' },
    approval_report: { format: 'application/pdf', encoding: 'base64', filename: 'cc-download.pdf', content: 'JVBERi0xLjQKJSVFT0YK' },
  }
}


describe('Change Case approval report', () => {
  it('downloads the frozen PDF bytes with the case filename', () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:change-case')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    try {
      render(<ChangeCaseReview changeCase={artifact()} executing={false} onClose={vi.fn()} onProceed={vi.fn()} />)
      fireEvent.click(screen.getByText('Download approval PDF'))

      expect(createObjectURL).toHaveBeenCalledOnce()
      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/pdf')
      expect(anchorClick).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:change-case')
    } finally {
      anchorClick.mockRestore()
      if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor)
      else delete (URL as unknown as Record<string, unknown>).createObjectURL
      if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
      else delete (URL as unknown as Record<string, unknown>).revokeObjectURL
    }
  })
})
