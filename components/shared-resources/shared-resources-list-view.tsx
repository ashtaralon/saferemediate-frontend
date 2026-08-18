"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  GitBranch,
  History,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react"
import {
  HEADLINE_STATE_PRESENTATION,
  type ConsumerPreview,
  type HeadlineState,
  type NarrowingDiff,
  type NarrowingMetrics,
  type SharedAccessIsolation,
  type SharedResourceRow,
  type SharedRoleRow,
  type SharedSGRow,
  type SharedSGRowRaw,
} from "./types"
import { NarrowingDiffPanel } from "./narrowing-diff-panel"

interface SharedRolesApiResponse {
  shared_roles?: Array<Omit<SharedRoleRow, "type">>
  roles?: Array<Omit<SharedRoleRow, "type">>
}

interface SharedSGsApiResponse {
  shared_sgs?: SharedSGRowRaw[]
  sgs?: SharedSGRowRaw[]
}

interface Props {
  systemName?: string
  embedded?: boolean
}

type ResourceFilter = "all" | "iam-role" | "security-group"

function fallbackIsolation(
  kind: "iam_role" | "security_group",
  metrics: NarrowingMetrics,
  protectedControl: boolean,
): SharedAccessIsolation {
  const isIam = kind === "iam_role"
  return {
    resource_kind: kind,
    strategy: isIam
      ? "dedicated_role_per_workload_group"
      : "dedicated_sg_per_workload_group",
    customer_value: isIam
      ? "Reduce identity blast radius by giving each workload group a dedicated role containing only its supported access."
      : "Reduce network blast radius by moving each workload group from the shared attachment to a dedicated Security Group.",
    protection: {
      level: protectedControl
        ? isIam ? "aws_service_linked" : "aws_default"
        : "customer_managed",
      automation_allowed: !protectedControl,
      reason: protectedControl
        ? "This control is platform-managed. Cyntro keeps it visible and protects it from automated replacement."
        : null,
    },
    evidence: {
      configured_count: metrics.allowed_count,
      observed_count: metrics.keep_count,
      unconfirmed_count: metrics.narrow_count,
      investigation_count: metrics.investigation_count,
      coverage_state:
        metrics.headline_state === "awaiting_observation" ? "collecting" : "observed",
      absence_claim_allowed: false,
    },
    capabilities: {
      preview: !protectedControl,
      create_scoped_controls: !protectedControl,
      staged_migration: !protectedControl,
      staged_scope: isIam ? "supported_workload_groups" : "lambda_consumers_v1",
      snapshot: true,
      history_checkpoints: true,
      verification: true,
      restore: true,
      permission_narrowing: isIam && !protectedControl,
      rule_narrowing: false,
    },
    enablement: {
      inventory: true,
      plan_preview: !protectedControl,
      // Older backend payloads do not expose account mutation flags.
      // Fail closed for IAM; SG CREATE_ONLY is on unless its global
      // kill switch is set (in which case the list endpoint is unavailable).
      create_scoped_controls: !protectedControl && !isIam,
      staged_migration: false,
      resource_opt_in: isIam ? "allowlist_required_for_staged_migration" : "required_for_staged_migration",
      resource_opt_in_state: "evaluated_in_plan",
    },
    readiness: {
      plan: !protectedControl,
      create: false,
      migrate: false,
      blocked_reasons: [],
    },
  }
}

