"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardList, GitBranch, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { useAccountScope } from '@/lib/account-scope-context'

interface QueueCase {
  case_id: string
  status: string
  updated_at: string
  system_name: string
  resource_name: string
  resource_type: string
  sg_id?: string | null
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
  risk_dossier: {
    analysis_kind?: string
    risk_band: string
    analysis_conclusion?: { state?: string; headline?: string }
    confidence?: { level?: string }
    finding_counts?: { total?: number; by_severity?: Record<string, number> }
    source_artifact?: { kind?: string }
    semantic_diff_summary?: { total_changes?: number; action_counts?: Record<string, number> }
    blast_radius: { direct_dependency_count: number; direct_dependency_count_semantics?: string; systems: string[] }
    evidence_gap_count: number
  }
  decision: { state: string }
  execution: {
    available_from_this_intent: boolean
    state: string
    handoff?: { state: string; available: boolean; workflow_kind?: string; workflow_id?: string }
  }
}

// Backend truth (unified/change_case/store.py): the Change Case store reaches S3 + DynamoDB
// through the tenant lifecycle role. When that raises, Lane 2 listing fails while Lane 1
// analysis (Neptune dossiers) keeps working — explain that instead of showing a bare string.
const LIFECYCLE_STORAGE_HINT =
  "Change Cases persist to this tenant's dedicated lifecycle storage (S3 + DynamoDB, reached through the tenant lifecycle role). Until that storage is provisioned for the tenant, existing cases cannot be listed and new executions cannot be checkpointed. Lane 1 risk dossiers are unaffected."

function errorHint(message: string): string | null {
  return message.toLowerCase().includes('lifecycle storage') ? LIFECYCLE_STORAGE_HINT : null
}

