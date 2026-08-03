"use client"

import { useEffect, useMemo } from "react"
import { Crown, GitBranch, Layers3, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  RECOVERY_POLL_MS,
  STALE_BACKEND_RECOVERING,
  useCachedFetch,
} from "@/lib/use-cached-fetch"
import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"
import { deriveCandidatesIntegrity, isCacheableCandidates } from "@/lib/candidates-integrity"
import { deriveEvidenceIntegrity, isCacheableEvidence } from "@/lib/evidence-integrity"
import { deriveSystemsIntegrity, isCacheableSystems } from "@/lib/systems-integrity"
import { AttackPathsCard, type PathsResponse } from "./attack-paths-card"
import { ExecutiveViewContext, StaleIndicator } from "./card-shell"
import { DivergenceBanner } from "./divergence-banner"
import { EvidenceHealthCardV3 } from "./evidence-health-card"
import { NarrowingSummaryCard } from "./narrowing-summary-card"
import {
  CANDIDATES_REQUEST_LIMIT,
  SafeRemediationsQueueCard,
  type CandidatesResponse,
} from "./safe-remediations-queue-card"
import { TopSystemsCard } from "./top-systems-card"
import type { ReportReadiness, SourceReadiness } from "./management-report-drawer"

/**
 * Executive cockpit — a parallel bento, not a vertical stack.
 *
 * The stacked layout gave every dataset equal weight and made a long
 * predictable scroll. This composes related views side by side so the page
 * has hierarchy: largest is material business risk, second is the decisions
 * to make, smaller is evidence confidence and progress, and technical
 * investigation lives in Operations.
 *
 * This is NOT pure layout. A prettier arrangement of broken cards is not an
 * improvement, and on 2026-08-02 this page served two simultaneous 502s. So
 * the cockpit also owns a presentation contract:
 *
 *   - ONE page-level data-status banner; per-card transport detail is
 *     suppressed via ExecutiveViewContext.
 *   - ONE refresh action, not a retry button per card.
 *   - Fixed row limits — five systems, three decisions, one path narrative.
 *   - Page-qualified counts are labelled as such, never as fleet totals.
 *
 * What it deliberately does NOT do is compose a cross-source narrative
 * sentence. Each feed is read independently and can be READY from a
 * different graph generation at a different time, so a combined claim can
 * be false while every input is individually honest. That needs the
 * governed snapshot first.
 */

type SystemsResponse = {
  systems?: Array<{ name?: string; SystemName?: string }>
  /** Preserved by the proxy for fan-out calls that failed. Omitting it
   *  here is what let a partial estate read as complete. */
  errors?: string[]
  error?: string
}
// PathsResponse / CandidatesResponse are imported from the cards that own
// them. Declaring a second local shape per endpoint is how two readings of
// one payload drift apart.

function num(v: unknown): number | null {
  return Number.isFinite(v as number) ? (v as number) : null
}

type Kpi = {
  label: string
  value: number | null
  sub: string
  icon: typeof Layers3
  tone: string
  unavailable: boolean
  onClick?: () => void
}

