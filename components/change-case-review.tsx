"use client"

import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  Play,
  UserCheck,
  X,
} from 'lucide-react'

interface ChangeCaseEvent {
  event_id: string
  kind: string
  actor: string
  at: string
  detail?: Record<string, unknown>
}

interface ChangeCaseRun {
  run_id: string
  status: string
  started_at: string
  completed_at?: string | null
  executed_by: string
  snapshot_id?: string | null
  timeline_event_id?: string | null
  checkpoint?: {
    checkpoint_id?: string
    dependency_hash?: string
    dependency_snapshot?: {
      live_eni_ids?: string[]
      neptune_eni_ids?: string[] | null
      graph_parity?: boolean
      all_consumers_supported?: boolean
      target_health_complete?: boolean
    }
    source_sg?: { sg_id?: string }
    clone?: { sg_id?: string | null; group_name?: string }
    eni_assignments?: Array<{ eni_id: string; instance_id?: string; instance_name?: string }>
  } | null
  result?: {
    success?: boolean
    status?: string
    execution_mode?: string
    clone_sg_id?: string | null
    canary_eni_id?: string
    expanded_eni_ids?: string[]
    rollback_performed?: boolean
    rollback_succeeded?: boolean
    post_change_verification?: { verified?: boolean; detail?: string }
    post_change_verified?: boolean
    domain_result?: Record<string, unknown>
    error?: { code?: string; message?: string }
    summary?: { rules_removed?: number; consumers_canaried?: number; consumers_expanded?: number }
  } | null
  rollback?: { status: string; automatic?: boolean; at?: string; rolled_back_by?: string } | null
  events: ChangeCaseEvent[]
}

interface ChangeCaseWorkflow {
  status: string
  version: number
  requested_by: string
  created_at: string
  updated_at: string
  approvals: Array<{
    approval_id: string
    approved_by: string
    approver_role: string
    rationale: string
    risk_accepted: boolean
    rollback_acknowledged: boolean
    at: string
  }>
  events: ChangeCaseEvent[]
  latest_run?: ChangeCaseRun | null
}

export interface ChangeCaseArtifact {
  schema_version: string
  case_id: string
  generated_at: string
  scope: {
    system_name: string
    resource_id: string
    resource_name: string
    resource_type: string
    sg_id?: string | null
    sg_name?: string | null
  }
  decision: {
    state: string
    domain_decision: string
    readiness: string
    override_eligible: boolean
    override_does_not_change_evidence_truth: true
  }
  authoritative_plan: {
    scheme: string
    plan_hash: string
    plan_token?: string
    expires_at_epoch?: number
    case_id_is_mutation_authority: false
  }
  execution_request: {
    rules: Array<Record<string, unknown>>
    create_snapshot: true
    create_checkpoint?: boolean
    dry_run: false
    force: boolean
    mode: 'auto'
    mutation_class?: string
    [key: string]: unknown
  }
  proposed_change: {
    kind: string
    before: Array<{ rule_id?: string; action?: string; protocol: string; port: string; source: string; purpose?: string }>
    after: Array<{ protocol: string; port: string; source: string; purpose?: string }>
    untouched: string[]
    claim: string
    cves_fixed?: number
    findings_attributable_to_removed_paths?: 'UNKNOWN' | string[]
  }
  evidence: {
    observed_traffic_records?: number
    observed_access_records?: number
    observed_events_are_verified_application_use?: boolean
    rule_unique_source_count?: number | null
    rule_unique_source_count_kind?: string
    rule_unique_source_count_display?: string
    requested_days?: number
    effective_days?: number | null
    complete: boolean
    gaps: Array<{ code: string; message: string; how_to_close?: string }>
    traffic_fanout_annotation?: { detected?: boolean; observed_port_count?: number; decision_input?: false }
    surviving_rule_flow_coverage?: { status?: string; redundant?: boolean; reason?: string }
  }
  blast_radius: {
    direct: string[]
    transitive: string | string[]
    shared_substrate: Array<{ resource_id?: string; resource_name?: string; resource_type?: string }>
    shared_substrate_complete: boolean
  }
  simulation: {
    performed: boolean
    rules_to_change: number
    warnings: string[]
    potential_impact_count: number
    simulated_at?: string | null
  }
  rollout: { strategy: string; steps: string[]; stop_conditions: string[] }
  rollback: { available: boolean; summary: string; preserves_original_aws_rule_id: boolean }
  iac_reconciliation?: { status: string; instruction: string }
  residual_risk: string[]
  narrative: {
    executive_summary: string
    operator_summary: string
    risk_summary: string
    decision_request: string
    source?: string
  }
  approval_report: { format: 'application/pdf'; encoding: 'base64'; filename: string; content: string }
  workflow?: ChangeCaseWorkflow
}

