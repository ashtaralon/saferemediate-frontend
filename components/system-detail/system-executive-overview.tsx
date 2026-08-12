"use client"

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  Database,
  GitBranch,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react"
import {
  RECOVERY_POLL_MS,
  STALE_BACKEND_RECOVERING,
  useCachedFetch,
} from "@/lib/use-cached-fetch"
import {
  isCacheableSystemExecutiveSnapshot,
  type ResourceRiskFinding,
  type SystemExecutiveSnapshot,
  type SystemPath,
} from "@/lib/system-executive-snapshot"

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function severityTone(value?: string | null): string {
  const severity = String(value || "").toUpperCase()
  if (severity === "CRITICAL") return "bg-rose-100 text-rose-700"
  if (severity === "HIGH") return "bg-orange-100 text-orange-700"
  if (severity === "MEDIUM") return "bg-amber-100 text-amber-700"
  return "bg-slate-100 text-slate-600"
}

export function shouldShowGlobalStateBanner(
  data: SystemExecutiveSnapshot,
  recovering: boolean,
): boolean {
  if (recovering) return true
  if (data.serve_state === "READY") return false

  const coreSectionsReady = [
    data.material_risk,
    data.resource_risk,
    data.evidence,
    data.outcomes,
    data.context,
  ].every((section) => section.serve_state === "READY")
  const remediationReviewOnly =
    data.serve_state === "PARTIAL" &&
    data.remediation.serve_state === "PARTIAL" &&
    (data.remediation.top_candidates?.length || 0) > 0

  return !(coreSectionsReady && remediationReviewOnly)
}

export function proposedChangeCount(
  remediation: SystemExecutiveSnapshot["remediation"],
): number | null {
  const returned = finite(remediation.returned_count)
  if (returned !== null) return returned
  const ready = finite(remediation.ready_on_page)
  const held = finite(remediation.held_on_page)
  return ready !== null && held !== null ? ready + held : null
}

export function resourceRiskNavigationTarget(): "least-privilege" {
  return "least-privilege"
}

