"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  ChevronRight,
  LoaderCircle,
  Network,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react"
import { ResourceConfigTab } from "@/components/inventory/resource-config-tab"
import { ServiceTypeBadge } from "@/lib/service-type"

type EvidenceType = "observed" | "configured" | "inferred"

interface Connection {
  direction: "upstream" | "downstream"
  resource_id: string
  resource_name: string
  resource_type: string
  vpc_id: string | null
  subnet_ids: string[]
  protocol: string | null
  last_seen: string | null
  evidence_type: EvidenceType
  evidence_source: string
  coverage_state: "complete" | "partial" | "unknown"
  activity_count: number | null
  egress_path: "public" | "vpce" | null
  via_vpce_id: string | null
  via_igw: boolean
}

interface ResourceDossierData {
  resource: {
    id: string
    name: string
    type: string | null
    account_id?: string | null
    region?: string | null
    vpc_id?: string | null
    subnet_ids?: string[]
    owner_systems?: string[]
    stale?: { reason: string } | null
  }
  dependencies: {
    upstream: Connection[]
    downstream: Connection[]
    summary: { consumer_count: number; observed: number; configured: number; inferred: number }
  }
  evidence: {
    window_days: number
    latest_observation: string | null
    sources: string[]
    coverage_state: "complete" | "partial"
  }
  change_capabilities: Array<{ kind: string; available: boolean; label: string }>
}

interface S3VpcePlan {
  readiness: "READY" | "BLOCKED"
  bucket_name: string
  vpc_id: string | null
  region: string
  consumer_ids: string[]
  subnet_ids: string[]
  route_table_ids: string[]
  blockers: Array<{ code: string; message: string }>
  impact: {
    observed_consumers: number
    subnets: number
    route_tables: number
    route_table_workloads: number
    permission_changes: number
    resource_replacements: number
  }
  plan_token: string | null
  expires_in_seconds: number | null
}

