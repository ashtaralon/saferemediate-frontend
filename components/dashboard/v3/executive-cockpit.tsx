"use client"

import { useEffect, useMemo } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  GitBranch,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  RECOVERY_POLL_MS,
  STALE_BACKEND_RECOVERING,
  useCachedFetch,
} from "@/lib/use-cached-fetch"
import {
  isCacheableExecutiveSnapshot,
  type ExecutiveCandidate,
  type ExecutiveRisk,
  type ExecutiveSnapshot,
  type SnapshotServeState,
} from "@/lib/executive-snapshot"
import { ErrorCard, LoadingCard, StaleIndicator } from "./card-shell"
import type {
  ManagementReportContext,
  ManagementReportSnapshot,
  ReportSource,
} from "./management-report-drawer"

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function lowerBound(value: number | null, lower: boolean): string {
  if (value === null) return "—"
  return `${lower ? "≥" : ""}${value.toLocaleString()}`
}

function stateLabel(state: SnapshotServeState): "READY" | "PARTIAL" | "UNAVAILABLE" {
  if (state === "READY") return "READY"
  if (state === "PARTIAL") return "PARTIAL"
  return "UNAVAILABLE"
}

type SystemsCatalogResponse = {
  success?: boolean
  timestamp?: string | number | null
  systems?: Array<{
    name?: string
    displayName?: string
    SystemName?: string
    environment?: string
    criticality?: string
    businessCriticality?: string
    owner?: string
    score?: number
    healthScore?: number
    resourceCount?: number
    critical?: number
    high?: number
    weakestPlane?: string
  }>
}

function reportSnapshot(data: ExecutiveSnapshot, catalog?: SystemsCatalogResponse | null): ManagementReportSnapshot {
  const material = data.material_risk
  const risks = material.top_risks || []
  const candidates = data.remediation.top_candidates || []
  const byDay = (data.outcomes.by_day || []).map((day) => ({
    date: day.date,
    permissionsRemoved: day.permissions_removed,
    events: day.events_count,
  }))
  const systemRows = new Map<string, ManagementReportSnapshot["systems"][number]>()

  for (const risk of risks) {
    const names = risk.system_names?.length
      ? risk.system_names
      : risk.system_name
        ? [risk.system_name]
        : ["System not reported"]
    for (const name of names) {
      const row = systemRows.get(name) || {
        name,
        displayName: name,
        environment: null,
        criticality: null,
        owner: null,
        score: null,
        resourceCount: null,
        critical: 0,
        high: 0,
        weakestPlane: null,
      }
      if (risk.severity === "CRITICAL") row.critical = (row.critical || 0) + 1
      if (risk.severity === "HIGH") row.high = (row.high || 0) + 1
      systemRows.set(name, row)
    }
  }


  for (const system of catalog?.systems || []) {
    const name = system.name || system.SystemName
    if (!name) continue
    const existingKey = Array.from(systemRows.keys()).find((key) => key.toLowerCase() === name.toLowerCase())
    const existing = existingKey ? systemRows.get(existingKey) : undefined
    const score = integer(system.score ?? system.healthScore)
    const row = {
      name,
      displayName: system.displayName || system.SystemName || name,
      environment: system.environment || null,
      criticality: system.businessCriticality || system.criticality || null,
      owner: system.owner || null,
      score,
      resourceCount: integer(system.resourceCount),
      critical: integer(system.critical) ?? existing?.critical ?? 0,
      high: integer(system.high) ?? existing?.high ?? 0,
      weakestPlane: system.weakestPlane || existing?.weakestPlane || null,
    }
    if (existingKey) systemRows.delete(existingKey)
    systemRows.set(name, row)
  }

  return {
    metrics: {
      systems: integer(material.systems_discovered),
      systemsPartial: material.counts_are_lower_bounds || material.serve_state !== "READY",
      systemsRequiringAttention: integer(material.high_risk_targets),
      reachableCrownJewels: integer(material.crown_jewels),
      internetExposedJewels: integer(material.externally_exposed_jewels),
      viableAttackPaths: integer(material.attack_paths),
      proposedChanges: integer(data.remediation.ready_on_page),
      heldChanges: integer(data.remediation.held_on_page),
    },
    systems: Array.from(systemRows.values()),
    crownJewels: risks.map((risk, index) => ({
      id: risk.id || `${risk.name || "risk"}-${index}`,
      name: risk.name || "Unnamed target",
      type: risk.resource_type || "Resource",
      severity: risk.severity || null,
      pathCount: integer(risk.path_count),
      riskScore: integer(risk.priority_score),
      internetExposed: typeof risk.internet_exposed === "boolean" ? risk.internet_exposed : null,
      dataClassification: null,
      systemName: risk.system_name || risk.system_names?.join(", ") || null,
    })),
    candidates: candidates.map((candidate) => ({
      resourceType: candidate.resource_type || "Resource",
      resourceId: candidate.resource_id || "Unnamed resource",
      system: candidate.system || null,
      unusedCount: integer(candidate.unused_count),
      totalPermissions: integer(candidate.total_permissions),
      severity: candidate.severity || null,
      canAutoApply: typeof candidate.can_auto_apply === "boolean" ? candidate.can_auto_apply : null,
      blockReason: candidate.block_reason || null,
    })),
    evidence: {
      confidence: null,
      accounts: null,
      healthy: integer(data.evidence.healthy),
      degraded: integer(data.evidence.degraded),
      missing: integer(data.evidence.missing),
      total: integer(data.evidence.total),
    },
    outcomes: {
      windowDays: integer(data.outcomes.window_days),
      permissionsRemoved: integer(data.outcomes.permissions_removed),
      events: integer(data.outcomes.events_count),
      rollbacks: integer(data.outcomes.rollbacks_count),
      periodStart: byDay.at(0)?.date || null,
      periodEnd: byDay.at(-1)?.date || null,
      byDay,
    },
  }
}

