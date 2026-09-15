"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Building2, Loader2, Network, PlugZap, Search } from "lucide-react"
import {
  attachRole,
  createBinding,
  intentIdentity,
  isPending,
  listBindings,
  listChildren,
  readDiscovery,
  readInstallationPlan,
  submitOperation,
  type Binding,
  type BindingPurpose,
  type Discovery,
  type InstallationPlan,
  type IntentIdentity,
  type Operation,
} from "@/lib/account-onboarding"
import { organizationTree, previewScope, type OrganizationTreeNode } from "@/lib/organization-scope"
import { OperationCard, StatusPill } from "@/components/settings/onboarding-operation-card"
import { BindingSummary, ExternalIdOnce, InstallationPlanView } from "@/components/settings/onboarding-plan"
import { roleArnProblem, parseRegions } from "@/components/settings/single-account-onboarding"
import { errorText, useTrackedOperation } from "@/components/settings/use-tracked-operation"

const ROLE_NAME = /^[A-Za-z0-9+=,.@_-]{1,64}$/

function UnitNode({
  node,
  depth,
  ancestorSelected = false,
  selectedUnits,
  selectedAccounts,
  excluded,
  coveredByUnit,
  onToggleUnit,
  onToggleAccount,
}: {
  node: OrganizationTreeNode
  depth: number
  ancestorSelected?: boolean
  selectedUnits: Set<string>
  selectedAccounts: Set<string>
  excluded: Set<string>
  coveredByUnit: (accountParent: string) => boolean
  onToggleUnit: (id: string) => void
  onToggleAccount: (id: string, parent: string) => void
}) {
  return (
    <li>
      <label className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: depth * 16 }}>
        {node.kind === "unit" ? (
          <input
            type="checkbox"
            aria-label={`Organizational unit ${node.name}`}
            className="h-4 w-4 accent-teal-600"
            checked={ancestorSelected || selectedUnits.has(node.id)}
            disabled={ancestorSelected}
            onChange={() => onToggleUnit(node.id)}
          />
        ) : <Network className="h-4 w-4 text-slate-400" />}
        <span className="font-semibold">{node.name}</span>
        <span className="font-mono text-[10px] text-slate-400">{node.id}</span>
        {ancestorSelected ? <span className="text-[10px] text-teal-700">included by parent OU</span> : null}
      </label>
      <ul>
        {node.accounts.map((account) => {
          const active = account.status === "ACTIVE"
          const viaUnit = coveredByUnit(account.parent_id)
          const checked = active && ((viaUnit && !excluded.has(account.account_id)) || selectedAccounts.has(account.account_id))
          return (
            <li key={account.account_id}>
              <label className={`flex items-center gap-2 py-1 text-sm ${active ? "" : "text-slate-400"}`} style={{ paddingLeft: (depth + 1) * 16 }}>
                <input
                  type="checkbox"
                  aria-label={`Account ${account.name || account.account_id} ${account.account_id}`}
                  className="h-4 w-4 accent-teal-600"
                  checked={checked}
                  disabled={!active}
                  onChange={() => onToggleAccount(account.account_id, account.parent_id)}
                />
                <span>{account.name || account.account_id}</span>
                <span className="font-mono text-[11px] text-slate-500">{account.account_id}</span>
                {!active ? <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold">{account.status}</span> : null}
              </label>
            </li>
          )
        })}
        {node.children.map((child) => (
          <UnitNode key={child.id} node={child} depth={depth + 1} ancestorSelected={ancestorSelected || selectedUnits.has(node.id)} selectedUnits={selectedUnits} selectedAccounts={selectedAccounts} excluded={excluded} coveredByUnit={coveredByUnit} onToggleUnit={onToggleUnit} onToggleAccount={onToggleAccount} />
        ))}
      </ul>
    </li>
  )
}

