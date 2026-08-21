"use client"

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, GitBranch, Loader2, ShieldCheck } from 'lucide-react'
import { useAccountScope } from '@/lib/account-scope-context'

interface Capability {
  capability_id: string
  display_name: string
  family: string
  resource_types: string[]
  actions: string[]
  required_parameters: string[]
  required_parameters_by_action: Record<string, string[]>
  required_evidence: string[]
  execution: { available: boolean; from_intent_available: boolean; workflow: string }
}

const CUSTOM = 'custom.graph_analysis'

export default function AnalyzeChangePage() {
  const router = useRouter()
  const scope = useAccountScope()
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [selected, setSelected] = useState(CUSTOM)
  const [resourceType, setResourceType] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [action, setAction] = useState('')
  const [systemName, setSystemName] = useState('')
  const [reason, setReason] = useState('')
  const [parameters, setParameters] = useState('{}')
  const [requestedBy, setRequestedBy] = useState('customer-operator')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/proxy/change-assurance/capabilities', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Capability catalogue failed')
        setCapabilities(payload.capabilities || [])
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Capability catalogue failed'))
  }, [])

  const capability = useMemo(
    () => capabilities.find(item => item.capability_id === selected),
    [capabilities, selected],
  )

  const chooseCapability = (id: string) => {
    setSelected(id)
    const next = capabilities.find(item => item.capability_id === id)
    if (next) {
      setResourceType(next.resource_types[0] || '')
      setAction(next.actions[0] || '')
      setParameters('{}')
    } else {
      setResourceType('')
      setAction('')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(parameters || '{}')
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Parameters must be a JSON object')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Parameters are invalid JSON')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/proxy/change-assurance/intents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: {
            customer_id: scope.customerId || undefined,
            account_id: scope.accountId !== 'all' ? scope.accountId : undefined,
            region: scope.region !== 'all' ? scope.region : undefined,
            system_name: systemName || undefined,
          },
          change: {
            resource_type: resourceType,
            resource_id: resourceId,
            action,
            reason,
            parameters: parsed,
            source: 'CUSTOMER_AUTHORED',
          },
          requested_by: requestedBy,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Change analysis failed')
      router.push(`/change-queue/intents/${encodeURIComponent(payload.intent_id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <Link href="/change-queue" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowLeft className="h-4 w-4" /> Change Queue</Link>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><GitBranch className="h-4 w-4" /> Customer change intent</div>
            <h1 className="mt-2 text-3xl font-bold">Analyze a proposed AWS change</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Cyntro resolves the target in your Neptune graph, enumerates affected systems and dependencies, checks periodic work, and reports unknowns. Analysis never executes AWS changes.</p>

            <label className="mt-6 block text-sm font-semibold">Change model</label>
            <select value={selected} onChange={event => chooseCapability(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              <option value={CUSTOM}>Other AWS change — graph impact only</option>
              {capabilities.map(item => <option key={item.capability_id} value={item.capability_id}>{item.display_name}</option>)}
            </select>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">Resource type<input required value={resourceType} onChange={event => setResourceType(event.target.value)} placeholder="SecurityGroup" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
              <label className="text-sm font-semibold">Exact resource ID or ARN<input required value={resourceId} onChange={event => setResourceId(event.target.value)} placeholder="sg-0123456789" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" /></label>
              <label className="text-sm font-semibold">Action
                {capability ? (
                  <select required value={action} onChange={event => setAction(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
                    {capability.actions.map(item => <option key={item}>{item}</option>)}
                  </select>
                ) : <input required value={action} onChange={event => setAction(event.target.value)} placeholder="wafv2:UpdateWebACL" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" />}
              </label>
              <label className="text-sm font-semibold">Business system <span className="font-normal text-slate-400">optional</span><input value={systemName} onChange={event => setSystemName(event.target.value)} placeholder="payment-production" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
            </div>

            <label className="mt-4 block text-sm font-semibold">Why is this change needed?<textarea required minLength={8} value={reason} onChange={event => setReason(event.target.value)} placeholder="Security, compliance, upgrade, cost reduction, incident prevention…" className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
            <label className="mt-4 block text-sm font-semibold">Exact change parameters <span className="font-normal text-slate-400">JSON</span><textarea value={parameters} onChange={event => setParameters(event.target.value)} className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 bg-slate-950 px-3 py-3 font-mono text-xs font-normal text-slate-100" /></label>
            {capability && <p className="mt-2 text-xs text-slate-500">This model requires: {(capability.required_parameters_by_action?.[action] || capability.required_parameters).join(', ')}. The dossier will tell you when more exact fields are needed.</p>}
            <label className="mt-4 block text-sm font-semibold">Requested by<input required minLength={2} value={requestedBy} onChange={event => setRequestedBy(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>

            {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
            <button disabled={loading} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Analyze and save dossier</button>
          </form>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">What every change gets</div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950"><li>Exact graph target resolution</li><li>Direct consumers and shared systems</li><li>Periodic, backup, batch, and reporting dependencies</li><li>Evidence gaps and confidence limits</li><li>A durable Neptune risk dossier</li></ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Execution boundary</div>
              <p className="mt-3 text-sm leading-6 text-amber-950">Only managed capabilities can reach execution. This analysis is never a bearer token, approval, or permission to mutate AWS.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
