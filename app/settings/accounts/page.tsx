"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Cloud,
  KeyRound,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { useAccountScope } from "@/lib/account-scope-context"

interface ManagedAccount {
  customer_id: string
  account_id: string
  display_name: string
  environment: string
  regions: string[]
  onboarding_status: string
  collection_mode: string
  read_enabled: boolean
  verification_enabled: boolean
  mutation_enabled: boolean
  install_method: string
  evidence_source_count: number
  last_evidence_at?: string | null
  validation_message?: string | null
}

interface AccountResponse {
  accounts: ManagedAccount[]
  total: number
  registry_available: boolean
  summary: {
    connected: number
    needs_attention: number
    discovered: number
    mutation_enabled: number
  }
}

interface AccountGroup {
  customer_id: string
  group_id: string
  name: string
  description: string
  account_ids: string[]
}

const settingsNav = [
  { id: "accounts", label: "Accounts", icon: Cloud, enabled: true },
  { id: "groups", label: "Account Groups", icon: Layers3, enabled: true },
  { label: "Users & Access", icon: Users },
  { label: "Data Sources", icon: Building2 },
  { label: "Policies & Approvals", icon: ShieldCheck },
  { label: "Audit & Platform", icon: Settings2 },
]

const emptySummary = { connected: 0, needs_attention: 0, discovered: 0, mutation_enabled: 0 }

