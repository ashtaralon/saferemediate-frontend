"use client"

import { ArrowRight, Crown, GitBranch, Layers3, ShieldCheck, ShieldX, Wifi } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { StaleIndicator } from "./card-shell"

type SystemsResponse = {
  systems?: Array<{ name?: string; SystemName?: string }>
}

type PathsResponse = {
  total_jewels?: number
  total_paths?: number
  exposed_jewels?: number
}

type RemediationsResponse = {
  summary?: {
    auto_applicable?: number
    blocked?: number
  }
  candidates?: Array<{ safety?: { can_auto_apply?: boolean } }>
}

type Metric = {
  label: string
  value: number | null
  note: string
  icon: typeof Layers3
  tone: string
  onClick?: () => void
}

function MetricCell({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${metric.tone}`}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        {metric.onClick && <ArrowRight className="h-3.5 w-3.5 text-slate-400" />}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">
        {metric.value ?? "—"}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{metric.label}</div>
      <div className="mt-0.5 text-xs leading-5 text-slate-500">{metric.note}</div>
    </>
  )

  if (!metric.onClick) return <div className="min-w-0 px-4 py-4">{body}</div>

  return (
    <button
      type="button"
      onClick={metric.onClick}
      className="min-w-0 px-4 py-4 text-left transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
    >
      {body}
    </button>
  )
}

export function EstateRiskBrief({ onNavigateToSection }: { onNavigateToSection?: (id: string) => void }) {
  const router = useRouter()
  const systems = useCachedFetch<SystemsResponse>("/api/proxy/systems/with-families", {
    cacheKey: "ciso-brief-systems",
    fetchInit: { cache: "no-store" },
  })
  const paths = useCachedFetch<PathsResponse>("/api/proxy/identity-attack-paths/all", {
    cacheKey: "ciso-brief-paths",
    maxStaleMs: 60 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })
  const remediations = useCachedFetch<RemediationsResponse>("/api/proxy/remediation-candidates?limit=50", {
    cacheKey: "ciso-brief-remediations",
    maxStaleMs: 60 * 60 * 1000,
    fetchInit: { cache: "no-store" },
  })

  const candidates = remediations.data?.candidates ?? []
  const ready = remediations.data?.summary?.auto_applicable ??
    (remediations.data ? candidates.filter((c) => c.safety?.can_auto_apply === true).length : null)
  const held = remediations.data?.summary?.blocked ??
    (remediations.data ? candidates.filter((c) => c.safety?.can_auto_apply === false).length : null)

  const metrics: Metric[] = [
    {
      label: "Business systems",
      value: systems.data ? (systems.data.systems ?? []).length : null,
      note: "Behaviorally discovered boundaries",
      icon: Layers3,
      tone: "bg-violet-100 text-violet-700",
      onClick: () => router.push("/business-systems"),
    },
    {
      label: "Crown jewels",
      value: paths.data?.total_jewels ?? null,
      note: "Critical assets with path context",
      icon: Crown,
      tone: "bg-amber-100 text-amber-700",
      onClick: () => onNavigateToSection?.("attack-paths"),
    },
    {
      label: "Viable paths",
      value: paths.data?.total_paths ?? null,
      note: "Materially distinct attacker routes",
      icon: GitBranch,
      tone: "bg-rose-100 text-rose-700",
      onClick: () => onNavigateToSection?.("attack-paths"),
    },
    {
      label: "Internet exposed",
      value: paths.data?.exposed_jewels ?? null,
      note: "Crown jewels reachable from an external entry",
      icon: Wifi,
      tone: "bg-orange-100 text-orange-700",
      onClick: () => onNavigateToSection?.("attack-paths"),
    },
    {
      label: "Safe changes",
      value: ready,
      note: "Evidence supports progressing now",
      icon: ShieldCheck,
      tone: "bg-emerald-100 text-emerald-700",
      onClick: () => onNavigateToSection?.("least-privilege"),
    },
    {
      label: "Held for safety",
      value: held,
      note: "Blocked by evidence or a safety gate",
      icon: ShieldX,
      tone: "bg-slate-200 text-slate-700",
      onClick: () => onNavigateToSection?.("least-privilege"),
    },
  ]

  const errors = [systems.error, paths.error, remediations.error].filter(Boolean)
  const isLoading = [systems, paths, remediations].some((result) => result.loading && !result.data)
  const staleSources = [systems, paths, remediations].filter((result) => result.isStale)
  const oldestCache = staleSources.reduce<number | null>((oldest, result) => {
    if (result.cachedAt === null) return oldest
    return oldest === null ? result.cachedAt : Math.min(oldest, result.cachedAt)
  }, null)

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-violet-50/60 shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Cyntro · Cloud risk command center
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
            What can an attacker reach—and what can Cyntro safely remove?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Business systems, crown jewels, attacker movement, damage potential, and evidence-backed changes in one decision view.
          </p>
        </div>
        <div className="flex min-h-7 items-center gap-2 text-xs text-slate-500">
          <StaleIndicator cachedAt={oldestCache} isStale={staleSources.length > 0} />
          {errors.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
              {errors.length} source{errors.length === 1 ? "" : "s"} unavailable
            </span>
          ) : isLoading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              Loading live estate view
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live estate view
            </span>
          )}
        </div>
      </div>

      <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
        {metrics.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
      </div>
    </section>
  )
}
