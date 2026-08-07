"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Database,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Route,
} from "lucide-react"
import {
  operationalRequest,
  type S3OperationKind,
  type S3VpceOperationList,
} from "@/components/topology-v0-2/estate-operations"
import {
  isInFlight,
  lifecycleView,
  operationFromSummary,
  operationKind,
  rememberedOperations,
  updateRememberedOperation,
  S3_ENFORCEMENT_KIND,
  S3_PRIVATE_PATH_KIND,
  type RememberedOperation,
} from "./s3-vpce-lifecycle"
import { S3VpceWizard } from "./s3-vpce-wizard"
import { S3EnforcementWizard } from "./s3-enforcement-wizard"

interface SystemResource {
  id: string
  name: string
  type: string
  region?: string | null
}

interface Props {
  systemName: string
}

const KIND_LABEL: Record<S3OperationKind, string> = {
  S3_PRIVATE_PATH: "Private path",
  S3_BUCKET_POLICY_ENFORCEMENT: "Enforce",
}

function StatusChip({ entry }: { entry: RememberedOperation | undefined }) {
  const view = lifecycleView(entry?.state ?? null)
  const style = view.tone === "done"
    ? { background: "#E6FBF7", color: "#0E8B7A", borderColor: "#9FE8DC" }
    : view.tone === "error"
      ? { background: "#FEF2F2", color: "#B91C1C", borderColor: "#FCA5A5" }
      : view.tone === "rolled_back"
        ? { background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" }
        : view.tone === "active"
          ? { background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }
          : { background: "#F8FAFC", color: "#5A6B7A", borderColor: "#DDE3E8" }
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={style}>
      {view.label}
    </span>
  )
}

