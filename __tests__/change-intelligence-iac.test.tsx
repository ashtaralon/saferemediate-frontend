import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AnalyzeChangePage from '@/app/change-queue/new/page'
import { IaCChangeDossier, type IaCIntentDocument } from '@/components/iac-change-dossier'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

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
  ChangeImpactGraph: ({ impacts }: { impacts: unknown[] }) => <div>Impact graph · {impacts.length} target</div>,
}))

describe('IaC Change Intelligence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
  })

  it('makes IaC the primary intake and submits the exact account-scoped plan', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/capabilities')) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      if (url.includes('/analyze-iac')) return new Response(JSON.stringify({ intent_id: 'ci-iac-1' }), { status: 200 })
      throw new Error(`Unexpected URL ${url} ${init?.method || 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AnalyzeChangePage />)

    expect(screen.getByRole('heading', { name: 'Will this change break anything?' })).toBeInTheDocument()
    expect(screen.getByText(/IaC-proven facts, configured topology, observed runtime behavior/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Check for breaking changes' })
    expect(submit).toBeDisabled()

    const file = new File(['{}'], 'tfplan.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify({
      format_version: '1.2',
      terraform_version: '1.9.8',
      resource_changes: [{
        address: 'aws_security_group.app',
        mode: 'managed',
        type: 'aws_security_group',
        change: { actions: ['update'], before: { id: 'sg-1' }, after: { id: 'sg-1' } },
      }],
    }) })
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('tfplan.json')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Why is this change needed?'), { target: { value: 'Roll out a security-group cleanup with owner review.' } })
    fireEvent.click(submit)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/change-queue/intents/ci-iac-1?customer_id=tenant-a'))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/analyze-iac'))
    expect(call).toBeDefined()
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.scope).toMatchObject({ customer_id: 'tenant-a', account_id: '123456789012', region: 'eu-west-1' })
    expect(body.artifact.kind).toBe('TERRAFORM_PLAN_JSON')
    expect(body.artifact.document.resource_changes[0].address).toBe('aws_security_group.app')
    expect(body.analysis_mode).toBe('IAC_CHANGE_INTELLIGENCE')
  })

  it('submits an import-aware baseline conservation check as a distinct analysis mode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/capabilities')) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      if (url.includes('/analyze-iac')) return new Response(JSON.stringify({ intent_id: 'ci-baseline-1' }), { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AnalyzeChangePage />)

    fireEvent.click(screen.getByRole('button', { name: /Create Terraform baseline/ }))
    expect(screen.getByRole('heading', { name: 'Can this import plan conserve production?' })).toBeInTheDocument()
    expect(screen.getByText(/does not discover resources, generate configuration, approve a manifest/)).toBeInTheDocument()

    const file = jsonFile('baseline-plan.json', {
      format_version: '1.2',
      terraform_version: '1.9.8',
      resource_changes: [{
        address: 'aws_security_group.web',
        mode: 'managed',
        type: 'aws_security_group',
        change: {
          actions: ['no-op'],
          before: null,
          after: { id: 'sg-1', name: 'web' },
          importing: { id: 'sg-1' },
        },
      }],
    })
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('baseline-plan.json')).toBeInTheDocument()
    expect(screen.getByText('Imports')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Why is this baseline needed?'), { target: { value: 'Adopt current production resources without changing AWS.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check baseline conservation' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/change-queue/intents/ci-baseline-1?customer_id=tenant-a'))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/analyze-iac'))
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.analysis_mode).toBe('TERRAFORM_BASELINE_ASSURANCE')
    expect(body.artifact.kind).toBe('TERRAFORM_PLAN_JSON')
    expect(body.artifact.document.resource_changes[0].change.importing.id).toBe('sg-1')
  })

  it('renders conclusion, evidence classes, graph scope, gates, and rollback without an apply action', () => {
    const document = iacDocument()
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)

    expect(screen.getByRole('heading', { name: /Block this change/ })).toBeInTheDocument()
    expect(screen.getByText('KMS key is disabled')).toBeInTheDocument()
    expect(screen.getAllByText('Observed Runtime').length).toBeGreaterThan(0)
    expect(screen.getByText('Impact graph · 1 target')).toBeInTheDocument()
    expect(screen.getByText('Live Drift Preflight')).toBeInTheDocument()
    expect(screen.getByText('Prove restore, not only backup')).toBeInTheDocument()
    expect(screen.getByText('Analysis Only')).toBeInTheDocument()
    expect(screen.getByText('VPC Flow Logs')).toBeInTheDocument()
    expect(screen.getByText(/90 coverage days/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
  })

  it('renders baseline readiness, import identity, and remaining gates without execution', () => {
    const document = iacDocument()
    document.intent.change = { ...document.intent.change, resource_type: 'TerraformBaselinePlan', action: 'ASSESS_TERRAFORM_BASELINE' }
    document.risk_dossier.analysis_kind = 'TERRAFORM_BASELINE_ASSURANCE'
    document.risk_dossier.analysis_conclusion = {
      state: 'NEEDS_EVIDENCE',
      headline: 'Import-only structure passed; manifest, ownership, and execution evidence are still required.',
      safe_to_apply: null,
      safe_to_apply_reason: 'The analysis lane cannot approve or execute Terraform import.',
    }
    document.risk_dossier.readiness = { state: 'NOT_READY', failed_gate_count: 0, required_gate_count: 3, meaning: 'This analysis is advisory.' }
    document.risk_dossier.semantic_diff.summary.action_counts.import = 1
    document.risk_dossier.semantic_diff.resource_changes = [{
      address: 'aws_security_group.web',
      resource_type: 'aws_security_group',
      family: 'network_security',
      actions: [],
      replace_paths: [],
      changed_paths: [],
      is_import: true,
      import_id: 'sg-1',
    }]
    document.risk_dossier.approval_guardrails = [
      { gate: 'NO_CLOUD_MUTATIONS', state: 'PASSED', detail: 'No cloud mutations.' },
      { gate: 'APPROVED_BASELINE_MANIFEST', state: 'REQUIRED', detail: 'Manifest approval is required.' },
    ]
    render(<IaCChangeDossier document={document} customerId="tenant-a" />)

    expect(screen.getByText(/Baseline readiness · Not Ready/)).toBeInTheDocument()
    expect(screen.getByText('Terraform baseline import plan · frozen review')).toBeInTheDocument()
    expect(screen.getByText('sg-1')).toBeInTheDocument()
    expect(screen.getByText('No Cloud Mutations')).toBeInTheDocument()
    expect(screen.getByText('Approved Baseline Manifest')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply|execute|import now/i })).not.toBeInTheDocument()
  })

  it('submits an enriched CloudFormation change set with both template contexts', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/capabilities')) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      if (url.includes('/analyze-iac')) return new Response(JSON.stringify({ intent_id: 'ci-cfn-1' }), { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AnalyzeChangePage />)

    fireEvent.click(screen.getByRole('button', { name: /^CloudFormation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change set + templates' }))
    const inputs = Array.from(view.container.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
    const files = [
      jsonFile('change-set.json', { Changes: [{ ResourceChange: { Action: 'Modify', LogicalResourceId: 'Db', ResourceType: 'AWS::RDS::DBInstance', Replacement: 'True' } }] }),
      jsonFile('current.json', { Resources: { Db: { Type: 'AWS::RDS::DBInstance', Properties: { Engine: 'postgres' } } } }),
      jsonFile('proposed.json', { Resources: { Db: { Type: 'AWS::RDS::DBInstance', Properties: { Engine: 'mysql' } } } }),
    ]
    inputs.forEach((input, index) => fireEvent.change(input, { target: { files: [files[index]] } }))
    expect(await screen.findByText('change-set.json')).toBeInTheDocument()
    expect(await screen.findByText('current.json')).toBeInTheDocument()
    expect(await screen.findByText('proposed.json')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Why is this change needed?'), { target: { value: 'Upgrade the database through an evaluated change set.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check for breaking changes' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/change-queue/intents/ci-cfn-1?customer_id=tenant-a'))
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/analyze-iac'))
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.artifact.kind).toBe('CLOUDFORMATION_CHANGE_SET_JSON')
    expect(body.artifact.document.change_set.Changes).toHaveLength(1)
    expect(body.artifact.document.current_template.Resources.Db.Properties.Engine).toBe('postgres')
    expect(body.artifact.document.proposed_template.Resources.Db.Properties.Engine).toBe('mysql')
  })

  it('blocks a combined request above the synchronous proxy limit before transmission', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/capabilities')) return new Response(JSON.stringify({ capabilities: [] }), { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AnalyzeChangePage />)

    fireEvent.click(screen.getByRole('button', { name: /^CloudFormation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change set + templates' }))
    const inputs = Array.from(view.container.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
    const padding = 'x'.repeat(1_500_000)
    const files = [
      jsonFile('change-set.json', { Changes: [], padding }),
      jsonFile('current.json', { Resources: {}, padding }),
      jsonFile('proposed.json', { Resources: {}, padding }),
    ]
    inputs.forEach((input, index) => fireEvent.change(input, { target: { files: [files[index]] } }))
    expect(await screen.findByText('proposed.json')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Why is this change needed?'), { target: { value: 'Validate a large evaluated infrastructure change safely.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check for breaking changes' }))

    expect(await screen.findByText('The combined analysis request is larger than 4 MB. Split the change into separately reviewed plans.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/analyze-iac'))).toBe(false)
  })
})

function jsonFile(name: string, document: Record<string, unknown>): File {
  const file = new File(['{}'], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(document) })
  return file
}

function iacDocument(): IaCIntentDocument {
  return {
    intent_id: 'ci-iac-1',
    analyzed_at: '2026-08-24T00:00:00Z',
    document_hash: 'document-hash',
    source_lineage: { repository: 'org/platform', workspace: 'payments-prod', commit_sha: 'abc123' },
    intent: {
      requested_by: 'ops@example.com',
      scope: { customer_id: 'tenant-a', account_id: '123456789012', region: 'eu-west-1', system_name: 'payments' },
      change: { resource_type: 'IaCChangePlan', resource_id: 'fingerprint', action: 'APPLY_IAC_PLAN', reason: 'Rotate the key after migrating every consumer.', source: 'TERRAFORM_PLAN_JSON' },
    },
    analysis_coverage: { performed_level: 'IAC_SEMANTIC_GRAPH_ANALYSIS' },
    decision: { state: 'BLOCK', reason: 'Block this change', approval_binds_to: 'fingerprint' },
    execution: { state: 'ANALYSIS_ONLY', reason: 'Apply remains in the customer pipeline.', available_from_this_intent: false },
    risk_dossier: {
      analysis_kind: 'IAC_CHANGE_INTELLIGENCE',
      analysis_conclusion: { state: 'BLOCK', headline: 'Block this change: 1 deterministic safeguard failed.', safe_to_apply: null, safe_to_apply_reason: 'Advisory evidence, not deployment proof.' },
      risk_band: 'CRITICAL',
      risk_indicator: 91,
      risk_indicator_explanation: 'Triage only',
      confidence: { level: 'HIGH', meaning: 'Confidence describes the evidence behind the finding.', gaps: [], proven_scope: 'IaC', graph_scope: 'COMPLETED' },
      source_artifact: { kind: 'TERRAFORM_PLAN_JSON', fingerprint: 'fingerprint', account_id: '123456789012', region: 'eu-west-1', metadata: {}, raw_artifact_persisted: false, retained_form: 'REDACTED_SEMANTIC_SLICE_ONLY' },
      semantic_diff: {
        summary: { total_changes: 1, action_counts: { create: 0, update: 1, delete: 0, replace: 0 }, family_counts: { encryption: 1 } },
        resource_changes: [{ address: 'aws_kms_key.data', resource_type: 'aws_kms_key', family: 'encryption', actions: ['update'], replace_paths: [], changed_paths: ['is_enabled'], removed_references: [], added_references: [] }],
      },
      findings: [{
        finding_id: 'finding-1', code: 'KMS_KEY_DISABLED', category: 'ENCRYPTION', severity: 'CRITICAL', disposition: 'BLOCK', confidence: 'HIGH', title: 'KMS key is disabled', summary: 'The proposed configuration disables an active encryption key.', addresses: ['aws_kms_key.data'], failure_mode: 'Decrypt can fail.', recommendation: 'Migrate and test every consumer.', affected_resources: [], evidence: [{ kind: 'IAC_PROVEN', statement: 'Redacted semantic diff' }, { kind: 'OBSERVED_RUNTIME', statement: 'Observed decrypt use', plane: 'OBSERVED' }],
      }],
      finding_counts: { total: 1, by_severity: { CRITICAL: 1 }, by_category: { ENCRYPTION: 1 }, by_disposition: { BLOCK: 1 } },
      blast_radius: { systems: ['payments'], changed_resource_count: 1, resolved_changed_resource_count: 1, graph_relationship_count: 1, periodic_dependencies: [], data_dependencies: [] },
      impact_graph: { status: 'COMPLETED', targets_requested: 1, targets_analyzed: 1, targets_resolved: 1, targets_failed: 0, target_limit_reached: false, direct_relationship_count: 1, systems: ['payments'], evidence_coverage: { status: 'COMPLETED', source_count: 1, enabled_source_count: 1, interpretation: 'Coverage does not prove absence.', sources: [{ source_id: 'flow-1', source_type: 'VPC_FLOW', region: 'eu-west-1', enabled: true, coverage_days: 90, last_run_status: 'SUCCESS' }] }, impacts: [{ address: 'aws_kms_key.data', requested_ref: 'key-1', query_status: 'COMPLETED', resolved: true, ambiguous: false, direct_relationship_count: 1, direct_resource_count: 1, direct_detail_count: 1, direct_detail_complete: true, direct_edges: [], unexpected_edge_types: [] }], limitations: [] },
      evidence_model: { classes: [{ kind: 'IAC_PROVEN', meaning: 'Plan fact.' }, { kind: 'OBSERVED_RUNTIME', meaning: 'Observed occurrence.' }], counts: { IAC_PROVEN: 1, OBSERVED_RUNTIME: 1 }, coverage: {}, negative_evidence_rule: 'No row is never proof of no dependency.' },
      evidence_gap_count: 0,
      approval_guardrails: [{ gate: 'LIVE_DRIFT_PREFLIGHT', state: 'REQUIRED', detail: 'Re-read current cloud configuration.' }],
      rollback_suggestions: [{ kind: 'DATA', title: 'Prove restore, not only backup', detail: 'Validate restore and decrypt.' }],
      limits: ['Application behavior is not deterministically simulated.'],
    },
  }
}
