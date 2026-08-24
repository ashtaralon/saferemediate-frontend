"use client"

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudCog,
  FileCode2,
  GitBranch,
  Loader2,
  LockKeyhole,
  Network,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
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

interface ArtifactFile {
  name: string
  size: number
  document: Record<string, unknown>
  summary: { changes: number; creates: number; updates: number; deletes: number; replaces: number; types: string[] }
}

type IntakeMode = 'iac' | 'manual'
type ArtifactKind = 'TERRAFORM_PLAN_JSON' | 'CLOUDFORMATION_CHANGE_SET_JSON'
type CloudFormationInput = 'change-set' | 'enriched-change-set' | 'template-pair'

const CUSTOM = 'custom.graph_analysis'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_PROXY_BODY_BYTES = 4 * 1024 * 1024

export default function AnalyzeChangePage() {
  const router = useRouter()
  const scope = useAccountScope()
  const [mode, setMode] = useState<IntakeMode>('iac')
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>('TERRAFORM_PLAN_JSON')
  const [cloudFormationInput, setCloudFormationInput] = useState<CloudFormationInput>('change-set')
  const [artifact, setArtifact] = useState<ArtifactFile | null>(null)
  const [currentTemplate, setCurrentTemplate] = useState<ArtifactFile | null>(null)
  const [proposedTemplate, setProposedTemplate] = useState<ArtifactFile | null>(null)
  const [accountId, setAccountId] = useState('')
  const [region, setRegion] = useState('')
  const [systemName, setSystemName] = useState('')
  const [lockedSystemName, setLockedSystemName] = useState(false)
  const [reason, setReason] = useState('')
  const [requestedBy, setRequestedBy] = useState('customer-operator')
  const [repository, setRepository] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [commitSha, setCommitSha] = useState('')
  const [pullRequestUrl, setPullRequestUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [selected, setSelected] = useState(CUSTOM)
  const [resourceType, setResourceType] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [action, setAction] = useState('')
  const [parameters, setParameters] = useState('{}')

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const requestedSystem = search.get('system_name')?.trim() || ''
    if (requestedSystem) {
      setSystemName(requestedSystem)
      setLockedSystemName(true)
    }
    if (scope.accountId !== 'all') setAccountId(scope.accountId)
    if (scope.region !== 'all') setRegion(scope.region)
  }, [scope.accountId, scope.region])

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
  const accountOptions = scope.options?.accounts || []
  const regionOptions = useMemo(() => {
    if (!accountId) return []
    return accountOptions.find(item => item.account_id === accountId)?.regions || []
  }, [accountId, accountOptions])
  const sourceReady = artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON'
    ? cloudFormationInput === 'template-pair'
      ? Boolean(currentTemplate && proposedTemplate)
      : cloudFormationInput === 'enriched-change-set'
        ? Boolean(artifact && currentTemplate && proposedTemplate)
        : Boolean(artifact)
    : Boolean(artifact)
  const sourceSummary = useMemo(() => {
    if (
      artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON'
      && cloudFormationInput === 'template-pair'
      && currentTemplate
      && proposedTemplate
    ) return summarizeTemplateDiff(currentTemplate.document, proposedTemplate.document)
    return artifact?.summary
  }, [artifact, artifactKind, cloudFormationInput, currentTemplate, proposedTemplate])

  const scopeParams = new URLSearchParams()
  if (scope.customerId) scopeParams.set('customer_id', scope.customerId)
  if (systemName) scopeParams.set('system_name', systemName)
  const scopeQuery = scopeParams.size ? `?${scopeParams}` : ''

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

  const setKind = (kind: ArtifactKind) => {
    setArtifactKind(kind)
    setArtifact(null)
    setCurrentTemplate(null)
    setProposedTemplate(null)
    setError(null)
  }

  const loadFile = async (file: File | undefined, target: 'artifact' | 'current' | 'proposed') => {
    if (!file) return
    setError(null)
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('The JSON file is larger than 4 MB. Split the change into separately reviewed plans.')
      const parsed = JSON.parse(await file.text())
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('The selected file must contain one JSON object.')
      const next: ArtifactFile = {
        name: file.name,
        size: file.size,
        document: parsed as Record<string, unknown>,
        summary: summarizeArtifact(parsed as Record<string, unknown>),
      }
      if (target === 'artifact') setArtifact(next)
      if (target === 'current') setCurrentTemplate(next)
      if (target === 'proposed') setProposedTemplate(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected file is not valid JSON.')
    }
  }

  const submitIaC = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!sourceReady) {
      setError('Attach the change artifact before analysis.')
      return
    }
    if (!/^\d{12}$/.test(accountId)) {
      setError('Choose the exact 12-digit AWS account. Cyntro will not infer it from provider configuration.')
      return
    }
    if (!region) {
      setError('Choose the exact AWS region for graph matching and live preflight.')
      return
    }
    const document = artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON'
      ? cloudFormationInput === 'template-pair'
        ? { current_template: currentTemplate?.document, proposed_template: proposedTemplate?.document }
        : cloudFormationInput === 'enriched-change-set'
          ? { change_set: artifact?.document, current_template: currentTemplate?.document, proposed_template: proposedTemplate?.document }
          : artifact?.document
      : artifact?.document
    const requestBody = JSON.stringify({
      scope: {
        customer_id: scope.customerId || undefined,
        account_id: accountId,
        region,
        system_name: systemName || undefined,
      },
      artifact: {
        kind: artifactKind,
        document,
        repository: repository || undefined,
        workspace: workspace || undefined,
        commit_sha: commitSha || undefined,
        pull_request_url: pullRequestUrl || undefined,
      },
      reason,
      requested_by: requestedBy,
    })
    if (new Blob([requestBody]).size > MAX_PROXY_BODY_BYTES) {
      setError('The combined analysis request is larger than 4 MB. Split the change into separately reviewed plans.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/proxy/change-assurance/intents/analyze-iac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(readError(payload, 'Change analysis failed'))
      router.push(`/change-queue/intents/${encodeURIComponent(payload.intent_id)}${scopeQuery}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const submitManual = async (event: FormEvent) => {
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
            account_id: accountId || undefined,
            region: region || undefined,
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
      if (!response.ok) throw new Error(readError(payload, 'Change analysis failed'))
      router.push(`/change-queue/intents/${encodeURIComponent(payload.intent_id)}${scopeQuery}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Link href={`/change-queue${scopeQuery}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowLeft className="h-4 w-4" /> Change Queue</Link>

        <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><GitBranch className="h-4 w-4" /> Pre-deployment change check</div>
            <h1 className="mt-2 text-3xl font-bold">Will this change break anything?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Upload a Terraform plan or CloudFormation change. Cyntro checks the proposed changes against the current cloud configuration, dependencies, permissions, and observed behavior to show what could break—and what cannot yet be verified—before deployment.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><strong className="text-slate-900">Analysis only.</strong> Nothing here changes AWS.</div>
        </header>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => { setMode('iac'); setError(null) }} className={`rounded-2xl border p-5 text-left transition ${mode === 'iac' ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:border-violet-200'}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><FileCode2 className="h-5 w-5 text-violet-700" /> Check an IaC plan for breaking changes <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] uppercase text-violet-800">Recommended</span></div>
            <p className="mt-2 text-sm text-slate-600">Terraform plan or CloudFormation change set/current-vs-proposed templates. Cyntro checks every proposed resource change against live dependencies.</p>
          </button>
          <button type="button" onClick={() => { setMode('manual'); setError(null) }} className={`rounded-2xl border p-5 text-left transition ${mode === 'manual' ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:border-violet-200'}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><CloudCog className="h-5 w-5 text-violet-700" /> Check one manual change</div>
            <p className="mt-2 text-sm text-slate-600">Describe one exact AWS resource change and check whether it could break a workload or system.</p>
          </button>
        </div>

        {mode === 'iac' ? (
          <form onSubmit={submitIaC} className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_.75fr]">
            <div className="space-y-5">
              <Panel step="1" title="Proposed change source" subtitle="The plan describes what will change; Cyntro checks it against the current operational environment.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SourceChoice selected={artifactKind === 'TERRAFORM_PLAN_JSON'} icon={<FileCode2 className="h-5 w-5" />} title="Terraform plan JSON" detail="terraform show -json tf.plan" onClick={() => setKind('TERRAFORM_PLAN_JSON')} />
                  <SourceChoice selected={artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON'} icon={<CloudCog className="h-5 w-5" />} title="CloudFormation" detail="Evaluated change set or template pair" onClick={() => setKind('CLOUDFORMATION_CHANGE_SET_JSON')} />
                </div>

                {artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON' && (
                  <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="CloudFormation input type">
                    <ModeChip selected={cloudFormationInput === 'change-set'} onClick={() => { setCloudFormationInput('change-set'); setArtifact(null) }}>Evaluated change set</ModeChip>
                    <ModeChip selected={cloudFormationInput === 'enriched-change-set'} onClick={() => { setCloudFormationInput('enriched-change-set'); setArtifact(null); setCurrentTemplate(null); setProposedTemplate(null) }}>Change set + templates</ModeChip>
                    <ModeChip selected={cloudFormationInput === 'template-pair'} onClick={() => { setCloudFormationInput('template-pair'); setCurrentTemplate(null); setProposedTemplate(null) }}>Current + proposed templates</ModeChip>
                  </div>
                )}

                {artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON' && cloudFormationInput === 'enriched-change-set' ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><FileDrop label="DescribeChangeSet JSON" file={artifact} onFile={file => void loadFile(file, 'artifact')} /></div>
                    <FileDrop label="Current template" file={currentTemplate} onFile={file => void loadFile(file, 'current')} />
                    <FileDrop label="Proposed template" file={proposedTemplate} onFile={file => void loadFile(file, 'proposed')} />
                    <p className="sm:col-span-2 text-xs leading-5 text-emerald-800">Best evidence: the evaluated change set supplies replacement semantics while the templates supply the redacted before/after property diff.</p>
                  </div>
                ) : artifactKind === 'CLOUDFORMATION_CHANGE_SET_JSON' && cloudFormationInput === 'template-pair' ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <FileDrop label="Current template" file={currentTemplate} onFile={file => void loadFile(file, 'current')} />
                    <FileDrop label="Proposed template" file={proposedTemplate} onFile={file => void loadFile(file, 'proposed')} />
                    <p className="sm:col-span-2 text-xs leading-5 text-amber-800">Template comparison cannot prove replacement behavior. Cyntro will block approval until an evaluated CloudFormation change set is supplied.</p>
                  </div>
                ) : (
                  <div className="mt-4"><FileDrop label={artifactKind === 'TERRAFORM_PLAN_JSON' ? 'Terraform plan JSON' : 'DescribeChangeSet JSON'} file={artifact} onFile={file => void loadFile(file, 'artifact')} /></div>
                )}

                {sourceReady && sourceSummary && (
                  <div className="mt-4 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-5">
                    <MiniMetric label="Changes" value={sourceSummary.changes} />
                    <MiniMetric label="Create" value={sourceSummary.creates} />
                    <MiniMetric label="Update" value={sourceSummary.updates} />
                    <MiniMetric label="Delete" value={sourceSummary.deletes} />
                    <MiniMetric label="Replace" value={sourceSummary.replaces} />
                    {sourceSummary.types.length > 0 && <p className="sm:col-span-5 mt-1 text-xs text-emerald-900"><strong>Detected types:</strong> {sourceSummary.types.slice(0, 8).join(', ')}</p>}
                  </div>
                )}
              </Panel>

              <Panel step="2" title="Exact cloud scope" subtitle="Account and region are mandatory. A wrong scope means a wrong graph.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">AWS account
                    {accountOptions.length > 0 ? (
                      <select required value={accountId} onChange={event => { setAccountId(event.target.value); setRegion('') }} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
                        <option value="">Choose exact account</option>
                        {accountOptions.map(item => <option key={item.account_id} value={item.account_id}>{item.display_name} · {item.account_id}</option>)}
                      </select>
                    ) : <input required pattern="\d{12}" value={accountId} onChange={event => setAccountId(event.target.value)} placeholder="123456789012" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm font-normal" />}
                  </label>
                  <label className="text-sm font-semibold">AWS region
                    {regionOptions.length > 0 ? (
                      <select required value={region} onChange={event => setRegion(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"><option value="">Choose exact region</option>{regionOptions.map(item => <option key={item}>{item}</option>)}</select>
                    ) : <input required value={region} onChange={event => setRegion(event.target.value)} placeholder="eu-west-1" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm font-normal" />}
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">Business system <span className="font-normal text-slate-400">{lockedSystemName ? 'scoped from the system page' : 'optional review boundary'}</span><input value={systemName} readOnly={lockedSystemName} onChange={event => setSystemName(event.target.value)} placeholder="payment-production" className={`mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal ${lockedSystemName ? 'bg-slate-100 text-slate-700' : ''}`} /></label>
                </div>
              </Panel>

              <Panel step="3" title="Change context" subtitle="Give reviewers enough ownership and intent to make a decision.">
                <label className="block text-sm font-semibold">Why is this change needed?<textarea required minLength={8} value={reason} onChange={event => setReason(event.target.value)} placeholder="Upgrade, security control, incident prevention, architecture change…" className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Requested by<input required minLength={2} value={requestedBy} onChange={event => setRequestedBy(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                  <label className="text-sm font-semibold">Repository <span className="font-normal text-slate-400">optional</span><input value={repository} onChange={event => setRepository(event.target.value)} placeholder="org/platform-infra" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                  <label className="text-sm font-semibold">Workspace / stack <span className="font-normal text-slate-400">optional</span><input value={workspace} onChange={event => setWorkspace(event.target.value)} placeholder="payments-prod" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                  <label className="text-sm font-semibold">Commit SHA <span className="font-normal text-slate-400">optional</span><input value={commitSha} onChange={event => setCommitSha(event.target.value)} placeholder="a1b2c3d" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Pull request URL <span className="font-normal text-slate-400">optional</span><input type="url" value={pullRequestUrl} onChange={event => setPullRequestUrl(event.target.value)} placeholder="https://…" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                </div>
              </Panel>

              {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
              <button disabled={loading || !sourceReady} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {loading ? 'Checking dependencies and evidence…' : 'Check for breaking changes'}</button>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-900"><Network className="h-4 w-4" /> Cyntro data used</div>
                <ul className="mt-3 space-y-2 text-sm leading-5 text-violet-950"><li>Current configuration and attachments</li><li>Observed traffic, API calls, identity use, and data access</li><li>Shared resources and SystemName ownership</li><li>Derived reachability and attack paths</li><li>Evidence provenance, freshness, coverage, and gaps</li></ul>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-900"><LockKeyhole className="h-4 w-4" /> Secret-minimized intake</div>
                <p className="mt-3 text-sm leading-6 text-emerald-950">Cyntro retains only an allowlisted semantic slice and artifact fingerprint. Raw plan/template content, state, credentials, environment values, and secret values are not stored in the dossier.</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-900"><AlertTriangle className="h-4 w-4" /> Honest conclusion</div>
                <p className="mt-3 text-sm leading-6 text-amber-950">The result distinguishes IaC-proven facts, configured topology, observed runtime behavior, graph inference, and unknowns. “No rows” is never shown as “safe.”</p>
              </div>
            </aside>
          </form>
        ) : (
          <form onSubmit={submitManual} className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><CloudCog className="h-4 w-4" /> Exact resource change</div>
              <h2 className="mt-2 text-2xl font-bold">Check one AWS change for breakage</h2>
              <label className="mt-6 block text-sm font-semibold">Change model</label>
              <select value={selected} onChange={event => chooseCapability(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
                <option value={CUSTOM}>Other AWS change — graph impact only</option>
                {capabilities.map(item => <option key={item.capability_id} value={item.capability_id}>{item.display_name}</option>)}
              </select>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold">Resource type<input required value={resourceType} onChange={event => setResourceType(event.target.value)} placeholder="SecurityGroup" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
                <label className="text-sm font-semibold">Exact resource ID or ARN<input required value={resourceId} onChange={event => setResourceId(event.target.value)} placeholder="sg-0123456789" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" /></label>
                <label className="text-sm font-semibold">Action{capability ? <select required value={action} onChange={event => setAction(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">{capability.actions.map(item => <option key={item}>{item}</option>)}</select> : <input required value={action} onChange={event => setAction(event.target.value)} placeholder="wafv2:UpdateWebACL" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" />}</label>
                <label className="text-sm font-semibold">Business system <span className="font-normal text-slate-400">optional</span><input value={systemName} readOnly={lockedSystemName} onChange={event => setSystemName(event.target.value)} className={`mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal ${lockedSystemName ? 'bg-slate-100' : ''}`} /></label>
                <label className="text-sm font-semibold">Account <span className="font-normal text-slate-400">recommended</span><input value={accountId} onChange={event => setAccountId(event.target.value)} placeholder="123456789012" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" /></label>
                <label className="text-sm font-semibold">Region <span className="font-normal text-slate-400">recommended</span><input value={region} onChange={event => setRegion(event.target.value)} placeholder="eu-west-1" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" /></label>
              </div>
              <label className="mt-4 block text-sm font-semibold">Why is this change needed?<textarea required minLength={8} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
              <label className="mt-4 block text-sm font-semibold">Exact parameters <span className="font-normal text-slate-400">JSON</span><textarea value={parameters} onChange={event => setParameters(event.target.value)} className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 bg-slate-950 px-3 py-3 font-mono text-xs font-normal text-slate-100" /></label>
              {capability && <p className="mt-2 text-xs text-slate-500">Required: {(capability.required_parameters_by_action?.[action] || capability.required_parameters).join(', ') || 'no additional parameters'}.</p>}
              <label className="mt-4 block text-sm font-semibold">Requested by<input required minLength={2} value={requestedBy} onChange={event => setRequestedBy(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>
              {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
              <button disabled={loading} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Analyze exact resource</button>
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="text-xs font-bold uppercase tracking-wide text-emerald-900">Best for</div><p className="mt-3 text-sm leading-6 text-emerald-950">An emergency/manual change or one of Cyntro's exact managed IAM, SG, S3, or private-path workflows.</p></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="text-xs font-bold uppercase tracking-wide text-amber-900">Execution boundary</div><p className="mt-3 text-sm leading-6 text-amber-950">Only managed capabilities can create a supervised Change Case. This dossier is never AWS mutation authority.</p></div>
            </aside>
          </form>
        )}
      </div>
    </main>
  )
}

function Panel({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-800">{step}</div><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div></div><div className="mt-5">{children}</div></section>
}

function SourceChoice({ selected, icon, title, detail, onClick }: { selected: boolean; icon: React.ReactNode; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left ${selected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-200'}`}><div className="flex items-center gap-2 font-semibold">{icon}{title}{selected && <CheckCircle2 className="ml-auto h-4 w-4 text-violet-700" />}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{detail}</div></button>
}

function ModeChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? 'border-violet-400 bg-violet-100 text-violet-900' : 'border-slate-300 bg-white text-slate-600'}`}>{children}</button>
}

function FileDrop({ label, file, onFile }: { label: string; file: ArtifactFile | null; onFile: (file: File | undefined) => void }) {
  return <label className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-violet-300 hover:bg-violet-50'}`}><input type="file" accept="application/json,.json" className="sr-only" onChange={event => onFile(event.target.files?.[0])} />{file ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : <UploadCloud className="h-6 w-6 text-slate-500" />}<div className="mt-2 text-sm font-bold">{file?.name || label}</div><div className="mt-1 text-xs text-slate-500">{file ? `${formatBytes(file.size)} · click to replace` : 'Choose a JSON file · maximum 4 MB'}</div></label>
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{label}</div><div className="mt-1 text-lg font-black text-emerald-950">{value}</div></div>
}

function summarizeArtifact(document: Record<string, unknown>): ArtifactFile['summary'] {
  const terraformRows = Array.isArray(document.resource_changes) ? document.resource_changes : null
  const cloudFormationRows = Array.isArray(document.Changes) ? document.Changes : null
  const templateResources = document.Resources && typeof document.Resources === 'object' && !Array.isArray(document.Resources)
    ? Object.entries(document.Resources as Record<string, unknown>)
    : []
  let changes = 0
  let creates = 0
  let updates = 0
  let deletes = 0
  let replaces = 0
  const types = new Set<string>()
  if (terraformRows) {
    for (const row of terraformRows) {
      if (!row || typeof row !== 'object') continue
      const item = row as Record<string, unknown>
      const change = item.change && typeof item.change === 'object' ? item.change as Record<string, unknown> : {}
      const actions = Array.isArray(change.actions) ? change.actions.map(String) : []
      if (actions.length === 0 || actions.every(action => action === 'no-op')) continue
      changes += 1
      if (actions.includes('create') && actions.includes('delete')) replaces += 1
      else if (actions.includes('create')) creates += 1
      else if (actions.includes('delete')) deletes += 1
      else updates += 1
      if (typeof item.type === 'string') types.add(item.type)
    }
  } else if (cloudFormationRows) {
    for (const wrapper of cloudFormationRows) {
      const resource = wrapper && typeof wrapper === 'object' ? (wrapper as Record<string, unknown>).ResourceChange : null
      if (!resource || typeof resource !== 'object') continue
      const row = resource as Record<string, unknown>
      changes += 1
      const action = String(row.Action || 'Modify')
      const replacement = String(row.Replacement || 'False')
      if (replacement === 'True' || replacement === 'Conditional') replaces += 1
      else if (action === 'Add') creates += 1
      else if (action === 'Remove') deletes += 1
      else updates += 1
      if (typeof row.ResourceType === 'string') types.add(row.ResourceType)
    }
  } else if (templateResources.length > 0) {
    changes = templateResources.length
    updates = changes
    for (const [, value] of templateResources) {
      if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).Type === 'string') types.add(String((value as Record<string, unknown>).Type))
    }
  }
  return { changes, creates, updates, deletes, replaces, types: Array.from(types).sort() }
}