export function OrganizationOnboarding({ customerId, canSubmit, onChanged }: { customerId: string; canSubmit: boolean; onChanged: () => void }) {
  const [managementAccountId, setManagementAccountId] = useState("")
  const [environment, setEnvironment] = useState("PRODUCTION")
  const [regions, setRegions] = useState("eu-west-1")
  const [bindings, setBindings] = useState<Partial<Record<BindingPurpose, Binding>>>({})
  const [externalIds, setExternalIds] = useState<Partial<Record<BindingPurpose, string>>>({})
  const [plan, setPlan] = useState<InstallationPlan | null>(null)
  const [discoveryRoleArn, setDiscoveryRoleArn] = useState("")
  const [memberRoleName, setMemberRoleName] = useState(`CyntroRead-${customerId}`)
  const [working, setWorking] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [children, setChildren] = useState<{ total: number; children: Operation[]; hiddenByAccountScope: number } | null>(null)
  const discoverIdentity = useRef<IntentIdentity | undefined>(undefined)
  const connectIdentity = useRef<IntentIdentity | undefined>(undefined)
  const discover = useTrackedOperation()
  const connect = useTrackedOperation({ intervalMs: 3000 })
  const child = useTrackedOperation()

  const accountValid = /^\d{12}$/.test(managementAccountId)
  const regionList = parseRegions(regions)

  useEffect(() => {
    setBindings({})
    setExternalIds({})
    setPlan(null)
    setDiscovery(null)
    discover.reset()
    connect.reset()
    if (!accountValid) return
    let cancelled = false
    listBindings(customerId).then((all) => {
      if (cancelled) return
      const mine = all.filter((item) => item.account_id === managementAccountId)
      setBindings(Object.fromEntries(mine.map((item) => [item.purpose, item])))
    }, (reason) => { if (!cancelled) setLocalError(errorText(reason)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, managementAccountId, accountValid])

  // Children are listed on every parent update so per-account results are visible
  // while the parent is still waiting to aggregate them.
  const parent = connect.operation
  useEffect(() => {
    if (!parent) return
    let cancelled = false
    listChildren(parent).then((result) => { if (!cancelled) setChildren(result) }, (reason) => { if (!cancelled) setLocalError(errorText(reason)) })
    return () => { cancelled = true }
  }, [parent, child.operation])

  const discoveryResultId = discover.operation?.status === "SUCCEEDED" ? String(discover.operation.result.discovery_id || "") : ""
  useEffect(() => {
    if (!discoveryResultId) return
    readDiscovery(customerId, managementAccountId, discoveryResultId).then(setDiscovery, (reason) => setLocalError(errorText(reason)))
  }, [discoveryResultId, customerId, managementAccountId])

  async function createBindings() {
    setWorking("bindings")
    setLocalError(null)
    try {
      const shown: Partial<Record<BindingPurpose, string>> = {}
      const next = { ...bindings }
      for (const purpose of ["ORGANIZATION_DISCOVERY", "ORGANIZATION_MEMBER_READ"] as const) {
        if (next[purpose]) continue
        const created = await createBinding({ customerId, accountId: managementAccountId, purpose })
        next[purpose] = created.binding
        if (created.externalIdOnce) shown[purpose] = created.externalIdOnce
      }
      setBindings(next)
      setExternalIds(shown)
      setPlan(await readInstallationPlan({ customerId, accountId: managementAccountId, mode: "organization", regions: regionList }))
      onChanged()
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setWorking(null)
    }
  }

  async function saveRoles() {
    setLocalError(null)
    const problem = !bindings.ORGANIZATION_DISCOVERY?.role_configured ? roleArnProblem(discoveryRoleArn, managementAccountId) : null
    if (problem) return setLocalError(problem)
    if (!bindings.ORGANIZATION_MEMBER_READ?.role_configured && !ROLE_NAME.test(memberRoleName)) return setLocalError("Enter the StackSet member role name, for example CyntroRead-" + customerId + ".")
    setWorking("roles")
    try {
      const next = { ...bindings }
      if (!next.ORGANIZATION_DISCOVERY?.role_configured) {
        next.ORGANIZATION_DISCOVERY = await attachRole({ customerId, accountId: managementAccountId, purpose: "ORGANIZATION_DISCOVERY", roleArn: discoveryRoleArn.trim() })
      }
      if (!next.ORGANIZATION_MEMBER_READ?.role_configured) {
        next.ORGANIZATION_MEMBER_READ = await attachRole({ customerId, accountId: managementAccountId, purpose: "ORGANIZATION_MEMBER_READ", roleName: memberRoleName.trim() })
      }
      setBindings(next)
      onChanged()
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setWorking(null)
    }
  }

  async function runDiscovery() {
    setDiscovery(null)
    discoverIdentity.current = intentIdentity(undefined, `${customerId}:${managementAccountId}:${Date.now()}`, "DISCOVER_ORGANIZATION")
    const identity = discoverIdentity.current
    await discover.start(() => submitOperation({ customerId, accountId: managementAccountId, operationType: "DISCOVER_ORGANIZATION", command: {}, identity }))
  }

  const parents = useMemo(() => new Map((discovery?.organizational_units || []).map((unit) => [unit.organizational_unit_id, unit.parent_id])), [discovery])
  const coveredByUnit = (parentId: string) => {
    const seen = new Set<string>()
    let node = parentId
    while (node && !seen.has(node)) {
      if (selectedUnits.has(node)) return true
      seen.add(node)
      node = parents.get(node) || ""
    }
    return false
  }
  // An exclusion only means something for an account a selected OU would include.
  const effectiveExcluded = discovery
    ? [...excluded].filter((id) => coveredByUnit(discovery.accounts.find((account) => account.account_id === id)?.parent_id || "")).sort()
    : []
  const preview = discovery ? previewScope(discovery, {
    organizationalUnitIds: [...selectedUnits],
    accountIds: [...selectedAccounts],
    excludedAccountIds: effectiveExcluded,
  }) : null

  function toggleUnit(id: string) {
    setSelectedUnits((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAccount(id: string, parentId: string) {
    if (coveredByUnit(parentId)) {
      setExcluded((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setSelectedAccounts((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function connectScope() {
    if (!discovery || !preview) return
    const command = {
      discovery_id: discovery.discovery_id,
      organizational_unit_ids: [...selectedUnits].sort(),
      account_ids: [...selectedAccounts].sort(),
      excluded_account_ids: effectiveExcluded,
      environment,
      regions: regionList,
    }
    connectIdentity.current = intentIdentity(connectIdentity.current, JSON.stringify({ customerId, managementAccountId, command }), "CONNECT_ORGANIZATION_ACCOUNTS")
    const identity = connectIdentity.current
    setChildren(null)
    const finished = await connect.start(() => submitOperation({ customerId, accountId: managementAccountId, operationType: "CONNECT_ORGANIZATION_ACCOUNTS", command, identity }))
    if (finished) onChanged()
  }

  const tree = discovery ? organizationTree(discovery) : []
  const filteredTree = filter.trim()
    ? tree.map(function filterNode(node): OrganizationTreeNode {
        const needle = filter.trim().toLowerCase()
        return {
          ...node,
          accounts: node.accounts.filter((account) => `${account.name} ${account.account_id}`.toLowerCase().includes(needle)),
          children: node.children.map(filterNode),
        }
      })
    : tree
  const rolesReady = Boolean(bindings.ORGANIZATION_DISCOVERY?.role_configured && bindings.ORGANIZATION_MEMBER_READ?.role_configured)
  const bothBindings = Boolean(bindings.ORGANIZATION_DISCOVERY && bindings.ORGANIZATION_MEMBER_READ)
  const parentResult = parent?.result || {}
  const error = localError || discover.error || connect.error || child.error

  return (
    <div className="space-y-5" data-testid="organization-onboarding">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Management account ID
          <input value={managementAccountId} inputMode="numeric" onChange={(event) => setManagementAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="123456789012" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono font-normal outline-none focus:border-teal-500" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Environment
          <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal outline-none focus:border-teal-500">
            <option>PRODUCTION</option><option>STAGING</option><option>DEVELOPMENT</option><option>SHARED_SERVICES</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Regions
          <input value={regions} onChange={(event) => setRegions(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" />
        </label>
      </section>

      {accountValid ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">1. Access bindings</h3>
          <BindingSummary binding={bindings.ORGANIZATION_DISCOVERY || null} title="Organization discovery (management account)" />
          <BindingSummary binding={bindings.ORGANIZATION_MEMBER_READ || null} title="Member read role (StackSet)" />
          {externalIds.ORGANIZATION_DISCOVERY ? <ExternalIdOnce label="Discovery role ExternalId" value={externalIds.ORGANIZATION_DISCOVERY} onStored={() => setExternalIds((c) => ({ ...c, ORGANIZATION_DISCOVERY: undefined }))} /> : null}
          {externalIds.ORGANIZATION_MEMBER_READ ? <ExternalIdOnce label="Member role ExternalId" value={externalIds.ORGANIZATION_MEMBER_READ} onStored={() => setExternalIds((c) => ({ ...c, ORGANIZATION_MEMBER_READ: undefined }))} /> : null}
          {!bothBindings ? (
            <button type="button" disabled={!canSubmit || working !== null || regionList.length === 0} onClick={() => void createBindings()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {working === "bindings" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Building2 className="h-3 w-3" />} Create organization bindings
            </button>
          ) : !plan ? (
            <button type="button" onClick={() => void readInstallationPlan({ customerId, accountId: managementAccountId, mode: "organization", regions: regionList }).then(setPlan, (r) => setLocalError(errorText(r)))} className="text-xs font-semibold text-teal-700">Show installation plan</button>
          ) : null}
          {plan ? <InstallationPlanView plan={plan} /> : null}
        </section>
      ) : null}

      {bothBindings ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">2. Roles</h3>
          {!bindings.ORGANIZATION_DISCOVERY?.role_configured ? (
            <label className="block text-xs font-semibold text-slate-600">Discovery role ARN (management account)
              <input value={discoveryRoleArn} onChange={(event) => setDiscoveryRoleArn(event.target.value)} placeholder={`arn:aws:iam::${managementAccountId}:role/CyntroOrganizationsDiscovery-${customerId}`} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-mono text-xs font-normal outline-none focus:border-teal-500" />
            </label>
          ) : <p className="text-xs text-slate-600">Discovery role attached.</p>}
          {!bindings.ORGANIZATION_MEMBER_READ?.role_configured ? (
            <label className="block text-xs font-semibold text-slate-600">StackSet member role name
              <input value={memberRoleName} onChange={(event) => setMemberRoleName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-mono text-xs font-normal outline-none focus:border-teal-500" />
            </label>
          ) : <p className="text-xs text-slate-600">Member role name attached.</p>}
          {!rolesReady ? (
            <button type="button" disabled={!canSubmit || working !== null} onClick={() => void saveRoles()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {working === "roles" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Attach roles
            </button>
          ) : null}
        </section>
      ) : null}

      {rolesReady ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">3. Discover the organization</h3>
          {discover.operation ? (
            <OperationCard operation={discover.operation} events={discover.events} canSubmit={canSubmit} busy={discover.busy} onCancel={(op) => void discover.cancel(op)} onRetry={(op) => void discover.retry(op)} />
          ) : null}
          {!discover.operation || (!isPending(discover.operation.status) && discover.operation.status !== "SUCCEEDED") || discovery ? (
            <button type="button" disabled={!canSubmit || discover.busy || (discover.operation ? isPending(discover.operation.status) : false)} onClick={() => void runDiscovery()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {discover.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Network className="h-3 w-3" />} {discovery ? "Discover again" : "Discover organization"}
            </button>
          ) : null}
        </section>
      ) : null}

      {discovery ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid="organization-scope">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">4. Choose an explicit scope</h3>
            <span className="text-xs text-slate-500">{discovery.organization_id} · {discovery.accounts.length} accounts · discovered {new Date(discovery.discovered_at).toLocaleString()}</span>
          </div>
          {discovery.truncated ? <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">The organization is larger than one discovery pass; not every account is listed.</p> : null}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter accounts" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-teal-500" />
          </div>
          <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {filteredTree.map((node) => (
              <UnitNode key={node.id} node={node} depth={0} selectedUnits={selectedUnits} selectedAccounts={selectedAccounts} excluded={excluded} coveredByUnit={coveredByUnit} onToggleUnit={toggleUnit} onToggleAccount={toggleAccount} />
            ))}
          </ul>
          {preview ? (
            <p data-testid="scope-preview" className="text-xs text-slate-600">
              {preview.active.length} account{preview.active.length === 1 ? "" : "s"} will be connected
              {preview.suspended.length ? ` · ${preview.suspended.length} suspended skipped` : ""}
            </p>
          ) : null}
          {!parent ? (
            <button type="button" disabled={!canSubmit || !preview?.active.length || connect.busy} onClick={() => void connectScope()} className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {connect.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Connect {preview?.active.length || 0} accounts
            </button>
          ) : null}
        </section>
      ) : null}

      {parent ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid="organization-connect">
          <h3 className="text-sm font-semibold">5. Connection results</h3>
          <OperationCard operation={parent} events={connect.events} canSubmit={canSubmit} busy={connect.busy} onCancel={(op) => void connect.cancel(op)} onRetry={(op) => void connect.retry(op)} />
          <p className="text-xs text-slate-600" data-testid="organization-counts">
            {typeof parentResult.children_succeeded === "number" ? `${parentResult.children_succeeded} connected · ${Number(parentResult.children_failed || 0) + Number(parentResult.children_blocked || 0)} need attention · ${parentResult.children_pending || 0} pending` : "Waiting for account operations"}
            {Array.isArray(parentResult.suspended_accounts_skipped) && parentResult.suspended_accounts_skipped.length ? ` · suspended skipped: ${parentResult.suspended_accounts_skipped.join(", ")}` : ""}
            {Array.isArray(parentResult.accounts_not_in_discovery) && parentResult.accounts_not_in_discovery.length ? ` · not in discovery: ${parentResult.accounts_not_in_discovery.join(", ")}` : ""}
          </p>
          {children ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] text-left text-xs" data-testid="organization-children">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
                <tbody>
                  {children.children.map((item) => (
                    <tr key={item.operation_id} data-child-account={item.account_id} data-child-status={item.status} className="border-t border-slate-100">
                      <td className="px-3 py-2"><span className="font-semibold">{String(item.command.display_name || item.account_id)}</span> <span className="font-mono text-slate-500">{item.account_id}</span></td>
                      <td className="px-3 py-2"><StatusPill operation={item} /></td>
                      <td className="px-3 py-2 text-slate-600">{item.failure ? `${item.failure.message} (${item.failure.code})` : item.status === "SUCCEEDED" ? "Connected; inventory started" : ""}</td>
                      <td className="px-3 py-2 text-right">
                        {canSubmit && !isPending(item.status) && item.status !== "SUCCEEDED" && item.failure?.retryable ? (
                          <button type="button" disabled={child.busy} onClick={() => void child.retry(item)} className="rounded-lg border border-slate-300 px-2 py-1 font-semibold text-slate-700 disabled:opacity-40">Retry</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {children.hiddenByAccountScope ? <p className="px-3 py-2 text-[11px] text-slate-500">{children.hiddenByAccountScope} accounts are outside your account scope and hidden.</p> : null}
            </div>
          ) : null}
          {child.operation ? <OperationCard operation={child.operation} events={child.events} canSubmit={canSubmit} busy={child.busy} onRetry={(op) => void child.retry(op)} /> : null}
        </section>
      ) : null}

      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    </div>
  )
}
