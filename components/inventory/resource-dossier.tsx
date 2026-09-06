"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react"
import { ServiceTypeBadge } from "@/lib/service-type"
import {
  useResourceDependencies,
  type DependencyRow,
  type Perspective,
} from "./use-resource-dependencies"
import { useAccountScope } from "@/lib/account-scope-context"

type ServeState = "ACTIVE" | "PARTIAL" | "NOT_READY" | "INTEGRITY_HELD" | "NOT_APPLICABLE"
type AssertionState = "OBSERVED" | "CONFIGURED" | "INFERRED" | "UNKNOWN" | "BLOCKED" | "NOT_APPLICABLE"
type BasisClass = "OBSERVED" | "CONFIGURED" | "STRUCTURAL"

interface Coverage {
  state: "FULL" | "PARTIAL" | "NONE" | "UNKNOWN"
  required_sources: string[]
  present_sources: string[]
  missing_sources: string[]
  sufficient_for: string[]
  insufficient_for: string[]
}

interface EvidenceBinding {
  object_key: string
  version_id: string
  digest: string
}

interface SourceGenerationRef {
  plane: string
  generation: string
  head_hash: string
  evidence_binding: EvidenceBinding | null
}

interface Assertion<T = unknown> {
  state: AssertionState
  value: T | null
  basis: string
  sources: string[]
  evidence_refs: EvidenceBinding[]
  authority_basis: string
  as_of: string
  window: { start: string; end: string; days: number } | null
  coverage: Coverage
  source_generation_refs: SourceGenerationRef[]
  policy_version: string | null
}

interface Dependency {
  direction: "UPSTREAM" | "DOWNSTREAM"
  basis_class: BasisClass
  freshness: string
  relationship: string
  principal_canonical_resource_uid?: string | null
  principal_arn?: string | null
  principal_display_name?: string | null
  principal_type?: string | null
  target_canonical_resource_uid?: string | null
  target_arn?: string | null
  target_display_name?: string | null
  target_type?: string | null
  resource_canonical_resource_uid: string
  first_seen?: string | null
  last_seen?: string | null
  observation_days?: number | null
  actions?: string[]
  read_prefixes?: string[]
  write_prefixes?: string[]
  delete_prefixes?: string[]
  via_vpce?: string | null
  evidence_refs: EvidenceBinding[]
  source_generation_refs: SourceGenerationRef[]
}

interface DossierSection<T> {
  serve_state: ServeState
  payload: T | null
  coverage: Coverage | null
  notes: string | null
}

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
  dependencies: DossierSection<{
    ledger: Dependency[]
    counts_by_basis: Record<BasisClass, number>
  }>
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

function StateBadge({ value, axis = "state" }: { value: string; axis?: "state" | "coverage" }) {
  const style = value === "ACTIVE" || value === "FULL" || value === "OBSERVED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "PARTIAL" || value === "CONFIGURED" || value === "STRUCTURAL"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : value === "INTEGRITY_HELD" || value === "HELD" || value === "BLOCKED"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-50 text-slate-600"
  const labels: Record<string, string> = axis === "coverage" ? {
    FULL: "Complete coverage",
    PARTIAL: "Partial coverage",
    NONE: "No coverage proof",
    UNKNOWN: "Coverage unverified",
  } : {
    ACTIVE: "Verified profile",
    PARTIAL: "Evidence available",
    NOT_READY: "Identity available",
    INTEGRITY_HELD: "Evidence review",
    NOT_APPLICABLE: "Not applicable",
    OBSERVED: "Observed",
    CONFIGURED: "Configured",
    STRUCTURAL: "Structural",
    INFERRED: "Inferred",
    BLOCKED: "Evidence blocked",
    HELD: "Evidence held",
  }
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{labels[value] ?? value.replaceAll("_", " ")}</span>
}

function canonicalDependencyIdentity(dependency: Dependency) {
  return dependency.principal_arn
    ?? dependency.principal_canonical_resource_uid
    ?? dependency.target_arn
    ?? dependency.target_canonical_resource_uid
    ?? null
}