function SectionErrorCard({ title, message, staleNote, onRetry, retrying }: { title: string; message: string; staleNote?: string; onRetry: () => void; retrying: boolean }) {
  const hint = errorHint(message)
  return (
    <div role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-800"><AlertTriangle className="h-4 w-4" /> {title}</div>
          <p className="mt-2 break-words font-mono text-sm text-red-900">{message}</p>
          {hint && <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">{hint}</p>}
          {staleNote && <p className="mt-2 text-xs font-semibold text-red-700">{staleNote}</p>}
        </div>
        <button onClick={onRetry} disabled={retrying} className="flex shrink-0 items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} /> Retry
        </button>
      </div>
    </div>
  )
}

// showBack renders the shared back arrow — only the standalone /change-queue page
// sets it; the system-detail dashboard embeds this view inside its own tab nav.
export function ChangeQueueView({ systemName, showBack }: { systemName?: string; showBack?: boolean }) {
  const [cases, setCases] = useState<QueueCase[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [intents, setIntents] = useState<AnalyzedIntent[]>([])
  const [loading, setLoading] = useState(true)
  const [casesError, setCasesError] = useState<string | null>(null)
  const [intentsError, setIntentsError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [casesLoadedAt, setCasesLoadedAt] = useState<Date | null>(null)
  const [intentsLoadedAt, setIntentsLoadedAt] = useState<Date | null>(null)
  // Same scope source as the rest of the product (org picker → URL → stored),
  // instead of hand-parsing window.location like this view used to.
  const { customerId: scopeCustomerId } = useAccountScope()
  const customerId = scopeCustomerId || ''
  const loadGeneration = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const load = async () => {
    // A newer load supersedes any in-flight one: abort the previous requests
    // and bump the generation so a late response from an outdated tenant or
    // system scope can never paint under the current scope's labels.
    const generation = ++loadGeneration.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const active = () => loadGeneration.current === generation && !controller.signal.aborted
    setLoading(true)
    const scoped = (extra: Record<string, string>) => new URLSearchParams({
      ...extra,
      ...(customerId ? { customer_id: customerId } : {}),
      ...(systemName ? { system_name: systemName } : {}),
    })
    // Lane 2 (durable Change Cases) and Lane 1 (analysis dossiers) have independent
    // backends — one failing must not blank the other, so each fetch settles on its own.
    const loadCases = async () => {
      const response = await fetch(`/api/proxy/change-cases?${scoped({ limit: '100' })}`, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Change Case queue failed')
      if (!active()) return
      setCases(payload.cases || [])
      setCasesLoadedAt(new Date())
    }
    const loadIntents = async () => {
      const response = await fetch(`/api/proxy/change-assurance/intents?${scoped({ limit: '20' })}`, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Analyzed-change list failed')
      if (!active()) return
      setIntents(payload.intents || [])
      setIntentsLoadedAt(new Date())
    }
    const loadCapabilities = async () => {
      const response = await fetch('/api/proxy/change-assurance/capabilities', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      if (!active()) return
      setCapabilities(payload.capabilities || [])
    }
    const [caseResult, intentResult] = await Promise.allSettled([loadCases(), loadIntents(), loadCapabilities()])
    // A superseded load must not write anything — not even its errors.
    if (!active()) return
    setCasesError(caseResult.status === 'rejected'
      ? (caseResult.reason instanceof Error ? caseResult.reason.message : 'Change Case queue failed')
      : null)
    setIntentsError(intentResult.status === 'rejected'
      ? (intentResult.reason instanceof Error ? intentResult.reason.message : 'Analyzed-change list failed')
      : null)
    setRefreshedAt(new Date())
    setLoading(false)
  }

  useEffect(() => {
    // Scope changed: drop last-known data so one tenant's cases never render
    // under another tenant's chip. Refresh (same scope) keeps stale data.
    setCases([])
    setIntents([])
    setCasesLoadedAt(null)
    setIntentsLoadedAt(null)
    setCasesError(null)
    setIntentsError(null)
    void load()
    return () => abortRef.current?.abort()
  // Reload whenever the org picker changes tenant or the system scope changes.
  // `load` intentionally remains local because Refresh reuses the same scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName, customerId])

  const scopeParams = new URLSearchParams()
  if (customerId) scopeParams.set('customer_id', customerId)
  if (systemName) scopeParams.set('system_name', systemName)
  const scopeQuery = scopeParams.size ? `?${scopeParams}` : ''
  const baselineParams = new URLSearchParams(scopeParams)
  baselineParams.set('mode', 'baseline')
  const baselineHref = `/change-queue/new?${baselineParams}`
  const initialIntentLoad = loading && intents.length === 0
  const initialCaseLoad = loading && cases.length === 0

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {showBack && <BackToDashboard
              href={customerId ? `/?${new URLSearchParams({ customer_id: customerId })}` : '/'}
              className="mt-0.5 rounded-lg p-2 transition-colors hover:bg-slate-200"
              iconClassName="h-5 w-5 text-slate-700"
            />}
            <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-700"><ClipboardList className="h-4 w-4" /> Change assurance</div>
            <h1 className="mt-2 text-3xl font-bold">Change Queue{systemName ? ` · ${systemName}` : ''}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{systemName ? `Only changes related to ${systemName} are shown. System identity follows Cyntro's case-insensitive SystemName tag boundary.` : 'Organization-wide view of every analyzed change and durable Change Case.'} Open a case to approve, execute, observe, rollback, and download its current report.</p>
            {customerId && <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">Tenant · {customerId}</span></div>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Link href={`/change-queue/new${scopeQuery}`} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> Check a change</Link>
              <Link href={baselineHref} className="flex items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50"><GitBranch className="h-4 w-4" /> Create Terraform baseline</Link>
              <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            </div>
            {refreshedAt && <span className="text-xs text-slate-500">Refreshed {refreshedAt.toLocaleTimeString()}</span>}
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-800"><GitBranch className="h-4 w-4" /> Lane 1 · Understand any proposed change</div>
            <p className="mt-2 text-sm leading-6 text-violet-950">IaC and customer-authored changes get a semantic diff, typed Neptune impact graph, observed-behavior evidence, shared-system scope, confidence gaps, approval gates, and rollback preparation.</p>
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

        <div className="mt-8 flex items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Customer-proposed changes</div><h2 className="mt-1 text-xl font-bold">Change safety checks</h2></div><Link href={`/change-queue/new${scopeQuery}`} className="text-sm font-bold text-violet-700">Check a change →</Link></div>
        {intentsError && <SectionErrorCard title="Lane 1 · analysis service unavailable" message={intentsError} staleNote={intents.length > 0 && intentsLoadedAt ? `The dossiers below are from the last successful load at ${intentsLoadedAt.toLocaleTimeString()} — they may be stale.` : undefined} onRetry={() => void load()} retrying={loading} />}
        {initialIntentLoad && !intentsError && <div className="mt-3 grid gap-3 lg:grid-cols-2">{[0, 1].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>}
        {!loading && !intentsError && intents.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No customer-authored change has been analyzed yet.</div>}
        <div className={`mt-3 grid gap-3 lg:grid-cols-2 ${intentsError ? 'opacity-60' : ''}`}>
          {intents.map(item => {
            const isBaseline = item.risk_dossier.analysis_kind === 'TERRAFORM_BASELINE_ASSURANCE'
            const isIaC = item.risk_dossier.analysis_kind === 'IAC_CHANGE_INTELLIGENCE' || isBaseline
            const sourceLabel = item.risk_dossier.source_artifact?.kind === 'TERRAFORM_PLAN_JSON' ? 'Terraform' : item.risk_dossier.source_artifact?.kind === 'CLOUDFORMATION_CHANGE_SET_JSON' ? 'CloudFormation' : null
            const changeCount = item.risk_dossier.semantic_diff_summary?.total_changes || 0
            const findingCount = item.risk_dossier.finding_counts?.total || 0
            const conclusion = item.risk_dossier.analysis_conclusion?.state || item.decision.state
            return <Link key={item.intent_id} href={`/change-queue/intents/${encodeURIComponent(item.intent_id)}${scopeQuery}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-violet-700">{isBaseline ? 'Terraform · Baseline conservation' : sourceLabel ? `${sourceLabel} · Change safety check` : item.capability?.display_name || 'Dependency check only'}</div><div className="mt-1 font-semibold">{isBaseline ? `${changeCount} baseline import target${changeCount === 1 ? '' : 's'}` : isIaC ? `${changeCount} proposed resource change${changeCount === 1 ? '' : 's'}` : item.intent.change.action.replace(/_/g, ' ')}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.risk_dossier.risk_band === 'CRITICAL' ? 'bg-red-100 text-red-800' : isBaseline ? 'bg-amber-100 text-amber-800' : item.risk_dossier.risk_band === 'HIGH' ? 'bg-orange-100 text-orange-800' : item.risk_dossier.risk_band === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{isBaseline ? 'NOT READY' : item.risk_dossier.risk_band}</span></div>
              {isIaC ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.risk_dossier.analysis_conclusion?.headline}</p> : <div className="mt-2 font-mono text-xs text-slate-500">{item.intent.change.resource_type} · {item.intent.change.resource_id}</div>}
              <div className="mt-3 text-xs text-slate-600">{isIaC ? `${findingCount} findings · ${item.risk_dossier.blast_radius.direct_dependency_count} adjacent resources` : `${item.risk_dossier.blast_radius.direct_dependency_count} graph-adjacent resources`} · {item.risk_dossier.blast_radius.systems.length} systems · {item.risk_dossier.evidence_gap_count} evidence gaps</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{conclusion.replace(/_/g, ' ')}</span>
                {isIaC && item.risk_dossier.confidence?.level && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Evidence {item.risk_dossier.confidence.level}</span>}
                <span className={`rounded-full px-2 py-0.5 ${item.execution.handoff?.state === 'HANDED_OFF' ? 'bg-emerald-100 text-emerald-800' : item.execution.handoff?.available ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                  {(item.execution.handoff?.state || item.execution.state).replace(/_/g, ' ')}
                </span>
              </div>
            </Link>
          })}
        </div>

        <div className="mt-8"><div className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">Supervised execution workflows</div><h2 className="mt-1 text-xl font-bold">Change Cases</h2></div>
        {casesError && <SectionErrorCard title="Lane 2 · Change Case storage unavailable" message={casesError} staleNote={cases.length > 0 && casesLoadedAt ? `The cases below are from the last successful load at ${casesLoadedAt.toLocaleTimeString()} — they may be stale.` : undefined} onRetry={() => void load()} retrying={loading} />}
        {initialCaseLoad && !casesError && <div className="mt-3 space-y-3">{[0, 1].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>}
        {!loading && !casesError && cases.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 font-semibold">No Change Cases yet</h2>
            <p className="mt-1 text-sm text-slate-600">Only a supported managed playbook that has entered its approval workflow appears here. Risk dossiers remain separate until an execution adapter freezes the exact plan.</p>
          </div>
        )}

        <div className={`mt-6 space-y-3 ${casesError ? 'opacity-60' : ''}`}>
          {cases.map((item) => (
            <Link key={item.case_id} href={`/change-queue/${encodeURIComponent(item.case_id)}${scopeQuery}`} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 md:grid-cols-[1.4fr_1fr_auto]">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-violet-700">{item.change_kind.replace(/_/g, ' ')}</div>
                <div className="mt-1 text-lg font-semibold">{item.resource_name}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{item.sg_id || item.resource_type} · {item.case_id}</div>
                {item.resource_type === 'IAMRole' && <div className="mt-2 text-xs text-slate-600">Exact used-vs-allowed permission reduction · policy pre/post verification</div>}
              </div>
              <div className="text-sm text-slate-700">
                <div>{item.system_name} · {item.resource_type}</div>
                <div className="mt-1">{item.rules_to_change} exact change item{item.rules_to_change === 1 ? '' : 's'} · {item.evidence_complete ? 'evidence complete' : `${item.evidence_gap_count} evidence gap${item.evidence_gap_count === 1 ? '' : 's'}`}</div>
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
