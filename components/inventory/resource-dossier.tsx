"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react"
import { ServiceTypeBadge } from "@/lib/service-type"
import { useAccountScope } from "@/lib/account-scope-context"
import type {
  Assertion,
  BasisClass,
  Coverage,
  DependenciesPayload,
  DossierSection,
  ServeState,
} from "@/lib/resource-dossier-types"
import { DependenciesTab } from "./dependencies-tab"
import { EvidenceRefList, StateBadge } from "./dossier-primitives"
import {
  isResourceDependenciesResponse,
  type ResourceDependenciesResponse,
} from "@/lib/resource-dependencies"

interface ProfileFact {
  key: string
  label: string
  assertion: Assertion
}

interface ProfileFactsPayload {
  profile_id: string
  facts: ProfileFact[]
}

interface ResourceDossierData {
  identity: {
    tenant: string
    account: string
    aws_partition: string
    canonical_resource_uid: string
    region: string | null
  }
  purpose: DossierSection<{
    summary: string | null
    not_established_reason: string | null
    assertion: Assertion<string>
    profile_id?: string
    profile_label?: string
  }>
  lifecycle: DossierSection<ProfileFactsPayload>
  fitness: DossierSection<ProfileFactsPayload>
  dependencies: DossierSection<DependenciesPayload>
  changes: DossierSection<never>
  actions: DossierSection<never>
  evidence: DossierSection<{
    assertions: Assertion[]
    coverage: Coverage
    diagnostics: string[]
    missing_immutable_evidence_bindings: number
  }>
  serve_state: Exclude<ServeState, "NOT_APPLICABLE">
  dossier_generation: string
  dossier_schema_version: string
  dossier_builder_version: string
  source_vector_hash: string
  source_generations: Record<string, string>
  change_readiness: "READY" | "READY_WITH_CONDITIONS" | "NOT_READY" | "HELD"
  assembly?: {
    cache: "HIT" | "MISS" | "BYPASS"
    cache_eligible: boolean
    latency_ms: number
    missing_source_heads: string[]
  }
}

interface Props {
  resourceId: string
  resourceName?: string
  resourceType?: string | null
  systemName: string
  vpcId?: string | null
  accountId?: string | null
  region?: string | null
  onClose: () => void
}

type Tab = "purpose" | "dependencies" | "evidence"

export function formatFactValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Unavailable"
  if (key === "internet_exposed" && typeof value === "boolean") return value ? "Publicly reachable" : "No public exposure in collected configuration"
  if (key === "fifo_queue" && typeof value === "boolean") return value ? "FIFO" : "Standard"
  if (key === "memory_mb" && typeof value === "number") return `${value.toLocaleString()} MB`
  if (key === "timeout_seconds" && typeof value === "number") return `${value.toLocaleString()} seconds`
  if (key === "allocated_storage" && typeof value === "number") return `${value.toLocaleString()} GiB`
  if (["maximum_message_size", "size_bytes", "stored_bytes"].includes(key) && typeof value === "number") return `${value.toLocaleString()} bytes`
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled"
  if (Array.isArray(value)) {
    const visible = value.slice(0, 6).map(String)
    return `${visible.join(", ")}${value.length > visible.length ? ` +${value.length - visible.length} more` : ""}`
  }
  if (typeof value === "object") return "Collected configuration available"
  if ((key.includes("time") || key.includes("created") || key.includes("seen") || key.includes("used") || key.includes("collected")) && typeof value === "string") {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleString()
  }
  return String(value)
}

function diagnosticText(value: string) {
  if (value.includes("mode=identity_only") || value.includes("substantive_projection=NOT_READY")) {
    return "Canonical identity is verified; service-specific configuration and activity evidence are not available in this profile."
  }
  return value.replaceAll("NOT_READY", "not available")
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || data.error || `Request failed (${response.status})`)
  return data
}

