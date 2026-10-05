"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  Cloud,
  KeyRound,
  Layers3,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { AccountCoverageChips, ConnectAccountPanel, MemberStatusBadge } from "@/components/settings/connect-account-panel"
import { OrganizationAccountPicker, useOrganizationDiscovery } from "@/components/settings/organization-account-picker"
import { FirstCollectionStatus, RegistrationJourney } from "@/components/settings/registration-journey"
import { useAccountScope } from "@/lib/account-scope-context"
import { COVERAGE_PAGE_PATH, READY_MEANS_OPERATIONAL, coveragePageHref } from "@/lib/observation-coverage"
import {
  MEMBER_ACCOUNTS_MODE,
  accountAdminFailure,
  accountIdAddable,
  accountIdEvidenceText,
  accountIdReviewable,
  accountIdUnverified,
  accountLabel,
  accountNameNote,
  accountNeedsPolling,
  checkAccountId,
  connectionCheckOutcome,
  organizationListing,
  organizationListingBoundary,
  discoveryCaveats,
  discoverySummary,
  memberReadRoleName,
  registrationActionPath,
  registrationFailed,
  registrationRequestBody,
  registrationStep,
  registryUnavailableDetail,
  requestOutcomeText,
  type AccountIdCheck,
  type RegistrationAction,
  type AccountListResponse,
  type FailedAccountRequest,
  type ManagedAccount,
} from "@/lib/account-admin"

interface AccountGroup {
  customer_id: string
  group_id: string
  name: string
  description: string
  account_ids: string[]
}

interface ListError {
  message: string
  /** Set only when the list call itself answered 503 because the registry is unavailable. */
  registry: { message: string; reason: string | null } | null
}

const settingsNav: Array<{ id?: string; label: string; icon: typeof Cloud; enabled?: boolean; href?: string }> = [
  { id: "accounts", label: "Accounts", icon: Cloud, enabled: true },
  { id: "groups", label: "Account Groups", icon: Layers3, enabled: true },
  { label: "Evidence coverage", icon: CalendarClock, enabled: true, href: COVERAGE_PAGE_PATH },
  { label: "Users & Access", icon: Users },
  { label: "Data Sources", icon: Building2 },
  { label: "Policies & Approvals", icon: ShieldCheck },
  { label: "Audit & Platform", icon: Settings2 },
]

const emptySummary = { connected: 0, needs_attention: 0, discovered: 0, mutation_enabled: 0 }

/** While a registration or connection check is open, the list is re-read this often. */
const POLL_INTERVAL_MS = 4000
/** A check this page asked for is watched at most this long if the list never shows it open. */
const CHECK_WATCH_MS = 120_000
/** Statuses that read as "working": each gets the operational-not-complete note and a coverage link. */
const OPERATIONAL_STATUSES = new Set(["CONNECTED", "READY"])
/** Member statuses from which the connection stack can be (re)deployed and checked. */
const CONNECTABLE = new Set(["AWAITING_CONNECTION", "CONNECTION_FAILED", "CONNECTED"])
/** Option C: the pending states whose next step needs the connection stack deployed (Connect shows it; Check connection
 *  is not offered there -- the access check is). */
const STACK_BEFORE_ACCESS = new Set(["PENDING_UNVERIFIED", "ACCESS_CONFIRMABLE", "ACTIVATION_FAILED"])
/** A new registration opens the Connect panel once its row reaches one of these. */
const OPEN_CONNECT_ON = new Set(["AWAITING_CONNECTION", "CONNECTED", "PENDING_UNVERIFIED"])

const REQUEST_ACTION_LABEL: Record<string, string> = {
  register: "Registration", validate: "Connection check", access_check: "Access check", activate: "Activation", release: "Release",
  withdraw: "Removal",
}
/** The journey request each action sends, named as the page says it. */
const REGISTRATION_ACTION_LABEL: Record<RegistrationAction, string> = {
  access_check: "Check access", activate: "Confirmation", release: "Release", withdraw: "Remove account",
}

