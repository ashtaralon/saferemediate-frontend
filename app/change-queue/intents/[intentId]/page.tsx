"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleHelp, GitBranch, Loader2, LockKeyhole, Network, ShieldAlert, TimerReset, Workflow } from 'lucide-react'
import { IaCChangeDossier, type IaCIntentDocument } from '@/components/iac-change-dossier'

interface ExecutionHandoff {
  state: string
  available: boolean
  workflow_kind?: string
  workflow_id?: string
  adapter_id?: string
  adapter_version?: string
  reason?: string
}

interface IntentDocument {
  intent_id: string
  analyzed_at: string
  document_hash: string
  intent: {
    requested_by: string
    scope: { system_name?: string; account_id?: string; region?: string }
    change: { resource_type: string; resource_id: string; action: string; reason: string; parameters: Record<string, unknown> }
  }
  capability: null | {
    capability_id: string
    display_name: string
    family: string
    execution: { available: boolean; from_intent_available: boolean; workflow: string }
  }
  analysis_coverage: { performed_level: string; graph_impact: string; service_risk_model: string; service_simulation: string; execution_assurance: string }
  risk_dossier: {
    analysis_kind?: string
    risk_band: string
    risk_indicator: number
    risk_indicator_explanation: string
    target: { resolved: boolean; ambiguous: boolean; resource_id: string; resource_name: string; resource_type: string }
    blast_radius: {
      direct_dependency_count: number
      direct_dependencies: Array<{ resource_id: string; resource_name: string; resource_type: string; relationship: string; system_names: string[] }>
      systems: string[]
      shared_across_systems: boolean
      periodic_dependencies: Array<{ resource_id: string; resource_name: string; resource_type: string; relationship: string }>
      data_dependencies: Array<{ resource_id: string; resource_name: string; resource_type: string; relationship: string }>
      transitive_completeness: string
    }
    risk_drivers: Array<{ code: string; weight: string; detail: string }>
    evidence: Array<{ source: string; state: string; reason: string }>
    evidence_gap_count: number
    semantic_analysis: { status: string; required_parameter_gaps: string[]; result?: { score?: number; decision?: string; confidence_level?: string; gates_applied?: string[] }; error?: string }
    limits: string[]
  }
  decision: { state: string; reason: string }
  execution: {
    available_in_cyntro: boolean
    available_from_this_intent: boolean
    state: string
    reason: string
    handoff: ExecutionHandoff
  }
  execution_handoff?: {
    workflow_kind: string
    workflow_id: string
    adapter_id: string
    adapter_version: string
    created_at: string
    contains_mutation_authority: false
  }
}

const riskStyles: Record<string, string> = {
  LOW: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-200 bg-orange-50 text-orange-900',
  CRITICAL: 'border-red-200 bg-red-50 text-red-900',
}