function summarizeTemplateDiff(current: Record<string, unknown>, proposed: Record<string, unknown>): ArtifactFile['summary'] {
  const currentResources = current.Resources && typeof current.Resources === 'object' && !Array.isArray(current.Resources)
    ? current.Resources as Record<string, unknown>
    : {}
  const proposedResources = proposed.Resources && typeof proposed.Resources === 'object' && !Array.isArray(proposed.Resources)
    ? proposed.Resources as Record<string, unknown>
    : {}
  const logicalIds = new Set([...Object.keys(currentResources), ...Object.keys(proposedResources)])
  let creates = 0
  let updates = 0
  let deletes = 0
  const types = new Set<string>()
  for (const logicalId of logicalIds) {
    const before = currentResources[logicalId]
    const after = proposedResources[logicalId]
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    if (before === undefined) creates += 1
    else if (after === undefined) deletes += 1
    else updates += 1
    const row = (after || before) as Record<string, unknown> | undefined
    if (row && typeof row.Type === 'string') types.add(row.Type)
  }
  return { changes: creates + updates + deletes, creates, updates, deletes, replaces: 0, types: Array.from(types).sort() }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function readError(payload: Record<string, unknown>, fallback: string): string {
  const detail = payload.detail || payload.error
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => typeof item === 'object' && item && 'msg' in item ? String((item as { msg: unknown }).msg) : String(item)).join('; ')
  return fallback
}