function downloadBase64Report(report: { content: string; filename: string }) {
  const binary = window.atob(report.content)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = report.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function RuleLine({ rule }: { rule: { protocol: string; port: string; source: string; purpose?: string } }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
      <span className="font-semibold text-slate-900">{rule.protocol} {rule.port}</span> from {rule.source}
      <div className="mt-1 text-[11px] text-slate-500">{rule.purpose || 'Application-defined service'}</div>
    </div>
  )
}

export function ChangeCaseReview({
  changeCase,
  executing,
  onClose,
  onProceed,
  onCaseUpdate,
}: {
  changeCase: ChangeCaseArtifact
  executing: boolean
  onClose: () => void
  onProceed?: () => void
  onCaseUpdate?: (changeCase: ChangeCaseArtifact) => void
}) {
  const [current, setCurrent] = useState(changeCase)
  const [busy, setBusy] = useState<'approve' | 'execute' | 'rollback' | 'report' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [approverRole, setApproverRole] = useState('Service owner')
  const [rationale, setRationale] = useState('')
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [rollbackAcknowledged, setRollbackAcknowledged] = useState(false)
  const [executedBy, setExecutedBy] = useState('')
  const [rollbackRationale, setRollbackRationale] = useState('')

  useEffect(() => setCurrent(changeCase), [changeCase])

  const hasGaps = current.evidence.gaps.length > 0
  const isConfigAssertion = current.execution_request.mutation_class === 'config_assertion'
  const isSecurityGroup = current.scope.resource_type === 'SecurityGroup' || Boolean(current.scope.sg_id)
  const observedRecords = current.evidence.observed_traffic_records ?? current.evidence.observed_access_records ?? 0
  const uniqueSources = current.evidence.rule_unique_source_count_display ?? String(current.evidence.rule_unique_source_count ?? 0)
  const shared = current.blast_radius.shared_substrate || []
  const workflow = current.workflow
  const canProceed = current.decision.state !== 'EXECUTION_UNSAFE'
    && (!hasGaps || current.decision.override_eligible)

  const transition = async (action: string, body: Record<string, unknown>) => {
    setError(null)
    const response = await fetch(`/api/proxy/change-cases/${encodeURIComponent(current.case_id)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.detail || payload.error || `${action} failed`
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    }
    setCurrent(payload)
    onCaseUpdate?.(payload)
    return payload as ChangeCaseArtifact
  }

  const approve = async () => {
    setBusy('approve')
    try {
      await transition('approve', {
        approved_by: approvedBy,
        approver_role: approverRole,
        rationale,
        risk_accepted: riskAccepted,
        rollback_acknowledged: rollbackAcknowledged,
        identity_source: 'self_attested',
      })
      setExecutedBy(approvedBy)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval failed')
    } finally {
      setBusy(null)
    }
  }

  const execute = async () => {
    setBusy('execute')
    try {
      await transition('execute', { executed_by: executedBy, identity_source: 'self_attested' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Execution failed')
    } finally {
      setBusy(null)
    }
  }

  const rollback = async () => {
    setBusy('rollback')
    try {
      await transition('rollback', {
        rolled_back_by: executedBy,
        rationale: rollbackRationale,
        identity_source: 'self_attested',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rollback failed')
    } finally {
      setBusy(null)
    }
  }

  const downloadFinalReport = async (audience: 'executive' | 'change_management' | 'engineering') => {
    setBusy('report')
    setError(null)
    try {
      const response = await fetch(`/api/proxy/change-cases/${encodeURIComponent(current.case_id)}/report?audience=${audience}`, { cache: 'no-store' })
      const report = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(report.detail || report.error || 'Final report failed')
      downloadBase64Report(report)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Final report failed')
    } finally {
      setBusy(null)
    }
  }

  const latestRun = workflow?.latest_run
  const checkpoint = latestRun?.checkpoint
  const executionResult = latestRun?.result
  const dependency = checkpoint?.dependency_snapshot

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" data-testid="change-case-review">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
              <ClipboardCheck className="h-4 w-4" /> Cyntro Change Case
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Review the complete production change</h2>
            <p className="mt-1 text-xs text-slate-600">
              {current.case_id} · exact frozen plan {current.authoritative_plan.plan_hash.slice(0, 12)} · captured {new Date(current.generated_at).toLocaleString()}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Decision gate · {current.decision.state.replace(/_/g, ' ')}</span>
              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">Lifecycle · {workflow?.status?.replace(/_/g, ' ') || current.decision.readiness.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close Change Case">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-violet-700">1. Why are we changing this?</div>
            <p className="mt-2 text-sm font-semibold text-slate-950">{current.narrative.executive_summary}</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">{current.narrative.operator_summary}</p>
            <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-xs text-slate-700">
              <strong>Verified claim:</strong> {current.proposed_change.claim}.{' '}
              {isSecurityGroup
                ? Array.isArray(current.proposed_change.findings_attributable_to_removed_paths)
                  ? `Verified path attribution: ${current.proposed_change.findings_attributable_to_removed_paths.join(', ')}. The findings remain open until the software is patched.`
                  : 'Finding-to-path attribution remains UNKNOWN; this network change is not presented as a software patch.'
                : 'This access-policy change is not presented as a vulnerability patch and does not close unrelated findings.'}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600">2. What exactly changes?</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-800">{isSecurityGroup ? 'Current reviewed rule' : 'Current reviewed policy statement'}</div>
                <div className="space-y-2">
                  {current.proposed_change.before.map((rule, index) => <RuleLine key={`${rule.rule_id}-${index}`} rule={rule} />)}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-emerald-800">Proposed state</div>
                <div className="space-y-2">
                  {current.proposed_change.after.length > 0
                    ? current.proposed_change.after.map((rule, index) => <RuleLine key={`${rule.protocol}-${rule.port}-${index}`} rule={rule} />)
                    : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Remove only the reviewed {isSecurityGroup ? 'rule' : 'policy statement'}. All unlisted items stay unchanged.</div>}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-600"><strong>Not touched:</strong> {current.proposed_change.untouched.join(', ')}.</div>
          </section>

          <section className={`rounded-2xl border p-4 ${hasGaps ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              {hasGaps ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
              3. What could break, and how strong is the evidence?
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3"><div className="text-lg font-bold">{observedRecords.toLocaleString()}</div><div className="text-[10px] text-slate-600">{isSecurityGroup ? 'Observed admitted-traffic events' : 'Observed S3 access records'}</div></div>
              <div className="rounded-xl bg-white p-3"><div className="text-sm font-bold">{uniqueSources}</div><div className="text-[10px] text-slate-600">{isSecurityGroup ? 'Distinct rule sources' : 'Observed principals'}</div></div>
              <div className="rounded-xl bg-white p-3"><div className="text-lg font-bold">{isConfigAssertion ? 'Not required' : `${current.evidence.effective_days ?? 'Unknown'} / ${current.evidence.requested_days}`}</div><div className="text-[10px] text-slate-600">{isConfigAssertion ? 'Behavioral gate' : 'Evidence days'}</div></div>
            </div>
            <p className="mt-3 text-xs text-slate-700">{current.narrative.risk_summary}</p>
            {current.evidence.traffic_fanout_annotation?.detected && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                Context only: broad destination-port fan-out was observed across {current.evidence.traffic_fanout_annotation.observed_port_count ?? 'multiple'} ports. This annotation does not select or authorize the change.
              </div>
            )}
            {current.evidence.gaps.map((gap) => (
              <div key={gap.code} className="mt-2 rounded-lg border border-amber-300 bg-white p-2 text-xs text-amber-950">
                <strong>{gap.message}</strong>
              </div>
            ))}
            {shared.length > 0 && (
              <div className="mt-2 text-xs text-slate-700">
                <strong>{isSecurityGroup ? 'Known shared SG consumers' : 'Known shared dependencies'}:</strong> {shared.map((item) => item.resource_name || item.resource_id).join(', ')}.
                {!current.blast_radius.shared_substrate_complete && ' Completeness is not attested; the execution pipeline rechecks live attachments.'}
              </div>
            )}
            <div className="mt-2 text-xs text-slate-700"><strong>Transitive blast radius:</strong> {Array.isArray(current.blast_radius.transitive) ? current.blast_radius.transitive.join(', ') : current.blast_radius.transitive}.</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"><ShieldCheck className="h-4 w-4" /> 4. How will Cyntro control and reverse it?</div>
            <ol className="mt-3 space-y-2">
              {current.rollout.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-xs text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span>{step}</li>
              ))}
            </ol>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <strong>Pre-change simulation:</strong> {current.simulation.rules_to_change} exact {isSecurityGroup ? 'rule' : 'change item'}(s); {current.simulation.potential_impact_count} potential-impact record(s).
              {current.simulation.warnings.map((warning) => (
                <div key={warning} className="mt-1 text-amber-800">⚠ {warning}</div>
              ))}
            </div>
            <div className="mt-3 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"><RotateCcw className="h-4 w-4 shrink-0" />{current.rollback.summary}</div>
            {current.iac_reconciliation?.instruction && <div className="mt-2 text-xs text-slate-600">IaC follow-up: {current.iac_reconciliation.instruction}</div>}
          </section>

          {latestRun && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4" data-testid="supervised-execution-evidence">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-800"><ShieldCheck className="h-4 w-4" /> Live supervised execution evidence</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Run stage</div><div className="mt-1 text-sm font-bold">{latestRun.status.replace(/_/g, ' ')}</div></div>
                {isSecurityGroup ? <>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Dependency parity</div><div className="mt-1 text-sm font-bold">{dependency?.graph_parity === true ? 'Neptune = live AWS' : dependency?.graph_parity === false ? 'Mismatch — blocked' : 'Pending'}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Consumers covered</div><div className="mt-1 text-sm font-bold">{dependency?.live_eni_ids?.length ?? 'Pending'}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Health signals</div><div className="mt-1 text-sm font-bold">{dependency?.target_health_complete === true ? 'Complete' : dependency ? 'Incomplete — blocked' : 'Pending'}</div></div>
                </> : <>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Checkpoint</div><div className="mt-1 text-sm font-bold">{latestRun.snapshot_id ? 'Captured' : 'Pending'}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Policy verification</div><div className="mt-1 text-sm font-bold">{executionResult?.post_change_verified === true || executionResult?.post_change_verification?.verified === true ? 'Verified' : executionResult?.success === false ? 'Failed' : 'Pending'}</div></div>
                  <div className="rounded-xl bg-white p-3"><div className="text-[10px] uppercase text-slate-500">Rollback</div><div className="mt-1 text-sm font-bold">{executionResult?.rollback_performed ? (executionResult.rollback_succeeded ? 'Verified' : 'Needs attention') : 'Not required'}</div></div>
                </>}
              </div>
              {checkpoint && (
                <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-700">
                  <div><strong>Durable checkpoint:</strong> {checkpoint.checkpoint_id}</div>
                  {isSecurityGroup && <div className="mt-1"><strong>Exact SG handoff:</strong> {checkpoint.source_sg?.sg_id || current.scope.sg_id} → {checkpoint.clone?.sg_id || checkpoint.clone?.group_name || 'clone pending'}</div>}
                  <div className="mt-1"><strong>Frozen dependency hash:</strong> <span className="font-mono">{checkpoint.dependency_hash || 'pending'}</span></div>
                </div>
              )}
              {executionResult && (
                <div className={`mt-3 rounded-xl border p-3 text-xs ${executionResult.rollback_performed ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
                  {isSecurityGroup
                    ? <div><strong>Canary:</strong> {executionResult.canary_eni_id || 'not reached'} · <strong>expanded:</strong> {executionResult.expanded_eni_ids?.length ?? 0} consumer(s)</div>
                    : <div><strong>Policy change:</strong> {executionResult.success === true ? 'applied and checked' : executionResult.success === false ? 'did not complete' : executionResult.status?.replace(/_/g, ' ') || 'pending'}</div>}
                  <div className="mt-1"><strong>Automatic rollback:</strong> {executionResult.rollback_performed ? (executionResult.rollback_succeeded ? 'performed and verified' : 'failed — manual intervention required') : 'not required'}</div>
                  {executionResult.error?.message && <div className="mt-1"><strong>Stop reason:</strong> {executionResult.error.message}</div>}
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-200"><FileText className="h-4 w-4" /> 5. What decision is required?</div>
            <p className="mt-2 text-sm">{current.narrative.decision_request}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={() => downloadBase64Report(current.approval_report)} className="flex items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10">
                <Download className="h-4 w-4" /> Download approval PDF
              </button>
              {workflow && (
                <button onClick={() => void downloadFinalReport('executive')} disabled={busy === 'report'} className="flex items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">
                  <Download className="h-4 w-4" /> Executive outcome
                </button>
              )}
              {workflow && (
                <button onClick={() => void downloadFinalReport('change_management')} disabled={busy === 'report'} className="flex items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">
                  <Download className="h-4 w-4" /> Change record
                </button>
              )}
              {workflow && (
                <button onClick={() => void downloadFinalReport('engineering')} disabled={busy === 'report'} className="flex items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">
                  <Download className="h-4 w-4" /> Engineering evidence
                </button>
              )}
            </div>

            {!workflow && (
              <button onClick={onProceed} disabled={executing || !canProceed} className="mt-3 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold hover:bg-violet-400 disabled:opacity-50">
                {executing
                  ? 'Executing existing safety workflow…'
                  : !canProceed
                    ? 'Execution blocked by hard control'
                    : hasGaps
                      ? 'Proceed with risk acceptance'
                      : 'Proceed to execution'}
              </button>
            )}

            {workflow?.status === 'AWAITING_APPROVAL' && (
              <div className="mt-4 space-y-3 rounded-xl bg-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><UserCheck className="h-4 w-4" /> Independent approval</div>
                <p className="text-xs text-amber-200">Pilot identity is self-attested until customer SSO is connected; the report labels it accordingly.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">Approver
                    <input aria-label="Approver" value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} className="mt-1 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" placeholder="name@company.com" />
                  </label>
                  <label className="text-xs">Approver role
                    <input aria-label="Approver role" value={approverRole} onChange={(event) => setApproverRole(event.target.value)} className="mt-1 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" />
                  </label>
                </div>
                <label className="block text-xs">Approval rationale
                  <textarea aria-label="Approval rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" placeholder="Ticket, owner confirmation, and why this exact change is approved" />
                </label>
                {hasGaps && (
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />
                    I accept the explicitly listed evidence gaps; this does not change their truth.
                  </label>
                )}
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={rollbackAcknowledged} onChange={(event) => setRollbackAcknowledged(event.target.checked)} />
                  I reviewed the checkpoint and rollback plan.
                </label>
                <button onClick={approve} disabled={busy !== null || approvedBy.trim().length < 2 || rationale.trim().length < 8 || !rollbackAcknowledged || (hasGaps && !riskAccepted)} className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold hover:bg-violet-400 disabled:opacity-50">
                  {busy === 'approve' ? 'Recording approval…' : 'Approve exact signed plan'}
                </button>
              </div>
            )}

            {workflow?.status === 'APPROVED' && (
              <div className="mt-4 space-y-3 rounded-xl bg-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4" /> Supervised execution</div>
                <label className="block text-xs">Executing operator
                  <input aria-label="Executing operator" value={executedBy} onChange={(event) => setExecutedBy(event.target.value)} className="mt-1 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" placeholder="name@company.com" />
                </label>
                <button onClick={execute} disabled={busy !== null || executedBy.trim().length < 2} className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold hover:bg-violet-400 disabled:opacity-50">
                  {busy === 'execute' ? 'Running preflight, checkpoint and mutation…' : 'Execute approved Change Case'}
                </button>
              </div>
            )}

            {workflow?.status === 'SUCCEEDED' && (
              <div className="mt-4 space-y-3 rounded-xl bg-emerald-500/15 p-4">
                <div className="text-sm font-semibold">Execution succeeded · checkpoint {workflow.latest_run?.snapshot_id || 'not reported'}</div>
                <label className="block text-xs">Rollback operator
                  <input aria-label="Rollback operator" value={executedBy} onChange={(event) => setExecutedBy(event.target.value)} className="mt-1 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" placeholder="name@company.com" />
                </label>
                <label className="block text-xs">Rollback rationale
                  <textarea aria-label="Rollback rationale" value={rollbackRationale} onChange={(event) => setRollbackRationale(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-slate-950" placeholder="Why restoration is required" />
                </label>
                <button onClick={rollback} disabled={busy !== null || executedBy.trim().length < 2 || rollbackRationale.trim().length < 8 || !workflow.latest_run?.snapshot_id} className="w-full rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-50">
                  {busy === 'rollback' ? 'Restoring checkpoint…' : 'Rollback from verified checkpoint'}
                </button>
              </div>
            )}

            {workflow && !['AWAITING_APPROVAL', 'APPROVED', 'SUCCEEDED'].includes(workflow.status) && (
              <div className="mt-4 rounded-xl bg-white/10 p-4 text-sm">
                Workflow status: <strong>{workflow.status.replace(/_/g, ' ')}</strong>
              </div>
            )}

            {error && <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-500/20 p-3 text-sm text-red-50">{error}</div>}
          </section>

          {workflow && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-600">6. Tamper-evident execution timeline</div>
              <div className="mt-3 space-y-3">
                {workflow.events.map((event) => (
                  <div key={event.event_id} className="flex gap-3 text-xs">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                    <div>
                      <div className="font-semibold text-slate-900">{event.kind.replace(/_/g, ' ')}</div>
                      <div className="text-slate-600">{new Date(event.at).toLocaleString()} · {event.actor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