function statusStyle(status: string) {
  if (["CONNECTED", "READY"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (["DEGRADED", "VALIDATION_HELD"].includes(status)) return "bg-amber-50 text-amber-800 border-amber-200"
  if (status === "DISCOVERED") return "bg-blue-50 text-blue-700 border-blue-200"
  return "bg-slate-50 text-slate-600 border-slate-200"
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function failureKey(failure: FailedAccountRequest): string {
  return `${failure.account_id}|${failure.action}|${failure.finished_at || ""}`
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
  const customerId = scope.customerId
  const [data, setData] = useState<AccountListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<ListError | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<"accounts" | "groups">("accounts")
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [connectFor, setConnectFor] = useState<string | null>(null)
  const [awaitingConnect, setAwaitingConnect] = useState<{ accountId: string; requestedAt: string } | null>(null)
  const [checks, setChecks] = useState<Record<string, { requestedAt: string; startedAt: number }>>({})
  const [dismissedFailures, setDismissedFailures] = useState<string[]>([])
  // Option C: the account whose journey request (check access, confirm, release) is being sent.
  const [journeyBusy, setJourneyBusy] = useState<string | null>(null)

  const mounted = useRef(true)
  const loadSeq = useRef(0)
  const listBusy = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * spinner: first load and the Refresh button. quiet: after an action, never skipped.
   * poll: the background re-read, skipped while another read is still in flight.
   */
  const load = useCallback(async (mode: "spinner" | "quiet" | "poll" = "spinner") => {
    if (!customerId) {
      setLoading(false)
      return
    }
    if (mode === "poll" && listBusy.current) return
    listBusy.current = true
    const seq = ++loadSeq.current
    if (mode === "spinner") setLoading(true)
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts?customer_id=${encodeURIComponent(customerId)}`,
        { cache: "no-store" },
      )
      if (!response.ok) throw await accountAdminFailure(response, "Account registry")
      const accountData = (await response.json()) as AccountListResponse
      if (!mounted.current || seq !== loadSeq.current) return
      setData(accountData)
      setListError(null)
    } catch (reason) {
      if (!mounted.current || seq !== loadSeq.current) return
      setListError({
        message: reason instanceof Error ? reason.message : String(reason),
        registry: registryUnavailableDetail(reason),
      })
    } finally {
      if (seq === loadSeq.current) {
        listBusy.current = false
        if (mounted.current) setLoading(false)
      }
    }
  }, [customerId])

  const loadGroups = useCallback(async () => {
    if (!customerId) return
    try {
      const response = await fetch(
        `/api/proxy/admin/accounts/groups/all?customer_id=${encodeURIComponent(customerId)}`,
        { cache: "no-store" },
      )
      if (!response.ok) throw await accountAdminFailure(response, "Account groups")
      const groupData = await response.json()
      if (!mounted.current) return
      setGroups(groupData.groups || [])
      setGroupsError(null)
    } catch (reason) {
      if (mounted.current) setGroupsError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [customerId])

  useEffect(() => {
    setData(null)
    setListError(null)
    setChecks({})
    setAwaitingConnect(null)
    setConnectFor(null)
    void load()
    void loadGroups()
  }, [load, loadGroups])

  const memberMode = data?.mode === MEMBER_ACCOUNTS_MODE
  const allAccounts = data?.accounts || []
  const failedRequests = data?.failed_requests || []

  // Re-read while the connector has work open for this page: a row it is still moving or with an
  // open request (accountNeedsPolling), or a check this page asked for. Stops when none; stops on
  // unmount.
  const needsPolling =
    allAccounts.some(accountNeedsPolling) ||
    awaitingConnect !== null ||
    Object.keys(checks).length > 0
  useEffect(() => {
    if (!needsPolling || !customerId) return
    const timer = window.setInterval(() => void load("poll"), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [needsPolling, customerId, load])

  // Retire the checks this page asked for once the connector closed them (or after CHECK_WATCH_MS).
  useEffect(() => {
    if (!data) return
    const settled = Object.entries(checks).filter(([accountId, check]) => {
      const row = data.accounts.find((account) => account.account_id === accountId)
      return (
        connectionCheckOutcome(accountId, row, data.failed_requests, check.requestedAt).state !== "PENDING" ||
        Date.now() - check.startedAt > CHECK_WATCH_MS
      )
    })
    if (!settled.length) return
    setChecks((current) => {
      const next = { ...current }
      for (const [accountId] of settled) delete next[accountId]
      return next
    })
  }, [data, checks])

  // A new registration opens its Connect panel as soon as the connector has created the row.
  useEffect(() => {
    if (!awaitingConnect || !data) return
    const row = data.accounts.find((account) => account.account_id === awaitingConnect.accountId)
    if (row && OPEN_CONNECT_ON.has(row.onboarding_status)) {
      setConnectFor(row.account_id)
      setAwaitingConnect(null)
    } else if (row && row.onboarding_status !== "REGISTERING" && !row.pending_request) {
      setAwaitingConnect(null)
    } else if (!row && registrationFailed(data.failed_requests, awaitingConnect.accountId, awaitingConnect.requestedAt)) {
      setAwaitingConnect(null)
    }
  }, [data, awaitingConnect])

  /** Member mode: queue a connection check; resolves the backend's requested_at. */
  async function requestConnectionCheck(accountId: string): Promise<string> {
    if (!customerId) throw new Error("No organization is selected")
    const response = await fetch(
      `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/validate?customer_id=${encodeURIComponent(customerId)}`,
      { method: "POST" },
    )
    if (!response.ok) throw await accountAdminFailure(response, "Check connection")
    const body = await response.json().catch(() => ({}))
    const requestedAt =
      typeof body?.requested_at === "string" && body.requested_at ? body.requested_at : new Date().toISOString()
    setChecks((current) => ({ ...current, [accountId]: { requestedAt, startedAt: Date.now() } }))
    void load("quiet")
    return requestedAt
  }

  /** Option C: one journey request for the registration and version the operator is looking at (and, to confirm, the
   *  check they confirm). The connector decides it; the page then re-reads the list, which shows the open request. */
  async function requestRegistrationAction(account: ManagedAccount, action: RegistrationAction, checkId?: string) {
    if (!customerId || !account.registration) return
    setJourneyBusy(account.account_id)
    setActionError(null)
    try {
      const response = await fetch(registrationActionPath(action, account.account_id, customerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationRequestBody(account.registration, checkId)),
      })
      if (!response.ok) throw await accountAdminFailure(response, REGISTRATION_ACTION_LABEL[action])
      const body = await response.json().catch(() => ({}))
      if (body?.already_open === true) {
        setNotice(`${REGISTRATION_ACTION_LABEL[action]} for ${account.account_id} was already requested; Cyntro is still working on it.`)
      }
      await load("quiet")
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setJourneyBusy(null)
    }
  }

  function journeyFor(account: ManagedAccount) {
    if (!customerId || !account.registration) return null
    return (
      <RegistrationJourney
        account={account}
        customerId={customerId}
        busy={journeyBusy === account.account_id || Boolean(account.pending_request)}
        onAction={(action, checkId) => requestRegistrationAction(account, action, checkId)}
      />
    )
  }

  async function validate(accountId: string) {
    if (!customerId) return
    setValidating(accountId)
    setActionError(null)
    try {
      if (memberMode) {
        await requestConnectionCheck(accountId)
      } else {
        const response = await fetch(
          `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/validate?customer_id=${encodeURIComponent(customerId)}`,
          { method: "POST" },
        )
        if (!response.ok) throw await accountAdminFailure(response, "Validation")
        await load("quiet")
      }
      scope.refresh()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setValidating(null)
    }
  }

  const accounts = allAccounts
    .filter((account) => {
      const value = `${accountLabel(account)} ${account.account_id} ${account.environment}`.toLowerCase()
      return value.includes(search.toLowerCase())
    })
    // The platform account leads in member mode (the backend sorts it first too).
    .sort((a, b) => Number(Boolean(b.is_platform_account)) - Number(Boolean(a.is_platform_account)))
  const summary = data?.summary || emptySummary
  const visibleFailures = failedRequests.filter((failure) => !dismissedFailures.includes(failureKey(failure)))
  const accountNames = new Map(allAccounts.map((account) => [account.account_id, accountLabel(account)]))
  const legacyRegistryUnprovisioned = Boolean(data) && !memberMode && data?.registry_available === false
  const tableColumns = memberMode
    ? "grid-cols-[minmax(240px,1.3fr)_120px_minmax(240px,1.5fr)_190px_250px]"
    : "grid-cols-[minmax(260px,1.5fr)_150px_140px_230px_130px]"

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
                {activeSection === "groups"
                  ? "Organize accounts into operational cohorts for investigation and reporting without weakening account-level execution boundaries."
                  : memberMode
                    ? "Connect the AWS accounts this install reads. Each account runs the Cyntro connection stack; Cyntro checks it and lists the evidence it found there."
                    : "Enroll AWS accounts, verify customer-plane evidence, and control where Cyntro may analyze or execute changes."}
              </p>
            </div>
            <button
              onClick={() => activeSection === "accounts" ? setShowAdd(true) : setShowAddGroup(true)}
              disabled={!customerId || (activeSection === "accounts" && !data)}
              title={activeSection === "accounts" && customerId && !data ? "Available once the account list has loaded" : undefined}
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
              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              }
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
                accounts={allAccounts}
                groups={groups}
                loading={loading}
                error={groupsError}
                onRetry={() => void loadGroups()}
                onCreate={() => setShowAddGroup(true)}
              />
            ) : <>
            <div className="grid grid-cols-4 gap-4">
              {(memberMode
                ? [
                    ["Accounts", data?.total || 0, "Platform and member accounts"],
                    ["Connected", summary.connected, "Connection verified"],
                    ["Needs attention", summary.needs_attention, "Awaiting or failed connection"],
                    ["Mutation enabled", summary.mutation_enabled, "Explicitly approved"],
                  ]
                : [
                    ["Accounts", data?.total || 0, "Registered and discovered"],
                    ["Connected", summary.connected, "Evidence verified"],
                    ["Needs attention", summary.needs_attention, "Validation held"],
                    ["Mutation enabled", summary.mutation_enabled, "Explicitly approved"],
                  ]
              ).map(([label, value, note]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </div>

            {/* READY / Connected is "operational", never "fully supported". */}
            <div data-testid="ready-means-operational" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {READY_MEANS_OPERATIONAL}{" "}
                <Link href={COVERAGE_PAGE_PATH} className="font-semibold text-teal-700 hover:text-teal-800">View evidence coverage</Link>
              </p>
            </div>

            {listError?.registry ? (
              <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Account registry unavailable</p>
                    <p className="mt-1 text-amber-800">{listError.registry.message}</p>
                    {listError.registry.reason ? <p className="mt-1 font-mono text-xs text-amber-800">{listError.registry.reason}</p> : null}
                  </div>
                </div>
                <button onClick={() => void load()} className="shrink-0 font-semibold">Retry</button>
              </div>
            ) : legacyRegistryUnprovisioned ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Registry storage is not provisioned</p>
                  <p className="mt-1 text-amber-800">Observed accounts remain visible, but enrollment and access changes are unavailable until the customer-plane foundation stack is installed.</p>
                </div>
              </div>
            ) : null}

            {listError && !listError.registry ? (
              <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{listError.message}</span>
                <button onClick={() => void load()} className="shrink-0 font-semibold">Retry</button>
              </div>
            ) : null}

            {actionError ? (
              <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="shrink-0 rounded p-1 hover:bg-red-100"><X className="h-4 w-4" /></button>
              </div>
            ) : null}

            {notice ? (
              <div role="status" className="flex items-center justify-between gap-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
                <span>{notice}</span>
                <button onClick={() => setNotice(null)} aria-label="Dismiss notice" className="shrink-0 rounded p-1 hover:bg-teal-100"><X className="h-4 w-4" /></button>
              </div>
            ) : null}

            {memberMode && data?.member_trust && !data.member_trust.ready ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Member trust is not established yet</p>
                  <p className="mt-1 text-amber-800">The account connector sets it up once it can read this install&apos;s AWS Organization. Until then, accounts can be registered but their connection stack parameters are not available.</p>
                </div>
              </div>
            ) : null}

            {memberMode ? visibleFailures.map((failure) => {
              const name = accountNames.get(failure.account_id)
              const worded = requestOutcomeText(failure.outcome)
              return (
                <div key={failureKey(failure)} role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <div className="flex gap-3">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        {REQUEST_ACTION_LABEL[failure.action] || failure.action} for {name && name !== failure.account_id ? `${name} (${failure.account_id})` : failure.account_id} failed
                      </p>
                      {worded ? <p className="mt-1" data-testid={`failure-outcome-${failure.account_id}`}>{worded}</p> : null}
                      <p className={worded ? "mt-1 text-xs text-red-700" : "mt-1"}>
                        {failure.detail || "The account connector recorded no detail."}
                      </p>
                      {formatTimestamp(failure.finished_at) ? <p className="mt-1 text-xs text-red-600">Finished {formatTimestamp(failure.finished_at)}</p> : null}
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissedFailures((current) => [...current, failureKey(failure)])}
                    aria-label={`Dismiss failed ${(REQUEST_ACTION_LABEL[failure.action] || failure.action).toLowerCase()} for ${failure.account_id}`}
                    className="shrink-0 rounded p-1 hover:bg-red-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            }) : null}

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
                <button onClick={() => { void load(); void loadGroups() }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh accounts" aria-label="Refresh accounts">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className={`grid ${tableColumns} gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500`}>
                <span>Account</span><span>Environment</span><span>Status</span><span>Access</span><span className="text-right">{memberMode ? "Actions" : "Action"}</span>
              </div>
              {loading && !data ? (
                <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading account estate</div>
              ) : accounts.length === 0 ? (
                <div className="p-12 text-center">
                  <Cloud className="mx-auto h-9 w-9 text-slate-300" />
                  <p className="mt-3 font-semibold">No AWS accounts in this view</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {memberMode
                      ? "Add an AWS account to connect it to this install."
                      : "Add an account or deploy the read-only spoke to discover organization evidence."}
                  </p>
                </div>
              ) : memberMode ? accounts.map((account) => (
                <MemberAccountRow
                  key={account.account_id}
                  account={account}
                  columns={tableColumns}
                  checking={validating === account.account_id || Boolean(checks[account.account_id]) || account.pending_request?.action === "validate"}
                  journey={journeyFor(account)}
                  onConnect={() => setConnectFor(account.account_id)}
                  onCheck={() => void validate(account.account_id)}
                />
              )) : accounts.map((account) => (
                <div key={account.account_id} className={`grid ${tableColumns} items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/70`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{account.display_name}</span>
                      {account.onboarding_status === "DISCOVERED" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">DISCOVERED</span> : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{account.account_id}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{account.regions?.join(", ") || "Region pending"} · {account.evidence_source_count || 0} evidence sources</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{account.environment}</span>
                  <div className="space-y-1">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyle(account.onboarding_status)}`}>{account.onboarding_status.replaceAll("_", " ")}</span>
                    {OPERATIONAL_STATUSES.has(account.onboarding_status) ? (
                      <Link href={coveragePageHref(account.account_id)} className="block text-[11px] font-semibold text-teal-700 hover:text-teal-800">
                        Operational · evidence coverage
                      </Link>
                    ) : null}
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
      {showAdd && memberMode ? (
        <MemberAddAccountDialog
          customerId={customerId}
          accounts={allAccounts}
          platformAccountId={data?.member_trust?.platform_account_id || null}
          onClose={() => setShowAdd(false)}
          onRequested={({ accountId, requestedAt, alreadyOpen }) => {
            setShowAdd(false)
            setAwaitingConnect({ accountId, requestedAt })
            setNotice(alreadyOpen ? `A registration for ${accountId} was already open; Cyntro is still working on it.` : null)
            void load("quiet")
            scope.refresh()
          }}
        />
      ) : showAdd ? (
        <AddAccountDialog
          customerId={customerId}
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
          customerId={customerId}
          accounts={allAccounts.filter((account) => account.onboarding_status !== "REGISTERING")}
          onClose={() => setShowAddGroup(false)}
          onCreated={async () => {
            setShowAddGroup(false)
            await Promise.all([load(), loadGroups()])
            scope.refresh()
          }}
        />
      ) : null}
      {connectFor && customerId ? (() => {
        const account = allAccounts.find((row) => row.account_id === connectFor) || null
        // Option C: a registration not yet in the connected lifecycle is checked by its access check, never Check connection.
        const preActivation = account && registrationStep(account, Date.now()) !== null && !CONNECTABLE.has(account.onboarding_status)
        return (
          <ConnectAccountPanel
            customerId={customerId}
            accountId={connectFor}
            account={account}
            failedRequests={failedRequests}
            onClose={() => setConnectFor(null)}
            onCheckConnection={requestConnectionCheck}
            accessStep={preActivation && account ? journeyFor(account) : null}
          />
        )
      })() : null}
    </div>
  )
}

/** What the platform row may say about collection -- only what the backend reported. */
function PlatformNote({ account }: { account: ManagedAccount }) {
  if (account.data_account === false) {
    return <p className="text-xs text-slate-500">The account Cyntro runs in, control plane only: it is not collected and needs no connection stack.</p>
  }
  if (account.collection_mode !== "LOCAL_CUSTOMER_PLANE") return null
  return account.data_account === true
    ? <p className="text-xs text-slate-500">The account Cyntro is installed in; read directly, no connection stack.</p>
    : <p className="text-xs text-slate-500">The account Cyntro is installed in; it needs no connection stack.</p>
}

function MemberAccountRow({
  account,
  columns,
  checking,
  journey,
  onConnect,
  onCheck,
}: {
  account: ManagedAccount
  columns: string
  checking: boolean
  /** Option C: the registration's next step (check access, confirm, retry, release), or null. */
  journey: React.ReactNode
  onConnect: () => void
  onCheck: () => void
}) {
  const platform = Boolean(account.is_platform_account)
  // A control-plane install runs Cyntro in its own account and never collects it (CYNTRO_PLATFORM_DATA_ACCOUNT=false).
  const controlPlane = platform && account.data_account === false
  const connectable = !platform && CONNECTABLE.has(account.onboarding_status)
  // Option C: before its access is proven the stack can be deployed (Connect), but the check is the access check.
  const stackOnly = !platform && STACK_BEFORE_ACCESS.has(account.onboarding_status)
  const summary = account.onboarding_status === "CONNECTED" ? discoverySummary(account.sources) : null
  const caveats = account.onboarding_status === "CONNECTED" ? discoveryCaveats(account.sources) : []
  const pending = account.pending_request
  return (
    <div data-testid={`account-row-${account.account_id}`} className={`grid ${columns} items-start gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/70`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* A member account: the name AWS holds for it (the backend's display_name for a named member account), or
              its ID until that is read -- never a typed label. */}
          {platform || account.aws_account_name ? (
            <span className="truncate text-sm font-semibold">{accountLabel(account)}</span>
          ) : (
            <span className="truncate font-mono text-sm font-semibold">{account.account_id}</span>
          )}
          {platform ? <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">Cyntro platform account</span> : null}
        </div>
        {platform || account.aws_account_name ? <p className="mt-1 font-mono text-xs text-slate-500">{account.account_id}</p> : null}
        {!platform && accountNameNote(account) ? <p data-testid={`account-name-note-${account.account_id}`} className="mt-1 text-[11px] text-slate-500">{accountNameNote(account)}</p> : null}
        <p className="mt-1 truncate text-[11px] text-slate-400">{account.regions?.length ? account.regions.join(", ") : "No regions recorded"}</p>
      </div>
      <span className="text-xs font-semibold text-slate-600">{account.environment}</span>
      <div className="min-w-0 space-y-1.5">
        <MemberStatusBadge status={account.onboarding_status} />
        {!controlPlane && (platform || OPERATIONAL_STATUSES.has(account.onboarding_status)) ? (
          <Link
            href={coveragePageHref(account.account_id)}
            aria-label={`Evidence coverage for ${account.account_id}`}
            className="block text-[11px] font-semibold text-teal-700 hover:text-teal-800"
          >
            {OPERATIONAL_STATUSES.has(account.onboarding_status) ? "Operational · evidence coverage" : "Evidence coverage"}
          </Link>
        ) : null}
        {platform ? <PlatformNote account={account} /> : null}
        {/* A REGISTERING row's message only repeats its badge; the open request line says the rest. */}
        {account.validation_message && account.onboarding_status !== "REGISTERING" ? <p className="text-xs text-slate-600">{account.validation_message}</p> : null}
        {summary ? <p className="text-[11px] text-slate-500">{summary}</p> : null}
        {caveats.map((caveat) => <p key={caveat} className="text-[11px] text-amber-800">{caveat}</p>)}
        <AccountCoverageChips accountId={account.account_id} coverage={account.coverage} regionsNotServed={account.regions_not_served} />
        {journey}
        {!platform ? <FirstCollectionStatus account={account} /> : null}
        {pending ? (
          <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {REQUEST_ACTION_LABEL[pending.action] || pending.action} {pending.status === "running" ? "running" : "queued"}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <AccessPill enabled={account.read_enabled}>Read</AccessPill>
        <AccessPill enabled={account.verification_enabled}>Verify</AccessPill>
        <AccessPill enabled={account.mutation_enabled}>Mutate</AccessPill>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {stackOnly ? (
          <button
            onClick={onConnect}
            aria-label={`Connect ${accountLabel(account)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
          >
            <Link2 className="h-3 w-3" /> Connect
          </button>
        ) : null}
        {connectable ? (
          <>
            <button
              onClick={onConnect}
              aria-label={`Connect ${accountLabel(account)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
            >
              <Link2 className="h-3 w-3" /> Connect
            </button>
            <button
              onClick={onCheck}
              disabled={checking}
              aria-label={`Check connection for ${accountLabel(account)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
              Check connection
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function AccountGroupsPanel({
  accounts,
  groups,
  loading,
  error,
  onRetry,
  onCreate,
}: {
  accounts: ManagedAccount[]
  groups: AccountGroup[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onCreate: () => void
}) {
  const names = new Map(accounts.map((account) => [account.account_id, accountLabel(account)]))
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-5">
        <div>
          <h2 className="font-semibold">Operational account groups</h2>
          <p className="mt-1 text-sm text-slate-500">Scope dashboards and analysis across approved account cohorts. Mutation remains one account and region at a time.</p>
        </div>
        <button onClick={onCreate} className="rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50">Create group</button>
      </div>
      {error ? (
        <div role="alert" className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={onRetry} className="shrink-0 font-semibold">Retry</button>
        </div>
      ) : null}
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
      if (!response.ok) throw await accountAdminFailure(response, "Create account group")
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="create-account-group-title" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account scope</p><h2 id="create-account-group-title" className="mt-1 text-xl font-semibold">Create account group</h2></div>
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
                  <span className="min-w-0 flex-1">{accountLabel(account) !== account.account_id ? <span className="block truncate text-sm font-semibold">{accountLabel(account)}</span> : null}<span className="font-mono text-xs text-slate-400">{account.account_id}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 p-5"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => void create()} disabled={submitting || !groupId || !displayName || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#008f7d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />} Create group</button></div>
      </div>
    </div>
  )
}

/**
 * The account's environment, as the operator states it. Nothing is assumed: the default is UNCLASSIFIED (the
 * backend's own default, api/account_registry.py CreateAccountRequest), never PRODUCTION. The other values are the
 * same canonical environments the tagging solution uses (backend unified/system_boundary_store.py ENVIRONMENTS), so
 * one word means one thing everywhere (Alon, 2026-10-03). Only the hosted add form offers this list (a member account's add
 * asks for its ID only); a stored value
 * (including an older or custom one) is shown as recorded.
 */
const ENVIRONMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "UNCLASSIFIED", label: "Unclassified" },
  { value: "PRODUCTION", label: "Production" },
  { value: "STAGING", label: "Staging" },
  { value: "DEVELOPMENT", label: "Development" },
  { value: "TEST", label: "Test" },
  { value: "SANDBOX", label: "Sandbox" },
  { value: "DISASTER_RECOVERY", label: "Disaster recovery" },
]
const DEFAULT_ENVIRONMENT = "UNCLASSIFIED"

function EnvironmentSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">Environment<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal outline-none focus:border-teal-500">
      {ENVIRONMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  )
}

/**
 * Member-account mode: record the operator's intent to add an account (202). The account
 * connector creates the row within seconds; the page then opens its Connect panel.
 *
 * The account ID is the only input (Alon, 2026-10-03): no name (AWS names the account once it connects), no environment
 * (that belongs to a business system or deployment, defined after the account connects), no Regions (the connector reads
 * the account in this installation's own collection Region; cyntro_data/accounts/connector.py).
 *
 * The ID is checked as it is typed or chosen, at Review and again at Add account, with one check for both paths
 * (lib/account-admin.ts checkAccountId): its format exactly as typed, the platform account, accounts added or being
 * added, and this customer's organization list, read here (GET only) when the dialog opens. Option C (Alon, 2026-10-04):
 * an ID found in a list from the last 24 hours is added as listed; a well-formed ID with no current evidence can be added
 * only as UNVERIFIED -- its own review, the operator's explicit acknowledgement, and no AWS call until they check access
 * and confirm. An ID ruled out stays refused. Add account sends only the kind that was reviewed, still true at the click.
 */
function MemberAddAccountDialog({
  customerId,
  accounts,
  platformAccountId,
  onClose,
  onRequested,
}: {
  customerId: string | null
  accounts: ManagedAccount[]
  platformAccountId: string | null
  onClose: () => void
  onRequested: (request: { accountId: string; requestedAt: string; alreadyOpen: boolean }) => void
}) {
  // Exactly what was typed or chosen; checkAccountId reads it as it is.
  const [raw, setRaw] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Adding is a deliberate step: the details are reviewed with what happens next before anything is submitted.
  const [step, setStep] = useState<"details" | "confirm">("details")
  // What was reviewed: a listed ID, or an unverified one on the guarded path. Add sends only that kind, still true then.
  const [reviewed, setReviewed] = useState<"LISTED" | "UNVERIFIED" | null>(null)
  // The operator's acknowledgement for an unverified ID: given in its review, never carried over from another.
  const [acknowledged, setAcknowledged] = useState(false)
  // Where the details come from: typed (the default) or chosen from the organization's listed accounts, which only
  // fills this form (components/settings/organization-account-picker.tsx).
  const [source, setSource] = useState<"manual" | "organization">("manual")
  const [chosen, setChosen] = useState<{ accountId: string; name: string } | null>(null)
  // The one organization reader for both ways of adding (GET only: on open, while listing, and on Try again).
  const organization = useOrganizationDiscovery(customerId)
  // The clock the listing's age is judged by: moved on when the listing comes into range or expires, so an open form
  // or review changes on its own; Review and Add account read the wall clock again themselves.
  const [now, setNow] = useState(() => Date.now())
  const boundary = organizationListingBoundary(organization.answer, now)
  useEffect(() => {
    if (boundary === null) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, boundary - Date.now()) + 1, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
  }, [boundary])

  // Recomputed on every edit, registry refresh, organization read and clock change; never stored as "verified".
  const checkAt = (at: number) => checkAccountId(raw, { accounts, platformAccountId, organization, now: at })
  const check = checkAt(now)
  const accountId = check.state === "EMPTY" || check.state === "MALFORMED" ? "" : check.accountId
  const ready = Boolean(customerId) && accountIdAddable(check)
  // Said before anything is typed: without a current list, an ID can be added only as unverified.
  const listing = organizationListing(organization, now)
  const listingProblem = "cannotVerify" in listing ? listing.cannotVerify : null
  const stillReviewed = (current: AccountIdCheck) =>
    reviewed === "LISTED" ? accountIdReviewable(current) : reviewed === "UNVERIFIED" ? accountIdUnverified(current) : false
  const addable = ready && step === "confirm" && stillReviewed(check) && (reviewed !== "UNVERIFIED" || acknowledged)

  function review() {
    const at = Date.now()
    setNow(at)
    const current = checkAt(at)
    if (!customerId || !accountIdAddable(current)) return
    setReviewed(accountIdReviewable(current) ? "LISTED" : "UNVERIFIED")
    setAcknowledged(false)
    setStep("confirm")
  }

  async function submit() {
    // Checked again here, against what the page holds and the wall clock now: only the kind that was reviewed -- and, for
    // an unverified ID, only with the acknowledgement given in its review -- is sent.
    const at = Date.now()
    setNow(at)
    const current = checkAt(at)
    if (!customerId || step !== "confirm" || !stillReviewed(current) || !accountIdAddable(current)) return
    const unverified = reviewed === "UNVERIFIED"
    if (unverified && !acknowledged) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/proxy/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The acknowledgement is the operator's; the server stamps it with the verified person and decides the evidence.
        body: JSON.stringify(unverified
          ? { customer_id: customerId, account_id: current.accountId, acknowledge_unverified: true }
          : { customer_id: customerId, account_id: current.accountId }),
      })
      if (!response.ok) throw await accountAdminFailure(response, "Registration")
      const body = await response.json().catch(() => ({}))
      onRequested({
        accountId: current.accountId,
        requestedAt: typeof body?.requested_at === "string" && body.requested_at ? body.requested_at : new Date().toISOString(),
        alreadyOpen: body?.already_open === true,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="add-member-account-title" className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Account onboarding</p>
            <h2 id="add-member-account-title" className="mt-1 text-xl font-semibold">Add an AWS account</h2>
            <p className="mt-1 text-sm text-slate-500">Cyntro registers the account, then shows the connection stack to deploy in it. Read access only; mutation needs a separate approval.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {step === "details" ? (
          <div role="tablist" aria-label="How to add the account" className="flex gap-2 border-b border-slate-200 px-6 pt-4">
            {([["manual", "Enter account ID"], ["organization", "Choose from your organization"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={source === value}
                onClick={() => setSource(value)}
                className={`border-b-2 px-2 pb-2 text-sm font-semibold ${source === value ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {step === "details" && source === "organization" ? (
          <OrganizationAccountPicker
            customerId={customerId}
            reader={organization}
            checkAccount={(id) => checkAccountId(id, { accounts, platformAccountId, organization, now })}
            onEnterManually={() => setSource("manual")}
            onChoose={(account) => {
              setRaw(account.accountId)
              setChosen(account)
              setSource("manual")
            }}
          />
        ) : step === "details" ? (
        <div className="grid grid-cols-2 gap-4 p-6">
          {listingProblem ? (
            <p data-testid="account-id-dependency" className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Without a current organization list, an account can be added only as unverified: Cyntro reads nothing in it
              until you check access and confirm. {listingProblem} &ldquo;Choose from your organization&rdquo; shows the
              list&apos;s status.
            </p>
          ) : null}
          {chosen && chosen.accountId === accountId ? (
            <p data-testid="chosen-from-organization" className="col-span-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
              Filled from your organization: {chosen.accountId}, named &ldquo;{chosen.name}&rdquo; in AWS Organizations. Nothing has been added. Review, then add it.
            </p>
          ) : null}
          <div className="col-span-2">
            <label className="text-sm font-semibold text-slate-700">AWS account ID<input
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="12-digit account ID"
              inputMode="numeric"
              aria-invalid={check.state === "INELIGIBLE" || (check.state === "MALFORMED" && !check.incomplete)}
              aria-describedby={check.state === "EMPTY" ? "add-account-name-from-aws" : "add-account-id-check add-account-name-from-aws"}
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-mono font-normal outline-none focus:border-teal-500"
            /></label>
            <AccountIdFeedback check={check} />
            {/* The account's name is AWS's, never typed (Alon, 2026-10-03). */}
            <p id="add-account-name-from-aws" className="mt-1.5 text-xs text-slate-500">The account&apos;s name is read from AWS once it connects.</p>
          </div>
        </div>
        ) : reviewed === "LISTED" && accountIdReviewable(check) ? (
          <AddAccountConfirmation check={check} />
        ) : reviewed === "UNVERIFIED" && accountIdUnverified(check) ? (
          <UnverifiedAddConfirmation check={check} role={memberReadRoleName(customerId || "")} acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
        ) : (
          // The page learned something since Review (a registry refresh, an organization read): said, and Add is off.
          <div className="p-6">
            <p role="alert" data-testid="account-id-recheck" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {check.state === "INELIGIBLE" || check.state === "CANNOT_VERIFY" ? check.reason
                : check.state === "MALFORMED" ? check.problem
                : check.state === "LISTED" ? "Your organization's list now holds this account. Go back and review it again."
                : "Enter an AWS account ID."} Nothing was added.
            </p>
          </div>
        )}
        {error ? <div role="alert" className="mx-6 mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          {step === "details" ? (
            <button onClick={onClose} className="text-sm font-semibold text-slate-500">Cancel</button>
          ) : (
            <button onClick={() => { setStep("details"); setError(null) }} disabled={submitting} className="text-sm font-semibold text-slate-500">Back</button>
          )}
          {step === "details" && source === "organization" ? (
            <span />
          ) : step === "details" ? (
            <button disabled={!ready} onClick={review} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Review
            </button>
          ) : (
            <button disabled={!addable || submitting} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {reviewed === "UNVERIFIED" ? "Add as unverified" : "Add account"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * What adding a LISTED account does, said before it is done -- in the account connector's own terms (Stage1B G9: the listed
 * registration is recorded as pending and reads nothing; S2: the access check's calls; S3a: only the confirmation turns
 * reads on and queues the first inventory). The same journey as an unverified account, without its acknowledgement.
 */
function AddAccountConfirmation({ check }: { check: Extract<AccountIdCheck, { state: "LISTED" | "UNVERIFIED" }> }) {
  return (
    <div data-testid="add-account-confirmation" className="space-y-4 p-6 text-sm text-slate-700">
      <p className="text-base font-semibold text-slate-900">Add AWS account {check.accountId}?</p>
      {check.state === "LISTED" ? (
        // The account's name in the organization's current list; shown, never sent.
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="font-semibold text-slate-500">Name in AWS Organizations</dt><dd>{check.name}</dd>
        </dl>
      ) : null}
      <p data-testid="account-id-evidence" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        {accountIdEvidenceText(check)}
      </p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Cyntro registers this account with this installation as pending. Nothing in it is read yet.</li>
        <li>Next, deploy the connection stack in that account (shown once the account is added), in this installation&apos;s own Region.</li>
        <li>Then check access: Cyntro assumes its read role there and asks AWS which account answered, and its name. AWS may log these calls in that account. Nothing else is read.</li>
        <li>If the check reaches the account, you confirm it. Only your confirmation turns reading on and starts collection: its configuration is read and its first inventory is queued.</li>
        <li>Cyntro shows the account by the name AWS holds for it once it is read; until then, by its ID. Business systems in this account are defined after it connects; one account can hold several.</li>
        <li>Read access only: nothing in the account is changed.</li>
      </ul>
    </div>
  )
}

/**
 * Option C: adding an ID with no current evidence, said before it is done -- in the connector's own terms (S1b: the
 * unverified registration makes no AWS call; S2: the access check's three calls; S3a: only the confirmation turns reads on).
 * The acknowledgement is required, given here, and never pre-ticked.
 */
function UnverifiedAddConfirmation({
  check,
  role,
  acknowledged,
  onAcknowledge,
}: {
  check: Extract<AccountIdCheck, { state: "CANNOT_VERIFY" }>
  role: string
  acknowledged: boolean
  onAcknowledge: (value: boolean) => void
}) {
  return (
    <div data-testid="add-account-unverified-confirmation" className="space-y-4 p-6 text-sm text-slate-700">
      <p className="text-base font-semibold text-slate-900">Add AWS account {check.accountId} as unverified?</p>
      <p data-testid="account-id-evidence" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{check.reason}</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Cyntro registers the account as pending and makes no AWS call: nothing in it is read.</li>
        <li>Next, deploy the connection stack in that account; it is shown once the account is added.</li>
        <li>Then check access: Cyntro assumes {role} there and asks AWS which account answered, and its name. AWS may log these calls in that account. Nothing else is read.</li>
        <li>If the check reaches the account, you confirm it. Only your confirmation turns reading on and starts collection.</li>
        <li>Read access only: nothing in the account is changed.</li>
      </ul>
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs">
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} className="mt-0.5" />
        <span>I recognise account {check.accountId} and want to add it, although Cyntro cannot verify it against my organization&apos;s account list.</span>
      </label>
    </div>
  )
}

/** What the account ID check found, beside the field; announced politely as it changes. */
function AccountIdFeedback({ check }: { check: AccountIdCheck }) {
  // Option C: an unverifiable ID is not refused -- it can be added on the guarded unverified path -- but it is said plainly.
  const refused = check.state === "INELIGIBLE" || (check.state === "MALFORMED" && !check.incomplete)
  const text =
    check.state === "MALFORMED" ? check.problem
    : check.state === "INELIGIBLE" || check.state === "CANNOT_VERIFY" ? check.reason
    : accountIdReviewable(check) ? accountIdEvidenceText(check)
    : ""
  return (
    <p
      id="add-account-id-check"
      data-testid="account-id-check"
      aria-live="polite"
      className={`mt-1.5 text-xs ${refused ? "font-semibold text-red-700" : "text-slate-600"}`}
    >
      {text}
    </p>
  )
}

function AddAccountDialog({ customerId, onClose, onCreated }: { customerId: string | null; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [environment, setEnvironment] = useState(DEFAULT_ENVIRONMENT)
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
      if (!response.ok) throw await accountAdminFailure(response, "Registration")
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
              <EnvironmentSelect value={environment} onChange={setEnvironment} />
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