function normalizeSG(raw: SharedSGRowRaw): SharedSGRow {
  const n = raw.narrowing ?? {
    allowed_count: 0,
    keep_count: 0,
    narrow_count: 0,
    investigation_count: 0,
    narrowable_pct: 0,
    headline_state: "no_rule_data" as HeadlineState,
    is_platform_owned: false,
    sort_score: 0,
  }
  const allowedCount = n.allowed_count ?? 0
  const trafficPortsObserved = n.traffic_ports_observed ?? 0
  // SG `keep_count` includes fail-closed rules whose traffic evidence is not
  // authoritative yet (especially outbound rules). The collapsed overview
  // must not present those safety-retained rules as positively observed.
  const observedCount =
    trafficPortsObserved > 0
      ? Math.min(
          trafficPortsObserved,
          Math.max(0, (n.keep_count ?? 0) - (raw.rule_summary?.outbound ?? 0)),
        )
      : 0
  const unconfirmedCount = Math.max(
    n.narrow_count ?? 0,
    allowedCount - observedCount,
  )
  const metrics: NarrowingMetrics = {
    allowed_count: allowedCount,
    keep_count: observedCount,
    narrow_count: unconfirmedCount,
    investigation_count: n.investigation_count ?? 0,
    narrowable_pct:
      allowedCount > 0
        ? Math.round((unconfirmedCount / allowedCount) * 100)
        : 0,
    headline_state: n.headline_state ?? "no_rule_data",
    is_platform_owned: Boolean(n.is_platform_owned),
    sort_score: n.sort_score ?? 0,
  }
  const hardBlocks = (raw.verdict?.blocked_reasons ?? []).filter(
    (blocker) => blocker.severity === "hard",
  )
  const systems = Array.from(
    new Set(
      (raw.topology?.systems ?? [])
        .map((system) => system.trim())
        .filter(Boolean),
    ),
  )
  return {
    type: "security-group",
    sg_id: raw.sg_id,
    sg_name: raw.sg_name || raw.sg_id,
    vpc_id: raw.vpc_id,
    consumer_count: raw.consumer_count ?? 0,
    consumer_preview: raw.consumer_preview ?? [],
    consumer_breakdown: raw.consumer_breakdown ?? {},
    systems,
    rule_summary: raw.rule_summary ?? {
      inbound: 0,
      outbound: 0,
      unused: 0,
      high_risk: 0,
      has_public_ingress: false,
    },
    traffic_ports_observed: trafficPortsObserved,
    has_blocked_reasons: hardBlocks.length > 0,
    blocked_reasons: raw.verdict?.blocked_reasons ?? [],
    has_active_plan: Boolean(raw.has_active_plan),
    active_plan_id: raw.active_plan_id ?? null,
    isolation:
      raw.isolation ?? fallbackIsolation("security_group", metrics, metrics.is_platform_owned),
    ...metrics,
  }
}

function normalizeIAM(raw: Omit<SharedRoleRow, "type">): SharedRoleRow {
  const metrics: NarrowingMetrics = {
    allowed_count: raw.allowed_count ?? 0,
    keep_count: raw.keep_count ?? 0,
    narrow_count: raw.narrow_count ?? 0,
    investigation_count: raw.investigation_count ?? 0,
    narrowable_pct: raw.narrowable_pct ?? 0,
    headline_state: raw.headline_state ?? "no_lp_data",
    is_platform_owned: Boolean(raw.is_platform_owned),
    sort_score: raw.sort_score ?? 0,
  }
  const isServiceLinked =
    raw.role_name?.startsWith("AWSServiceRoleFor") ||
    raw.role_arn?.includes("/aws-service-role/")
  return {
    type: "iam-role",
    ...raw,
    ...metrics,
    isolation:
      raw.isolation ?? fallbackIsolation("iam_role", metrics, Boolean(isServiceLinked)),
  }
}

