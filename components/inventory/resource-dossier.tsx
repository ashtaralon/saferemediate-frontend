"use client"

import { useEffect, useState } from "react"
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronRight,
  LoaderCircle,
  Network,
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
  transport_evidence_type?: "configured" | null
  transport_evidence_source?: string | null
  transport_coverage_state?: "complete" | "partial" | "unknown" | null
  transport_route_kinds?: string[]
  transport_route_table_ids?: string[]
  transport_subnet_ids?: string[]
  transport_last_seen?: string | null
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

function transportLabel(connection: Connection) {
  if (connection.transport_evidence_source !== "structural_s3_egress") return "Transport unknown"
  if (connection.egress_path === "vpce") return `Private via ${connection.via_vpce_id ?? "VPC endpoint"}`
  if (connection.egress_path === "public") {
    const kinds = connection.transport_route_kinds?.join(" / ")
    return kinds ? `Public AWS endpoint via ${kinds}` : "Public AWS endpoint route"
  }
  return "Transport unknown"
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

  // Send the operator to the system dashboard's Fixes tab — the one place
  // staged changes run from. The dashboard listens for this event; when the
  // dossier is rendered outside it, the button simply closes the drawer.
  function openFixesTab() {
    window.dispatchEvent(new CustomEvent("cyntro:navigate-tab", { detail: { tabId: "configuration" } }))
    onClose()
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
              <h3 className="mt-2 text-lg font-bold text-slate-950">{data.dependencies.summary.consumer_count} actual consumer{data.dependencies.summary.consumer_count === 1 ? "" : "s"} {data.dependencies.summary.consumer_count === 1 ? "depends" : "depend"} on this resource.</h3>
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
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"><strong>Two proofs:</strong> behavior shows who used the resource. Route configuration shows how that consumer reaches it. Cyntro requires both before a network change can proceed.</div>
            {[...data.dependencies.upstream, ...data.dependencies.downstream].length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No dependency links are available for this resource.</div> : null}
            {[...data.dependencies.upstream, ...data.dependencies.downstream].map((connection, index) => (
              <article key={`${connection.direction}-${connection.resource_id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2"><ArrowDownToLine className={`h-4 w-4 ${connection.direction === "upstream" ? "rotate-90" : "-rotate-90"}`} /></div>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-950">{connection.resource_name}</div><div className="mt-0.5 text-xs text-slate-500">{connection.resource_type} | {connection.protocol ?? "relationship"}</div></div>
                  <EvidenceBadge value={connection.evidence_type} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><span>Behavior: {connection.evidence_type === "observed" ? "Observed" : connection.evidence_type}</span><span>Last used: {connection.last_seen ? new Date(connection.last_seen).toLocaleDateString() : "not recorded"}</span><span>VPC: {connection.vpc_id ?? "regional / unknown"}</span><span>Source subnets: {connection.subnet_ids.length || "unknown"}</span></div>
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${connection.transport_coverage_state === "complete" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <div className="flex items-center justify-between gap-3"><strong>{transportLabel(connection)}</strong><span className="shrink-0 uppercase tracking-wide">{connection.transport_coverage_state === "complete" ? "Route proven" : "Proof missing"}</span></div>
                  {connection.transport_route_table_ids?.length ? <div className="mt-1 font-mono text-[10px] opacity-75">{connection.transport_route_table_ids.join(", ")} · {connection.transport_subnet_ids?.length ?? 0} subnet{connection.transport_subnet_ids?.length === 1 ? "" : "s"}</div> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {data && tab === "configuration" ? <ResourceConfigTab resourceId={data.resource.id} resourceType={data.resource.type ?? "Unknown"} systemName={systemName} /> : null}

        {data && tab === "change" ? (
          <div className="space-y-4">
            {!isS3 ? <div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-950">Change planning is read-only for this resource type.</h3><p className="mt-2 text-sm text-slate-600">The shared dossier is ready. The first staged setup is S3 public-path to Gateway VPCE; certificate and token rotation require additional client-side telemetry before they can be safe.</p></div> : null}
            {isS3 ? (
              <section className="rounded-xl border border-teal-200 bg-teal-50 p-5">
                <div className="flex items-center gap-2"><Network className="h-5 w-5 text-teal-700" /><h3 className="font-bold text-slate-950">This setup runs from Fixes → Configuration</h3></div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Moving this bucket&apos;s traffic onto an S3 Gateway endpoint is a staged change — review, safety
                  check, four-eyes approval, canary rollout, verification, rollback. It runs from one place so every
                  operation is tracked and resumable, instead of from per-resource drawers.
                </p>
                <button
                  type="button"
                  onClick={openFixesTab}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  data-testid="dossier-open-fixes"
                >
                  Open Fixes → Configuration <ArrowRight className="h-4 w-4" />
                </button>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 text-[10px] text-slate-500"><span>Canonical Behavioral Engine</span><span className="inline-flex items-center gap-1">Observed <ChevronRight className="h-3 w-3" /> Configured <ChevronRight className="h-3 w-3" /> Unknown</span></footer>
    </aside>
  )
}
