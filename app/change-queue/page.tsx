"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, GitBranch, Plus, RefreshCw, ShieldCheck } from 'lucide-react'

interface QueueCase {
  case_id: string
  status: string
  updated_at: string
  system_name: string
  resource_name: string
  resource_type: string
  sg_id: string
  change_kind: string
  rules_to_change: number
  decision_state: string
  evidence_complete: boolean
  evidence_gap_count: number
  rollback_available: boolean
}

interface Capability {
  capability_id: string
  display_name: string
  family: string
}

interface AnalyzedIntent {
  intent_id: string
  analyzed_at: string
  intent: { change: { action: string; resource_id: string; resource_type: string; reason: string } }
  capability: null | { display_name: string }
  risk_dossier: { risk_band: string; blast_radius: { direct_dependency_count: number; systems: string[] }; evidence_gap_count: number }
  decision: { state: string }
  execution: { available_from_this_intent: boolean; state: string }
}

export default function ChangeQueuePage() {
  const [cases, setCases] = useState<QueueCase[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [intents, setIntents] = useState<AnalyzedIntent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/proxy/change-cases?limit=100', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Change Queue failed')
      setCases(payload.cases || [])
      const [capabilityResponse, intentResponse] = await Promise.all([
        fetch('/api/proxy/change-assurance/capabilities', { cache: 'no-store' }),
        fetch('/api/proxy/change-assurance/intents?limit=20', { cache: 'no-store' }),
      ])
      if (capabilityResponse.ok) {
        const capabilityPayload = await capabilityResponse.json().catch(() => ({}))
        setCapabilities(capabilityPayload.capabilities || [])
      }
      if (intentResponse.ok) {
        const intentPayload = await intentResponse.json().catch(() => ({}))
        setIntents(intentPayload.intents || [])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change Queue failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-700"><ClipboardList className="h-4 w-4" /> Change assurance</div>
            <h1 className="mt-2 text-3xl font-bold">Change Queue</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Only durable, exact Change Cases appear here. Open a case to approve, execute, observe, rollback, and download its current report.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/change-queue/new" className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> Analyze change</Link>
            <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-800"><GitBranch className="h-4 w-4" /> Lane 1 · Understand any proposed change</div>
            <p className="mt-2 text-sm leading-6 text-violet-950">Customer-authored changes get a Neptune dependency dossier, shared-system impact, periodic-work checks, evidence gaps, and explicit analysis limits.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800"><ShieldCheck className="h-4 w-4" /> Lane 2 · Execute only managed playbooks</div>
            <p className="mt-2 text-sm leading-6 text-emerald-950">AWS execution remains capability-gated, approved, checkpointed, observable, and reversible. An analysis dossier is never mutation authority.</p>
          </div>
        </section>

        {capabilities.length > 0 && <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Managed capability boundary</div>
          <div className="mt-3 flex flex-wrap gap-2">{capabilities.map(item => <span key={item.capability_id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{item.display_name}</span>)}</div>
        </section>}

        {error && <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
        <div className="mt-8 flex items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Customer-proposed changes</div><h2 className="mt-1 text-xl font-bold">Risk dossiers</h2></div><Link href="/change-queue/new" className="text-sm font-bold text-violet-700">Analyze a change →</Link></div>
        {!loading && !error && intents.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No customer-authored change has been analyzed yet.</div>}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {intents.map(item => <Link key={item.intent_id} href={`/change-queue/intents/${encodeURIComponent(item.intent_id)}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-violet-700">{item.capability?.display_name || 'Graph impact only'}</div><div className="mt-1 font-semibold">{item.intent.change.action.replace(/_/g, ' ')}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.risk_dossier.risk_band === 'CRITICAL' ? 'bg-red-100 text-red-800' : item.risk_dossier.risk_band === 'HIGH' ? 'bg-orange-100 text-orange-800' : item.risk_dossier.risk_band === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.risk_dossier.risk_band}</span></div>
            <div className="mt-2 font-mono text-xs text-slate-500">{item.intent.change.resource_type} · {item.intent.change.resource_id}</div>
            <div className="mt-3 text-xs text-slate-600">{item.risk_dossier.blast_radius.direct_dependency_count} direct dependencies · {item.risk_dossier.blast_radius.systems.length} systems · {item.risk_dossier.evidence_gap_count} evidence gaps</div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.decision.state.replace(/_/g, ' ')} · {item.execution.state.replace(/_/g, ' ')}</div>
          </Link>)}
        </div>

        <div className="mt-8"><div className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">Approved execution workflows</div><h2 className="mt-1 text-xl font-bold">Change Cases</h2></div>
        {!loading && !error && cases.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 font-semibold">No Change Cases yet</h2>
            <p className="mt-1 text-sm text-slate-600">Only a supported managed playbook that has entered its approval workflow appears here. Risk dossiers remain separate until an execution adapter freezes the exact plan.</p>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {cases.map((item) => (
            <Link key={item.case_id} href={`/change-queue/${encodeURIComponent(item.case_id)}`} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 md:grid-cols-[1.4fr_1fr_auto]">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-violet-700">{item.change_kind.replace(/_/g, ' ')}</div>
                <div className="mt-1 text-lg font-semibold">{item.resource_name}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{item.sg_id} · {item.case_id}</div>
              </div>
              <div className="text-sm text-slate-700">
                <div>{item.system_name} · {item.resource_type}</div>
                <div className="mt-1">{item.rules_to_change} exact rule{item.rules_to_change === 1 ? '' : 's'} · {item.evidence_complete ? 'evidence complete' : `${item.evidence_gap_count} evidence gap${item.evidence_gap_count === 1 ? '' : 's'}`}</div>
                <div className="mt-1 text-xs text-slate-500">Updated {new Date(item.updated_at).toLocaleString()}</div>
              </div>
              <div className="self-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">{item.status.replace(/_/g, ' ')}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