export function SharedResourcesListView({ systemName: systemNameProp, embedded = false }: Props) {
  const router = useRouter()
  const [resolvedSystemName, setResolvedSystemName] = useState(systemNameProp ?? "")
  const [rows, setRows] = useState<SharedResourceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllStates, setShowAllStates] = useState(true)
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>("all")
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [planBusyId, setPlanBusyId] = useState<string | null>(null)
  const [planError, setPlanError] = useState<Record<string, string>>({})

  useEffect(() => {
    if (systemNameProp) setResolvedSystemName(systemNameProp)
  }, [systemNameProp])

  useEffect(() => {
    if (systemNameProp || resolvedSystemName) return
    let cancelled = false
    ;(async () => {
      const fromUrl = new URLSearchParams(window.location.search).get("system")
      if (fromUrl) {
        if (!cancelled) setResolvedSystemName(fromUrl)
        return
      }
      try {
        const response = await fetch("/api/proxy/systems", { cache: "no-store" })
        const json = response.ok ? await response.json() : {}
        const name = (json.systems ?? [])[0]?.name
        if (!cancelled && typeof name === "string" && name) setResolvedSystemName(name)
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolvedSystemName, systemNameProp])

  const fetchAll = useCallback(async () => {
    if (!resolvedSystemName) return
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ system_name: resolvedSystemName })
      const [iamResponse, sgResponse] = await Promise.all([
        fetch(`/api/proxy/iam/shared-roles?${query}`, { cache: "no-store" }),
        fetch(`/api/proxy/sg/shared-sgs?${query}`, { cache: "no-store" }),
      ])
      if (!iamResponse.ok) {
        throw new Error(`IAM inventory ${iamResponse.status}: ${await iamResponse.text()}`)
      }
      if (!sgResponse.ok) {
        throw new Error(`Network inventory ${sgResponse.status}: ${await sgResponse.text()}`)
      }
      const iamJson = (await iamResponse.json()) as SharedRolesApiResponse
      const sgJson = (await sgResponse.json()) as SharedSGsApiResponse
      const merged = [
        ...(iamJson.shared_roles ?? iamJson.roles ?? []).map(normalizeIAM),
        ...(sgJson.shared_sgs ?? sgJson.sgs ?? []).map(normalizeSG),
      ].sort((a, b) => {
        const scoreDelta = b.sort_score - a.sort_score
        if (scoreDelta !== 0) return scoreDelta
        return rowDisplayName(a).localeCompare(rowDisplayName(b))
      })
      setRows(merged)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [resolvedSystemName])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (rows ?? []).filter((row) => {
      if (resourceFilter !== "all" && row.type !== resourceFilter) return false
      if (!showAllStates && !isActionable(row)) return false
      if (!needle) return true
      const searchable = [
        rowDisplayName(row),
        rowIdentifier(row),
        ...(row.type === "iam-role" ? row.system_tags : row.systems),
      ]
        .join(" ")
        .toLowerCase()
      return searchable.includes(needle)
    })
  }, [resourceFilter, rows, search, showAllStates])

  const summary = useMemo(() => {
    const allRows = rows ?? []
    return {
      controls: allRows.length,
      attachments: allRows.reduce((sum, row) => sum + row.consumer_count, 0),
      opportunities: allRows.filter(isActionable).length,
      protected: allRows.filter((row) => !row.isolation?.protection.automation_allowed).length,
    }
  }, [rows])

  const openPlan = useCallback(
    (row: SharedResourceRow, planId: string) => {
      router.push(
        row.type === "iam-role"
          ? `/iam/shared-roles/by-plan/${encodeURIComponent(planId)}`
          : `/sg/shared-sgs/by-plan/${encodeURIComponent(planId)}`,
      )
    },
    [router],
  )

  const previewIsolation = useCallback(
    async (row: SharedResourceRow) => {
      if (row.has_active_plan && row.active_plan_id) {
        openPlan(row, row.active_plan_id)
        return
      }
      const key = rowKey(row)
      setPlanBusyId(key)
      setPlanError((current) => ({ ...current, [key]: "" }))
      try {
        const query = new URLSearchParams(
          row.type === "iam-role"
            ? { role_ref: row.role_arn || row.role_name }
            : { sg_ref: row.sg_id },
        )
        const response = await fetch(
          row.type === "iam-role"
            ? `/api/proxy/iam/shared-roles/split-plan?${query}`
            : `/api/proxy/sg/shared-sgs/split-plan?${query}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requested_by: "cyntro-ui" }),
          },
        )
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.plan_id) {
          const message = body?.detail?.message ?? body?.detail ?? body?.error ?? "Plan preview failed"
          throw new Error(typeof message === "string" ? message : JSON.stringify(message))
        }
        openPlan(row, body.plan_id)
      } catch (caught) {
        setPlanError((current) => ({
          ...current,
          [key]: caught instanceof Error ? caught.message : String(caught),
        }))
      } finally {
        setPlanBusyId(null)
      }
    },
    [openPlan],
  )

  return (
    <section className="flex flex-col gap-5" data-shared-access-isolation data-system-name={resolvedSystemName}>
      <SharedAccessHero systemName={resolvedSystemName} embedded={embedded} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Boxes} label="Shared controls" value={summary.controls} detail="IAM roles + Security Groups" tone="violet" />
        <MetricCard icon={GitBranch} label="Connected attachments" value={summary.attachments} detail="Across shared control boundaries" tone="blue" />
        <MetricCard icon={Sparkles} label="Isolation opportunities" value={summary.opportunities} detail="Ready for a safe plan preview" tone="teal" />
        <MetricCard icon={LockKeyhole} label="Protected controls" value={summary.protected} detail="Visible, never auto-replaced" tone="amber" />
      </div>

      <OperationFramework />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FilterButton active={resourceFilter === "all"} onClick={() => setResourceFilter("all")} label="All shared" count={rows?.length ?? 0} />
            <FilterButton active={resourceFilter === "iam-role"} onClick={() => setResourceFilter("iam-role")} label="IAM roles" count={(rows ?? []).filter((row) => row.type === "iam-role").length} icon={KeyRound} />
            <FilterButton active={resourceFilter === "security-group"} onClick={() => setResourceFilter("security-group")} label="Security Groups" count={(rows ?? []).filter((row) => row.type === "security-group").length} icon={Network} />
            <button
              type="button"
              onClick={() => setShowAllStates((current) => !current)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${showAllStates ? "border-slate-200 bg-white text-slate-600" : "border-teal-200 bg-teal-50 text-teal-700"}`}
            >
              {showAllStates ? "Showing every state" : "Isolation opportunities only"}
            </button>
          </div>
          <label className="relative block min-w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search shared controls"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search control or system"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-teal-600" />
            Mapping shared access for {resolvedSystemName || "this system"}…
          </div>
        )}

        {error && (
          <div className="m-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Shared access inventory could not be loaded</div>
              <div className="mt-1 break-words text-xs text-rose-700">{error}</div>
              <button type="button" onClick={() => void fetchAll()} className="mt-2 text-xs font-bold underline">Try again</button>
            </div>
          </div>
        )}

        {!loading && !error && filteredRows.length === 0 && (
          <div className="px-6 py-16 text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-emerald-500" />
            <div className="mt-3 font-semibold text-slate-800">No shared controls match this view</div>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
              {showAllStates
                ? "This system has no IAM role or Security Group attached to more than one discovered workload."
                : "No controls currently have an isolation plan opportunity. Switch to every state to review protected and learning controls."}
            </p>
          </div>
        )}

        {!loading && !error && filteredRows.length > 0 && (
          <div className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const key = rowKey(row)
              return (
                <SharedResourceCard
                  key={key}
                  row={row}
                  expanded={expandedId === key}
                  onToggle={() => setExpandedId((current) => (current === key ? null : key))}
                  onPreview={() => void previewIsolation(row)}
                  previewBusy={planBusyId === key}
                  previewError={planError[key]}
                  onOpenDetail={() => router.push(row.type === "iam-role" ? `/iam/shared-roles?focus=${encodeURIComponent(row.role_name)}` : `/sg/shared-sgs?focus=${encodeURIComponent(row.sg_id)}`)}
                />
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function SharedAccessHero({ systemName, embedded }: { systemName: string; embedded: boolean }) {
  return (
    <header className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white ${embedded ? "p-5" : "p-6"} shadow-sm`}>
      <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-teal-100/60 blur-3xl" />
      <div className="absolute right-32 top-0 h-36 w-36 rounded-full bg-violet-100/50 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">
            <Workflow className="h-4 w-4" />
            Shared access isolation · IAM + network
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">
            See the shared blast radius. Isolate it safely.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            One view of every IAM role and Security Group shared by multiple workloads—what is configured, what is observed, why it matters, and the guarded path to dedicated controls.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><Boxes className="h-4 w-4" /></span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System scope</div>
            <div className="max-w-56 truncate text-sm font-semibold text-slate-800" title={systemName}>{systemName || "Resolving system…"}</div>
          </div>
        </div>
      </div>
    </header>
  )
}

const FRAMEWORK_STEPS = [
  { icon: Eye, label: "Explain", detail: "Risk + evidence" },
  { icon: GitBranch, label: "Preview", detail: "Before + after" },
  { icon: Camera, label: "Checkpoint", detail: "Snapshot + approval" },
  { icon: Activity, label: "Migrate", detail: "Staged change" },
  { icon: ShieldCheck, label: "Verify", detail: "Health + access" },
  { icon: RotateCcw, label: "Restore", detail: "One-click rollback" },
]

function OperationFramework() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.15em] text-teal-300">Every isolation uses the same safety frame</div>
          <div className="mt-1 text-xs text-slate-400">No direct mutation. Every action is explained, checkpointed, verified, recorded and restorable.</div>
        </div>
        <History className="hidden h-5 w-5 text-slate-500 sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {FRAMEWORK_STEPS.map((step, index) => (
          <div key={step.label} className="relative rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-400/10 text-teal-300"><step.icon className="h-3.5 w-3.5" /></span>
              <span className="text-xs font-semibold">{step.label}</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">{step.detail}</div>
            {index < FRAMEWORK_STEPS.length - 1 && <ArrowRight className="absolute -right-3 top-5 z-10 hidden h-3.5 w-3.5 text-slate-600 md:block" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Boxes; label: string; value: number; detail: string; tone: "violet" | "blue" | "teal" | "amber" }) {
  const tones = {
    violet: "bg-violet-50 text-violet-700",
    blue: "bg-blue-50 text-blue-700",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight text-slate-950">{value}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-700">{label}</div>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">{detail}</div>
    </div>
  )
}

function FilterButton({ active, onClick, label, count, icon: Icon }: { active: boolean; onClick: () => void; label: string; count: number; icon?: typeof KeyRound }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      <span className={active ? "text-slate-400" : "text-slate-400"}>{count}</span>
    </button>
  )
}

function SharedResourceCard({ row, expanded, onToggle, onPreview, previewBusy, previewError, onOpenDetail }: { row: SharedResourceRow; expanded: boolean; onToggle: () => void; onPreview: () => void; previewBusy: boolean; previewError?: string; onOpenDetail: () => void }) {
  const [liveDiff, setLiveDiff] = useState<NarrowingDiff | null>(null)
  const presentation = HEADLINE_STATE_PRESENTATION[row.headline_state]
  const protectedFallback = row.type === "iam-role"
    ? row.role_name.startsWith("AWSServiceRoleFor") || row.role_arn.includes("/aws-service-role/")
    : row.is_platform_owned
  const isolation = row.isolation ?? fallbackIsolation(row.type === "iam-role" ? "iam_role" : "security_group", row, protectedFallback)
  const automationAllowed = isolation.protection.automation_allowed
  const activePlan = row.has_active_plan && row.active_plan_id
  const risk = describeRisk(row)
  const Icon = row.type === "iam-role" ? KeyRound : Network
  const statusLabel = !automationAllowed
    ? "Protected by design"
    : activePlan
      ? "Isolation in progress"
      : isolation.readiness.plan
        ? "Isolation plan preview"
        : presentation.label
  const statusClass = !automationAllowed
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : activePlan || isolation.readiness.plan
      ? "border-teal-200 bg-teal-50 text-teal-700"
      : presentation.chipClass

  return (
    <article data-shared-resource-row data-resource-type={row.type} data-resource-id={rowIdentifier(row)} data-headline-state={row.headline_state} className="group">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="grid w-full grid-cols-1 gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(250px,1.2fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.type === "iam-role" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold text-slate-900" title={rowDisplayName(row)}>{rowDisplayName(row)}</span>
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span>{row.type === "iam-role" ? "IAM role" : "Security Group"}</span>
              <span>·</span>
              <span className="max-w-56 truncate font-mono" title={rowIdentifier(row)}>{rowIdentifier(row)}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-slate-400" />{row.consumer_count} connected consumers</div>
          <div className={`mt-1 text-[11px] font-medium ${risk.tone}`}>{risk.label}</div>
        </div>

        <EvidenceBar
          row={row}
          liveMetrics={liveDiff ? {
            allowed_count: liveDiff.allowed_count,
            keep_count: liveDiff.keep_count,
            narrow_count: liveDiff.narrow_count,
            investigation_count: liveDiff.investigation_count,
          } : undefined}
        />

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-4 lg:p-5">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="space-y-4">
              <IsolationCanvas row={row} />
              <NarrowingDiffPanel row={row} onLoaded={setLiveDiff} />
            </div>
            <div className="space-y-3">
              <MeaningCard row={row} isolation={isolation} />
              <SafetyCard row={row} isolation={isolation} />
              <AutomationAvailability isolation={isolation} />
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">What Cyntro will do</div>
                <ol className="mt-3 space-y-2">
                  {operationSteps(row).map((step, index) => (
                    <li key={step} className="flex gap-2 text-xs leading-5 text-slate-600"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span><span>{step}</span></li>
                  ))}
                </ol>
              </div>
              {previewError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{previewError}</div>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={!automationAllowed || previewBusy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : activePlan ? <History className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  {!automationAllowed ? "AWS-managed · visibility only" : activePlan ? "Continue active isolation" : "Preview isolation plan"}
                </button>
                <button type="button" onClick={onOpenDetail} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900">Technical detail</button>
              </div>
              <p className="text-center text-[10px] text-slate-400">Preview is read-only. Approval is required before any AWS change.</p>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function EvidenceBar({ row, liveMetrics }: { row: SharedResourceRow; liveMetrics?: Pick<NarrowingDiff, "allowed_count" | "keep_count" | "narrow_count" | "investigation_count"> }) {
  const configured = liveMetrics?.allowed_count ?? row.allowed_count
  const observed = liveMetrics?.keep_count ?? row.keep_count
  const unconfirmed = liveMetrics?.narrow_count ?? row.narrow_count
  const investigate = liveMetrics?.investigation_count ?? row.investigation_count
  const total = Math.max(configured, 1)
  const observedWidth = Math.min(100, (observed / total) * 100)
  const unconfirmedWidth = Math.min(100 - observedWidth, (unconfirmed / total) * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>{liveMetrics ? "Live configured vs observed" : "Configured vs observed"}</span><span>{configured} total</span></div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-emerald-500" style={{ width: `${observedWidth}%` }} title={`${observed} observed`} />
        <div className="bg-amber-300" style={{ width: `${unconfirmedWidth}%` }} title={`${unconfirmed} not yet confirmed`} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />{observed} observed</span>
        <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />{unconfirmed} unconfirmed</span>
        {investigate > 0 && <span className="text-rose-600">{investigate} investigate</span>}
      </div>
    </div>
  )
}

function IsolationCanvas({ row }: { row: SharedResourceRow }) {
  const consumers = consumerNodes(row)
  const ControlIcon = row.type === "iam-role" ? KeyRound : Network
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-xs font-bold text-slate-800">Blast-radius preview</div>
          <div className="mt-0.5 text-[10px] text-slate-400">Current shared boundary → proposed dedicated boundaries</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Read-only model</span>
      </div>
      <div className="grid gap-px bg-slate-200 md:grid-cols-2">
        <div className="bg-rose-50/60 p-4">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-wider text-rose-600">Before · one shared control</div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-rose-200 bg-white text-rose-600 shadow-sm"><ControlIcon className="h-6 w-6" /></div>
            <div className="h-px w-5 bg-rose-300" />
            <div className="min-w-0 flex-1 space-y-1.5">
              {consumers.map((consumer, index) => <ConsumerPill key={`${consumer.name}-${index}`} consumer={consumer} />)}
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-rose-100/70 px-3 py-2 text-[10px] font-medium text-rose-800">A change to this control can affect every connected workload.</div>
        </div>
        <div className="bg-emerald-50/60 p-4">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-wider text-emerald-700">After · dedicated boundaries</div>
          <div className="space-y-1.5">
            {consumers.map((consumer, index) => (
              <div key={`${consumer.id}-after-${index}`} className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700"><ControlIcon className="h-3.5 w-3.5" /></span>
                <span className="h-px w-3 bg-emerald-300" />
                <ConsumerPill consumer={consumer} />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-emerald-100/70 px-3 py-2 text-[10px] font-medium text-emerald-800">Each workload group gets an independent, reversible access boundary.</div>
        </div>
      </div>
    </div>
  )
}

function ConsumerPill({ consumer }: { consumer: ConsumerPreview }) {
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"><div className="truncate text-[10px] font-bold text-slate-700" title={consumer.name}>{consumer.name}</div><div className="truncate text-[9px] text-slate-400">{friendlyKind(consumer.kind)}</div></div>
}

function MeaningCard({ row, isolation }: { row: SharedResourceRow; isolation: SharedAccessIsolation }) {
  const risk = describeRisk(row)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><CircleAlert className="h-4 w-4" /></span>
        <div>
          <div className="text-xs font-bold text-slate-900">What this means</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">{isolation.customer_value}</p>
          <div className={`mt-2 text-[11px] font-semibold ${risk.tone}`}>{risk.label}</div>
        </div>
      </div>
    </div>
  )
}

function SafetyCard({ row, isolation }: { row: SharedResourceRow; isolation: SharedAccessIsolation }) {
  const collecting = isolation.evidence.coverage_state === "collecting" || row.headline_state === "awaiting_observation"
  return (
    <div className={`rounded-xl border p-4 ${collecting ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ${collecting ? "text-amber-700" : "text-emerald-700"}`}>{collecting ? <Activity className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}</span>
        <div>
          <div className="text-xs font-bold text-slate-900">Evidence guardrail</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {collecting
              ? "Usage learning is still in progress. Unobserved access stays unconfirmed and is retained until coverage and dependency gates prove a safe decision."
              : "Observed use is supported by the current evidence window. Every removal candidate still passes per-item coverage, dependency and rollback gates in the signed plan."}
          </p>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Not observed ≠ unused</div>
        </div>
      </div>
    </div>
  )
}

function AutomationAvailability({ isolation }: { isolation: SharedAccessIsolation }) {
  const enablement = isolation.enablement
  if (!isolation.protection.automation_allowed || !enablement) return null
  const createEnabled = enablement.create_scoped_controls
  const migrateEnabled = enablement.staged_migration
  return (
    <div className={`rounded-xl border p-4 ${createEnabled ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ${createEnabled ? "text-blue-700" : "text-amber-700"}`}><LockKeyhole className="h-4 w-4" /></span>
        <div>
          <div className="text-xs font-bold text-slate-900">Automation availability</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {createEnabled
              ? migrateEnabled
                ? "Plan preview and guarded execution are enabled. Final migration still requires evidence gates, an approved snapshot, and resource opt-in."
                : "Dedicated-control creation is enabled. Staged migration is activated per resource only after evidence review and operator opt-in."
              : "Plan preview is available, while AWS changes are disabled by this account’s change policy. An authorized operator can activate execution after review."}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-emerald-700">Supported</span>
            <span className={`rounded-full border bg-white px-2 py-1 ${createEnabled ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}`}>{createEnabled ? "Create enabled" : "Create disabled by policy"}</span>
            <span className={`rounded-full border bg-white px-2 py-1 ${migrateEnabled ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}`}>{migrateEnabled ? "Migration enabled" : "Migration requires activation"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function operationSteps(row: SharedResourceRow): string[] {
  if (row.type === "iam-role") {
    return [
      "Group consumers and calculate a dedicated permission set from configured access, observed use and dependency evidence.",
      "Simulate trust and policy changes, explain every keep/remove decision, then require approval.",
      "Snapshot the current role attachments and policies before creating dedicated roles.",
      "Migrate in stages, verify workload health and API access, and checkpoint every result in History.",
      "Detach the shared role only after verification; restore from the checkpoint if any gate fails.",
    ]
  }
  return [
    "Group current attachments and preview a dedicated Security Group for each supported workload group.",
    "Preserve the current rules in v1; rule narrowing remains held until direction-aware traffic evidence is authoritative.",
    "Snapshot SG rules and attachments before creating Cyntro-tagged dedicated groups.",
    "Migrate eligible consumers in stages, verify reachability and checkpoint every result in History.",
    "Remove the shared attachment only after verification; restore the original SG list if any gate fails.",
  ]
}

function consumerNodes(row: SharedResourceRow): ConsumerPreview[] {
  if (row.type === "security-group" && row.consumer_preview.length > 0) {
    const preview = row.consumer_preview.slice(0, 4)
    if (row.consumer_count > preview.length) {
      preview.push({ name: `+${row.consumer_count - preview.length} more`, id: "more", kind: "Resource" })
    }
    return preview
  }
  const breakdown = row.type === "iam-role" ? row.consumer_kinds : row.consumer_breakdown
  const nodes = Object.entries(breakdown)
    .filter(([, count]) => Number(count) > 0)
    .slice(0, 4)
    .map(([kind, count]) => ({ name: `${count} ${friendlyKind(kind)}`, id: kind, kind }))
  return nodes.length > 0 ? nodes : [{ name: `${row.consumer_count} connected workloads`, id: "consumers", kind: "Resource" }]
}

function describeRisk(row: SharedResourceRow): { label: string; tone: string } {
  const crossSystem = row.type === "iam-role" ? row.cross_system : row.systems.length > 1
  if (crossSystem) return { label: "High blast radius · spans multiple systems", tone: "text-rose-600" }
  if (row.type === "security-group" && row.rule_summary.has_public_ingress) return { label: "Elevated exposure · includes public ingress", tone: "text-rose-600" }
  if (row.consumer_count >= 8) return { label: "Broad blast radius · many consumers share one boundary", tone: "text-amber-700" }
  return { label: "Shared change boundary · isolate to reduce coupling", tone: "text-slate-500" }
}

function isActionable(row: SharedResourceRow): boolean {
  return Boolean(row.isolation?.protection.automation_allowed && row.isolation?.readiness.plan)
}

function rowKey(row: SharedResourceRow): string {
  return row.type === "iam-role" ? `iam:${row.role_arn}` : `sg:${row.sg_id}`
}

function rowDisplayName(row: SharedResourceRow): string {
  return row.type === "iam-role" ? row.role_name : row.sg_name
}

function rowIdentifier(row: SharedResourceRow): string {
  return row.type === "iam-role" ? row.role_arn : row.sg_id
}

function friendlyKind(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
}
