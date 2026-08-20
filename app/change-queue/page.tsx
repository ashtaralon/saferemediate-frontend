"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react'

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

export default function ChangeQueuePage() {
  const [cases, setCases] = useState<QueueCase[]>([])
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
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </header>

        {error && <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
        {!loading && !error && cases.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 font-semibold">No Change Cases yet</h2>
            <p className="mt-1 text-sm text-slate-600">Select an SG remediation opportunity and open its Change Case. Weak, unselected findings do not enter this queue.</p>
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