function SnapshotStatus({ data, recovering }: { data: ExecutiveSnapshot; recovering: boolean }) {
  const material = data.material_risk
  const scanned = integer(material.systems_scanned)
  const discovered = integer(material.systems_discovered)
  const coverage = scanned !== null && discovered !== null && discovered > 0
    ? Math.min(100, Math.round((scanned / discovered) * 100))
    : null

  if (data.serve_state === "READY" && !recovering) return null

  return (
    <div className={`rounded-xl border px-4 py-3 ${
      recovering
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-amber-200 bg-amber-50 text-amber-950"
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4" />
          {recovering
            ? "Backend recovering — showing the last verified snapshot"
            : data.serve_state === "PARTIAL"
              ? "Analysis in progress — figures are lower bounds"
              : "Executive risk reading is not ready"}
        </div>
        {coverage !== null ? (
          <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-current" style={{ width: `${coverage}%` }} />
            </div>
            {scanned}/{discovered} systems
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-xs opacity-80">
        {recovering
          ? "The reading remains useful but is not current. All mutations stay disabled until the backend responds."
          : material.reason || "Cyntro will update this brief as graph-backed sections finish."}
      </p>
    </div>
  )
}

function Kpi({
  icon: Icon,
  value,
  label,
  detail,
  tone,
  lower,
  onClick,
}: {
  icon: typeof Crown
  value: number | null
  label: string
  detail: string
  tone: string
  lower?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </div>
      <div className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.055em] text-slate-950 tabular-nums">
        {lowerBound(value, lower === true)}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </>
  )
  const className = "min-w-0 px-5 py-5 text-left"
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} transition hover:bg-slate-50`}>
      {content}
    </button>
  ) : <div className={className}>{content}</div>
}