interface ExecutionResult {
  status: string
  errors?: string[]
  snapshot_id?: string | null
  endpoint_id?: string | null
  rollback_available?: boolean
  lifecycle_token?: string | null
  rollback_expires_in_seconds?: number | null
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

type Tab = "overview" | "dependencies" | "configuration" | "change"

function EvidenceBadge({ value }: { value: EvidenceType }) {
  const style = value === "observed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "configured"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-amber-200 bg-amber-50 text-amber-700"
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{value}</span>
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
  vpcId,
  accountId,
  region,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview")
  const [data, setData] = useState<ResourceDossierData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<S3VpcePlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [simulation, setSimulation] = useState<{ safe_to_apply: boolean; errors: string[] } | null>(null)
  const [execution, setExecution] = useState<ExecutionResult | null>(null)
  const [verification, setVerification] = useState<Record<string, unknown> | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const query = new URLSearchParams({ resource_id: resourceId, window_days: "90" })
    if (vpcId) query.set("vpc_id", vpcId)
    if (accountId) query.set("account_id", accountId)
    if (region) query.set("region", region)
    fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/resource?${query}`, { cache: "no-store" })
      .then(readJson)
      .then(body => { if (!cancelled) setData(body) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountId, region, resourceId, systemName, vpcId])

  const isS3 = (data?.resource.type ?? resourceType) === "S3" || (data?.resource.type ?? resourceType) === "S3Bucket"

  async function createPlan() {
    setPlanLoading(true)
    setOperationError(null)
    setSimulation(null)
    setExecution(null)
    setVerification(null)
    try {
      const response = await fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/s3-vpce/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_id: data?.resource.id ?? resourceId,
          vpc_id: vpcId || undefined,
          account_id: accountId || undefined,
          region: region || data?.resource.region || undefined,
          window_days: 90,
        }),
      })
      setPlan(await readJson(response))
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPlanLoading(false)
    }
  }

  async function simulate() {
    if (!plan?.plan_token) return
    setOperationError(null)
    try {
      const response = await fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/s3-vpce/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_token: plan.plan_token }),
      })
      setSimulation(await readJson(response))
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function apply() {
    if (!plan?.plan_token || !plan.vpc_id) return
    setOperationError(null)
    try {
      const response = await fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/s3-vpce/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_token: plan.plan_token,
          confirmation: `APPLY ${plan.bucket_name} ${plan.vpc_id}`,
          requested_by: "cyntro-ui",
        }),
      })
      setExecution(await readJson(response))
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function verify() {
    if (!execution?.lifecycle_token || !execution?.endpoint_id) return
    setOperationError(null)
    try {
      const response = await fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/s3-vpce/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_token: execution.lifecycle_token, endpoint_id: execution.endpoint_id }),
      })
      setVerification(await readJson(response))
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function rollback() {
    if (!execution?.lifecycle_token || !execution?.snapshot_id) return
    setOperationError(null)
    try {
      const response = await fetch(`/api/proxy/operational-map/${encodeURIComponent(systemName)}/s3-vpce/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_token: execution.lifecycle_token,
          snapshot_id: execution.snapshot_id,
          confirmation: `ROLLBACK ${execution.snapshot_id}`,
          requested_by: "cyntro-ui",
        }),
      })
      setExecution(await readJson(response))
      setVerification(null)
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "dependencies", label: "Dependencies" },
    { id: "configuration", label: "Configuration" },
    { id: "change", label: "Change impact" },
  ]

  return (
    <aside className="fixed inset-y-0 right-0 z-[240] flex w-full max-w-[620px] flex-col border-l border-slate-200 bg-white shadow-2xl" role="dialog" aria-label={`Operations dossier for ${resourceName ?? resourceId}`}>
      <header className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 px-5 py-4 text-white">
        <div className="flex items-start gap-3">
          <ServiceTypeBadge type={data?.resource.type ?? resourceType ?? "Resource"} variant="tile" size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Behavioral operations dossier</div>
            <h2 className="mt-1 truncate text-lg font-bold">{data?.resource.name ?? resourceName ?? resourceId}</h2>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-400">{data?.resource.id ?? resourceId}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close dossier"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <nav className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-1 pt-2 sm:px-3">
        {tabs.map(item => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-w-0 border-b-2 px-1 py-2 text-[10px] font-semibold sm:px-3 sm:text-xs ${tab === item.id ? "border-teal-500 bg-white text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item.label}</button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto bg-[#F4F6F8] p-5">
        {loading ? <div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Loading behavioral evidence...</div> : null}
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

        {data && tab === "overview" ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operational answer</div>
              <h3 className="mt-2 text-lg font-bold text-slate-950">{data.dependencies.summary.consumer_count} actual consumer{data.dependencies.summary.consumer_count === 1 ? "" : "s"} depend on this resource.</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Use this view before encryption, endpoint, certificate, token, or policy changes to identify the systems that must move together.</p>
            </section>
            <section className="grid grid-cols-3 gap-3">
              {([ ["Observed", data.dependencies.summary.observed, "text-emerald-700"], ["Configured", data.dependencies.summary.configured, "text-blue-700"], ["Unknown", data.dependencies.summary.inferred, "text-amber-700"] ] as const).map(([label, value, color]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><div className={`text-2xl font-bold ${color}`}>{value}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label} links</div></div>)}
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">Evidence window</span><span>{data.evidence.window_days} days</span></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Last observed</span><span>{data.evidence.latest_observation ? new Date(data.evidence.latest_observation).toLocaleString() : "No timestamp"}</span></div>
              <div className="mt-3 flex items-center justify-between"><span className="font-semibold text-slate-900">Coverage</span><span className={data.evidence.coverage_state === "complete" ? "text-emerald-700" : "text-amber-700"}>{data.evidence.coverage_state}</span></div>
            </section>
          </div>
        ) : null}

        {data && tab === "dependencies" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"><strong>Focus:</strong> observed links are behavioral proof. Configured and inferred links remain visible but never qualify a change as safe.</div>
            {[...data.dependencies.upstream, ...data.dependencies.downstream].length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No dependency links are available for this resource.</div> : null}
            {[...data.dependencies.upstream, ...data.dependencies.downstream].map((connection, index) => (
              <article key={`${connection.direction}-${connection.resource_id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2"><ArrowDownToLine className={`h-4 w-4 ${connection.direction === "upstream" ? "rotate-90" : "-rotate-90"}`} /></div>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-950">{connection.resource_name}</div><div className="mt-0.5 text-xs text-slate-500">{connection.resource_type} | {connection.protocol ?? "relationship"}</div></div>
                  <EvidenceBadge value={connection.evidence_type} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><span>Path: {connection.egress_path ?? (connection.via_igw ? "unknown (IGW route present)" : "unknown")}</span><span>Last seen: {connection.last_seen ? new Date(connection.last_seen).toLocaleDateString() : "not recorded"}</span><span>VPC: {connection.vpc_id ?? "regional / unknown"}</span><span>Subnets: {connection.subnet_ids.length || "unknown"}</span></div>
              </article>
            ))}
          </div>
        ) : null}

        {data && tab === "configuration" ? <ResourceConfigTab resourceId={data.resource.id} resourceType={data.resource.type ?? "Unknown"} systemName={systemName} /> : null}

        {data && tab === "change" ? (
          <div className="space-y-4">
            {!isS3 ? <div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-950">Change planning is read-only for this resource type.</h3><p className="mt-2 text-sm text-slate-600">The shared dossier is ready. The first signed execution workflow is S3 public-path to Gateway VPCE; certificate and token rotation require additional client-side telemetry before they can be safe.</p></div> : null}
            {isS3 ? <>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2"><Network className="h-5 w-5 text-teal-600" /><h3 className="font-bold text-slate-950">Move observed S3 traffic to a Gateway VPCE</h3></div>
                <p className="mt-2 text-sm leading-6 text-slate-600">Cyntro uses this bucket as the behavioral anchor, then binds the exact route-table cohort and evidence baseline into a signed 15-minute plan. AWS moves all S3 traffic on those route tables, so the full affected workload count is shown.</p>
                <button type="button" onClick={createPlan} disabled={planLoading} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{planLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Analyze change</button>
              </section>
              {plan ? <section className={`rounded-xl border p-4 ${plan.readiness === "READY" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center gap-2 font-bold text-slate-950">{plan.readiness === "READY" ? <Check className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}{plan.readiness === "READY" ? "Exact change set is ready" : "Change is blocked by evidence gaps"}</div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><strong className="block text-xl">{plan.impact.observed_consumers}</strong><span className="text-[10px] uppercase text-slate-500">Observed users</span></div><div><strong className="block text-xl">{plan.impact.route_table_workloads}</strong><span className="text-[10px] uppercase text-slate-500">Affected workloads</span></div><div><strong className="block text-xl">{plan.impact.subnets}</strong><span className="text-[10px] uppercase text-slate-500">Source subnets</span></div><div><strong className="block text-xl">{plan.impact.route_tables}</strong><span className="text-[10px] uppercase text-slate-500">Route tables</span></div></div>
                <div className="mt-3 text-xs text-slate-600">Permissions changed: 0 | Resources replaced: 0 | Snapshot before apply: required</div>
                {plan.blockers.map(blocker => <div key={blocker.code} className="mt-3 rounded border border-amber-200 bg-white/70 p-3 text-xs"><strong>{blocker.code}</strong><div className="mt-1 text-slate-600">{blocker.message}</div></div>)}
                {plan.readiness === "READY" ? <button type="button" onClick={simulate} className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-teal-500">Simulate exact plan</button> : null}
              </section> : null}
              {simulation ? <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-bold text-slate-950">Simulation {simulation.safe_to_apply ? "passed" : "did not pass"}</div>{simulation.errors?.map(item => <div key={item} className="mt-2 text-xs text-rose-700">{item}</div>)}{simulation.safe_to_apply ? <><label className="mt-4 flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-0.5" />I reviewed the exact consumer and route-table scope. Apply will create a snapshot before AWS is changed.</label><button type="button" onClick={apply} disabled={!reviewed} className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Apply private path</button></> : null}</section> : null}
              {execution ? <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-bold text-slate-950">Execution: {execution.status}</div>{execution.endpoint_id ? <div className="mt-2 font-mono text-xs text-slate-600">{execution.endpoint_id}</div> : null}<div className="mt-4 flex flex-wrap gap-2">{execution.endpoint_id ? <button type="button" onClick={verify} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Verify behavioral path</button> : null}{execution.snapshot_id ? <button type="button" onClick={rollback} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800"><RotateCcw className="h-4 w-4" />Rollback</button> : null}</div></section> : null}
              {verification ? <pre className="overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(verification, null, 2)}</pre> : null}
              {operationError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{operationError}</div> : null}
            </> : null}
          </div>
        ) : null}
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 text-[10px] text-slate-500"><span>Canonical Behavioral Engine</span><span className="inline-flex items-center gap-1">Observed <ChevronRight className="h-3 w-3" /> Configured <ChevronRight className="h-3 w-3" /> Unknown</span></footer>
    </aside>
  )
}