export function ConfigurationFixesTab({ systemName }: Props) {
  const [resources, setResources] = useState<SystemResource[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operations, setOperations] = useState<RememberedOperation[]>([])
  // "server": rows come from the operations ledger (cross-browser truth).
  // "local": ledger unreachable — degraded to this browser's stash.
  const [listSource, setListSource] = useState<"server" | "local">("local")
  const [wizard, setWizard] = useState<{
    bucket: SystemResource
    resume: RememberedOperation | null
    kind: S3OperationKind
  } | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // The ledger is the system of record for this list; the browser stash
  // contributes only the bearer tokens reads never return, and serves as
  // the fallback when the ledger cannot be reached.
  const refreshOperations = useCallback(async () => {
    const stash = rememberedOperations(systemName)
    try {
      const body = await operationalRequest<S3VpceOperationList>(
        systemName,
        "s3-vpce/operations?include_terminal=true&limit=100",
      )
      const stashById = new Map(stash.map((entry) => [entry.operationId, entry]))
      const rows = (body.operations ?? []).map((summary) =>
        operationFromSummary(systemName, summary, stashById.get(summary.operation_id)),
      )
      // Keep stashed entries in step with the ledger so a token-holding
      // browser never disagrees with the server about where things stand.
      for (const row of rows) {
        if (stashById.has(row.operationId)) {
          updateRememberedOperation(systemName, row.operationId, {
            state: row.state,
            snapshotId: row.snapshotId,
            endpointId: row.endpointId,
            requestedBy: row.requestedBy,
            approvedBy: row.approvedBy,
            rollbackExpiresAt: row.rollbackExpiresAt,
          })
        }
      }
      if (mountedRef.current) {
        setOperations(rows)
        setListSource("server")
      }
    } catch {
      if (mountedRef.current) {
        setOperations(stash)
        setListSource("local")
      }
    }
  }, [systemName])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch(
          `/api/proxy/system-resources/${encodeURIComponent(systemName)}`,
          { cache: "no-store" },
        )
        const body = await response.json().catch(() => null)
        if (!response.ok || !body || body.error) {
          throw new Error(body?.error || `system-resources returned ${response.status}`)
        }
        if (!cancelled) {
          const all = (body.resources || []) as Array<Record<string, unknown>>
          setResources(
            all
              .filter((r) => r.type === "S3" || r.type === "S3Bucket")
              .map((r) => ({
                id: String(r.id ?? r.name ?? ""),
                name: String(r.name ?? r.id ?? "Unknown bucket"),
                type: String(r.type ?? "S3"),
                region: (r.region as string) ?? null,
              }))
              .filter((r) => r.id),
          )
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load resources")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [systemName])

  useEffect(() => {
    void refreshOperations()
  }, [refreshOperations])

  // Split the latest op per bucket by change type: the transport migration and
  // the enforcement that comes after it are two independent lifecycles on the
  // same bucket, each with its own card action.
  const latestByBucketForKind = useCallback((kind: S3OperationKind) => {
    const map = new Map<string, RememberedOperation>()
    for (const entry of operations) {
      // operations[] is newest-first (both ledger and stash), keep the
      // first hit per bucket for this kind.
      if (operationKind(entry) === kind && !map.has(entry.bucketId)) {
        map.set(entry.bucketId, entry)
      }
    }
    return map
  }, [operations])

  const latestVpceByBucket = useMemo(
    () => latestByBucketForKind(S3_PRIVATE_PATH_KIND),
    [latestByBucketForKind],
  )
  const latestEnforcementByBucket = useMemo(
    () => latestByBucketForKind(S3_ENFORCEMENT_KIND),
    [latestByBucketForKind],
  )

  // Only operations that are genuinely running or awaiting a human belong
  // here. Abandoned drafts (blocked/never-simulated analyses) stay off the
  // strip — analyze mints a fresh operation every time, so drafts are
  // superseded, not resumable work.
  const inFlight = useMemo(
    () => operations.filter((entry) => isInFlight(entry.state)),
    [operations],
  )

  const openWizard = (
    bucket: SystemResource,
    resume: RememberedOperation | null,
    kind: S3OperationKind,
  ) => {
    setWizard({ bucket, resume, kind })
  }

  const closeWizard = () => {
    setWizard(null)
    void refreshOperations()
  }

  return (
    <div className="space-y-5 p-1" data-testid="configuration-fixes-tab">
      <div className="rounded-2xl border p-5" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
        <div className="flex items-center gap-2 text-base font-bold" style={{ color: "#1A2330" }}>
          <Route className="h-5 w-5" style={{ color: "#0E8B7A" }} /> Configuration fixes
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: "#5A6B7A" }}>
          Guided infrastructure changes for this system. Each fix runs as a staged setup: review the change, pass the
          safety checks, get a second pair of eyes, then watch it roll out one step at a time — verified from real
          traffic, with a snapshot rollback ready the whole way. No scripts, no console sessions.
        </p>
      </div>

      {inFlight.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "#5A6B7A" }}>
            In progress ({inFlight.length})
          </h3>
          {listSource === "local" ? (
            <p className="mb-2 text-[11px]" style={{ color: "#B45309" }} data-testid="configuration-fixes-degraded">
              Live operations list unavailable — showing changes started in this browser only.
            </p>
          ) : null}
          <div className="space-y-2">
            {inFlight.map((entry) => {
              const kind = operationKind(entry)
              return (
                <div
                  key={entry.operationId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  style={{ borderColor: "#BFDBFE", background: "#EFF6FF" }}
                  data-testid="configuration-fixes-inflight"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "#1A2330" }}>{entry.bucketName}</span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ borderColor: "#C9D4DE", background: "#FFFFFF", color: "#5A6B7A" }}
                      >
                        {kind === S3_ENFORCEMENT_KIND ? <Lock className="h-3 w-3" /> : <Network className="h-3 w-3" />}
                        {KIND_LABEL[kind]}
                      </span>
                      <StatusChip entry={entry} />
                    </div>
                    <div className="mt-0.5 font-mono text-[10px]" style={{ color: "#5A6B7A" }}>
                      {entry.operationId} {entry.vpcId ? `· ${entry.vpcId}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWizard(
                      { id: entry.bucketId, name: entry.bucketName, type: "S3" },
                      entry,
                      kind,
                    )}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    style={{ background: "#0E8B7A" }}
                  >
                    Resume <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5A6B7A" }}>
            S3 private path · route S3 traffic off the internet gateway
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading this system&apos;s S3 buckets…
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
        ) : resources.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No S3 buckets are attributed to this system yet. Buckets appear here after discovery and behavioral sync.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {resources.map((bucket) => {
              const entry = latestVpceByBucket.get(bucket.id)
              const active = entry ? isInFlight(entry.state) : false
              // Enforcement eligibility is decided by backend analysis (which
              // proves the private path from behavior), NOT by whether Cyntro
              // ran the migration. So the affordance is always available — a
              // bucket already private through a VPCE set up outside Cyntro can
              // start enforcement, and analyze blocks clearly if it is not yet
              // eligible (consumers on the public path, no proof, etc.).
              const enforceEntry = latestEnforcementByBucket.get(bucket.id)
              const enforceActive = enforceEntry ? isInFlight(enforceEntry.state) : false
              const enforced = enforceEntry?.state === "COMPLETE"
              return (
                <div
                  key={bucket.id}
                  className="flex flex-col justify-between rounded-xl border bg-white p-4"
                  style={{ borderColor: "#DDE3E8" }}
                  data-testid="configuration-fix-card"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg p-1.5" style={{ background: "#E6FBF7" }}>
                        <Database className="h-4 w-4" style={{ color: "#0E8B7A" }} />
                      </span>
                      <span className="truncate text-sm font-semibold" style={{ color: "#1A2330" }}>{bucket.name}</span>
                      <StatusChip entry={entry} />
                    </div>
                    <p className="mt-2 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                      Checks who uses this bucket, then moves that traffic onto an S3 Gateway endpoint —
                      route tables only, no application or permission changes.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#7A8996" }}>
                      <Network className="h-3 w-3" /> Network routing
                    </span>
                    <button
                      type="button"
                      onClick={() => openWizard(bucket, active ? entry ?? null : null, S3_PRIVATE_PATH_KIND)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                      style={{ background: active ? "#1D4ED8" : "#0E8B7A" }}
                      data-testid="configuration-fix-open"
                    >
                      {active ? "Resume setup" : entry?.state === "COMPLETE" ? "Review / run again" : "Start setup"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "#EDF1F4" }} data-testid="configuration-fix-enforce-row">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#7A8996" }}>
                        <Lock className="h-3 w-3" /> Enforce private path
                        {enforceEntry ? <StatusChip entry={enforceEntry} /> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => openWizard(
                          bucket,
                          enforceActive ? enforceEntry ?? null : null,
                          S3_ENFORCEMENT_KIND,
                        )}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        style={enforced
                          ? { background: "#FFFFFF", color: "#0E8B7A", border: "1px solid #9FE8DC" }
                          : { background: enforceActive ? "#1D4ED8" : "#0D1B2A", color: "#FFFFFF" }}
                        data-testid="configuration-fix-enforce-open"
                      >
                        {enforceActive ? "Resume enforcement" : enforced ? "Enforced · review" : "Enforce private path"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "#C9D4DE", color: "#7A8996" }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: "#5A6B7A" }}>
          <RefreshCw className="h-3.5 w-3.5" /> More configuration fixes are on the way
        </div>
        <p className="mt-1 leading-5">
          The same staged setup will cover unused internet routes and endpoint policy scoping — each with its own review,
          safety check, approval, and rollback.
        </p>
      </section>

      {wizard?.kind === S3_ENFORCEMENT_KIND ? (
        <S3EnforcementWizard
          systemName={systemName}
          bucket={wizard.bucket}
          resume={wizard.resume}
          region={wizard.bucket.region}
          onClose={closeWizard}
        />
      ) : wizard ? (
        <S3VpceWizard
          systemName={systemName}
          bucket={wizard.bucket}
          resume={wizard.resume}
          region={wizard.bucket.region}
          onClose={closeWizard}
        />
      ) : null}
    </div>
  )
}