function RiskTable({ risks }: { risks: ExecutiveRisk[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Top material risks</div>
          <p className="mt-1 text-sm text-slate-600">Crown jewels with the highest graph-backed path priority</p>
        </div>
        <Radar className="h-5 w-5 text-rose-500" />
      </header>
      {risks.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-600">
          No ranked targets are available in this snapshot. This is not an all-clear.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {risks.map((risk, index) => (
            <div key={risk.id || `${risk.name}-${index}`} className="grid grid-cols-[32px_minmax(0,1fr)_90px_80px] items-center gap-3 px-5 py-3.5">
              <div className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{risk.name || "Unnamed target"}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {risk.system_name || risk.system_names?.join(", ") || "System attribution unavailable"} · {risk.resource_type || "resource"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-slate-900">{integer(risk.path_count)?.toLocaleString() ?? "—"}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">paths</div>
              </div>
              <div className="text-right">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  risk.severity === "CRITICAL"
                    ? "bg-rose-100 text-rose-700"
                    : risk.severity === "HIGH"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}>
                  {risk.severity || "unrated"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CandidateList({ candidates, held }: { candidates: ExecutiveCandidate[]; held: number | null }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">What Cyntro recommends</div>
          <p className="mt-1 text-sm text-slate-600">Prioritized changes; execution remains gated</p>
        </div>
        <Sparkles className="h-5 w-5 text-violet-500" />
      </div>
      <div className="mt-4 space-y-2.5">
        {candidates.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600">
            No candidate rows are available in the current snapshot.
          </div>
        ) : candidates.slice(0, 4).map((candidate, index) => (
          <div key={`${candidate.resource_type}-${candidate.resource_id}-${index}`} className="rounded-xl border border-slate-100 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{candidate.resource_id || "Unnamed resource"}</div>
                <div className="mt-0.5 text-xs text-slate-500">{candidate.resource_type || "Resource"} · {candidate.system || "System unknown"}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                candidate.can_auto_apply ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                {candidate.can_auto_apply ? "ready" : "held"}
              </span>
            </div>
            {candidate.unused_count !== null && candidate.unused_count !== undefined ? (
              <div className="mt-2 text-xs text-slate-600">
                {candidate.unused_count} unused of {candidate.total_permissions ?? "—"} permissions
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {held !== null && held > 0 ? (
        <p className="mt-3 text-xs text-slate-500">{held} additional candidate{held === 1 ? " is" : "s are"} held by evidence or safety gates.</p>
      ) : null}
    </section>
  )
}

function EvidencePanel({ evidence }: { evidence: ExecutiveSnapshot["evidence"] }) {
  const healthy = integer(evidence.healthy)
  const degraded = integer(evidence.degraded)
  const missing = integer(evidence.missing)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Evidence readiness</div>
          <p className="mt-1 text-sm text-slate-600">What strengthens or blocks a decision</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-sky-500" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Healthy", healthy, "text-emerald-700 bg-emerald-50"],
          ["Degraded", degraded, "text-amber-700 bg-amber-50"],
          ["Missing", missing, "text-rose-700 bg-rose-50"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className={`rounded-xl px-3 py-3 ${tone}`}>
            <div className="text-xl font-semibold tabular-nums">{typeof value === "number" ? value : "—"}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {(evidence.top_blockers || []).slice(0, 3).map((blocker) => (
          <div key={`${blocker.source_type}-${blocker.reason}`} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 truncate text-slate-600">{blocker.source_type.replaceAll("_", " ")} · {blocker.reason.replaceAll("_", " ")}</div>
            <div className="font-semibold tabular-nums text-slate-900">{blocker.count}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function OutcomePanel({ outcomes }: { outcomes: ExecutiveSnapshot["outcomes"] }) {
  const windowDays = integer(outcomes.window_days)
  const removed = integer(outcomes.permissions_removed)
  const events = integer(outcomes.events_count)
  const rollbacks = integer(outcomes.rollbacks_count)
  const hasProgress = removed !== null && events !== null && (removed > 0 || events > 0)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Verified improvement</div>
          <p className="mt-1 text-sm text-slate-600">Graph-recorded remediation outcomes</p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      </div>
      {windowDays === null || removed === null || events === null ? (
        <div className="mt-5 text-sm text-slate-600">Outcome history is not available in this snapshot.</div>
      ) : hasProgress ? (
        <div className="mt-5">
          <div className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 tabular-nums">−{removed}</div>
          <div className="mt-1 text-sm text-slate-600">permissions removed across {events} verified action{events === 1 ? "" : "s"}</div>
          {rollbacks ? <div className="mt-2 text-xs text-amber-700">{rollbacks} rollback{rollbacks === 1 ? "" : "s"} in the same window</div> : null}
        </div>
      ) : (
        <div className="mt-5 rounded-xl bg-slate-50 px-4 py-4">
          <div className="text-sm font-semibold text-slate-800">No verified narrowing in the last {windowDays} days</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">This is a measured zero from remediation history, not a missing reading.</div>
        </div>
      )}
    </section>
  )
}

export function ExecutiveCockpit({
  onNavigateToSection,
  onReportData,
}: {
  onNavigateToSection?: (id: string) => void
  onReportData?: (report: ManagementReportContext) => void
}) {
  const router = useRouter()
  const snapshot = useCachedFetch<ExecutiveSnapshot>(
    "/api/proxy/dashboard/executive-snapshot",
    {
      cacheKey: "dashboard-executive-snapshot-v1",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      transientRetries: 2,
      failClosedOnError: true,
      autoRetryMs: RECOVERY_POLL_MS,
      isCacheable: isCacheableExecutiveSnapshot,
    },
  )
  const systemsCatalog = useCachedFetch<SystemsCatalogResponse>(
    "/api/proxy/systems",
    {
      cacheKey: "management-report-systems-v1",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      transientRetries: 1,
      autoRetryMs: RECOVERY_POLL_MS,
      isCacheable: (value) => Boolean(value && typeof value === "object" && Array.isArray((value as SystemsCatalogResponse).systems)),
    },
  )

  const data = snapshot.data
  const sources: ReportSource[] = useMemo(() => {
    if (!data) return []
    const readingAt = snapshot.cachedAt || Date.parse(data.computed_at) || null
    return [
      { label: "Material risk", state: stateLabel(data.material_risk.serve_state), detail: data.material_risk.reason || null, cachedAt: readingAt },
      {
        label: "Report scope catalog",
        state: systemsCatalog.data?.systems?.length ? "READY" : systemsCatalog.loading ? "PARTIAL" : "UNAVAILABLE",
        detail: systemsCatalog.data?.systems?.length ? `${systemsCatalog.data.systems.length} systems available for scope selection` : systemsCatalog.error || "System metadata is loading",
        cachedAt: systemsCatalog.cachedAt || (systemsCatalog.data?.timestamp ? Date.parse(String(systemsCatalog.data.timestamp)) || null : null),
      },
      { label: "Proposed changes", state: stateLabel(data.remediation.serve_state), cachedAt: readingAt },
      { label: "Evidence readiness", state: stateLabel(data.evidence.serve_state), detail: data.evidence.reason || null, cachedAt: readingAt },
      { label: "Verified outcomes", state: stateLabel(data.outcomes.serve_state), cachedAt: readingAt },
    ]
  }, [data, snapshot.cachedAt, systemsCatalog.cachedAt, systemsCatalog.data, systemsCatalog.error, systemsCatalog.loading])

  useEffect(() => {
    if (!data) return
    const discovered = integer(data.material_risk.systems_discovered)
    const scanned = integer(data.material_risk.systems_scanned)
    onReportData?.({
      scope: discovered === null
        ? "Not available"
        : scanned === null
          ? `analysis coverage unavailable across ${discovered} business systems`
          : `${scanned} of ${discovered} business systems analyzed`,
      sources,
      snapshot: reportSnapshot(data, systemsCatalog.data),
    })
  }, [data, onReportData, sources, systemsCatalog.data])

  if (snapshot.loading && !data) return <LoadingCard label="Cloud risk and remediation overview" />
  if ((snapshot.error || !data) && !data) {
    return <ErrorCard label="Cloud risk and remediation overview" error={snapshot.error || "Executive snapshot unavailable"} onRetry={snapshot.retry} />
  }
  if (!data) return null

  const recovering = snapshot.staleReason === STALE_BACKEND_RECOVERING
  const material = data.material_risk
  const lower = material.counts_are_lower_bounds === true
  const ready = integer(data.remediation.ready_on_page)
  const held = integer(data.remediation.held_on_page)

  return (
    <div className="flex flex-col gap-5">
      <SnapshotStatus data={data} recovering={recovering} />

      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-7 text-white shadow-[0_22px_60px_rgba(15,23,42,0.18)] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(139,92,246,0.28),transparent_36%),radial-gradient(circle_at_10%_90%,rgba(14,165,233,0.18),transparent_32%)]" />
        <div className="relative max-w-4xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200">
            <Sparkles className="h-3.5 w-3.5" /> Executive risk brief
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.narrative.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{data.narrative.body}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>Last verified {new Date(data.computed_at).toLocaleString()}</span>
            <StaleIndicator cachedAt={snapshot.cachedAt} isStale={snapshot.isStale} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
        <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <Kpi icon={GitBranch} value={integer(material.attack_paths)} lower={lower} label="Attack paths" detail={lower ? "Confirmed in analyzed systems" : "Across the analyzed estate"} tone="bg-rose-100 text-rose-700" onClick={() => onNavigateToSection?.("attack-paths")} />
          <Kpi icon={Crown} value={integer(material.crown_jewels)} lower={lower} label="Crown jewels reached" detail={`${integer(material.externally_exposed_jewels) ?? "—"} externally exposed`} tone="bg-amber-100 text-amber-700" onClick={() => onNavigateToSection?.("attack-paths")} />
          <Kpi icon={AlertTriangle} value={integer(material.high_risk_targets)} lower={lower} label="High-risk targets" detail="Targets whose highest path is high risk" tone="bg-violet-100 text-violet-700" onClick={() => router.push("/resource-risk")} />
          <Kpi icon={ShieldCheck} value={ready} label="Proposed changes" detail={ready === null ? "Candidate analysis unavailable" : held === null ? "Held count unavailable · execution disabled" : `${held} held on the reviewed page · execution disabled`} tone="bg-emerald-100 text-emerald-700" onClick={() => onNavigateToSection?.("least-privilege")} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8"><RiskTable risks={material.top_risks || []} /></div>
        <div className="lg:col-span-4"><CandidateList candidates={data.remediation.top_candidates || []} held={held} /></div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EvidencePanel evidence={data.evidence} />
        <OutcomePanel outcomes={data.outcomes} />
      </div>

      <button type="button" onClick={() => onNavigateToSection?.("attack-paths")} className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 hover:shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-900">Investigate the attacker story</div>
          <div className="mt-0.5 text-xs text-slate-500">Open Current Access, Lateral Movement and Exfiltration evidence for a selected path.</div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
      </button>
    </div>
  )
}
