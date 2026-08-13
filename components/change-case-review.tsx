"use client"

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'

export interface ChangeCaseArtifact {
  schema_version: string
  case_id: string
  generated_at: string
  scope: {
    system_name: string
    resource_id: string
    resource_name: string
    resource_type: string
    sg_id: string
    sg_name?: string
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
    plan_token: string
    expires_at_epoch: number
    case_id_is_mutation_authority: false
  }
  execution_request: {
    rules: Array<Record<string, unknown>>
    create_snapshot: true
    dry_run: false
    force: boolean
    mode: 'auto'
    mutation_class?: 'config_assertion'
  }
  proposed_change: {
    kind: string
    before: Array<{ rule_id?: string; action: string; protocol: string; port: string; source: string; purpose?: string }>
    after: Array<{ protocol: string; port: string; source: string; purpose?: string }>
    untouched: string[]
    claim: string
    cves_fixed: 0
    findings_attributable_to_removed_paths: 'UNKNOWN' | string[]
  }
  evidence: {
    observed_traffic_records: number
    observed_events_are_verified_application_use: false
    rule_unique_source_count: number | null
    rule_unique_source_count_kind: string
    rule_unique_source_count_display: string
    requested_days: number
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
  rollback: { available: boolean; summary: string; preserves_original_aws_rule_id: false }
  iac_reconciliation: { status: string; instruction: string }
  residual_risk: string[]
  narrative: {
    executive_summary: string
    operator_summary: string
    risk_summary: string
    decision_request: string
    source?: string
  }
  approval_report: { format: 'application/pdf'; encoding: 'base64'; filename: string; content: string }
}

function downloadReport(changeCase: ChangeCaseArtifact) {
  const binary = window.atob(changeCase.approval_report.content)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = changeCase.approval_report.filename
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
}: {
  changeCase: ChangeCaseArtifact
  executing: boolean
  onClose: () => void
  onProceed: () => void
}) {
  const hasGaps = changeCase.evidence.gaps.length > 0
  const shared = changeCase.blast_radius.shared_substrate || []
  const expiry = new Date(changeCase.authoritative_plan.expires_at_epoch * 1000)
  const canProceed = changeCase.decision.state !== 'EXECUTION_UNSAFE'
    && (!hasGaps || changeCase.decision.override_eligible)

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
              {changeCase.case_id} · exact plan {changeCase.authoritative_plan.plan_hash.slice(0, 12)} · expires {expiry.toLocaleString()}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{changeCase.decision.state.replace(/_/g, ' ')}</span>
              <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">{changeCase.decision.readiness.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close Change Case">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-violet-700">1. Why are we changing this?</div>
            <p className="mt-2 text-sm font-semibold text-slate-950">{changeCase.narrative.executive_summary}</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">{changeCase.narrative.operator_summary}</p>
            <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-xs text-slate-700">
              <strong>Verified claim:</strong> {changeCase.proposed_change.claim}.{' '}
              {Array.isArray(changeCase.proposed_change.findings_attributable_to_removed_paths)
                ? `Verified path attribution: ${changeCase.proposed_change.findings_attributable_to_removed_paths.join(', ')}. The findings remain open until the software is patched.`
                : 'Scanner findings prioritize this workload; findings attributable to the changed paths remain UNKNOWN.'}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600">2. What exactly changes?</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-800">Current reviewed rule</div>
                <div className="space-y-2">
                  {changeCase.proposed_change.before.map((rule, index) => <RuleLine key={`${rule.rule_id}-${index}`} rule={rule} />)}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-emerald-800">Proposed state</div>
                <div className="space-y-2">
                  {changeCase.proposed_change.after.length > 0
                    ? changeCase.proposed_change.after.map((rule, index) => <RuleLine key={`${rule.protocol}-${rule.port}-${index}`} rule={rule} />)
                    : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Remove only the reviewed rule. All unlisted rules stay unchanged.</div>}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-600"><strong>Not touched:</strong> {changeCase.proposed_change.untouched.join(', ')}.</div>
          </section>

          <section className={`rounded-2xl border p-4 ${hasGaps ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              {hasGaps ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
              3. What could break, and how strong is the evidence?
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3"><div className="text-lg font-bold">{changeCase.evidence.observed_traffic_records.toLocaleString()}</div><div className="text-[10px] text-slate-600">Observed admitted-traffic events</div></div>
              <div className="rounded-xl bg-white p-3"><div className="text-sm font-bold">{changeCase.evidence.rule_unique_source_count_display}</div><div className="text-[10px] text-slate-600">Distinct rule sources</div></div>
              <div className="rounded-xl bg-white p-3"><div className="text-lg font-bold">{changeCase.evidence.effective_days ?? 'Unknown'} / {changeCase.evidence.requested_days}</div><div className="text-[10px] text-slate-600">Evidence days</div></div>
            </div>
            <p className="mt-3 text-xs text-slate-700">{changeCase.narrative.risk_summary}</p>
            {changeCase.evidence.traffic_fanout_annotation?.detected && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                Context only: broad destination-port fan-out was observed across {changeCase.evidence.traffic_fanout_annotation.observed_port_count ?? 'multiple'} ports. This annotation does not select or authorize the change.
              </div>
            )}
            {changeCase.evidence.gaps.map((gap) => (
              <div key={gap.code} className="mt-2 rounded-lg border border-amber-300 bg-white p-2 text-xs text-amber-950">
                <strong>{gap.message}</strong>
              </div>
            ))}
            {shared.length > 0 && (
              <div className="mt-2 text-xs text-slate-700">
                <strong>Known shared SG consumers:</strong> {shared.map((item) => item.resource_name || item.resource_id).join(', ')}.
                {!changeCase.blast_radius.shared_substrate_complete && ' Completeness is not attested; the execution pipeline rechecks live attachments.'}
              </div>
            )}
            <div className="mt-2 text-xs text-slate-700"><strong>Transitive blast radius:</strong> {Array.isArray(changeCase.blast_radius.transitive) ? changeCase.blast_radius.transitive.join(', ') : changeCase.blast_radius.transitive}.</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"><ShieldCheck className="h-4 w-4" /> 4. How will Cyntro control and reverse it?</div>
            <ol className="mt-3 space-y-2">
              {changeCase.rollout.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-xs text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span>{step}</li>
              ))}
            </ol>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <strong>Pre-change simulation:</strong> {changeCase.simulation.rules_to_change} exact rule(s); {changeCase.simulation.potential_impact_count} potential-impact record(s).
              {changeCase.simulation.warnings.map((warning) => (
                <div key={warning} className="mt-1 text-amber-800">⚠ {warning}</div>
              ))}
            </div>
            <div className="mt-3 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"><RotateCcw className="h-4 w-4 shrink-0" />{changeCase.rollback.summary}</div>
            <div className="mt-2 text-xs text-slate-600">IaC follow-up: {changeCase.iac_reconciliation.instruction}</div>
          </section>

          <section className="rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-200"><FileText className="h-4 w-4" /> 5. What decision is required?</div>
            <p className="mt-2 text-sm">{changeCase.narrative.decision_request}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={() => downloadReport(changeCase)} className="flex items-center justify-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10">
                <Download className="h-4 w-4" /> Download approval PDF
              </button>
              <button onClick={onProceed} disabled={executing || !canProceed} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold hover:bg-violet-400 disabled:opacity-50">
                {executing
                  ? 'Executing existing safety workflow…'
                  : !canProceed
                    ? 'Execution blocked by hard control'
                    : hasGaps
                      ? 'Proceed with risk acceptance'
                      : 'Proceed to execution'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