export default function ChangeIntentDossierPage() {
  const params = useParams<{ intentId: string }>()
  const [document, setDocument] = useState<IntentDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')

  useEffect(() => {
    let cancelled = false
    const selectedCustomer = new URLSearchParams(window.location.search).get('customer_id') || ''
    setCustomerId(selectedCustomer)
    const customerQuery = selectedCustomer ? `?customer_id=${encodeURIComponent(selectedCustomer)}` : ''
    fetch(`/api/proxy/change-assurance/intents/${encodeURIComponent(params.intentId)}${customerQuery}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Risk dossier failed')
        if (!cancelled) setDocument(payload)
      })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Risk dossier failed') })
    return () => { cancelled = true }
  }, [params.intentId])

  if (error) return <main className="min-h-screen bg-slate-50 p-8 text-red-900">{error}</main>
  if (!document) return <main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading risk dossier…</main>

  const dossier = document.risk_dossier
  const change = document.intent.change
  const handoff = document.execution.handoff || { state: document.execution.state, available: false, reason: document.execution.reason }
  const scopeQuery = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''

  if (dossier.analysis_kind === 'IAC_CHANGE_INTELLIGENCE') {
    return <IaCChangeDossier document={document as unknown as IaCIntentDocument} customerId={customerId} />
  }

  const createHandoff = async () => {
    setConverting(true)
    setHandoffError(null)
    try {
      const response = await fetch(`/api/proxy/change-assurance/intents/${encodeURIComponent(document.intent_id)}/execution-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation_days: 90 }),
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = payload.detail || payload.error || 'Execution handoff failed'
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }
      const refresh = await fetch(`/api/proxy/change-assurance/intents/${encodeURIComponent(document.intent_id)}${scopeQuery}`, { cache: 'no-store' })
      const refreshed = await refresh.json().catch(() => ({}))
      if (!refresh.ok) throw new Error(refreshed.detail || 'The workflow was created, but the dossier could not be refreshed')
      setDocument(refreshed)
    } catch (cause) {
      setHandoffError(cause instanceof Error ? cause.message : 'Execution handoff failed')
    } finally {
      setConverting(false)
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/change-queue${scopeQuery}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowLeft className="h-4 w-4" /> Change Queue</Link>
          <Link href={`/change-queue/new${scopeQuery}`} className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700">Analyze another change</Link>
        </div>

        <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><GitBranch className="h-4 w-4" /> Change risk dossier</div>
              <h1 className="mt-2 text-2xl font-bold">{change.action.replace(/_/g, ' ')}</h1>
              <p className="mt-2 font-mono text-xs text-slate-500">{change.resource_type} · {change.resource_id}</p>
              <p className="mt-3 max-w-3xl text-sm text-slate-700"><strong>Why:</strong> {change.reason}</p>
            </div>
            <div className={`rounded-2xl border px-5 py-4 ${riskStyles[dossier.risk_band] || riskStyles.MEDIUM}`}>
              <div className="text-xs font-bold uppercase tracking-wide">Change risk</div>
              <div className="mt-1 text-2xl font-black">{dossier.risk_band}</div>
              <div className="mt-1 text-xs">Triage indicator {dossier.risk_indicator}/100</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Analysis performed" value={document.analysis_coverage.performed_level.replace(/_/g, ' ')} />
            <Metric label="Decision" value={document.decision.state.replace(/_/g, ' ')} />
            <Metric label="Direct dependencies" value={String(dossier.blast_radius.direct_dependency_count)} />
            <Metric label="Evidence gaps" value={String(dossier.evidence_gap_count)} />
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
          <div className="space-y-5">
            <Section icon={<Network className="h-4 w-4" />} title="Blast radius from Neptune">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Systems in scope" value={String(dossier.blast_radius.systems.length)} />
                <Metric label="Periodic dependencies" value={String(dossier.blast_radius.periodic_dependencies.length)} />
                <Metric label="Data dependencies" value={String(dossier.blast_radius.data_dependencies.length)} />
              </div>
              {dossier.blast_radius.systems.length > 0 && <div className="mt-3 text-xs text-slate-600"><strong>Systems:</strong> {dossier.blast_radius.systems.join(', ')}</div>}
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {dossier.blast_radius.direct_dependencies.length === 0 ? <p className="p-4 text-sm text-slate-500">No direct graph dependencies were returned. This is not proof that none exist.</p> : dossier.blast_radius.direct_dependencies.map((item, index) => (
                  <div key={`${item.resource_id}-${item.relationship}-${index}`} className="grid gap-1 p-3 text-sm sm:grid-cols-[1fr_auto]">
                    <div><span className="font-semibold">{item.resource_name}</span><div className="font-mono text-[11px] text-slate-500">{item.resource_type} · {item.resource_id}</div></div>
                    <div className="self-center text-xs font-semibold text-violet-700">{item.relationship.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section icon={<ShieldAlert className="h-4 w-4" />} title="Why this change is risky">
              <div className="space-y-3">{dossier.risk_drivers.map(driver => <div key={driver.code} className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-700">{driver.code.replace(/_/g, ' ')}</div><p className="mt-1 text-sm text-slate-600">{driver.detail}</p></div>)}</div>
            </Section>

            <Section icon={<TimerReset className="h-4 w-4" />} title="Periodic and rare work">
              {dossier.blast_radius.periodic_dependencies.length === 0 ? <p className="text-sm text-slate-600">No periodic dependency was found. Coverage is not asserted complete.</p> : dossier.blast_radius.periodic_dependencies.map(item => <div key={`${item.resource_id}-${item.relationship}`} className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>{item.resource_name}</strong> · {item.resource_type} · {item.relationship.replace(/_/g, ' ')}</div>)}
            </Section>
          </div>

          <aside className="space-y-5">
            <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Service model coverage">
              <div className="text-sm"><strong>{document.capability?.display_name || 'No managed Cyntro capability'}</strong></div>
              <p className="mt-2 text-sm text-slate-600">Semantic analysis: {dossier.semantic_analysis.status.replace(/_/g, ' ')}</p>
              {dossier.semantic_analysis.required_parameter_gaps.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Still needed:</strong> {dossier.semantic_analysis.required_parameter_gaps.join(', ')}</div>}
              {dossier.semantic_analysis.result && <div className="mt-3 rounded-xl bg-slate-100 p-3 text-xs text-slate-700">Unified engine: {dossier.semantic_analysis.result.decision?.replace(/_/g, ' ')} · confidence {dossier.semantic_analysis.result.confidence_level || 'unknown'} · score {dossier.semantic_analysis.result.score ?? 'unknown'}</div>}
            </Section>

            <Section icon={<LockKeyhole className="h-4 w-4" />} title="Execution boundary">
              <div className={`rounded-xl border p-3 text-sm ${handoff.state === 'HANDED_OFF' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : handoff.available ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                <strong>{handoff.state.replace(/_/g, ' ')}</strong><p className="mt-1">{handoff.reason || document.execution.reason}</p>
              </div>
              {document.capability && <p className="mt-3 text-xs text-slate-500">Managed workflow: {document.capability.execution.workflow.replace(/_/g, ' ')}</p>}
              {handoff.state === 'AVAILABLE' && (
                <button onClick={() => void createHandoff()} disabled={converting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                  {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
                  {converting ? 'Revalidating current evidence…' : 'Create supervised workflow'}
                </button>
              )}
              {handoff.state === 'HANDED_OFF' && handoff.workflow_id && (
                handoff.workflow_kind === 'CHANGE_CASE_V4'
                  ? <Link href={`/change-queue/${encodeURIComponent(handoff.workflow_id)}${scopeQuery}`} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"><Workflow className="h-4 w-4" /> Open supervised Change Case</Link>
                  : <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-950"><strong>{handoff.workflow_kind?.replace(/_/g, ' ')}</strong><div className="mt-1 break-all font-mono">{handoff.workflow_id}</div><p className="mt-2">The Neptune workflow is ready for approval in its managed service surface.</p></div>
              )}
              {handoffError && <div role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">{handoffError}</div>}
              <p className="mt-3 text-xs font-semibold text-slate-700">Creating a workflow does not execute AWS. This dossier contains no mutation token; approval, live preflight, checkpoint, execution, verification, and rollback remain separate gates.</p>
            </Section>

            <Section icon={<CircleHelp className="h-4 w-4" />} title="Evidence readiness">
              <div className="space-y-2">{dossier.evidence.map(item => <div key={item.source} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3 text-xs font-bold uppercase tracking-wide"><span>{item.source.replace(/_/g, ' ')}</span><span>{item.state}</span></div><p className="mt-1 text-xs leading-5 text-slate-600">{item.reason}</p></div>)}</div>
            </Section>

            <Section icon={<AlertTriangle className="h-4 w-4" />} title="Known limits">
              <ul className="space-y-2 text-xs leading-5 text-slate-600">{dossier.limits.map(limit => <li key={limit}>• {limit}</li>)}</ul>
              <div className="mt-3 break-all border-t border-slate-100 pt-3 font-mono text-[10px] text-slate-400">Frozen dossier {document.document_hash}</div>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">{icon}{title}</div><div className="mt-4">{children}</div></section>
}
