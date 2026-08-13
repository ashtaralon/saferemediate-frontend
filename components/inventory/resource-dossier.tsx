"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react"
import { ServiceTypeBadge } from "@/lib/service-type"
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
  principal_type?: string | null
  target_canonical_resource_uid?: string | null
  target_arn?: string | null
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
  }>
  lifecycle: DossierSection<never>
  fitness: DossierSection<never>
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

function StateBadge({ value }: { value: string }) {
  const style = value === "ACTIVE" || value === "FULL" || value === "OBSERVED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "PARTIAL" || value === "CONFIGURED" || value === "STRUCTURAL"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : value === "INTEGRITY_HELD" || value === "HELD" || value === "BLOCKED"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-50 text-slate-600"
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{value.replaceAll("_", " ")}</span>
}

function displayIdentity(dependency: Dependency) {
  return dependency.principal_arn
    ?? dependency.principal_canonical_resource_uid
    ?? dependency.target_arn
    ?? dependency.target_canonical_resource_uid
    ?? "Canonical identity unavailable"
}

function EvidenceRefList({ refs }: { refs: EvidenceBinding[] }) {
  if (!refs.length) return <span className="text-amber-700">Immutable evidence binding unavailable</span>
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
  const isS3 = resourceType === "S3" || resourceType === "S3Bucket"

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    if (!isS3) return () => { cancelled = true }
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
  }, [accountId, isS3, region, resourceId, scope.accountId, scope.region, systemName])

  const dependencies = data?.dependencies.payload?.ledger ?? []
  const counts = data?.dependencies.payload?.counts_by_basis
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
            {data ? <div className="mt-2 flex flex-wrap gap-2"><StateBadge value={data.serve_state} /><StateBadge value={data.purpose.coverage?.state ?? "UNKNOWN"} /></div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close dossier"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <nav className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-3 pt-2">
        {tabs.map(item => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`border-b-2 px-2 py-2 text-xs font-semibold ${tab === item.id ? "border-teal-500 bg-white text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item.label}</button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto bg-[#F4F6F8] p-5">
        {!isS3 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 font-semibold text-slate-950"><CircleHelp className="h-5 w-5 text-slate-500" />Dossier not yet available for this resource type</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">The frozen v6 rollout currently serves the S3 vertical slice. No legacy or inferred dossier is shown in its place.</p>
          </div>
        ) : null}
        {loading ? <div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Assembling generation-pinned evidence…</div> : null}
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

        {data && tab === "purpose" ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Established purpose</div><StateBadge value={data.purpose.serve_state} /></div>
              {data.purpose.payload?.summary ? (
                <h3 className="mt-3 text-lg font-bold leading-7 text-slate-950">{data.purpose.payload.summary}</h3>
              ) : (
                <div className="mt-3 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Purpose not established. {data.purpose.payload?.not_established_reason}</span></div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div><div className="font-semibold text-slate-900">Authority</div>{data.purpose.payload?.assertion.authority_basis}</div>
                <div><div className="font-semibold text-slate-900">Evidence window</div>{data.purpose.payload?.assertion.window?.days ?? "Not applicable"} days</div>
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck className="h-4 w-4 text-teal-700" />Decision-relative coverage</div>
              <div className="mt-3 flex items-center gap-2"><StateBadge value={data.purpose.coverage?.state ?? "UNKNOWN"} /><span className="text-xs text-slate-500">This controls which absence claims may be rendered.</span></div>
              {data.purpose.coverage?.missing_sources.length ? <p className="mt-3 text-xs text-amber-800">Missing: {data.purpose.coverage.missing_sources.join(", ")}</p> : null}
            </section>
            <section className="grid grid-cols-3 gap-3">
              {(["OBSERVED", "CONFIGURED", "STRUCTURAL"] as BasisClass[]).map(basis => <div key={basis} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-2xl font-bold text-slate-950">{counts?.[basis] ?? 0}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{basis}</div></div>)}
              <p className="col-span-3 text-[11px] text-slate-500">Basis classes are separate proof sets and are never added into a consumer total.</p>
            </section>
          </div>
        ) : null}

        {data && tab === "dependencies" ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">{data.dependencies.notes ?? "Basis classes are separate proof sets and are never added into a consumer total."}</div>
            {dependencies.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No dependency assertions are available. This is not proof that dependencies do not exist.</div> : null}
            {(["OBSERVED", "CONFIGURED", "STRUCTURAL"] as BasisClass[]).map(basis => grouped[basis].length ? (
              <section key={basis}>
                <div className="mb-2 flex items-center gap-2"><StateBadge value={basis} /><span className="text-xs text-slate-500">{grouped[basis].length} assertion{grouped[basis].length === 1 ? "" : "s"}</span></div>
                <div className="space-y-3">
                  {grouped[basis].map((dependency, index) => (
                    <article key={`${basis}-${displayIdentity(dependency)}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3"><Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /><div className="min-w-0 flex-1"><div className="break-all font-mono text-xs font-semibold text-slate-900">{displayIdentity(dependency)}</div><div className="mt-1 text-xs text-slate-500">{dependency.direction} · {dependency.relationship} · {dependency.freshness}</div></div></div>
                      {dependency.actions?.length ? <div className="mt-3 text-xs text-slate-600">Actions: {dependency.actions.join(", ")}</div> : null}
                      {dependency.observation_days ? <div className="mt-1 text-xs text-slate-600">Observed over {dependency.observation_days} days · last seen {dependency.last_seen ? new Date(dependency.last_seen).toLocaleString() : "unknown"}</div> : null}
                      {dependency.via_vpce ? <div className="mt-1 text-xs text-slate-600">Via VPC endpoint: <span className="font-mono">{dependency.via_vpce}</span></div> : null}
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs"><EvidenceRefList refs={dependency.evidence_refs ?? []} /></div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null)}
          </div>
        ) : null}

        {data && tab === "evidence" ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">Evidence serve state</span><StateBadge value={data.evidence.serve_state} /></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Immutable bindings missing</span><span>{data.evidence.payload?.missing_immutable_evidence_bindings ?? 0}</span></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Assembly cache</span><span>{data.assembly?.cache ?? "UNREPORTED"}{data.assembly ? ` · ${data.assembly.latency_ms} ms` : ""}</span></div>
              {data.assembly?.missing_source_heads.length ? <div className="mt-3 text-amber-800">Cache reuse held: missing activated {data.assembly.missing_source_heads.join(", ")} head{data.assembly.missing_source_heads.length === 1 ? "" : "s"}.</div> : null}
            </section>
            {data.evidence.payload?.diagnostics.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">{data.evidence.payload.diagnostics.map(item => <div key={item}>{item}</div>)}</section> : null}
            <section className="space-y-2">
              {data.evidence.payload?.assertions.map((assertion, index) => (
                <article key={`${assertion.basis}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button type="button" onClick={() => setExpandedAssertion(expandedAssertion === index ? null : index)} className="flex w-full items-center gap-3 p-4 text-left">
                    {assertion.evidence_refs.length ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-950">{assertion.basis}</div><div className="text-[10px] text-slate-500">{assertion.sources.join(", ") || "No source declared"} · {new Date(assertion.as_of).toLocaleString()}</div></div>
                    <StateBadge value={assertion.state} />
                    {expandedAssertion === index ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {expandedAssertion === index ? <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 text-xs"><div><strong>Authority:</strong> {assertion.authority_basis}</div><EvidenceRefList refs={assertion.evidence_refs} /><pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify(assertion.value, null, 2)}</pre></div> : null}
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
