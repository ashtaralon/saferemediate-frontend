"use client"

import { Crown, GitBranch, Layers3, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { derivePathsIntegrity, isCacheablePaths } from "@/lib/paths-integrity"
import { StaleIndicator } from "./card-shell"

/**
 * Executive summary — four metrics, not six.
 *
 * Home answers one question: where is our greatest material risk, and what can
 * we safely do next? Internet exposure is a QUALIFIER on reachable crown
 * jewels, and held actions are a qualifier on safe actions — neither is a peer
 * metric, so both sit beneath their parent instead of competing with it.
 *
 * HONESTY RULES, carried from lib/summary-integrity.ts:
 *
 *   * A metric with no data renders "—", never 0. `?? 0` on a null count is how
 *     this estate rendered "0 jewels · 0 paths · 0 internet-exposed" at 14:30
 *     today while the backend was returning 502s. The same view read
 *     33 jewels · 211 paths once it recovered. Nothing changed but the nulls.
 *   * A count derived from a TRUNCATED list is not that count. The remediation
 *     fetch is ?limit=50; counting the returned array and calling it the total
 *     silently under-reports past 50.
 *   * A cached value whose refresh failed loses its authority —
 *     failClosedOnError, per source, so one dead source cannot be laundered by
 *     three live ones.
 */

type SystemsResponse = {
  systems?: Array<{ name?: string; SystemName?: string }>
}

type PathsResponse = {
  total_jewels?: number | null
  total_paths?: number | null
  exposed_jewels?: number | null
  crown_jewels?: Array<{ system_name?: string }>
}

type RemediationsResponse = {
  summary?: {
    auto_applicable?: number | null
    blocked?: number | null
  }
}

/** A count is only a count when it is a finite number. */
function num(v: unknown): number | null {
  return Number.isFinite(v as number) ? (v as number) : null
}

type Metric = {
  label: string
  value: number | null
  /** The sub-fact beneath the number — a qualifier, not a peer metric. */
  sub: string
  icon: typeof Layers3
  tone: string
  unavailable: boolean
  onClick?: () => void
}

function MetricCell({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  // A cell may not print a number and disclaim it in the same breath. Caught
  // in the browser against the pre-provenance backend: the card rendered
  // "Reachable crown jewels 18" directly above "Not established — this is not
  // a zero." The reader believes the big number and never reads the caption,
  // so an unvouched value must be suppressed, not annotated.
  const shown = metric.unavailable ? null : metric.value
  const body = (
    <>
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${metric.tone}`}>
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div
        className={`mt-4 text-3xl font-semibold tracking-[-0.04em] tabular-nums ${
          shown === null ? "text-slate-300" : "text-slate-950"
        }`}
      >
        {shown ?? "—"}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{metric.label}</div>
      <div className="mt-0.5 text-xs leading-5 text-slate-500">
        {metric.unavailable ? "Not established — this is not a zero." : metric.sub}
      </div>
    </>
  )
  if (!metric.onClick) return <div className="min-w-0 px-4 py-4">{body}</div>
  return (
    <button
      type="button"
      onClick={metric.onClick}
      className="min-w-0 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
    >
      {body}
    </button>
  )
}

export function EstateRiskBrief({
  onNavigateToSection,
}: {
  onNavigateToSection?: (id: string) => void
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
    // A non-READY fan-out never enters localStorage, and an older build's
    // cached zero is evicted on read rather than re-rendered as current.
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

  // "Requiring attention" = has at least one crown jewel with a reachable path.
  // Derived from the jewels actually returned, so it is a real answer rather
  // than a total-systems count wearing a risk label.
  //
  // Gated on the fan-out having COMPLETED. The backend scans systems
  // concurrently against a bounded compute pool; a partial sweep returns the
  // jewels it found, and counting their distinct systems would report "2
  // systems requiring attention" for an estate where six were never examined.
  // Undercounting risk reads as reassurance, which is the failure this whole
  // card is built to avoid.
  const pathsIntegrity = derivePathsIntegrity(paths.data)
  const jewelSystems =
    paths.data?.crown_jewels && pathsIntegrity.state === "READY"
      ? new Set(paths.data.crown_jewels.map((j) => j.system_name).filter(Boolean)).size
      : null

  // ONLY the backend's own summary. Counting the candidates array would count
  // within ?limit=50 and present that as the total.
  const ready = num(remediations.data?.summary?.auto_applicable)
  const held = num(remediations.data?.summary?.blocked)

  const jewels = num(paths.data?.total_jewels)
  const exposed = num(paths.data?.exposed_jewels)
  const totalPaths = num(paths.data?.total_paths)

  // "Down" covers two distinct failures that must read identically to the
  // operator: the source never answered, and the source answered but had not
  // finished analysing. Both mean the number below is not a measurement.
  const pathsDown = !paths.data || pathsIntegrity.state !== "READY"
  const remDown = !remediations.data

  const metrics: Metric[] = [
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
      label: "Safe actions ready",
      value: ready,
      sub: held === null ? "Held count unavailable" : `${held} held by an evidence or safety gate`,
      icon: ShieldCheck,
      tone: "bg-emerald-100 text-emerald-700",
      unavailable: remDown,
      onClick: () => onNavigateToSection?.("least-privilege"),
    },
  ]

  const sources = [systems, paths, remediations]
  const errors = sources.filter((s) => s.error).length
  const isLoading = sources.some((s) => s.loading && !s.data)
  const staleSources = sources.filter((s) => s.isStale)
  const oldestCache = staleSources.reduce<number | null>((oldest, s) => {
    if (s.cachedAt === null) return oldest
    return oldest === null ? s.cachedAt : Math.min(oldest, s.cachedAt)
  }, null)

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Cyntro
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">
            Cloud Risk &amp; Remediation Overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Prioritized business-system exposure, attack paths, and evidence-backed actions.
          </p>
        </div>
        <div className="flex min-h-7 items-center gap-2 text-xs text-slate-500">
          <StaleIndicator cachedAt={oldestCache} isStale={staleSources.length > 0} />
          {errors > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
              {errors} source{errors === 1 ? "" : "s"} unavailable
            </span>
          ) : isLoading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              Loading
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
        </div>
      </div>

      <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {metrics.map((m) => (
          <MetricCell key={m.label} metric={m} />
        ))}
      </div>
    </section>
  )
}
