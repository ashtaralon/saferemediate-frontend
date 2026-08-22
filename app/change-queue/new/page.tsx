"use client"

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, GitBranch, Loader2, ShieldCheck } from 'lucide-react'
import { useAccountScope } from '@/lib/account-scope-context'
import { withAccountScope } from '@/lib/account-scope'
import {
  buildAnalyzePayload,
  buildChangeParameters,
  ParameterOption,
  requiredParameterKeys,
  toggleSelection,
} from '@/lib/change-assurance-form'

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

interface ChangeTarget {
  resource_type: string
  resource_id: string
  display_name: string
  account_id: string
  arn: string
  resource_uid: string
  system_name: string
  selector_value: string
}

interface SystemRow {
  name?: string
  system_name?: string
  SystemName?: string
}

const CUSTOM = 'custom.graph_analysis'

function systemLabel(row: SystemRow): string {
  return String(row.system_name || row.SystemName || row.name || '').trim()
}

export default function AnalyzeChangePage() {
  const router = useRouter()
  const scope = useAccountScope()
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [systems, setSystems] = useState<string[]>([])
  const [discoveredTypes, setDiscoveredTypes] = useState<string[]>([])
  const [targets, setTargets] = useState<ChangeTarget[]>([])
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [selected, setSelected] = useState(CUSTOM)
  const [resourceType, setResourceType] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [action, setAction] = useState('')
  const [systemName, setSystemName] = useState('')
  const [lockedSystemName, setLockedSystemName] = useState(false)
  const [reason, setReason] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [selectedPolicyArns, setSelectedPolicyArns] = useState<string[]>([])
  const [selectedPolicyNames, setSelectedPolicyNames] = useState<string[]>([])
  const [selectedStatementIds, setSelectedStatementIds] = useState<string[]>([])
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])
  const [parameterOptions, setParameterOptions] = useState<Record<string, ParameterOption[]>>({})
  const [optionsCoverage, setOptionsCoverage] = useState<Record<string, string>>({})
  const [permissionDisclaimer, setPermissionDisclaimer] = useState<string | null>(null)
  const [vpcId, setVpcId] = useState('')
  const [bucketName, setBucketName] = useState('')
  const [policyChangeJson, setPolicyChangeJson] = useState('{}')
  const [customParameters, setCustomParameters] = useState('{}')
  const [requestedBy, setRequestedBy] = useState('customer-operator')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const requestedSystem = new URLSearchParams(window.location.search).get('system_name')?.trim() || ''
    if (requestedSystem) {
      setSystemName(requestedSystem)
      setLockedSystemName(true)
    }
    fetch('/api/proxy/change-assurance/capabilities', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Capability catalogue failed')
        setCapabilities(payload.capabilities || [])
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Capability catalogue failed'))

    if (!requestedSystem) {
      fetch(withAccountScope('/api/proxy/systems', scope), { cache: 'no-store' })
        .then(async response => {
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) return
          const rows = (payload.systems || payload || []) as SystemRow[]
          const names = Array.from(new Set(rows.map(systemLabel).filter(Boolean))).sort((a, b) => a.localeCompare(b))
          setSystems(names)
        })
        .catch(() => undefined)
    }
  }, [scope.customerId, scope.groupId, scope.accountId, scope.region])

  const capability = useMemo(
    () => capabilities.find(item => item.capability_id === selected),
    [capabilities, selected],
  )
  const managed = Boolean(capability)
  const scopeParams = new URLSearchParams()
  if (scope.customerId) scopeParams.set('customer_id', scope.customerId)
  if (systemName) scopeParams.set('system_name', systemName)
  const scopeQuery = scopeParams.size ? `?${scopeParams}` : ''

  useEffect(() => {
    if (!systemName) {
      setTargets([])
      setDiscoveredTypes([])
      return
    }
    let cancelled = false
    const query = new URLSearchParams({ system_name: systemName })
    if (selected !== CUSTOM) query.set('capability_id', selected)
    if (resourceType) query.set('resource_type', resourceType)
    if (!managed && !resourceType) query.set('discover_types', 'true')
    if (scope.customerId) query.set('customer_id', scope.customerId)
    if (scope.accountId && scope.accountId !== 'all') query.set('account_id', scope.accountId)
    setTargetsLoading(true)
    fetch(`/api/proxy/change-assurance/targets?${query}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Target inventory failed')
        if (cancelled) return
        setDiscoveredTypes(payload.resource_types || [])
        setTargets(payload.targets || [])
      })
      .catch(cause => {
        if (cancelled) return
        setTargets([])
        setDiscoveredTypes([])
        setError(cause instanceof Error ? cause.message : 'Target inventory failed')
      })
      .finally(() => {
        if (!cancelled) setTargetsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [systemName, selected, resourceType, managed, scope.customerId, scope.accountId])

  useEffect(() => {
    if (!managed || !systemName || !resourceId || !resourceType || !action) {
      setParameterOptions({})
      setOptionsCoverage({})
      setPermissionDisclaimer(null)
      return
    }
    let cancelled = false
    const query = new URLSearchParams({
      system_name: systemName,
      resource_id: resourceId,
      resource_type: resourceType,
      action,
      capability_id: selected,
    })
    if (scope.customerId) query.set('customer_id', scope.customerId)
    if (scope.accountId && scope.accountId !== 'all') query.set('account_id', scope.accountId)
    fetch(`/api/proxy/change-assurance/targets/options?${query}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.detail || 'Target options failed')
        if (cancelled) return
        setParameterOptions(payload.parameter_options || {})
        setOptionsCoverage(payload.coverage || {})
        setPermissionDisclaimer(payload.permission_evidence?.disclaimer || null)
        const vpcs = payload.parameter_options?.vpc_id || []
        if (vpcs[0]?.value && typeof vpcs[0].value === 'string') setVpcId(vpcs[0].value)
        const buckets = payload.parameter_options?.bucket_name || []
        if (buckets[0]?.value && typeof buckets[0].value === 'string') setBucketName(buckets[0].value)
      })
      .catch(cause => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Target options failed')
      })
    return () => {
      cancelled = true
    }
  }, [managed, systemName, resourceId, resourceType, action, selected, scope.customerId, scope.accountId])

  const chooseCapability = (id: string) => {
    setSelected(id)
    setResourceId('')
    setResourceType('')
    setSelectedPermissions([])
    setSelectedPolicyArns([])
    setSelectedPolicyNames([])
    setSelectedStatementIds([])
    setSelectedRuleIds([])
    setError(null)
    const next = capabilities.find(item => item.capability_id === id)
    if (next) {
      setResourceType(next.resource_types[0] || '')
      setAction(next.actions[0] || '')
    } else {
      setAction('')
    }
  }

  const chooseTarget = (selector: string) => {
    const target = targets.find(item => item.selector_value === selector)
    if (!target) {
      setResourceId('')
      return
    }
    setResourceId(target.selector_value)
    setResourceType(target.resource_type)
    setSelectedPermissions([])
    setSelectedPolicyArns([])
    setSelectedPolicyNames([])
    setSelectedStatementIds([])
    setSelectedRuleIds([])
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!systemName.trim()) {
      setError('Select a business system before analyzing a change.')
      return
    }
    if (!resourceId.trim() || !resourceType.trim()) {
      setError('Select a graph resource type and target from the system inventory.')
      return
    }
    let parameters: Record<string, unknown>
    try {
      parameters = buildChangeParameters({
        capability: capability || null,
        action,
        selectedPermissions,
        selectedPolicyArns,
        selectedPolicyNames,
        selectedStatementIds,
        selectedRuleIds,
        ruleOptions: parameterOptions.rules || [],
        vpcId,
        bucketName,
        policyChangeJson,
        customParametersJson: customParameters,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Parameters are invalid')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/proxy/change-assurance/intents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAnalyzePayload({
          customerId: scope.customerId,
          accountId: scope.accountId,
          region: scope.region,
          systemName,
          resourceType,
          resourceId,
          action,
          reason,
          requestedBy,
          parameters,
        })),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Change analysis failed')
      router.push(`/change-queue/intents/${encodeURIComponent(payload.intent_id)}${scopeQuery}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const keys = requiredParameterKeys(capability, action)
  const resourceTypeOptions = managed
    ? (capability?.resource_types || [])
    : discoveredTypes

  const optionList = (key: string) => parameterOptions[key] || []

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <Link href={`/change-queue${scopeQuery}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowLeft className="h-4 w-4" /> Change Queue</Link>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><GitBranch className="h-4 w-4" /> Customer change intent</div>
            <h1 className="mt-2 text-3xl font-bold">Analyze a proposed AWS change</h1>
            {lockedSystemName ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-900" data-testid="system-context-chip">
                System · {systemName}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">Pick the system and inventory target first. Cyntro resolves that exact graph node and never executes AWS changes from this form.</p>
            )}

            {!lockedSystemName && (
              <label className="mt-6 block text-sm font-semibold">Business system
                <select
                  required
                  value={systemName}
                  onChange={event => {
                    setSystemName(event.target.value)
                    setResourceId('')
                    setResourceType('')
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                >
                  <option value="">Select a system…</option>
                  {systems.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            )}

            <label className={`${lockedSystemName ? 'mt-6' : 'mt-4'} block text-sm font-semibold`}>Change model</label>
            <select value={selected} onChange={event => chooseCapability(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              <option value={CUSTOM}>Other AWS change — graph impact only</option>
              {capabilities.map(item => <option key={item.capability_id} value={item.capability_id}>{item.display_name}</option>)}
            </select>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">Resource type
                <select
                  required
                  value={resourceType}
                  onChange={event => {
                    setResourceType(event.target.value)
                    setResourceId('')
                  }}
                  disabled={!systemName || (!managed && discoveredTypes.length === 0 && targetsLoading)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                >
                  <option value="">{!systemName ? 'Select a system first…' : targetsLoading ? 'Loading types…' : 'Select type…'}</option>
                  {resourceTypeOptions.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Graph target
                <select
                  required
                  value={resourceId}
                  onChange={event => chooseTarget(event.target.value)}
                  disabled={!resourceType || targetsLoading || targets.length === 0}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-mono text-xs font-normal"
                >
                  <option value="">{targetsLoading ? 'Loading inventory…' : targets.length ? 'Select resource…' : 'No matching resources in this system'}</option>
                  {targets.map(item => (
                    <option key={item.selector_value} value={item.selector_value}>
                      {item.display_name} · {item.selector_value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">Action
                {capability ? (
                  <select required value={action} onChange={event => setAction(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
                    {capability.actions.map(item => <option key={item}>{item}</option>)}
                  </select>
                ) : <input required value={action} onChange={event => setAction(event.target.value)} placeholder="wafv2:UpdateWebACL" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs font-normal" />}
              </label>
              <div className="self-end pb-3 text-sm text-slate-500">
                {targetsLoading ? 'Refreshing system inventory…' : systemName ? `${targets.length} selectable target${targets.length === 1 ? '' : 's'}` : 'Choose a system to load inventory'}
              </div>
            </div>

            <label className="mt-4 block text-sm font-semibold">Why is this change needed?<textarea required minLength={8} value={reason} onChange={event => setReason(event.target.value)} placeholder="Security, compliance, upgrade, cost reduction, incident prevention…" className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>

            {capability ? (
              <div className="mt-4 space-y-4">
                <div className="text-sm font-semibold">Exact change parameters</div>
                {keys.includes('permissions') && (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">Permissions to remove</legend>
                    {permissionDisclaimer && (
                      <p className="mb-2 text-xs text-amber-900" data-testid="permission-evidence-disclaimer">{permissionDisclaimer}</p>
                    )}
                    {optionList('permissions').length === 0 ? (
                      <p className="text-xs text-amber-800">No unused permissions in graph evidence ({optionsCoverage.permissions || 'EMPTY'}).</p>
                    ) : optionList('permissions').map(item => (
                      <label key={String(item.value)} className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedPermissions.includes(String(item.value))} onChange={() => setSelectedPermissions(toggleSelection(selectedPermissions, String(item.value)))} />
                        <span className="font-mono text-xs">{item.label}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {keys.includes('policy_arns') && (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">Managed policies</legend>
                    {optionList('policy_arns').length === 0 ? (
                      <p className="text-xs text-amber-800">No attached managed policies found in graph evidence.</p>
                    ) : optionList('policy_arns').map(item => (
                      <label key={String(item.value)} className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedPolicyArns.includes(String(item.value))} onChange={() => setSelectedPolicyArns(toggleSelection(selectedPolicyArns, String(item.value)))} />
                        <span className="font-mono text-xs">{item.label}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {keys.includes('policy_names') && (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">Inline policies</legend>
                    {optionList('policy_names').length === 0 ? (
                      <p className="text-xs text-amber-800">No inline policy names found in graph evidence.</p>
                    ) : optionList('policy_names').map(item => (
                      <label key={String(item.value)} className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedPolicyNames.includes(String(item.value))} onChange={() => setSelectedPolicyNames(toggleSelection(selectedPolicyNames, String(item.value)))} />
                        <span className="font-mono text-xs">{item.label}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {keys.includes('statement_ids') && (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">Bucket policy statement IDs</legend>
                    {optionList('statement_ids').length === 0 ? (
                      <p className="text-xs text-amber-800">No statement IDs found on the graph policy document.</p>
                    ) : optionList('statement_ids').map(item => (
                      <label key={String(item.value)} className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedStatementIds.includes(String(item.value))} onChange={() => setSelectedStatementIds(toggleSelection(selectedStatementIds, String(item.value)))} />
                        <span className="font-mono text-xs">{item.label}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {keys.includes('rules') && (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold">Security group rules</legend>
                    {optionList('rules').length === 0 ? (
                      <p className="text-xs text-amber-800">No inbound rules found in graph evidence for this SG.</p>
                    ) : optionList('rules').map(item => {
                      const id = item.rule_id || item.label
                      return (
                        <label key={id} className="mt-2 flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={selectedRuleIds.includes(id)} onChange={() => setSelectedRuleIds(toggleSelection(selectedRuleIds, id))} />
                          <span className="font-mono text-xs">{id}</span>
                        </label>
                      )
                    })}
                  </fieldset>
                )}
                {keys.includes('vpc_id') && (
                  <label className="block text-sm font-semibold">VPC
                    {optionList('vpc_id').length > 0 ? (
                      <select value={vpcId} onChange={event => setVpcId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-mono text-xs font-normal">
                        {optionList('vpc_id').map(item => <option key={String(item.value)} value={String(item.value)}>{item.label}</option>)}
                      </select>
                    ) : (
                      <p className="mt-2 text-xs text-amber-800">No VPC linkage found on this target in the graph.</p>
                    )}
                  </label>
                )}
                {keys.includes('bucket_name') && (
                  <label className="block text-sm font-semibold">Bucket
                    <input value={bucketName} readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-3 font-normal text-slate-700" />
                  </label>
                )}
                {keys.includes('policy_change') && (
                  <label className="block text-sm font-semibold">Policy change <span className="font-normal text-slate-400">JSON object</span>
                    <textarea value={policyChangeJson} onChange={event => setPolicyChangeJson(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 bg-slate-950 px-3 py-3 font-mono text-xs font-normal text-slate-100" />
                  </label>
                )}
                <p className="text-xs text-slate-500">This model requires: {keys.join(', ') || 'no extra parameters'}.</p>
              </div>
            ) : (
              <label className="mt-4 block text-sm font-semibold">Exact change parameters <span className="font-normal text-slate-400">JSON</span>
                <textarea value={customParameters} onChange={event => setCustomParameters(event.target.value)} className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 bg-slate-950 px-3 py-3 font-mono text-xs font-normal text-slate-100" />
              </label>
            )}

            <label className="mt-4 block text-sm font-semibold">Requested by<input required minLength={2} value={requestedBy} onChange={event => setRequestedBy(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>

            {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
            <button disabled={loading} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Analyze and save dossier</button>
          </form>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">Selector contract</div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950"><li>System first (chip when opened from a system page)</li><li>Types and targets come from that system&apos;s graph inventory</li><li>Managed action fields are evidence-backed checklists</li><li>Analyze still never mutates AWS</li></ul>
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
