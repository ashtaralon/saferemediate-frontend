"use client"

import { useEffect, useMemo } from "react"
import { Crown, GitBranch, Layers3, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"
import { AttackPathsCard } from "./attack-paths-card"
import { ExecutiveViewContext, StaleIndicator } from "./card-shell"
import { DivergenceBanner } from "./divergence-banner"
import { EvidenceHealthCardV3 } from "./evidence-health-card"
import { NarrowingSummaryCard } from "./narrowing-summary-card"
import { SafeRemediationsQueueCard } from "./safe-remediations-queue-card"
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

type SystemsResponse = { systems?: Array<{ name?: string; SystemName?: string }> }
type PathsResponse = {
  total_jewels?: number | null
  total_paths?: number | null
  exposed_jewels?: number | null
  crown_jewels?: Array<{ system_name?: string }>
}
type RemediationsResponse = {
  summary?: { auto_applicable?: number | null; blocked?: number | null }
}

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

function DataStatusBanner({ sources }: { sources: SourceReadiness[] }) {
  const bad = sources.filter((s) => s.state !== "READY")
  if (bad.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="text-sm font-semibold text-amber-900">
        Partial data — {bad.length} of {sources.length} feeds are not current
      </div>
      <ul className="mt-1 space-y-0.5 text-xs leading-5 text-amber-800">
        {bad.map((s) => (
          <li key={s.label}>
            · {s.label}: {s.state.toLowerCase()}
            {s.detail ? ` — ${s.detail}` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-amber-800">
        Figures below cover only what was read. Absent values render as
        &ldquo;—&rdquo;, never as zero.
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
  })
  const paths = useCachedFetch<PathsResponse>("/api/proxy/identity-attack-paths/all", {
    cacheKey: "ciso-brief-paths",
    maxStaleMs: 60 * 60 * 1000,
    fetchInit: { cache: "no-store" },
    transientRetries: 2,
    failClosedOnError: true,
    isCacheable: isCacheablePaths,
  })
  const remediations = useCachedFetch<RemediationsResponse>(
    "/api/proxy/remediation-candidates?limit=50",
    {
      cacheKey: "ciso-brief-remediations",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
      transientRetries: 2,
      failClosedOnError: true,
    },
  )

  const pathsIntegrity = derivePathsIntegrity(paths.data)
  const pathsDown = !paths.data || pathsIntegrity.state !== "READY"
  const remDown = !remediations.data

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
      state: systems.data ? "READY" : "UNAVAILABLE",
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
      state: remediations.data ? "READY" : "UNAVAILABLE",
      cachedAt: remediations.cachedAt,
    },
  ], [systems.data, systems.cachedAt, paths.data, paths.cachedAt,
      remediations.data, remediations.cachedAt, pathsIntegrity.state,
      pathsIntegrity.reason])

  const scope = systems.data
    ? `${(systems.data.systems ?? []).length} discovered business systems`
    : "scope unavailable"

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
      sub: systems.data
        ? `of ${(systems.data.systems ?? []).length} discovered business systems`
        : "Behaviorally discovered boundaries",
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
        <DataStatusBanner sources={sources} />
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
            <SafeRemediationsQueueCard limit={3} />
            <EvidenceHealthCardV3 />
          </div>
        </div>

        {/* Highest-impact path beside verified outcomes. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <AttackPathsCard onNavigateToSection={onNavigateToSection} limit={1} />
          </div>
          <div className="lg:col-span-4">
            <NarrowingSummaryCard />
          </div>
        </div>
      </div>
    </ExecutiveViewContext.Provider>
  )
}