function typedAwsIdentity(identity: string, resourceType?: string | null) {
  if (identity === "*") return "Any AWS principal"
  if (!identity.startsWith("arn:")) {
    const tail = identity.split(/[/:]/).filter(Boolean).at(-1) ?? identity
    return resourceType ? `${resourceType} · ${tail}` : tail
  }

  const parts = identity.split(":")
  const service = parts[2] ?? "AWS"
  const resource = parts.slice(5).join(":")
  const path = resource.split("/").filter(Boolean)
  const tail = path.at(-1) ?? resource

  if (service === "ec2" && path[0] === "instance") return `EC2 instance · ${tail}`
  if (service === "sts" && path[0] === "assumed-role") {
    const role = path[1] ?? "unknown role"
    const session = path.slice(2).join("/")
    return `STS session · ${role}${session ? ` / ${session}` : ""}`
  }
  if (service === "iam" && path[0] === "role") return `IAM role · ${path.slice(1).join("/")}`
  if (service === "iam" && path[0] === "user") return `IAM user · ${path.slice(1).join("/")}`
  if (service === "iam" && resource === "root") return "AWS account root"
  if (service === "lambda" && resource.startsWith("function:")) {
    return `Lambda function · ${resource.slice("function:".length)}`
  }
  if (service === "s3") return `S3 bucket · ${resource}`
  if (service === "kms") return `KMS key · ${tail}`

  const serviceLabel = service === "events" ? "EventBridge" : service.toUpperCase()
  return `${resourceType || serviceLabel} · ${tail}`
}

function isNetworkAddress(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":")
}

function displayIdentity(dependency: Dependency) {
  const canonical = canonicalDependencyIdentity(dependency)
  const resolved = dependency.principal_display_name ?? dependency.target_display_name
  if (resolved && resolved !== canonical && !resolved.startsWith("arn:")) {
    return !canonical && isNetworkAddress(resolved) ? `Network endpoint · ${resolved}` : resolved
  }
  if (canonical) return typedAwsIdentity(canonical, dependency.principal_type ?? dependency.target_type)
  return "Relationship endpoint"
}

