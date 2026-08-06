"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  GitBranch,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react"
import { ResourceConfigTab } from "@/components/inventory/resource-config-tab"
import { ServiceTypeBadge } from "@/lib/service-type"
import type { TopologyNode } from "./types"
import {
  operationalRequest,
  type OperationalConnection,
  type OperationalDossier,
  type S3VpceExecution,
  type S3VpcePlan,
} from "./estate-operations"

interface Props {
  node: TopologyNode | null
  systemName: string
  accountId?: string | null
  region?: string | null
  vpcId?: string | null
  onClose: () => void
}

type Tab = "resource" | "dependencies" | "change"

function relativeTime(value?: string | null): string {
  if (!value) return "No observation timestamp"
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return value
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function EvidenceBadge({ type }: { type: OperationalConnection["evidence_type"] }) {
  const style = type === "observed"
    ? { background: "#E6FBF7", color: "#0E8B7A", borderColor: "#9FE8DC" }
    : type === "configured"
      ? { background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }
      : { background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" }
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={style}>
      {type}
    </span>
  )
}

function ConnectionRow({ connection }: { connection: OperationalConnection }) {
  const inbound = connection.direction === "upstream"
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg p-2" style={{ background: inbound ? "#E6FBF7" : "#EFF6FF" }}>
          {inbound
            ? <ArrowDownLeft className="h-4 w-4" style={{ color: "#0E8B7A" }} />
            : <ArrowUpRight className="h-4 w-4" style={{ color: "#2563EB" }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: "#1A2330" }}>
              {connection.resource_name}
            </span>
            <EvidenceBadge type={connection.evidence_type} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "#5A6B7A" }}>
            <span>{connection.resource_type}</span>
            {connection.protocol ? <span className="font-mono">{connection.protocol}</span> : null}
            {connection.port ? <span className="font-mono">port {connection.port}</span> : null}
            <span>{relativeTime(connection.last_seen)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            {connection.egress_path ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold uppercase text-slate-600">
                {connection.egress_path === "vpce" ? `private · ${connection.via_vpce_id ?? "VPCE"}` : connection.egress_path}
              </span>
            ) : null}
            {connection.vpc_id ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{connection.vpc_id}</span> : null}
            {connection.activity_count != null ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{connection.activity_count} events</span> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#DDE3E8", background: "#F8FAFC" }}>
      <div className="text-xl font-bold" style={{ color: "#1A2330" }}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#5A6B7A" }}>{label}</div>
    </div>
  )
}

