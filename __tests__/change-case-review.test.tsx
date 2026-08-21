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

  it('renders Neptune dependency parity, the durable checkpoint, and supervised rollout evidence', () => {
    const current = artifact()
    current.schema_version = 'change-case/v3'
    current.workflow = {
      status: 'ROLLED_BACK',
      version: 12,
      requested_by: 'requester@example.com',
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:15:00Z',
      approvals: [],
      events: [],
      latest_run: {
        run_id: 'run-supervised',
        status: 'ROLLED_BACK',
        started_at: '2026-08-21T00:05:00Z',
        completed_at: '2026-08-21T00:10:00Z',
        executed_by: 'operator@example.com',
        events: [],
        checkpoint: {
          checkpoint_id: 'checkpoint-neptune-1',
          dependency_hash: 'dependency-hash-1',
          source_sg: { sg_id: 'sg-source' },
          clone: { sg_id: 'sg-clone' },
          dependency_snapshot: {
            live_eni_ids: ['eni-canary', 'eni-expanded'],
            neptune_eni_ids: ['eni-canary', 'eni-expanded'],
            graph_parity: true,
            all_consumers_supported: true,
            target_health_complete: true,
          },
        },
        result: {
          success: true,
          canary_eni_id: 'eni-canary',
          expanded_eni_ids: ['eni-expanded'],
          rollback_performed: true,
          rollback_succeeded: true,
        },
      },
    }

    render(<ChangeCaseReview changeCase={current} executing={false} onClose={vi.fn()} onProceed={vi.fn()} />)

    expect(screen.getByTestId('supervised-execution-evidence')).toHaveTextContent('Neptune = live AWS')
    expect(screen.getByTestId('supervised-execution-evidence')).toHaveTextContent('checkpoint-neptune-1')
    expect(screen.getByTestId('supervised-execution-evidence')).toHaveTextContent('sg-source → sg-clone')
    expect(screen.getByTestId('supervised-execution-evidence')).toHaveTextContent('performed and verified')
    expect(screen.getByText('Executive outcome')).toBeInTheDocument()
    expect(screen.getByText('Change record')).toBeInTheDocument()
    expect(screen.getByText('Engineering evidence')).toBeInTheDocument()
  })

  it('renders an S3 statement-removal Change Case without SG-specific claims', () => {
    const current = artifact()
    current.schema_version = 'change-case/v4'
    current.scope = {
      system_name: 'payments',
      resource_id: 'customer-data',
      resource_name: 'customer-data',
      resource_type: 'S3Bucket',
      sg_id: null,
    }
    current.proposed_change = {
      kind: 'S3_POLICY_STATEMENT_REMOVAL',
      before: [{ rule_id: 'UnusedWriter', action: 'REMOVE', protocol: 'S3 POLICY', port: 's3:PutObject', source: 'arn:aws:iam::123:role/old', purpose: 'Bucket-policy statement UnusedWriter' }],
      after: [],
      untouched: ['Unselected policy statements', 'bucket objects'],
      claim: 'Removes only the reviewed bucket-policy statements.',
      cves_fixed: 0,
      findings_attributable_to_removed_paths: 'UNKNOWN',
    }
    current.evidence = {
      observed_access_records: 0,
      observed_traffic_records: 0,
      rule_unique_source_count: 0,
      rule_unique_source_count_display: '0',
      requested_days: 90,
      effective_days: 90,
      complete: true,
      gaps: [],
    }
    current.workflow = {
      status: 'SUCCEEDED',
      version: 4,
      requested_by: 'requester@example.com',
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:15:00Z',
      approvals: [],
      events: [],
      latest_run: {
        run_id: 'run-s3',
        status: 'SUCCEEDED',
        started_at: '2026-08-21T00:05:00Z',
        executed_by: 'operator@example.com',
        snapshot_id: 's3-policy-snapshot-1',
        events: [],
        result: { success: true, post_change_verification: { verified: true } },
      },
    }

    render(<ChangeCaseReview changeCase={current} executing={false} onClose={vi.fn()} />)

    expect(screen.getByText('Current reviewed policy statement')).toBeInTheDocument()
    expect(screen.getByText('Observed S3 access records')).toBeInTheDocument()
    expect(screen.getByText('applied and checked')).toBeInTheDocument()
    expect(screen.queryByText(/Exact SG handoff/)).not.toBeInTheDocument()
  })

  it('renders an IAM permission Change Case as exact permissions and policy hashes', () => {
    const current = artifact()
    current.schema_version = 'change-case/v4'
    current.scope = {
      system_name: 'payments',
      resource_id: 'arn:aws:iam::123456789012:role/app-role',
      resource_name: 'app-role',
      resource_type: 'IAMRole',
    }
    current.proposed_change = {
      kind: 'IAM_PERMISSION_REMOVAL',
      before: [{ permission: 's3:DeleteObject', source_policies: ['app-inline'] }],
      after: [{ permission: 's3:DeleteObject', effective_grant: 'REMOVED' }],
      untouched: ['trust policy', 'managed policies', 'unselected IAM actions'],
      claim: 'Remove one exact unused IAM action.',
    }
    current.evidence = {
      observed_access_records: 0,
      rule_unique_source_count_display: '2',
      requested_days: 90,
      effective_days: 45,
      complete: true,
      gaps: [],
    }
    current.workflow = {
      status: 'SUCCEEDED',
      version: 5,
      requested_by: 'requester@example.com',
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:15:00Z',
      approvals: [],
      events: [],
      latest_run: {
        run_id: 'run-iam',
        status: 'SUCCEEDED',
        started_at: '2026-08-21T00:05:00Z',
        executed_by: 'operator@example.com',
        snapshot_id: 'iam-snapshot-1',
        events: [],
        checkpoint: {
          checkpoint_id: 'iam-snapshot-1',
          preimage_hash: 'preimage-123',
          expected_applied_hash: 'postimage-456',
        },
        result: { success: true, summary: { permissions_removed: 1 } },
      },
    }

    render(<ChangeCaseReview changeCase={current} executing={false} onClose={vi.fn()} />)

    expect(screen.getByText('Current exact permission grant')).toBeInTheDocument()
    expect(screen.getAllByText('s3:DeleteObject')).toHaveLength(2)
    expect(screen.getByText('Granted by: app-inline')).toBeInTheDocument()
    expect(screen.getByText('Effective grant: REMOVED')).toBeInTheDocument()
    expect(screen.getByText('Approved policy preimage:')).toBeInTheDocument()
    expect(screen.getByText('preimage-123')).toBeInTheDocument()
    expect(screen.getByText('postimage-456')).toBeInTheDocument()
    expect(screen.getByText('applied and checked')).toBeInTheDocument()
  })
})
