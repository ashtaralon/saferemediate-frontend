import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChangeQueueView } from '@/components/change-queue-view'
import { IaCChangeDossier, type IaCIntentDocument } from '@/components/iac-change-dossier'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/account-scope-context', () => ({
  useAccountScope: () => ({
    customerId: 'tenant-a',
    accountId: '123456789012',
    region: 'eu-west-1',
    options: {
      customer_id: 'tenant-a',
      accounts: [{ account_id: '123456789012', display_name: 'Production', regions: ['eu-west-1'], group_ids: [], status: 'active' }],
      groups: [],
    },
  }),
}))
vi.mock('@/components/change-impact-graph', () => ({
  ChangeImpactGraph: ({ impacts }: { impacts: unknown[] }) => <div>Impact graph · {impacts.length}</div>,
}))

/**
 * Component-level proof that an unproven dependency family reaches the screen
 * as words, not as a zero. The backend's own version of this bug rendered
 * three periodic dependencies where none had been analysed; the UI equivalent
 * is rendering an empty compatibility array as "none found".
 */
describe('baseline contract rendering', () => {
  it('shows NOT_COMPUTED families explicitly in the dossier', () => {
    const document = baselineDocument()
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)

    const periodic = screen.getByTestId('periodic-dependencies')
    expect(periodic).toHaveTextContent('periodic dependencies: Not computed')
    expect(periodic).not.toHaveTextContent(/\b0\b/)
    expect(periodic).not.toHaveTextContent(/none/i)

    expect(screen.getByTestId('data-dependencies')).toHaveTextContent('data dependencies: Not computed')
  })

  it('labels the adjacency figure as incidences and reports distinct resources apart', () => {
    const document = baselineDocument()
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)

    // 3 security groups sharing 1 VPC: 3 incidences, 1 distinct resource.
    expect(screen.getByTestId('adjacency')).toHaveTextContent('3 adjacency incidences')
    expect(screen.getByTestId('adjacency')).not.toHaveTextContent(/distinct/)
    expect(screen.getByTestId('distinct-affected')).toHaveTextContent('1 distinct affected resources')
  })

  it('shows a finding whose affected resources were not computed', () => {
    const document = baselineDocument()
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)
    expect(screen.getAllByTestId('affected-resources-state')[0]).toHaveTextContent('Not computed')
  })

  it('renders Still required as Unknown when the backend omits the count', () => {
    const document = baselineDocument()
    document.risk_dossier.readiness = {
      state: 'NOT_READY', failed_gate_count: 0, meaning: 'This analysis is advisory.',
    }
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('labels the queue row by semantics rather than asserting adjacent resources', async () => {
    // ChangeQueueView fetches its own data, so drive it the way the existing
    // queue tests do rather than inventing props it does not take.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('change-cases')) return new Response(JSON.stringify({ cases: [] }), { status: 200 })
      if (url.includes('capabilities')) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      return new Response(JSON.stringify({ intents: [queueRow()] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ChangeQueueView />)

    await waitFor(() => expect(screen.getByText(/3 adjacency incidences/)).toBeInTheDocument())
    expect(screen.queryByText(/3 adjacent resources/)).not.toBeInTheDocument()
    expect(screen.queryByText(/3 graph-adjacent resources/)).not.toBeInTheDocument()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function queueRow() {
  return {
    intent_id: 'ci-baseline-1',
    analyzed_at: '2026-08-25T00:00:00Z',
    status: 'ANALYZED',
    intent: { change: { resource_type: 'TerraformBaselinePlan', action: 'ASSESS_TERRAFORM_BASELINE', reason: 'Adopt existing estate.' } },
    analysis_coverage: { performed_level: 'TERRAFORM_BASELINE_ASSURANCE' },
    risk_dossier: {
      analysis_kind: 'TERRAFORM_BASELINE_ASSURANCE',
      risk_band: 'NOT_COMPUTED',
      analysis_conclusion: { state: 'NEEDS_EVIDENCE', headline: 'Evidence still required.' },
      confidence: { level: 'MEDIUM' },
      finding_counts: { total: 0, by_severity: {} },
      source_artifact: { kind: 'TERRAFORM_PLAN_JSON' },
      semantic_diff_summary: { total_changes: 3, action_counts: { import: 3 } },
      blast_radius: {
        dependency_incidences: 3,
        direct_dependency_count: 3,
        direct_dependency_count_semantics: 'ADJACENCY_INCIDENCES_MAY_DOUBLE_COUNT_SHARED_NEIGHBOURS',
        systems: ['payments'],
      },
      evidence_gap_count: 6,
    },
    decision: { state: 'NEEDS_EVIDENCE' },
    execution: { available_from_this_intent: false, state: 'ANALYSIS_ONLY' },
  }
}

function baselineDocument(): IaCIntentDocument {
  return {
    intent_id: 'ci-baseline-1',
    analyzed_at: '2026-08-25T00:00:00Z',
    document_hash: 'document-hash',
    source_lineage: { repository: 'org/platform', workspace: 'payments-prod' },
    intent: {
      requested_by: 'ops@example.com',
      scope: { customer_id: 'tenant-a', account_id: '123456789012', region: 'eu-west-1', system_name: 'payments' },
      change: { resource_type: 'TerraformBaselinePlan', resource_id: 'fingerprint', action: 'ASSESS_TERRAFORM_BASELINE', reason: 'Adopt the existing estate into Terraform.', source: 'TERRAFORM_PLAN_JSON' },
    },
    analysis_coverage: { performed_level: 'TERRAFORM_BASELINE_ASSURANCE' },
    decision: { state: 'NEEDS_EVIDENCE', reason: 'Evidence still required', approval_binds_to: 'fingerprint' },
    execution: { state: 'ANALYSIS_ONLY', reason: 'Analysis only.', available_from_this_intent: false },
    risk_dossier: {
      analysis_kind: 'TERRAFORM_BASELINE_ASSURANCE',
      baseline_phase: 'IMPORT_AWARE_CONSERVATION_PREVIEW',
      readiness: { state: 'NOT_READY', failed_gate_count: 0, required_gate_count: 6, required_gate_definition: 'UNKNOWN + NOT_COMPUTED blocking gates; excludes FAILED', meaning: 'This analysis is advisory.' },
      analysis_conclusion: { state: 'NEEDS_EVIDENCE', headline: 'Evidence still required.', safe_to_apply: null, safe_to_apply_reason: 'The analysis lane cannot approve or execute Terraform import.' },
      risk_band: 'NOT_COMPUTED',
      risk_indicator: null,
      risk_indicator_explanation: 'This lane emits deterministic conservation verdicts, not a risk score.',
      confidence: { level: 'MEDIUM', meaning: 'Import semantics are plan-proven.', gaps: [], proven_scope: 'Terraform import metadata', graph_scope: 'COMPLETED' },
      source_artifact: { kind: 'TERRAFORM_PLAN_JSON', fingerprint: 'fingerprint', account_id: '123456789012', region: 'eu-west-1', metadata: {}, raw_artifact_persisted: false, retained_form: 'REDACTED_IMPORT_SEMANTICS_ONLY' },
      semantic_diff: {
        summary: { total_changes: 3, action_counts: { import: 3, create: 0, update: 0, delete: 0, replace: 0 }, family_counts: { network_security: 3 } },
        resource_changes: [{ address: 'aws_security_group.web', resource_type: 'aws_security_group', family: 'network_security', actions: [], replace_paths: [], changed_paths: [], is_import: true, import_id: 'sg-0' }],
      },
      findings: [{
        finding_id: 'finding-1', code: 'BASELINE_ADOPTION_IDENTITY_UNPROVEN', category: 'BASELINE_CONSERVATION',
        severity: 'HIGH', disposition: 'BLOCK', confidence: 'HIGH', title: 'Adoption identity is not proven',
        summary: 'aws_security_group.web is absent from the canonical projection.',
        addresses: ['aws_security_group.web'], failure_mode: 'Terraform could bind to a different object.',
        recommendation: 'Refresh authoritative inventory.',
        affected_resources: [],
        affected_resources_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Downstream consumers are not computed in phase one.' },
        evidence: [{ kind: 'CONFIDENCE_GAP', statement: 'Adoption identity resolution' }],
      }],
      finding_counts: { total: 1, by_severity: { HIGH: 1 }, by_category: { BASELINE_CONSERVATION: 1 }, by_disposition: { BLOCK: 1 } },
      blast_radius: {
        systems: ['payments'], changed_resource_count: 3, resolved_changed_resource_count: 3, graph_relationship_count: 3,
        dependency_incidences: 3,
        direct_dependency_count: 3,
        direct_dependency_count_semantics: 'ADJACENCY_INCIDENCES_MAY_DOUBLE_COUNT_SHARED_NEIGHBOURS',
        distinct_affected_resources: { state: 'PASSED', count: 1, detail: 'Distinct graph neighbours.' },
        periodic_dependencies: [],
        data_dependencies: [],
        periodic_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
        data_dependencies_assessment: { state: 'NOT_COMPUTED', items: [], detail: 'Not analysed in phase one.' },
      },
      impact_graph: {
        status: 'COMPLETED', targets_requested: 3, targets_analyzed: 3, targets_resolved: 3, targets_failed: 0,
        target_limit_reached: false, direct_relationship_count: 3, systems: ['payments'],
        evidence_coverage: {
          status: 'COMPLETED', source_count: 1, enabled_source_count: 1,
          interpretation: 'Coverage does not prove absence.',
          sources: [{ source_id: 'flow-1', source_type: 'VPC_FLOW', region: 'eu-west-1', enabled: true, coverage_days: 90, last_run_status: 'SUCCESS' }],
        },
        impacts: [], limitations: [],
      },
      evidence_model: { classes: [], counts: {}, coverage: {}, negative_evidence_rule: 'Absence is not proof.' },
      evidence_gap_count: 6,
      approval_guardrails: [{ gate: 'IMPORT_IDENTITY_PROVEN', state: 'UNKNOWN', detail: 'Adoption identity is not proven for every import target.' }],
      rollback_suggestions: [],
      limits: [],
    },
  } as unknown as IaCIntentDocument
}