export function ResourceDossier({
  resourceId,
  resourceName,
  resourceType,
  systemName,
  accountId,
  region,
  onClose,
}: Props) {
  const scope = useAccountScope()
  const [tab, setTab] = useState<Tab>("purpose")
  const [data, setData] = useState<ResourceDossierData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedAssertion, setExpandedAssertion] = useState<number | null>(null)
  const [dependencies, setDependencies] = useState<ResourceDependenciesResponse | null>(null)
  const [dependenciesError, setDependenciesError] = useState<string | null>(null)
  const [dependenciesLoading, setDependenciesLoading] = useState(false)

  useEffect(() => {
    // The dossier is a viewport-fixed modal panel. Lock the page underneath it
    // so wide inventory tables cannot expose a horizontal body scrollbar at
    // narrow breakpoints while the panel itself remains correctly scrollable.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    setLoading(true)
    setDependencies(null)
    setDependenciesError(null)
    const query = new URLSearchParams({
      resource_id: resourceId,
      window_days: "90",
    })
    const resolvedAccount = accountId && accountId !== "all" ? accountId : scope.accountId
    const resolvedRegion = region && region !== "all" ? region : scope.region
    if (resolvedAccount && resolvedAccount !== "all") query.set("account_id", resolvedAccount)
    if (resolvedRegion && resolvedRegion !== "all") query.set("region", resolvedRegion)
    fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/resource-dossier?${query}`, { cache: "no-store" })
      .then(readJson)
      .then(body => { if (!cancelled) setData(body) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountId, region, resourceId, scope.accountId, scope.region, systemName])

  useEffect(() => {
    if (tab !== "dependencies" || !data) return
    let cancelled = false
    setDependenciesLoading(true)
    setDependenciesError(null)
    const query = new URLSearchParams({
      resource_id: resourceId,
      page_size: "200",
    })
    const resolvedAccount = (accountId && accountId !== "all" ? accountId : null)
      || data.identity.account
      || (scope.accountId && scope.accountId !== "all" ? scope.accountId : null)
    if (resolvedAccount) query.set("account_id", resolvedAccount)
    fetch(`/api/proxy/resource-dependencies/${encodeURIComponent(systemName)}?${query}`, { cache: "no-store" })
      .then(readJson)
      .then(body => {
        if (cancelled) return
        if (!isResourceDependenciesResponse(body)) {
          throw new Error("Dependency read model returned an unexpected payload")
        }
        setDependencies(body)
      })
      .catch(cause => {
        if (!cancelled) setDependenciesError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => { if (!cancelled) setDependenciesLoading(false) })
    return () => { cancelled = true }
  }, [accountId, data, resourceId, scope.accountId, systemName, tab])

  const counts = data?.dependencies.payload?.counts_by_basis
  const lifecycleFacts = data?.lifecycle.payload?.facts ?? []
  const fitnessFacts = data?.fitness.payload?.facts ?? []
  const hasConfigurationProfile = Boolean(data?.purpose.payload?.profile_id)

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "purpose", label: "Purpose" },
    { id: "dependencies", label: "Dependencies" },
    { id: "evidence", label: "Technical evidence" },
  ]

  // Roving-focus arrow keys, per the WAI-ARIA tabs pattern (DE-307).
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    const jump = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
    if (!step && jump === null) return
    event.preventDefault()
    const current = tabs.findIndex(item => item.id === tab)
    const next = jump ?? (current + step + tabs.length) % tabs.length
    setTab(tabs[next].id)
    document.getElementById(`dossier-tab-${tabs[next].id}`)?.focus()
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[240] flex w-full max-w-[680px] flex-col border-l border-slate-200 bg-white shadow-2xl" role="dialog" aria-label={`Resource dossier for ${resourceName ?? resourceId}`}>
      <header className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 px-5 py-4 text-white">
        <div className="flex items-start gap-3">
          <ServiceTypeBadge type={resourceType ?? "Resource"} variant="tile" size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Resource dossier · v6</div>
            <h2 className="mt-1 truncate text-lg font-bold">{resourceName ?? resourceId}</h2>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-400">{data?.identity.canonical_resource_uid ?? resourceId}</div>
            {data ? <div className="mt-2 flex flex-wrap gap-2"><StateBadge value={data.serve_state} /><StateBadge value={data.purpose.coverage?.state ?? "UNKNOWN"} axis="coverage" /></div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close dossier"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <div role="tablist" aria-label="Resource dossier sections" className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-3 pt-2" onKeyDown={onTabKeyDown}>
        {tabs.map(item => (
          <button
            key={item.id}
            id={`dossier-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`dossier-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            disabled={!data}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-2 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:text-slate-300 ${tab === item.id && data ? "border-teal-500 bg-white text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >{item.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F4F6F8] p-5">
        {loading ? <div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Assembling generation-pinned evidence…</div> : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-white p-5">
            <div className="flex items-center gap-2 font-semibold text-slate-950"><CircleHelp className="h-5 w-5 text-amber-600" />Resource dossier unavailable</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{error}</p>
            <p className="mt-3 text-xs leading-5 text-slate-500">No legacy, inferred, or client-generated dossier is shown when the canonical server profile is unavailable.</p>
          </div>
        ) : null}

        {data && tab === "purpose" ? (
          <div id="dossier-panel-purpose" role="tabpanel" aria-labelledby="dossier-tab-purpose" className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{hasConfigurationProfile ? "Operational profile" : data.serve_state === "NOT_READY" ? "Identity profile" : "Established purpose"}</div><StateBadge value={data.purpose.serve_state} /></div>
              {data.purpose.payload?.summary ? (
                <h3 className="mt-3 text-lg font-bold leading-7 text-slate-950">{data.purpose.payload.summary}</h3>
              ) : (
                <div className="mt-3 flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span>{data.serve_state === "NOT_READY" ? "Canonical identity is verified. Service-specific configuration and activity evidence are not available in this profile." : <>Purpose not established. {data.purpose.payload?.not_established_reason}</>}</span></div>
              )}
              {data.purpose.notes ? <p className="mt-3 text-xs leading-5 text-slate-500">{data.purpose.notes}</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div><div className="font-semibold text-slate-900">Authority</div>{data.purpose.payload?.assertion.authority_basis}</div>
                <div><div className="font-semibold text-slate-900">Evidence window</div>{data.purpose.payload?.assertion.window?.days ? `${data.purpose.payload.assertion.window.days} days` : "Not applicable"}</div>
              </div>
            </section>
            {hasConfigurationProfile ? (
              <>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 font-semibold text-slate-950"><Clock3 className="h-4 w-4 text-teal-700" />Lifecycle</div>
                  {lifecycleFacts.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{lifecycleFacts.map(fact => (
                    <div key={fact.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{fact.label}</div>
                      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{formatFactValue(fact.key, fact.assertion.value)}</div>
                      <div className="mt-2"><StateBadge value={fact.assertion.state} /></div>
                    </div>
                  ))}</div> : <p className="mt-3 text-xs text-slate-600">{data.lifecycle.notes ?? "No lifecycle fields were present in the collected configuration."}</p>}
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 font-semibold text-slate-950"><Gauge className="h-4 w-4 text-teal-700" />Configuration and posture</div>
                  {fitnessFacts.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{fitnessFacts.map(fact => (
                    <div key={fact.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{fact.label}</div>
                      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{formatFactValue(fact.key, fact.assertion.value)}</div>
                      <div className="mt-2"><StateBadge value={fact.assertion.state} /></div>
                    </div>
                  ))}</div> : <p className="mt-3 text-xs text-slate-600">{data.fitness.notes ?? "No posture fields were present in the collected configuration."}</p>}
                </section>
              </>
            ) : null}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck className="h-4 w-4 text-teal-700" />Evidence coverage</div>
              <div className="mt-3 flex items-center gap-2"><StateBadge value={data.purpose.coverage?.state ?? "UNKNOWN"} axis="coverage" /><span className="text-xs text-slate-500">Coverage determines which conclusions are safe to make.</span></div>
              {data.purpose.coverage?.missing_sources.length ? <p className="mt-3 text-xs text-amber-800">Additional evidence needed: {data.purpose.coverage.missing_sources.join(", ")}</p> : null}
            </section>
            <section className="grid grid-cols-3 gap-3">
              {(["OBSERVED", "CONFIGURED", "STRUCTURAL"] as BasisClass[]).map(basis => <div key={basis} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-2xl font-bold text-slate-950">{counts?.[basis] ?? 0}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{basis}</div></div>)}
              <p className="col-span-3 text-[11px] text-slate-500">Basis classes are separate proof sets and are never added into a consumer total.</p>
            </section>
          </div>
        ) : null}

        {data && tab === "dependencies" ? (
          <div id="dossier-panel-dependencies" role="tabpanel" aria-labelledby="dossier-tab-dependencies">
            <DependenciesTab
              payload={dependencies}
              loading={dependenciesLoading}
              error={dependenciesError}
              coverage={dependencies?.coverage ?? data.dependencies.coverage}
              serveState={data.dependencies.serve_state}
              notes={data.dependencies.notes}
              resourceType={resourceType}
            />
          </div>
        ) : null}

        {data && tab === "evidence" ? (
          <div id="dossier-panel-evidence" role="tabpanel" aria-labelledby="dossier-tab-evidence" className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">Evidence status</span><StateBadge value={data.evidence.serve_state} /></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Object-level evidence links unavailable</span><span>{data.evidence.payload?.missing_immutable_evidence_bindings ?? 0}</span></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Assembly cache</span><span>{data.assembly?.cache ?? "UNREPORTED"}{data.assembly ? ` · ${data.assembly.latency_ms} ms` : ""}</span></div>
              {data.assembly?.missing_source_heads.length ? <div className="mt-3 text-amber-800">Cache reuse held: missing activated {data.assembly.missing_source_heads.join(", ")} head{data.assembly.missing_source_heads.length === 1 ? "" : "s"}.</div> : null}
            </section>
            {data.evidence.payload?.diagnostics.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">{data.evidence.payload.diagnostics.map(item => <div key={item}>{diagnosticText(item)}</div>)}</section> : null}
            <section className="space-y-2">
              {data.evidence.payload?.assertions.map((assertion, index) => (
                <article key={`${assertion.basis}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button type="button" onClick={() => setExpandedAssertion(expandedAssertion === index ? null : index)} className="flex w-full items-center gap-3 p-4 text-left">
                    {assertion.evidence_refs.length ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-950">{assertion.basis}</div><div className="text-[10px] text-slate-500">{assertion.sources.join(", ") || "No source declared"} · {new Date(assertion.as_of).toLocaleString()}</div></div>
                    <StateBadge value={assertion.state} />
                    {expandedAssertion === index ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {expandedAssertion === index ? <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 text-xs"><div><strong>Authority:</strong> {assertion.authority_basis}</div><EvidenceRefList refs={assertion.evidence_refs} sourceRefs={assertion.source_generation_refs} />{assertion.value !== null ? <div className="rounded border border-slate-200 bg-white p-3 text-slate-700"><strong>Verified value:</strong> {formatFactValue("assertion", assertion.value)}</div> : null}</div> : null}
                </article>
              ))}
            </section>
          </div>
        ) : null}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-[10px] text-slate-500"><span>{data?.dossier_schema_version ?? "dossier-v6"}</span><span className="truncate font-mono">source {data?.source_vector_hash.slice(0, 12) ?? "unavailable"}</span></footer>
    </aside>
  )
}