function KpiCell({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon
  // A cell may not print a number and disclaim it in the same breath.
  const shown = kpi.unavailable ? null : kpi.value
  const body = (
    <>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${kpi.tone}`}>
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div
        className={`mt-3 text-3xl font-semibold tracking-[-0.04em] tabular-nums ${
          shown === null ? "text-slate-300" : "text-slate-950"
        }`}
      >
        {shown ?? "—"}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{kpi.label}</div>
      <div className="mt-0.5 text-xs leading-5 text-slate-500">
        {kpi.unavailable ? "Not established — this is not a zero." : kpi.sub}
      </div>
    </>
  )
  if (!kpi.onClick) return <div className="min-w-0 px-4 py-4">{body}</div>
  return (
    <button
      type="button"
      onClick={kpi.onClick}
      className="min-w-0 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
    >
      {body}
    </button>
  )
}

function DataStatusBanner({
  sources,
  recovering,
}: {
  sources: SourceReadiness[]
  /** Any feed is re-presenting its last verified reading because the backend
   *  is unreachable (deploy restart, cold start, 5xx). Distinct from a feed
   *  that genuinely has nothing. */
  recovering?: boolean
}) {
  const bad = sources.filter((s) => s.state !== "READY")
  // The primary recovery scenario is EVERY feed holding a cached READY while
  // the backend 504s. `bad` is then empty, so an early return on that alone
  // silently showed old numbers with no warning at all — strictly worse than
  // the blank page it replaced, because it looks current. Only bail when
  // there is nothing to report on EITHER axis.
  if (bad.length === 0 && !recovering) return null

  // "Recovering" and "unavailable" are different facts and reading them as
  // the same one is what made the 2026-08-03 deploy window look like data
  // loss. Recovering means: we have a verified reading, the backend is
  // briefly unreachable, a retry is already in flight, and this heals itself.
  // They can also be true AT ONCE — one feed 504ing while another is
  // semantically PARTIAL — so the recovering line never replaces the
  // per-feed list, it precedes it.
  return (
    <div
      className={
        recovering
          ? "rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3"
          : "rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3"
      }
    >
      <div
        className={
          recovering
            ? "text-sm font-semibold text-sky-900"
            : "text-sm font-semibold text-amber-900"
        }
      >
        {recovering
          ? "Backend recovering — showing the last verified reading"
          : `Partial data — ${bad.length} of ${sources.length} feeds are not current`}
      </div>
      {/* A recovering feed must not hide a simultaneous semantic PARTIAL:
          different causes, different remedies. Both get said. */}
      {recovering && bad.length > 0 ? (
        <div className="mt-1 text-xs font-medium text-sky-900">
          Separately, {bad.length} of {sources.length} feed
          {bad.length === 1 ? "" : "s"} {bad.length === 1 ? "is" : "are"} not
          current for its own reason:
        </div>
      ) : null}
      <ul
        className={
          recovering
            ? "mt-1 space-y-0.5 text-xs leading-5 text-sky-800"
            : "mt-1 space-y-0.5 text-xs leading-5 text-amber-800"
        }
      >
        {bad.map((s) => (
          <li key={s.label}>
            · {s.label}: {s.state.toLowerCase()}
            {s.detail ? ` — ${s.detail}` : ""}
          </li>
        ))}
      </ul>
      <p
        className={
          recovering
            ? "mt-1.5 text-xs text-sky-800"
            : "mt-1.5 text-xs text-amber-800"
        }
      >
        {recovering
          ? "Retrying automatically. Values shown were verified earlier — they are not live. Actions stay disabled until the reading is current."
          : "Figures below cover only what was read. Absent values render as “—”, never as zero."}
      </p>
    </div>
  )
}

export function ExecutiveCockpit({
  onNavigateToSection,
  onReadiness,
}: {
  onNavigateToSection?: (id: string) => void
  /** Lifts source readiness to the shell so the report drawer describes the
   *  SAME reading that is on screen, rather than fetching its own copies. */
  onReadiness?: (r: ReportReadiness) => void
}) {
  const router = useRouter()

  const systems = useCachedFetch<SystemsResponse>("/api/proxy/systems/with-families", {
    cacheKey: "ciso-brief-systems",
    fetchInit: { cache: "no-store" },
    transientRetries: 2,
    failClosedOnError: true,
    autoRetryMs: RECOVERY_POLL_MS,
    isCacheable: isCacheableSystems,
  })
  const paths = useCachedFetch<PathsResponse>("/api/proxy/identity-attack-paths/all", {
    cacheKey: "ciso-brief-paths",
    maxStaleMs: 60 * 60 * 1000,
    fetchInit: { cache: "no-store" },
    transientRetries: 2,
    failClosedOnError: true,
    autoRetryMs: RECOVERY_POLL_MS,
    isCacheable: isCacheablePaths,
  })
  const remediations = useCachedFetch<CandidatesResponse>(
    `/api/proxy/remediation-candidates?limit=${CANDIDATES_REQUEST_LIMIT}`,
    {
      cacheKey: "ciso-brief-remediations",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      transientRetries: 2,
      failClosedOnError: true,
    autoRetryMs: RECOVERY_POLL_MS,
      isCacheable: isCacheableCandidates,
    },
  )

  // Every panel the cockpit RENDERS is read here, so the management report
  // can vouch for all of them. Tracking only three while rendering five let
  // the drawer say "3 of 3 feeds ready" with a panel unavailable on screen.
  const evidence = useCachedFetch<any>("/api/proxy/evidence/coverage", {
    cacheKey: "evidence-coverage",
    fetchInit: { cache: "no-store" },
    transientRetries: 2,
    failClosedOnError: true,
    autoRetryMs: RECOVERY_POLL_MS,
    isCacheable: isCacheableEvidence,
  })
  const outcomes = useCachedFetch<any>(
    "/api/proxy/remediation-history/narrowing-summary?days=7",
    {
      cacheKey: "narrowing-summary-7d",
      fetchInit: { cache: "no-store" },
      transientRetries: 2,
      failClosedOnError: true,
    autoRetryMs: RECOVERY_POLL_MS,
    },
  )

  const pathsIntegrity = derivePathsIntegrity(paths.data)
  const remIntegrity = deriveCandidatesIntegrity(remediations.data)
  // True when ANY feed is re-presenting a verified reading because the backend
  // is unreachable. Drives the banner's recovering vs unavailable wording —
  // and only that. It must never re-enable an action: staleness still gates
  // mutations exactly as before.
  const backendRecovering = [systems, paths, remediations, evidence, outcomes].some(
    (f) => f.staleReason === STALE_BACKEND_RECOVERING,
  )

  const evidenceIntegrity = deriveEvidenceIntegrity(evidence.data)
  const systemsIntegrity = deriveSystemsIntegrity(systems.data)
  const pathsDown = !paths.data || pathsIntegrity.state !== "READY"
  const remDown = remIntegrity.state !== "READY"

  const jewelSystems =
    paths.data?.crown_jewels && pathsIntegrity.state === "READY"
      ? new Set(paths.data.crown_jewels.map((j) => j.system_name).filter(Boolean)).size
      : null

  const ready = num(remediations.data?.summary?.auto_applicable)
  const held = num(remediations.data?.summary?.blocked)
  const jewels = num(paths.data?.total_jewels)
  const exposed = num(paths.data?.exposed_jewels)
  const totalPaths = num(paths.data?.total_paths)

  const sources: SourceReadiness[] = useMemo(() => [
    {
      label: "Business systems",
      state: systemsIntegrity.state,
      detail: systemsIntegrity.reason,
      cachedAt: systems.cachedAt,
    },
    {
      label: "Attack paths",
      state: !paths.data
        ? "UNAVAILABLE"
        : pathsIntegrity.state === "READY"
          ? "READY"
          : pathsIntegrity.state === "PARTIAL"
            ? "PARTIAL"
            : "UNAVAILABLE",
      detail: pathsIntegrity.state === "READY" ? null : pathsIntegrity.reason,
      cachedAt: paths.cachedAt,
    },
    {
      label: "Proposed changes",
      state: remIntegrity.state,
      detail: remIntegrity.reason,
      cachedAt: remediations.cachedAt,
    },
    {
      // errors[] means accounts we could not read. Their evidence is absent
      // from every downstream number, so coverage is PARTIAL, not complete —
      // the report said "5 of 5 ready" while the card said a fetch failed.
      label: "Evidence health",
      state: evidenceIntegrity.state,
      detail: evidenceIntegrity.reason,
      cachedAt: evidence.cachedAt,
    },
    {
      label: "Verified outcomes",
      state: outcomes.data ? "READY" : "UNAVAILABLE",
      cachedAt: outcomes.cachedAt,
    },
  ], [systems.data, systems.cachedAt, systemsIntegrity.state,
      systemsIntegrity.reason, paths.data, paths.cachedAt,
      remediations.data, remediations.cachedAt, pathsIntegrity.state,
      pathsIntegrity.reason, remIntegrity.state, remIntegrity.reason,
      evidence.data, evidence.cachedAt, evidenceIntegrity.state,
      evidenceIntegrity.reason, outcomes.data, outcomes.cachedAt])

  const scope = !systems.data
    ? "scope unavailable"
    : systemsIntegrity.countIsPartial
      ? `at least ${(systems.data.systems ?? []).length} discovered business systems (partial)`
      : `${(systems.data.systems ?? []).length} discovered business systems`

  // The report drawer must describe THIS reading, not fetch its own copies —
  // a drawer with independent fetches would report a different reading of the
  // estate than the one on screen. Lifted in an effect: calling the parent's
  // setter during render re-renders the parent mid-render and loops.
  useEffect(() => {
    onReadiness?.({ scope, sources, generation: null })
  }, [onReadiness, scope, sources])

  const kpis: Kpi[] = [
    {
      label: "Systems requiring attention",
      value: jewelSystems,
      sub: !systems.data
        ? "Behaviorally discovered boundaries"
        : systemsIntegrity.countIsPartial
          ? `of at least ${(systems.data.systems ?? []).length} discovered — ${systemsIntegrity.reason}`
          : `of ${(systems.data.systems ?? []).length} discovered business systems`,
      icon: Layers3,
      tone: "bg-violet-100 text-violet-700",
      unavailable: pathsDown,
      onClick: () => router.push("/business-systems"),
    },
    {
      label: "Reachable crown jewels",
      value: jewels,
      sub:
        exposed === null
          ? "Internet exposure unknown"
          : `${exposed} reachable from an external entry point`,
      icon: Crown,
      tone: "bg-amber-100 text-amber-700",
      unavailable: pathsDown,
      onClick: () => onNavigateToSection?.("attack-paths"),
    },
    {
      label: "Viable attack paths",
      value: totalPaths,
      sub: "Materially distinct attacker routes",
      icon: GitBranch,
      tone: "bg-rose-100 text-rose-700",
      unavailable: pathsDown,
      onClick: () => onNavigateToSection?.("attack-paths"),
    },
    {
      label: "Proposed changes",
      value: ready,
      sub:
        held === null
          ? "Held count unavailable"
          : `${held} held by an evidence or safety gate · execution disabled`,
      icon: ShieldCheck,
      tone: "bg-emerald-100 text-emerald-700",
      unavailable: remDown,
      onClick: () => onNavigateToSection?.("least-privilege"),
    },
  ]

  const staleSources = [systems, paths, remediations].filter((s) => s.isStale)
  const oldestCache = staleSources.reduce<number | null>((oldest, s) => {
    if (s.cachedAt === null) return oldest
    return oldest === null ? s.cachedAt : Math.min(oldest, s.cachedAt)
  }, null)

  return (
    <ExecutiveViewContext.Provider value={true}>
      <div className="flex flex-col gap-5">
        <DataStatusBanner sources={sources} recovering={backendRecovering} />
        <DivergenceBanner />

        {/* KPI row — four across, one row. */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Material risk
            </span>
            <StaleIndicator cachedAt={oldestCache} isStale={staleSources.length > 0} />
          </div>
          <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {kpis.map((k) => (
              <KpiCell key={k.label} kpi={k} />
            ))}
          </div>
        </section>

        {/* Bento: services table two-thirds, decisions + trust stacked beside. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <TopSystemsCard limit={5} shared={systems} />
          </div>
          <div className="flex flex-col gap-5 lg:col-span-4">
            <SafeRemediationsQueueCard limit={3} shared={remediations} />
            <EvidenceHealthCardV3 shared={evidence} />
          </div>
        </div>

        {/* Highest-impact path beside verified outcomes. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <AttackPathsCard onNavigateToSection={onNavigateToSection} limit={1} shared={paths} />
          </div>
          <div className="lg:col-span-4">
            <NarrowingSummaryCard shared={outcomes} />
          </div>
        </div>
      </div>
    </ExecutiveViewContext.Provider>
  )
}