function EvidenceRefList({ refs, sourceRefs = [] }: { refs: EvidenceBinding[]; sourceRefs?: SourceGenerationRef[] }) {
  if (!refs.length) return sourceRefs.length ? (
    <div className="space-y-1 text-slate-600">
      {sourceRefs.map(ref => <div key={`${ref.plane}:${ref.generation}`}><span className="font-semibold capitalize">{ref.plane}</span> generation <span className="font-mono">{ref.generation}</span> · object-level evidence link unavailable</div>)}
    </div>
  ) : <span className="text-slate-600">Object-level evidence link unavailable</span>
  return (
    <ul className="space-y-1">
      {refs.map(ref => (
        <li key={`${ref.object_key}:${ref.version_id}`} className="break-all font-mono text-[10px] text-slate-600">
          {ref.object_key} · version {ref.version_id} · sha {ref.digest.slice(0, 12)}…
        </li>
      ))}
    </ul>
  )
}

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

  // The BOUNDED, resource-anchored projection (DE-305) — the tab's dependency
  // source. The dossier ledger next to it answers a different question (basis
  // classes across the whole dossier) and is deliberately NOT used as a
  // fallback here: two datasets under one heading would show different numbers
  // for the same resource depending on which one happened to answer.
  const bounded = useResourceDependencies({
    systemName,
    resourceId,
    accountId: accountId && accountId !== "all" ? accountId : scope.accountId,
  })
  const boundedByPerspective = useMemo(() => {
    const buckets: Record<Perspective, DependencyRow[]> = {
      USES: [], USED_BY: [], PEER: [],
    }
    for (const row of bounded.rows) {
      if (buckets[row.perspective]) buckets[row.perspective].push(row)
    }
    return buckets
  }, [bounded.rows])

  const dependencies = data?.dependencies.payload?.ledger ?? []
  const counts = data?.dependencies.payload?.counts_by_basis
  const lifecycleFacts = data?.lifecycle.payload?.facts ?? []
  const fitnessFacts = data?.fitness.payload?.facts ?? []
  const hasConfigurationProfile = Boolean(data?.purpose.payload?.profile_id)
  const grouped = useMemo(() => ({
    OBSERVED: dependencies.filter(item => item.basis_class === "OBSERVED"),
    CONFIGURED: dependencies.filter(item => item.basis_class === "CONFIGURED"),
    STRUCTURAL: dependencies.filter(item => item.basis_class === "STRUCTURAL"),
  }), [dependencies])

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "purpose", label: "Purpose" },
    { id: "dependencies", label: "Dependencies" },
    { id: "evidence", label: "Technical evidence" },
  ]

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

      <nav className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-3 pt-2">
        {tabs.map(item => (
          <button key={item.id} type="button" disabled={!data} onClick={() => setTab(item.id)} className={`border-b-2 px-2 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:text-slate-300 ${tab === item.id && data ? "border-teal-500 bg-white text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item.label}</button>
        ))}
      </nav>

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
          <div className="space-y-4">
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

        {tab === "dependencies" ? (
          <div className="space-y-5">
            {/* The exact wording the plan requires: what is shown is what was
                collected, not everything that exists. */}
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
              Known dependencies within collected scope. Basis classes are separate proof sets and are never added into a consumer total.
              {bounded.data?.scope?.generation ? <> Projection generation <span className="font-mono">{bounded.data.scope.generation}</span>.</> : null}
            </div>

            {bounded.data?.coverage ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <StateBadge value={String(bounded.data.coverage.state ?? "UNKNOWN")} axis="coverage" />
                {Array.isArray(bounded.data.coverage.missing_sources) && bounded.data.coverage.missing_sources.length ? (
                  <span>Missing: {bounded.data.coverage.missing_sources.join(", ")}</span>
                ) : null}
                {bounded.data.coverage.observation_days ? <span>· observed over {String(bounded.data.coverage.observation_days)} days</span> : null}
              </div>
            ) : null}

            {bounded.loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Loading dependencies…
              </div>
            ) : null}

            {/* A moved generation is not a fault: the projection advanced under
                an in-flight cursor. Stitching the pages would mix two graphs. */}
            {bounded.generationMoved ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                The projection advanced while this list was paging, so the remaining pages belong to a different generation.
                <button type="button" onClick={bounded.retry} className="ml-2 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">Reload from the current generation</button>
              </div>
            ) : null}

            {bounded.error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                Dependencies could not be read: <span className="font-mono text-xs">{bounded.error}</span>. This is not proof that dependencies do not exist.
                <button type="button" onClick={bounded.retry} className="ml-2 rounded border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100">Retry</button>
              </div>
            ) : null}

            {!bounded.loading && !bounded.error && !bounded.generationMoved && bounded.rows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                No dependencies were found for this resource within collected scope. This is not proof that dependencies do not exist.
              </div>
            ) : null}

            {/* Perspective-first: the same fact seen from both ends, with the
                counts saying which number they are. A filtered total that read
                as the resource's whole dependency count would understate it. */}
            {(["USES", "USED_BY", "PEER"] as Perspective[]).map(perspective => {
              const group = boundedByPerspective[perspective]
              if (!group.length) return null
              const heading = perspective === "USES" ? "Uses" : perspective === "USED_BY" ? "Used by" : "Peers"
              return (
                <section key={perspective}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{heading}</span>
                    <span className="text-xs text-slate-500">{group.length} loaded</span>
                  </div>
                  <div className="space-y-3">
                    {group.map(row => (
                      <article key={row.pair_key} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900">{row.counterparty.label ?? row.counterparty.identity ?? "Unidentified counterparty"}</div>
                            {row.counterparty.identity && row.counterparty.identity !== row.counterparty.label ? (
                              <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{row.counterparty.identity}</div>
                            ) : null}
                            <div className="mt-1 text-xs text-slate-500">
                              {row.counterparty.type ?? "Unknown type"}
                              {/* UNKNOWN scope means the neighbour carried no
                                  account, which is different from being ours. */}
                              {row.counterparty.scope ? ` · ${row.counterparty.scope.replace(/_/g, " ").toLowerCase()}` : ""}
                              {row.counterparty.account_id ? ` · ${row.counterparty.account_id}` : ""}
                              {row.counterparty.region ? ` · ${row.counterparty.region}` : ""}
                            </div>
                            {row.counterparty.rolled_up_member_count ? (
                              <div className="mt-1 text-xs text-slate-600">Groups {row.counterparty.rolled_up_member_count} member{row.counterparty.rolled_up_member_count === 1 ? "" : "s"}</div>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {row.facts.map((fact, index) => (
                            <div key={fact.fact_id ?? `${row.pair_key}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                {fact.basis_class ? <StateBadge value={fact.basis_class} /> : null}
                                <span className="font-semibold text-slate-800">{String(fact.relationship ?? "relationship")}</span>
                                {fact.mechanism ? <span className="text-slate-500">· {String(fact.mechanism)}</span> : null}
                                {fact.freshness ? <span className="text-slate-500">· {String(fact.freshness)}</span> : null}
                              </div>
                              {Array.isArray(fact.actions) && fact.actions.length ? <div className="mt-2 text-slate-600">Actions: {fact.actions.join(", ")}</div> : null}
                              {fact.observation_days ? <div className="mt-1 text-slate-600">Observed over {fact.observation_days} days · last seen {fact.last_seen ? new Date(String(fact.last_seen)).toLocaleString() : "unknown"}</div> : null}
                              {fact.via_vpce ? <div className="mt-1 text-slate-600">Via VPC endpoint: <span className="font-mono">{String(fact.via_vpce)}</span></div> : null}
                              {/* Derived rows say so; a derivation must never
                                  read as a direct attachment. */}
                              {fact.derivation ? <div className="mt-1 text-slate-600">Derived — not a direct attachment.</div> : null}
                              <div className="mt-2 border-t border-slate-200 pt-2">
                                <EvidenceRefList refs={(fact.evidence_refs ?? []) as EvidenceBinding[]} sourceRefs={(fact.source_generation_refs ?? []) as SourceGenerationRef[]} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}

            {/* Paging is explicit. Silent truncation of a high-degree consumer
                set is the failure this replaces. */}
            {bounded.data?.page ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>Showing {bounded.rows.length} of {bounded.data.page.total} dependency row{bounded.data.page.total === 1 ? "" : "s"}.</span>
                {bounded.hasMore ? (
                  <button type="button" onClick={bounded.loadMore} disabled={bounded.loadingMore} className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                    {bounded.loadingMore ? "Loading…" : "Load more"}
                  </button>
                ) : bounded.rows.length ? <span>Complete for this generation.</span> : null}
              </div>
            ) : null}

            {/* Resource-specific views for the four advertised types. Supporting
                VPC/ENI/policy facts stay context, not extra tabs. */}
            {bounded.data?.type_views?.views?.length ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{bounded.data.type_views.family ?? "Resource"} detail</div>
                {bounded.data.type_views.views.map((view, index) => (
                  <div key={view.title ?? index} className="mt-3">
                    <div className="text-xs font-semibold text-slate-700">{view.title}</div>
                    <ul className="mt-1 space-y-1">
                      {(view.items ?? []).map((item, itemIndex) => (
                        <li key={itemIndex} className="break-all font-mono text-[10px] text-slate-600">
                          {typeof item === "string" ? item : JSON.stringify(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}

        {data && tab === "evidence" ? (
          <div className="space-y-4">
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