function statusStyle(status: string) {
  if (["CONNECTED", "READY"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (["DEGRADED", "VALIDATION_HELD"].includes(status)) return "bg-amber-50 text-amber-800 border-amber-200"
  if (status === "DISCOVERED") return "bg-blue-50 text-blue-700 border-blue-200"
  return "bg-slate-50 text-slate-600 border-slate-200"
}

function AccessPill({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
      enabled ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-slate-50 text-slate-400"
    }`}>
      {children}
    </span>
  )
}

export default function AccountSettingsPage() {
  const scope = useAccountScope()
  const [data, setData] = useState<AccountResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<"accounts" | "groups">("accounts")
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [showAddGroup, setShowAddGroup] = useState(false)

  async function load() {
    if (!scope.customerId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts?customer_id=${encodeURIComponent(scope.customerId)}`,
        { cache: "no-store" },
      )
      if (!response.ok) throw new Error(`Account registry returned ${response.status}`)
      const accountData = await response.json()
      setData(accountData)
      const groupResponse = await fetch(
        `/api/proxy/admin/accounts/groups/all?customer_id=${encodeURIComponent(scope.customerId)}`,
        { cache: "no-store" },
      )
      if (!groupResponse.ok) throw new Error(`Account groups returned ${groupResponse.status}`)
      const groupData = await groupResponse.json()
      setGroups(groupData.groups || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [scope.customerId])

  async function validate(accountId: string) {
    if (!scope.customerId) return
    setValidating(accountId)
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts/${accountId}/validate?customer_id=${encodeURIComponent(scope.customerId)}`,
        { method: "POST" },
      )
      if (!response.ok) throw new Error(`Validation returned ${response.status}`)
      await load()
      scope.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setValidating(null)
    }
  }

  const accounts = (data?.accounts || []).filter((account) => {
    const value = `${account.display_name} ${account.account_id} ${account.environment}`.toLowerCase()
    return value.includes(search.toLowerCase())
  })
  const summary = data?.summary || emptySummary

  return (
    <div className="flex min-h-[calc(100vh-44px)] bg-[#f3f6f7] text-slate-900">
      <LeftSidebarNav activeItem="settings" />
      <main className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-8 py-7">
          <div className="mx-auto flex max-w-[1500px] items-end justify-between gap-8">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700">Customer estate</p>
              <h1 className="text-3xl font-semibold tracking-tight">{activeSection === "accounts" ? "Accounts" : "Account Groups"}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                {activeSection === "accounts"
                  ? "Enroll AWS accounts, verify customer-plane evidence, and control where Cyntro may analyze or execute changes."
                  : "Organize accounts into operational cohorts for investigation and reporting without weakening account-level execution boundaries."}
              </p>
            </div>
            <button
              onClick={() => activeSection === "accounts" ? setShowAdd(true) : setShowAddGroup(true)}
              disabled={!scope.customerId}
              className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#007c6d] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> {activeSection === "accounts" ? "Add AWS account" : "Create account group"}
            </button>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-7 p-8 2xl:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="grid h-fit grid-cols-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:grid-cols-3 2xl:block">
            {settingsNav.map((item) => {
              const Icon = item.icon
              const active = item.id === activeSection
              return (
                <button
                  key={item.label}
                  onClick={() => item.id && setActiveSection(item.id as "accounts" | "groups")}
                  disabled={!item.enabled}
                  title={item.enabled ? undefined : "Planned for the pilot administration package"}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    active ? "bg-teal-50 text-teal-800" : item.enabled ? "text-slate-600 hover:bg-slate-50" : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {active ? <ChevronRight className="ml-auto h-4 w-4" /> : null}
                </button>
              )
            })}
          </aside>

          <section className="min-w-0 space-y-6">
            {activeSection === "groups" ? (
              <AccountGroupsPanel
                accounts={data?.accounts || []}
                groups={groups}
                loading={loading}
                onCreate={() => setShowAddGroup(true)}
              />
            ) : <>
            <div className="grid grid-cols-4 gap-4">
              {[
                ["Accounts", data?.total || 0, "Registered and discovered"],
                ["Connected", summary.connected, "Evidence verified"],
                ["Needs attention", summary.needs_attention, "Validation held"],
                ["Mutation enabled", summary.mutation_enabled, "Explicitly approved"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </div>

            {!data?.registry_available && !loading ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Registry storage is not provisioned</p>
                  <p className="mt-1 text-amber-800">Observed accounts remain visible, but enrollment and access changes are unavailable until the customer-plane foundation stack is installed.</p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{error}</span>
                <button onClick={() => void load()} className="font-semibold">Retry</button>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <div className="relative w-80">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, account ID, environment"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
                  />
                </div>
                <button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh accounts">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="grid grid-cols-[minmax(260px,1.5fr)_150px_140px_230px_130px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                <span>Account</span><span>Environment</span><span>Status</span><span>Access</span><span className="text-right">Action</span>
              </div>
              {loading ? (
                <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading account estate</div>
              ) : accounts.length === 0 ? (
                <div className="p-12 text-center">
                  <Cloud className="mx-auto h-9 w-9 text-slate-300" />
                  <p className="mt-3 font-semibold">No AWS accounts in this view</p>
                  <p className="mt-1 text-sm text-slate-500">Add an account or deploy the read-only spoke to discover organization evidence.</p>
                </div>
              ) : accounts.map((account) => (
                <div key={account.account_id} className="grid grid-cols-[minmax(260px,1.5fr)_150px_140px_230px_130px] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{account.display_name}</span>
                      {account.onboarding_status === "DISCOVERED" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">DISCOVERED</span> : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{account.account_id}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{account.regions?.join(", ") || "Region pending"} · {account.evidence_source_count || 0} evidence sources</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{account.environment}</span>
                  <div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle(account.onboarding_status)}`}>{account.onboarding_status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <AccessPill enabled={account.read_enabled}>Read</AccessPill>
                    <AccessPill enabled={account.verification_enabled}>Verify</AccessPill>
                    <AccessPill enabled={account.mutation_enabled}>Mutate</AccessPill>
                  </div>
                  <div className="text-right">
                    {account.onboarding_status === "DISCOVERED" ? (
                      <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-teal-700">Enroll</button>
                    ) : (
                      <button
                        onClick={() => void validate(account.account_id)}
                        disabled={validating === account.account_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                      >
                        {validating === account.account_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        Validate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>}
          </section>
        </div>
      </main>
      {showAdd ? (
        <AddAccountDialog
          customerId={scope.customerId}
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false)
            await load()
            scope.refresh()
          }}
        />
      ) : null}
      {showAddGroup ? (
        <AddGroupDialog
          customerId={scope.customerId}
          accounts={data?.accounts || []}
          onClose={() => setShowAddGroup(false)}
          onCreated={async () => {
            setShowAddGroup(false)
            await load()
            scope.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AccountGroupsPanel({
  accounts,
  groups,
  loading,
  onCreate,
}: {
  accounts: ManagedAccount[]
  groups: AccountGroup[]
  loading: boolean
  onCreate: () => void
}) {
  const names = new Map(accounts.map((account) => [account.account_id, account.display_name]))
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-5">
        <div>
          <h2 className="font-semibold">Operational account groups</h2>
          <p className="mt-1 text-sm text-slate-500">Scope dashboards and analysis across approved account cohorts. Mutation remains one account and region at a time.</p>
        </div>
        <button onClick={onCreate} className="rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50">Create group</button>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading account groups</div>
      ) : groups.length === 0 ? (
        <div className="p-12 text-center">
          <Layers3 className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 font-semibold">No account groups yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a cohort such as Production EU or Shared Services.</p>
        </div>
      ) : groups.map((group) => (
        <div key={group.group_id} className="border-b border-slate-100 px-5 py-4 last:border-b-0">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold">{group.name}</span><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{group.group_id}</span></div>
              <p className="mt-1 text-sm text-slate-500">{group.description || "No description"}</p>
            </div>
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{group.account_ids.length} accounts</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {group.account_ids.map((accountId) => <span key={accountId} className="rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-800">{names.get(accountId) || accountId}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}

function AddGroupDialog({ customerId, accounts, onClose, onCreated }: { customerId: string | null; accounts: ManagedAccount[]; onClose: () => void; onCreated: () => void }) {
  const [groupId, setGroupId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!customerId || !groupId || !displayName || selected.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/proxy/admin/accounts/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, group_id: groupId, name: displayName, description, account_ids: selected }),
      })
      if (!response.ok) throw new Error(`Create account group returned ${response.status}`)
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account scope</p><h2 className="mt-1 text-xl font-semibold">Create account group</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-slate-600">Display name<input value={displayName} onChange={(event) => { setDisplayName(event.target.value); if (!groupId) setGroupId(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) }} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-teal-500" /></label>
            <label className="text-xs font-semibold text-slate-600">Group ID<input value={groupId} onChange={(event) => setGroupId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-normal outline-none focus:border-teal-500" /></label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Purpose<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Production accounts operated by the EU platform team" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-teal-500" /></label>
          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">Accounts</legend>
            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {accounts.map((account) => (
                <label key={account.account_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(account.account_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, account.account_id] : current.filter((id) => id !== account.account_id))} className="h-4 w-4 accent-teal-600" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{account.display_name}</span><span className="font-mono text-xs text-slate-400">{account.account_id}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 p-5"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => void create()} disabled={submitting || !groupId || !displayName || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />} Create group</button></div>
      </div>
    </div>
  )
}

function AddAccountDialog({ customerId, onClose, onCreated }: { customerId: string | null; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [environment, setEnvironment] = useState("PRODUCTION")
  const [regions, setRegions] = useState("eu-west-1")

  async function create() {
    if (!customerId) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/proxy/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          account_id: accountId,
          display_name: displayName,
          environment,
          regions: regions.split(",").map((value) => value.trim()).filter(Boolean),
          install_method: "STACKSET",
          collection_mode: "ORGANIZATION_TRAIL",
          read_enabled: true,
          verification_enabled: false,
          mutation_enabled: false,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(typeof body.detail === "string" ? body.detail : `Registration returned ${response.status}`)
      }
      setStep(3)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account onboarding</p>
            <h2 className="mt-1 text-xl font-semibold">Add an AWS account</h2>
            <p className="mt-1 text-sm text-slate-500">Read access starts first. Mutation requires a separate approval after verification.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6">
          {["Account", "Install", "Verify"].map((label, index) => (
            <div key={label} className={`flex-1 border-b-2 py-3 text-center text-xs font-bold uppercase tracking-wider ${step === index + 1 ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400"}`}>{index + 1}. {label}</div>
          ))}
        </div>
        <div className="min-h-80 p-6">
          {step === 1 ? (
            <div className="grid grid-cols-2 gap-4">
              <label className="col-span-2 text-sm font-semibold text-slate-700">Account name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Payments production" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" /></label>
              <label className="text-sm font-semibold text-slate-700">AWS account ID<input value={accountId} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="123456789012" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono font-normal outline-none focus:border-teal-500" /></label>
              <label className="text-sm font-semibold text-slate-700">Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal outline-none focus:border-teal-500"><option>PRODUCTION</option><option>STAGING</option><option>DEVELOPMENT</option><option>SHARED_SERVICES</option></select></label>
              <label className="col-span-2 text-sm font-semibold text-slate-700">Regions<input value={regions} onChange={(event) => setRegions(event.target.value)} placeholder="eu-west-1, us-east-1" className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-teal-500" /></label>
              <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Safe default:</strong> this registration enables inventory and historical evidence only. It does not grant Cyntro mutation authority.</div>
            </div>
          ) : null}
          {step === 2 ? (
            <div>
              <h3 className="font-semibold">Deploy the read and verification spoke</h3>
              <p className="mt-1 text-sm text-slate-500">For AWS Organizations, deploy once with service-managed StackSets to the selected OU. Cyntro records the account now, then validates heartbeats after deployment.</p>
              <div className="mt-5 space-y-3">
                {[
                  ["Inventory role", "Read AWS configuration and resource metadata"],
                  ["Historical evidence", "Bind organization CloudTrail and AWS Config history"],
                  ["Verification role", "Run read-only simulations and post-change checks"],
                  ["Mutation role", "Not deployed or enabled in this step"],
                ].map(([title, note], index) => (
                  <div key={title} className="flex gap-3 rounded-xl border border-slate-200 p-4"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === 3 ? "bg-slate-100 text-slate-400" : "bg-teal-50 text-teal-700"}`}>{index === 3 ? <KeyRound className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</div><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs text-slate-500">{note}</p></div></div>
                ))}
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-700"><Check className="h-7 w-7" /></div><h3 className="mt-4 text-xl font-semibold">Account registered</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Deploy the customer account spoke, then use Validate from the account list. Cyntro will not mark it connected until evidence is observed.</p></div>
          ) : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={step === 1 ? onClose : () => setStep((value) => Math.max(1, value - 1))} className="text-sm font-semibold text-slate-500">{step === 1 ? "Cancel" : "Back"}</button>
          {step === 1 ? <button disabled={accountId.length !== 12 || !displayName} onClick={() => setStep(2)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Review installation</button> : null}
          {step === 2 ? <button disabled={submitting} onClick={() => void create()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Register account</button> : null}
          {step === 3 ? <button onClick={onCreated} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Return to accounts</button> : null}
        </div>
      </div>
    </div>
  )
}