function StateBanner({ data, recovering }: { data: SystemExecutiveSnapshot; recovering: boolean }) {
  if (!shouldShowGlobalStateBanner(data, recovering)) return null
  return (
    <div className={`rounded-xl border px-4 py-3 ${recovering ? "border-sky-200 bg-sky-50 text-sky-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {recovering
          ? "Backend recovering — showing the last verified system reading"
          : data.serve_state === "PARTIAL"
            ? "Partial system reading — unavailable figures are not zero"
            : "System risk reading is not ready"}
      </div>
      <p className="mt-1 text-xs opacity-80">
        Decisions remain fail-closed while the unavailable sections recover.
      </p>
    </div>
  )
}

function Metric({
  icon: Icon,
  value,
  label,
  detail,
  tone,
  onClick,
}: {
  icon: typeof Crown
  value: number | null
  label: string
  detail: string
  tone: string
  onClick?: () => void
}) {
  const content = (
    <>
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon className="h-[18px] w-[18px]" /></div>
      <div className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.05em] tabular-nums text-slate-950">
        {value === null ? "—" : value.toLocaleString()}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="min-w-0 px-5 py-5 text-left transition hover:bg-slate-50">{content}</button>
  ) : <div className="min-w-0 px-5 py-5">{content}</div>
}

function Gate({ label, state }: { label: string; state?: string | null }) {
  const pass = state === "PASS" || state === "REACHABLE"
  const blocked = state === "BLOCKED" || state === "FAIL"
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${pass ? "bg-emerald-50 text-emerald-700" : blocked ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
      {label}: {state || "unverified"}
    </span>
  )
}

function TopPaths({ paths, onOpen }: { paths: SystemPath[]; onOpen: () => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Top crown jewel paths</div>
          <p className="mt-1 text-sm text-slate-600">The highest-potential attacker routes in this system</p>
        </div>
        <button onClick={onOpen} className="flex items-center gap-1 text-xs font-semibold text-blue-700">Investigate <ArrowRight className="h-3.5 w-3.5" /></button>
      </header>
      {paths.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-600">No ranked paths are available in this reading. This is not an all-clear.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {paths.slice(0, 5).map((path, index) => (
            <div key={path.path_id || index} className="grid gap-3 px-5 py-4 lg:grid-cols-[30px_minmax(0,1.25fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="truncate">{path.source_name || "Unknown source"}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{path.crown_jewel_name || path.crown_jewel_id || "Unknown crown jewel"}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">{path.impact_headline || "Impact statement unavailable"}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Gate label="Network" state={path.route_gate} />
                <Gate label="Identity" state={path.identity_gate} />
                <Gate label="Data" state={path.data_plane_gate} />
              </div>
              <div className="flex items-center justify-end gap-2">
                {finite(path.score) !== null ? <span className="text-sm font-semibold tabular-nums text-slate-800">{finite(path.score)}</span> : null}
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${severityTone(path.severity)}`}>{path.severity || "unrated"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ResourceRisks({ findings, onOpen }: { findings: ResourceRiskFinding[]; onOpen: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Top resource risks</div>
          <p className="mt-1 text-sm text-slate-600">Graph-classified weaknesses that increase attacker options</p>
        </div>
        <Target className="h-5 w-5 text-rose-500" />
      </div>
      <div className="mt-4 space-y-2.5">
        {findings.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600">No ranked resource risks are available in this reading.</div>
        ) : findings.slice(0, 5).map((finding, index) => (
          <div key={`${finding.resource_arn}-${index}`} className="rounded-xl border border-slate-100 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{finding.resource_name || "Unnamed resource"}</div>
                <div className="mt-0.5 text-xs text-slate-500">{finding.category?.replaceAll("_", " ") || "Risk category unavailable"}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${severityTone(finding.severity)}`}>{finding.severity || "unrated"}</span>
            </div>
            {finding.attacker_narrative ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{finding.attacker_narrative}</p> : null}
          </div>
        ))}
      </div>
      <button onClick={onOpen} className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-700">Review resource risk <ArrowRight className="h-3.5 w-3.5" /></button>
    </section>
  )
}

export function SystemExecutiveOverview({
  systemName,
  onNavigate,
}: {
  systemName: string
  onNavigate: (tab: string) => void
}) {
  const snapshot = useCachedFetch<SystemExecutiveSnapshot>(
    `/api/proxy/dashboard/systems/${encodeURIComponent(systemName)}`,
    {
      cacheKey: `system-executive-v1:${systemName}`,
      maxStaleMs: 15 * 60 * 1000,
      transientRetries: 1,
      isCacheable: isCacheableSystemExecutiveSnapshot,
      failClosedOnError: true,
      autoRetryMs: RECOVERY_POLL_MS,
    },
  )

  if (snapshot.loading && !snapshot.data) {
    return <div className="mx-auto max-w-[1800px] px-8 py-8"><div className="h-64 animate-pulse rounded-3xl bg-slate-100" /></div>
  }
  if (!snapshot.data) {
    return (
      <div className="mx-auto max-w-[1800px] px-8 py-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5" /> System risk reading unavailable</div>
          <p className="mt-2 text-sm">No figures are shown because no verified system snapshot is available.</p>
          <button onClick={snapshot.retry} className="mt-4 flex items-center gap-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Retry</button>
        </div>
      </div>
    )
  }

  const data = snapshot.data
  const material = data.material_risk
  const risks = data.resource_risk
  const remediation = data.remediation
  const context = data.context
  const recovering = snapshot.staleReason === STALE_BACKEND_RECOVERING
  const paths = material.top_paths || []
  const candidates = remediation.top_candidates || []
  const families = Object.entries(context.resource_families || {})
  const changes = proposedChangeCount(remediation)
  const readyChanges = finite(remediation.ready_on_page)
  const heldChanges = finite(remediation.held_on_page)

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-8 py-6" data-testid="system-executive-overview">
      <StateBanner data={data} recovering={recovering} />

      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-7 py-7 text-white shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(139,92,246,0.3),transparent_36%),radial-gradient(circle_at_10%_90%,rgba(14,165,233,0.18),transparent_32%)]" />
        <div className="relative max-w-4xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200"><Sparkles className="h-3.5 w-3.5" /> {systemName} risk brief</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{data.narrative.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{data.narrative.body}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>Last verified {new Date(data.computed_at).toLocaleString()}</span>
            {context.criticality ? <span>· {context.criticality}</span> : null}
            {context.environment ? <span>· {context.environment}</span> : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
        <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <Metric icon={GitBranch} value={finite(material.attack_paths)} label="Attack paths" detail="Verified routes in this system" tone="bg-rose-100 text-rose-700" onClick={() => onNavigate("attack-paths")} />
          <Metric icon={Crown} value={finite(material.crown_jewels)} label="Crown jewels reached" detail={`${finite(material.externally_exposed_jewels) ?? "—"} externally exposed`} tone="bg-amber-100 text-amber-700" onClick={() => onNavigate("crown-jewels")} />
          <Metric icon={AlertTriangle} value={finite(risks.total)} label="Resource risks" detail="Classified weaknesses requiring review" tone="bg-violet-100 text-violet-700" onClick={() => onNavigate(resourceRiskNavigationTarget())} />
          <Metric icon={ShieldCheck} value={changes} label="Proposed changes" detail={`${readyChanges ?? "—"} ready · ${heldChanges ?? "—"} held for safety review`} tone="bg-emerald-100 text-emerald-700" onClick={() => onNavigate("least-privilege")} />
        </div>
      </section>

      <TopPaths paths={paths} onOpen={() => onNavigate("attack-paths")} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <ResourceRisks findings={risks.top_findings || []} onOpen={() => onNavigate(resourceRiskNavigationTarget())} />
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Recommended changes</div><p className="mt-1 text-sm text-slate-600">Prioritized actions; execution remains gated</p></div>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          {remediation.serve_state === "PARTIAL" && candidates.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
              Safety readiness is still being verified. These actions are visible for review but cannot execute.
            </div>
          ) : null}
          <div className="mt-4 space-y-2.5">
            {candidates.length === 0 ? <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600">No candidate rows are available in this reading.</div> : candidates.slice(0, 5).map((candidate, index) => (
              <div key={`${candidate.resource_id}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-3">
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{candidate.resource_id || "Unnamed resource"}</div><div className="text-xs text-slate-500">{candidate.resource_type || "Resource"}{typeof candidate.unused_count === "number" ? ` · ${candidate.unused_count} unused permissions` : candidate.remediation_id ? ` · ${candidate.remediation_id.replaceAll("_", " ").toLowerCase()}` : " · review required"}</div></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${candidate.can_auto_apply ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{candidate.can_auto_apply ? "ready" : "held"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><Database className="h-5 w-5 text-sky-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Evidence readiness</div><div className="mt-2 text-2xl font-semibold text-slate-950">{finite(data.evidence.healthy) ?? "—"} healthy</div><p className="mt-1 text-xs text-slate-500">{finite(data.evidence.degraded) ?? "—"} degraded · {finite(data.evidence.missing) ?? "—"} missing</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">Verified outcomes · 30 days</div><div className="mt-2 text-2xl font-semibold text-slate-950">{finite(data.outcomes.permissions_removed) ?? "—"}</div><p className="mt-1 text-xs text-slate-500">permissions removed · {finite(data.outcomes.events_count) ?? "—"} recorded changes</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><Server className="h-5 w-5 text-violet-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-400">System footprint</div><div className="mt-2 text-2xl font-semibold text-slate-950">{finite(context.resource_count) ?? "—"}</div><p className="mt-1 text-xs text-slate-500">tracked resources</p><div className="mt-3 flex flex-wrap gap-1.5">{families.map(([name, count]) => <span key={name} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{name} {count}</span>)}</div></section>
      </div>
    </div>
  )
}
