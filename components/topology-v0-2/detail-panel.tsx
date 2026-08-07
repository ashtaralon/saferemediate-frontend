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
  Sparkles,
  Wrench,
  X,
} from "lucide-react"
import { ResourceConfigTab } from "@/components/inventory/resource-config-tab"
import { ServiceTypeBadge } from "@/lib/service-type"
import type { TopologyNode } from "./types"
import {
  operationalRequest,
  type EstateOperatorNarration,
  type OperationalConnection,
  type OperationalDossier,
  type S3PrivatePathOperation,
  type S3VpceExecution,
  type S3VpcePlan,
  type S3VpceSimulation,
  type S3VpceVerification,
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

const S3_BLOCKER_GUIDANCE: Record<string, { title: string; next: string }> = {
  NO_OBSERVED_CONSUMERS: {
    title: "No eligible VPC consumer in this scope",
    next: "Select All VPCs or a VPC containing an observed consumer. If none appears, generate S3 activity from a VPC-attached workload and refresh behavioral data.",
  },
  UNKNOWN_NETWORK_PATH: {
    title: "Effective S3 route is not proven",
    next: "Refresh AWS network inventory and behavioral evidence so Cyntro can bind the workload to its subnet, effective route table, and current S3 path.",
  },
  EXISTING_ENDPOINT_NOT_OPTED_IN: {
    title: "Existing endpoint is not authorized for Cyntro changes",
    next: "Add cyntro:allow-managed-route-associations=true to the selected endpoint after confirming that Cyntro may manage its route-table associations.",
  },
  OPERATION_LEDGER_UNAVAILABLE: {
    title: "Execution record is temporarily unavailable",
    next: "No AWS change was authorized. Retry Analyze after the operation ledger recovers.",
  },
}

function blockerGuidance(code: string) {
  return S3_BLOCKER_GUIDANCE[code] ?? {
    title: code.replaceAll("_", " ").toLowerCase(),
    next: "Resolve this safety check, then analyze the migration again.",
  }
}

export function DetailPanel({ node, systemName, accountId, region, vpcId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resource")
  const [dossier, setDossier] = useState<OperationalDossier | null>(null)
  const [narration, setNarration] = useState<EstateOperatorNarration | null>(null)
  const [narrationLoading, setNarrationLoading] = useState(false)
  const [narrationError, setNarrationError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<S3VpcePlan | null>(null)
  const [simulation, setSimulation] = useState<S3VpceSimulation | null>(null)
  const [operation, setOperation] = useState<S3PrivatePathOperation | null>(null)
  const [execution, setExecution] = useState<S3VpceExecution | null>(null)
  const [verification, setVerification] = useState<S3VpceVerification | null>(null)
  const [expansion, setExpansion] = useState<Record<string, unknown> | null>(null)
  const [requester, setRequester] = useState("")
  const [approver, setApprover] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [rollbackConfirmation, setRollbackConfirmation] = useState("")
  const [action, setAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setTab("resource")
    setDossier(null)
    setNarration(null)
    setNarrationError(false)
    setPlan(null)
    setSimulation(null)
    setOperation(null)
    setExecution(null)
    setVerification(null)
    setExpansion(null)
    setRequester("")
    setApprover("")
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

  useEffect(() => {
    if (!node) return
    let cancelled = false
    const loadNarration = async () => {
      setNarrationLoading(true)
      setNarrationError(false)
      const query = new URLSearchParams({ resource_id: node.id, window_days: "90" })
      if (accountId) query.set("account_id", accountId)
      if (region) query.set("region", region)
      if (vpcId) query.set("vpc_id", vpcId)
      try {
        const body = await operationalRequest<EstateOperatorNarration>(
          systemName,
          `resource/narration?${query}`,
        )
        if (!cancelled) setNarration(body)
      } catch {
        if (!cancelled) setNarrationError(true)
      } finally {
        if (!cancelled) setNarrationLoading(false)
      }
    }
    void loadNarration()
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
    // A new analysis invalidates every artifact from the previous lifecycle.
    // Clear first so a failed request cannot leave a stale plan on screen.
    setPlan(null)
    setSimulation(null)
    setOperation(null)
    setExecution(null)
    setVerification(null)
    setExpansion(null)
    const body = await post<S3VpcePlan>("s3-vpce/plan", {
      resource_id: node.id,
      vpc_id: vpcId || undefined,
      account_id: accountId || undefined,
      region: region || undefined,
      window_days: 90,
    })
    setPlan(body)
  })
  const simulate = () => runAction("simulate", async () => {
    if (!plan?.plan_token || !plan.operation_id) return
    setSimulation(await post<S3VpceSimulation>("s3-vpce/simulate", {
      operation_id: plan.operation_id,
      plan_token: plan.plan_token,
    }))
  })
  const requestApproval = () => runAction("request-approval", async () => {
    if (!plan?.operation_id) return
    setOperation(await post<S3PrivatePathOperation>("s3-vpce/request-approval", {
      operation_id: plan.operation_id,
      requested_by: requester,
      note: `Move the reviewed S3 route-table cohort through a Gateway endpoint.`,
    }))
  })
  const approve = () => runAction("approve", async () => {
    if (!plan?.operation_id) return
    setOperation(await post<S3PrivatePathOperation>("s3-vpce/approve", {
      operation_id: plan.operation_id,
      approved_by: approver,
      note: "Reviewed cohort, canary, verification gates, and rollback scope.",
    }))
  })
  const execute = () => runAction("execute", async () => {
    const executionPlanToken = operation?.execution_plan_token
    if (!executionPlanToken || !plan?.operation_id) return
    const result = await post<S3VpceExecution>("s3-vpce/execute", {
      operation_id: plan.operation_id,
      plan_token: executionPlanToken,
      confirmation,
      requested_by: requester,
    })
    setExecution(result)
  })
  const verify = () => runAction("verify", async () => {
    if (!execution?.lifecycle_token || !execution.endpoint_id || !plan?.operation_id) return
    setVerification(await post<S3VpceVerification>("s3-vpce/verify", {
      operation_id: plan.operation_id,
      plan_token: execution.lifecycle_token,
      endpoint_id: execution.endpoint_id,
    }))
  })
  const expand = () => runAction("expand", async () => {
    if (!execution?.lifecycle_token || !plan?.operation_id) return
    const result = await post<Record<string, unknown>>("s3-vpce/expand", {
      operation_id: plan.operation_id,
      plan_token: execution.lifecycle_token,
      executed_by: requester,
    })
    setExpansion(result)
    setVerification(null)
  })
  const rollback = () => runAction("rollback", async () => {
    if (!execution?.lifecycle_token || !execution.snapshot_id || !plan?.operation_id) return
    const result = await post<Record<string, unknown>>("s3-vpce/rollback", {
      operation_id: plan.operation_id,
      plan_token: execution.lifecycle_token,
      snapshot_id: execution.snapshot_id,
      confirmation: rollbackConfirmation,
      requested_by: requester,
    })
    setVerification({ ...result, state: "ROLLED_BACK" } as S3VpceVerification)
  })

  const upstream = dossier?.dependencies.upstream ?? []
  const downstream = dossier?.dependencies.downstream ?? []
  const expectedApply = plan?.bucket_name && plan.vpc_id ? `APPLY ${plan.bucket_name} ${plan.vpc_id}` : ""
  const expectedRollback = execution?.snapshot_id ? `ROLLBACK ${execution.snapshot_id}` : ""
  const operationState = verification?.operation_state
    ?? (expansion?.operation_state as S3PrivatePathOperation["state"] | undefined)
    ?? execution?.operation_state
    ?? operation?.state
    ?? simulation?.operation_state
    ?? plan?.operation_state
  const progressSteps = ["Analyze", "Simulate", "Approve", "Canary", "Expand", "Verify"]
  const progressIndex = operationState === "COMPLETE" ? 6
    : operationState === "EXPANDING" ? 5
      : operationState === "CANARY_VERIFIED" ? 4
        : operationState === "CANARY_MONITORING" ? 3
          : operationState === "APPROVED" ? 3
            : operationState === "APPROVAL_PENDING" ? 2
              : operationState === "SIMULATED" ? 2
                : operationState === "READY_FOR_SIMULATION" ? 1
                  : plan ? 1 : 0
  const blockerCodes = new Set(plan?.blockers.map((blocker) => blocker.code) ?? [])
  const noEligibleConsumer = blockerCodes.has("NO_OBSERVED_CONSUMERS")
  const unknownNetworkPath = blockerCodes.has("UNKNOWN_NETWORK_PATH")
  const endpointNeedsOptIn = blockerCodes.has("EXISTING_ENDPOINT_NOT_OPTED_IN")
  const migrationScope = plan?.vpc_id ?? vpcId ?? "the selected VPC"
  const totalObservedConsumers = plan?.impact.total_observed_consumers ?? plan?.impact.observed_consumers ?? 0
  const migratableConsumers = plan?.impact.migrating_consumers ?? plan?.impact.observed_consumers ?? 0
  const planStatusTitle = plan?.readiness === "READY"
    ? "One-route-table canary is ready to simulate"
    : noEligibleConsumer
      ? "No VPC-attached bucket consumer found in this scope"
      : unknownNetworkPath
        ? "Consumer route evidence is incomplete"
        : endpointNeedsOptIn
          ? "Endpoint management authorization is required"
          : "Change is blocked by a safety check"
  const planStatusDetail = plan?.readiness === "READY"
    ? `Cyntro proved ${migratableConsumers} migratable consumer${migratableConsumers === 1 ? "" : "s"} and an exact canary route table in ${migrationScope}.`
    : noEligibleConsumer
      ? totalObservedConsumers > 0
        ? `${totalObservedConsumers} bucket consumer${totalObservedConsumers === 1 ? " was" : "s were"} observed, but none is attached to ${migrationScope} and eligible for an S3 Gateway endpoint migration.`
        : `No bucket access by a VPC-attached workload was observed in ${migrationScope}.`
      : unknownNetworkPath
        ? `${plan?.impact.unknown_consumers ?? 1} observed consumer${(plan?.impact.unknown_consumers ?? 1) === 1 ? " cannot" : "s cannot"} yet be bound to a subnet, effective route table, and current S3 route.`
        : endpointNeedsOptIn
          ? `Endpoint ${plan?.existing_endpoint_id ?? "selected for this VPC"} is customer-owned and has not authorized Cyntro-managed route-table associations.`
          : "At least one required safety condition is not satisfied. Review the exact blocker and next action below."
  let endpointAction = ""
  if (plan) {
    if (noEligibleConsumer) {
      endpointAction = "No endpoint change until an eligible VPC consumer is observed"
    } else if (endpointNeedsOptIn) {
      endpointAction = `Existing endpoint ${plan.existing_endpoint_id} selected; explicit Cyntro opt-in required`
    } else if (unknownNetworkPath && plan.endpoint_mode !== "ADOPT_EXISTING") {
      endpointAction = "No endpoint change until the route-table scope is proven"
    } else if (plan.endpoint_mode !== "ADOPT_EXISTING") {
      endpointAction = "Create a Cyntro-managed S3 Gateway endpoint"
    } else {
      endpointAction = `Use opted-in endpoint ${plan.existing_endpoint_id}`
    }
  }

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
            <section
              className="mb-4 rounded-xl border p-4"
              style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}
              data-testid="estate-operator-summary"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#1A2330" }}>
                  <span className="rounded-lg p-1.5" style={{ background: "#E6FBF7" }}>
                    <Sparkles className="h-4 w-4" style={{ color: "#0E8B7A" }} />
                  </span>
                  Operator summary
                </div>
                {narration ? (
                  <span
                    className="rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide"
                    style={narration.source === "deterministic_fallback"
                      ? { borderColor: "#DDE3E8", background: "#F8FAFC", color: "#5A6B7A" }
                      : { borderColor: "#9FE8DC", background: "#E6FBF7", color: "#0E8B7A" }}
                    data-testid="estate-narration-source"
                  >
                    {narration.source === "deterministic_fallback"
                      ? "Deterministic evidence summary"
                      : "AI explanation · verified evidence"}
                  </span>
                ) : null}
              </div>
              {narrationLoading ? (
                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "#5A6B7A" }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Translating verified evidence…
                </div>
              ) : null}
              {narration ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm font-semibold leading-6" style={{ color: "#1A2330" }}>{narration.operator_summary}</p>
                  <p className="text-xs leading-5" style={{ color: "#5A6B7A" }}>{narration.why_it_matters}</p>
                  <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "#B9E8DF", background: "#F0FDFA", color: "#176B5E" }}>
                    <strong>Next check:</strong> {narration.recommended_next_check}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-wide" style={{ color: "#7A8996" }}>
                    <span>Grounded in</span>
                    {narration.evidence_ids.map(id => (
                      <span key={id} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{id.replaceAll("_", " ")}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {narrationError && !narrationLoading ? (
                <p className="mt-3 text-xs" style={{ color: "#7A8996" }}>
                  Narrative summary is unavailable. Verified configuration and evidence remain available below.
                </p>
              ) : null}
            </section>
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
                  <div className="space-y-4" data-testid="estate-vpce-plan">
                    <div className="grid grid-cols-6 gap-1 rounded-xl border bg-white p-3" style={{ borderColor: "#DDE3E8" }} aria-label="Private path lifecycle">
                      {progressSteps.map((step, index) => (
                        <div key={step} className="min-w-0 text-center">
                          <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold" style={index < progressIndex
                            ? { borderColor: "#00C2A8", background: "#0E8B7A", color: "#FFFFFF" }
                            : index === progressIndex
                              ? { borderColor: "#00C2A8", background: "#E6FBF7", color: "#0E8B7A" }
                              : { borderColor: "#DDE3E8", background: "#F8FAFC", color: "#7A8996" }}>
                            {index < progressIndex ? "✓" : index + 1}
                          </div>
                          <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500">{step}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: plan.readiness === "READY" ? "#9FE8DC" : "#FED7AA", background: plan.readiness === "READY" ? "#F0FDFA" : "#FFF7ED" }}>
                      <div className="flex items-start gap-2">
                        {plan.readiness === "READY" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />}
                        <div>
                          <div className="text-sm font-bold">{planStatusTitle}</div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{planStatusDetail}</p>
                          <p className="mt-1 text-[10px] text-slate-500">Scope: <strong>{migrationScope}</strong> · Bucket: <strong>{plan.bucket_name}</strong></p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Metric label="Migratable consumers" value={migratableConsumers} />
                        <Metric label="Cohort workloads" value={plan.impact.route_table_workloads} />
                        <Metric label="Route tables" value={plan.impact.route_tables} />
                        <Metric label="S3 destinations" value={plan.impact.s3_destinations ?? 0} />
                      </div>
                      <div className="rounded-lg border bg-white p-3 text-xs text-slate-600" style={{ borderColor: "#DDE3E8" }}>
                        <div className="grid grid-cols-[125px_1fr] gap-x-3 gap-y-2">
                          <strong className="text-slate-800">Endpoint action</strong><span>{endpointAction}</span>
                          <strong className="text-slate-800">Canary</strong><span className="font-mono">{plan.canary_route_table_id ?? "Blocked"}</span>
                          <strong className="text-slate-800">Authorization</strong><span>No IAM or bucket-policy change in this operation</span>
                          <strong className="text-slate-800">Rollback</strong><span>Remove only associations added by this operation</span>
                        </div>
                      </div>
                      {(plan.excluded_consumers?.length ?? 0) > 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-xs font-bold text-slate-800">Not changed by this operation ({plan.excluded_consumers?.length})</div>
                          <div className="mt-2 space-y-2">
                            {plan.excluded_consumers?.map((consumer, index) => (
                              <div key={`${consumer.resource_id}-${index}`} className="text-xs text-slate-600">
                                <strong>{consumer.resource_name || consumer.resource_id}</strong> · {consumer.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {plan.blockers.length ? (
                        <div className="space-y-2">
                          {plan.blockers.map((blocker) => {
                            const guidance = blockerGuidance(blocker.code)
                            return (
                              <div key={blocker.code} className="rounded-lg border border-orange-200 bg-white p-3 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong className="text-orange-800">{guidance.title}</strong>
                                  <span className="rounded bg-orange-50 px-1.5 py-0.5 font-mono text-[9px] text-orange-700">{blocker.code}</span>
                                </div>
                                <p className="mt-1 leading-5 text-slate-600">{blocker.message}</p>
                                <p className="mt-2 leading-5 text-slate-700"><strong>Next:</strong> {guidance.next}</p>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}

                      {plan.readiness === "READY" && plan.plan_token ? (
                        <div className="space-y-3 border-t border-teal-200 pt-3">
                          {operationState === "READY_FOR_SIMULATION" ? (
                            <button type="button" onClick={simulate} disabled={!!action} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-700 disabled:opacity-50" data-testid="estate-vpce-simulate">
                              {action === "simulate" ? "Running AWS dry-run…" : "Simulate canary in AWS"}
                            </button>
                          ) : null}
                          {simulation ? (
                            <div className={`rounded-lg border bg-white p-3 text-xs ${simulation.safe_to_apply ? "border-teal-200 text-teal-800" : "border-red-200 text-red-700"}`} data-testid="estate-vpce-simulation">
                              <strong>{simulation.safe_to_apply ? "AWS dry-run passed" : "Simulation blocked"}</strong> · exact canary scope is immutable under plan hash {simulation.plan_hash.slice(0, 10)}…
                            </div>
                          ) : null}
                          {operationState === "SIMULATED" ? (
                            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                              <label className="block text-xs font-semibold text-slate-700">Requester identity<input aria-label="Requester identity" value={requester} onChange={e => setRequester(e.target.value)} placeholder="name@company.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" /></label>
                              <button type="button" onClick={requestApproval} disabled={!!action || requester.trim().length < 3} className="rounded-lg bg-[#0D1B2A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" data-testid="estate-vpce-request-approval">Request change approval</button>
                            </div>
                          ) : null}
                          {operationState === "APPROVAL_PENDING" ? (
                            <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3">
                              <p className="text-xs text-slate-600">Requested by <strong>{operation?.approval?.requested_by}</strong>. A different operator must approve.</p>
                              <label className="block text-xs font-semibold text-slate-700">Approver identity<input aria-label="Approver identity" value={approver} onChange={e => setApprover(e.target.value)} placeholder="approver@company.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" /></label>
                              <button type="button" onClick={approve} disabled={!!action || approver.trim().length < 3 || approver.trim().toLowerCase() === requester.trim().toLowerCase()} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40" data-testid="estate-vpce-approve">Approve canary and staged rollout</button>
                            </div>
                          ) : null}
                          {operationState === "APPROVED" ? (
                            <div className="space-y-2 rounded-lg border border-teal-200 bg-white p-3">
                              <p className="text-xs text-slate-600">Approved by <strong>{operation?.approval?.approved_by}</strong>. Apply changes only the canary route table.</p>
                              <label className="block text-xs font-semibold text-slate-700">Type <span className="font-mono">{expectedApply}</span><input aria-label="Apply confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs" /></label>
                              <button type="button" onClick={execute} disabled={!!action || !simulation?.safe_to_apply || !operation?.execution_plan_token || confirmation !== expectedApply} className="rounded-lg bg-[#0D1B2A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" data-testid="estate-vpce-execute">Snapshot and apply canary</button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {execution ? (
                  <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" data-testid="estate-vpce-execution">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-900"><ShieldCheck className="h-5 w-5" /> Canary applied · rollback retained</div>
                    <p className="text-xs text-blue-800">Endpoint <span className="font-mono">{execution.endpoint_id ?? "—"}</span> · snapshot <span className="font-mono">{execution.snapshot_id ?? "—"}</span></p>
                    {operationState === "CANARY_MONITORING" || operationState === "EXPANDING" ? (
                      <button type="button" onClick={verify} disabled={!!action || !execution.lifecycle_token} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50" data-testid="estate-vpce-verify">Verify AWS route and observed S3 traffic</button>
                    ) : null}
                    {verification ? (
                      <div className="space-y-1 rounded-lg bg-white p-3 text-xs text-blue-900" data-testid="estate-vpce-verification">
                        <div>State: <strong>{verification.state}</strong> · {verification.fresh_private_s3_flows ?? 0}/{verification.expected_s3_flows ?? 0} fresh S3 flows · route scope {verification.route_scope_verified ? "verified" : "pending"}.</div>
                        <div>Observed action coverage: {verification.fresh_private_s3_actions ?? 0}/{verification.expected_s3_actions ?? 0} · endpoint denials: {verification.endpoint_denial_rows ?? 0}.</div>
                        <div>{verification.message}</div>
                        {verification.evidence_refresh?.success === false ? <div className="font-semibold text-amber-700">Evidence refresh is still pending: {verification.evidence_refresh.error ?? "collector unavailable"}</div> : null}
                      </div>
                    ) : null}
                    {(operationState === "CANARY_VERIFIED" || (operationState === "EXPANDING" && verification?.state === "VERIFIED" && verification.more_routes_pending)) ? (
                      <button type="button" onClick={expand} disabled={!!action} className="rounded-lg bg-[#0D1B2A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="estate-vpce-expand">Apply next route-table stage</button>
                    ) : null}
                    {expansion ? <div className="rounded-lg border border-blue-200 bg-white p-3 text-xs text-blue-900">One route table was added. Fresh S3 flow evidence is required before the next stage.</div> : null}
                    {operationState === "COMPLETE" ? <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">Transport migration verified. Bucket-policy enforcement remains a separate reviewed change.</div> : null}
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