export function DetailPanel({ node, systemName, accountId, region, vpcId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resource")
  const [dossier, setDossier] = useState<OperationalDossier | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<S3VpcePlan | null>(null)
  const [simulation, setSimulation] = useState<Record<string, unknown> | null>(null)
  const [execution, setExecution] = useState<S3VpceExecution | null>(null)
  const [verification, setVerification] = useState<Record<string, unknown> | null>(null)
  const [confirmation, setConfirmation] = useState("")
  const [rollbackConfirmation, setRollbackConfirmation] = useState("")
  const [action, setAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setTab("resource")
    setDossier(null)
    setPlan(null)
    setSimulation(null)
    setExecution(null)
    setVerification(null)
    setConfirmation("")
    setRollbackConfirmation("")
    setActionError(null)
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const query = new URLSearchParams({ resource_id: node.id, window_days: "90" })
      if (accountId) query.set("account_id", accountId)
      if (region) query.set("region", region)
      if (vpcId) query.set("vpc_id", vpcId)
      try {
        const body = await operationalRequest<OperationalDossier>(systemName, `resource?${query}`)
        if (!cancelled) setDossier(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load operational context")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [node, systemName, accountId, region, vpcId])

  if (!node) return null

  const isS3 = node.type === "S3" || node.type === "S3Bucket"
  const post = async <T,>(path: string, body: Record<string, unknown>): Promise<T> =>
    operationalRequest<T>(systemName, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  const runAction = async (name: string, operation: () => Promise<void>) => {
    setAction(name)
    setActionError(null)
    try { await operation() } catch (err) {
      setActionError(err instanceof Error ? err.message : "Operation failed")
    } finally { setAction(null) }
  }

  const analyze = () => runAction("analyze", async () => {
    const body = await post<S3VpcePlan>("s3-vpce/plan", {
      resource_id: node.id,
      vpc_id: vpcId || undefined,
      account_id: accountId || undefined,
      region: region || undefined,
      window_days: 90,
    })
    setPlan(body)
    setSimulation(null)
  })
  const simulate = () => runAction("simulate", async () => {
    if (!plan?.plan_token) return
    setSimulation(await post("s3-vpce/simulate", { plan_token: plan.plan_token }))
  })
  const execute = () => runAction("execute", async () => {
    if (!plan?.plan_token) return
    setExecution(await post<S3VpceExecution>("s3-vpce/execute", {
      plan_token: plan.plan_token,
      confirmation,
      requested_by: "estate-map",
    }))
  })
  const verify = () => runAction("verify", async () => {
    if (!execution?.lifecycle_token || !execution.endpoint_id) return
    setVerification(await post("s3-vpce/verify", {
      plan_token: execution.lifecycle_token,
      endpoint_id: execution.endpoint_id,
    }))
  })
  const rollback = () => runAction("rollback", async () => {
    if (!execution?.lifecycle_token || !execution.snapshot_id) return
    const result = await post<Record<string, unknown>>("s3-vpce/rollback", {
      plan_token: execution.lifecycle_token,
      snapshot_id: execution.snapshot_id,
      confirmation: rollbackConfirmation,
      requested_by: "estate-map",
    })
    setVerification({ ...result, state: "ROLLED_BACK" })
  })

  const upstream = dossier?.dependencies.upstream ?? []
  const downstream = dossier?.dependencies.downstream ?? []
  const expectedApply = plan?.bucket_name && plan.vpc_id ? `APPLY ${plan.bucket_name} ${plan.vpc_id}` : ""
  const expectedRollback = execution?.snapshot_id ? `ROLLBACK ${execution.snapshot_id}` : ""

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l shadow-2xl md:w-[720px]"
      style={{ background: "#F4F6F8", borderColor: "#DDE3E8", color: "#1A2330" }}
      role="dialog"
      aria-label={`Operations for ${node.name}`}
      data-testid="estate-operations-panel"
    >
      <header className="border-b px-5 py-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
        <div className="flex items-start gap-3">
          <ServiceTypeBadge type={node.type ?? "Resource"} variant="tile" size={42} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#0E8B7A" }}>
              Estate operations · {node.type ?? "Resource"}
            </div>
            <h2 className="mt-1 truncate text-lg font-bold">{node.name}</h2>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono" style={{ color: "#5A6B7A" }}>
              <span>{node.id}</span>
              {node.vpc_id ? <span>{node.vpc_id}</span> : null}
              {node.subnet_id ? <span>{node.subnet_id}</span> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close operations panel">
            <X className="h-5 w-5" style={{ color: "#5A6B7A" }} />
          </button>
        </div>
        <div className="mt-4 flex gap-1" role="tablist" aria-label="Resource operations">
          {([
            ["resource", "Resource", ServerCog],
            ["dependencies", "Dependencies", GitBranch],
            ["change", "Change impact", Wrench],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
              style={tab === id
                ? { borderColor: "#00C2A8", background: "#E6FBF7", color: "#0E8B7A" }
                : { borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}
              data-testid={`estate-operations-tab-${id}`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "resource" ? (
          <div data-testid="estate-operations-resource">
            <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "#B9E8DF", background: "#F0FDFA" }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#0E8B7A" }}>
                <ShieldCheck className="h-4 w-4" /> Live configuration from Inventory
              </div>
              <p className="mt-1 text-xs" style={{ color: "#5A6B7A" }}>
                Same resource inspector and evidence used by All Services. The map adds dependency and change scope around it.
              </p>
            </div>
            {dossier ? (
              <div className="mb-4 space-y-3" data-testid="estate-resource-overview">
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Consumers" value={dossier.dependencies.summary.consumer_count} />
                  <Metric label="Observed links" value={dossier.dependencies.summary.observed} />
                  <Metric label="Coverage" value={dossier.evidence.coverage_state} />
                </div>
                <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}>
                  <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
                    <span className="font-semibold" style={{ color: "#1A2330" }}>Account</span>
                    <span className="font-mono">{String(dossier.resource.account_id ?? accountId ?? "Not reported")}</span>
                    <span className="font-semibold" style={{ color: "#1A2330" }}>Region</span>
                    <span className="font-mono">{String(dossier.resource.region ?? region ?? "Global")}</span>
                    <span className="font-semibold" style={{ color: "#1A2330" }}>VPC scope</span>
                    <span className="font-mono">{String(dossier.resource.vpc_id ?? vpcId ?? "Regional / outside VPC")}</span>
                    <span className="font-semibold" style={{ color: "#1A2330" }}>Last observed</span>
                    <span>{relativeTime(dossier.evidence.latest_observation)}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <ResourceConfigTab resourceId={node.id} resourceType={node.type ?? "Resource"} systemName={systemName} />
          </div>
        ) : null}

        {tab === "dependencies" ? (
          <div className="space-y-5" data-testid="estate-operations-dependencies">
            {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Correlating behavioral dependencies…</div> : null}
            {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            {dossier ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Consumers" value={dossier.dependencies.summary.consumer_count} />
                  <Metric label="Observed links" value={dossier.dependencies.summary.observed} />
                  <Metric label="Evidence" value={dossier.evidence.coverage_state} />
                </div>
                <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}>
                  <strong style={{ color: "#1A2330" }}>90-day behavioral view</strong> · latest {relativeTime(dossier.evidence.latest_observation)} · sources {dossier.evidence.sources.join(", ") || "not reported"}
                </div>
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><ArrowDownLeft className="h-4 w-4 text-teal-600" /> Who depends on this ({upstream.length})</h3>
                  <div className="space-y-2">{upstream.length ? upstream.map((c, i) => <ConnectionRow key={`${c.resource_id}-${i}`} connection={c} />) : <p className="text-sm text-slate-500">No upstream dependency is proven in this scope.</p>}</div>
                </section>
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><ArrowUpRight className="h-4 w-4 text-blue-600" /> What this depends on ({downstream.length})</h3>
                  <div className="space-y-2">{downstream.length ? downstream.map((c, i) => <ConnectionRow key={`${c.resource_id}-${i}`} connection={c} />) : <p className="text-sm text-slate-500">No downstream dependency is proven in this scope.</p>}</div>
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "change" ? (
          <div className="space-y-4" data-testid="estate-operations-change">
            <div className="rounded-xl border p-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
              <div className="flex items-center gap-2 text-sm font-bold"><Network className="h-4 w-4 text-teal-600" /> Behavioral change impact</div>
              <p className="mt-1 text-xs text-slate-500">Start from proven consumers, bind the exact AWS scope, simulate, snapshot, apply, verify, and retain rollback.</p>
            </div>
            {!isS3 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold">No automated change package for {node.type ?? "this resource"} yet.</p>
                <p className="mt-1 text-xs text-slate-500">Configuration and behavioral dependencies are still available. Cyntro will not invent an execution plan it cannot safely bind.</p>
              </div>
            ) : (
              <>
                <button type="button" onClick={analyze} disabled={!!action} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#0E8B7A" }} data-testid="estate-vpce-analyze">
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Analyze S3 private-path migration
                </button>
                {plan ? (
                  <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: plan.readiness === "READY" ? "#9FE8DC" : "#FED7AA", background: plan.readiness === "READY" ? "#F0FDFA" : "#FFF7ED" }} data-testid="estate-vpce-plan">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {plan.readiness === "READY" ? <CheckCircle2 className="h-5 w-5 text-teal-600" /> : <AlertTriangle className="h-5 w-5 text-orange-600" />}
                      {plan.readiness === "READY" ? "Exact change set is ready" : "Change is blocked by missing proof"}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Metric label="Consumers" value={plan.impact.observed_consumers} />
                      <Metric label="Subnets" value={plan.impact.subnets} />
                      <Metric label="Route tables" value={plan.impact.route_tables} />
                      <Metric label="Workloads in scope" value={plan.impact.route_table_workloads} />
                    </div>
                    <p className="text-xs text-slate-600">Permissions changed: <strong>{plan.impact.permission_changes}</strong> · resources replaced: <strong>{plan.impact.resource_replacements}</strong></p>
                    {plan.blockers.length ? <div className="space-y-2">{plan.blockers.map(b => <div key={b.code} className="rounded-lg border border-orange-200 bg-white p-3 text-xs"><strong className="text-orange-700">{b.code}</strong><p className="mt-1 text-slate-600">{b.message}</p></div>)}</div> : null}
                    {plan.readiness === "READY" && plan.plan_token ? (
                      <div className="space-y-3 border-t border-teal-200 pt-3">
                        <button type="button" onClick={simulate} disabled={!!action} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-700 disabled:opacity-50" data-testid="estate-vpce-simulate">Simulate exact change</button>
                        {simulation ? <div className="rounded-lg border border-teal-200 bg-white p-3 text-xs text-teal-800" data-testid="estate-vpce-simulation">Simulation complete · {String(simulation.status ?? "review result")} · safe to apply: {String(simulation.safe_to_apply ?? false)}</div> : null}
                        <label className="block text-xs font-semibold text-slate-700">Type <span className="font-mono">{expectedApply}</span><input value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs" /></label>
                        <button type="button" onClick={execute} disabled={!!action || confirmation !== expectedApply} className="rounded-lg bg-[#0D1B2A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" data-testid="estate-vpce-execute">Snapshot and apply</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {execution ? (
                  <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" data-testid="estate-vpce-execution">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-900"><ShieldCheck className="h-5 w-5" /> Applied · rollback retained</div>
                    <p className="text-xs text-blue-800">Endpoint <span className="font-mono">{execution.endpoint_id ?? "—"}</span> · snapshot <span className="font-mono">{execution.snapshot_id ?? "—"}</span></p>
                    <button type="button" onClick={verify} disabled={!!action || !execution.lifecycle_token} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">Verify behavioral cutover</button>
                    {verification ? <div className="rounded-lg bg-white p-3 text-xs text-blue-900">State: <strong>{String(verification.state ?? "unknown")}</strong> {verification.message ? `· ${String(verification.message)}` : ""}</div> : null}
                    <label className="block text-xs font-semibold text-blue-900">Type <span className="font-mono">{expectedRollback}</span><input value={rollbackConfirmation} onChange={e => setRollbackConfirmation(e.target.value)} className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 font-mono text-xs" /></label>
                    <button type="button" onClick={rollback} disabled={!!action || rollbackConfirmation !== expectedRollback} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Roll back from snapshot</button>
                  </div>
                ) : null}
              </>
            )}
            {actionError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div> : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
