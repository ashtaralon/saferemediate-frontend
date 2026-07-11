"use client"

/**
 * BlastRadiusKpiStrip — headline KPI row + Killer-path for Zoom −1.
 * Light theme — matches Attack Paths shell (readable on white/card).
 */

import type { ReactNode } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"

interface BRVerdict {
  attack_paths: number
  reachable_crown_jewels: number
  source_workloads: number
  severity?: string | null
  allowed_vs_actual?: number | null
}
interface BRTopPath {
  id: string
  business_sentence?: string | null
  workload_name?: string | null
  cj_name?: string | null
  cj_type?: string | null
  hop_count?: number | null
  damage_types?: string[] | null
  impact_confidence?: string | null
}
interface BRCut {
  rank: number
  role_name?: string | null
  closes_paths?: number | null
}
export interface BlastRadiusPayload {
  verdict: BRVerdict
  top_paths: BRTopPath[]
  recommended_cuts: BRCut[]
  from_snapshot?: boolean
  snapshot_age_seconds?: number | null
}

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "text-red-700 dark:text-red-400",
  HIGH: "text-orange-700 dark:text-orange-400",
  MEDIUM: "text-amber-700 dark:text-amber-400",
  LOW: "text-emerald-700 dark:text-emerald-400",
}

function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-[7.5rem]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className={`text-2xl font-semibold tabular-nums leading-none ${tone ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  )
}

function fmtAge(sec?: number | null): string | null {
  if (sec == null) return null
  if (sec < 90) return `${Math.round(sec)}s`
  if (sec < 5400) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

export function BlastRadiusKpiStrip({ systemName }: { systemName: string }) {
  const url = systemName
    ? `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
    : null
  const { data, loading, error, isStale, retry } = useCachedFetch<BlastRadiusPayload>(url, {
    cacheKey: `blast-radius:${systemName}`,
  })

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        Loading blast radius…
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Couldn’t load blast radius.</span>
        <button
          type="button"
          onClick={retry}
          className="text-sm text-primary hover:underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!data) return null

  const v = data.verdict
  const topCut = data.recommended_cuts?.[0]
  const killer = data.top_paths?.[0]
  const ageLabel = data.from_snapshot ? fmtAge(data.snapshot_age_seconds) : null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-4">
        {v.severity ? (
          <Kpi
            label="Blast Radius"
            value={v.severity}
            tone={SEVERITY_TONE[v.severity?.toUpperCase?.()] ?? "text-foreground"}
          />
        ) : null}
        <Kpi
          label="Reachable Jewels"
          value={v.reachable_crown_jewels}
          tone="text-red-700 dark:text-red-400"
        />
        <Kpi
          label="Attack Paths"
          value={v.attack_paths}
          tone="text-red-700 dark:text-red-400"
        />
        {typeof v.allowed_vs_actual === "number" ? (
          <Kpi
            label="Allowed vs Actual"
            value={`${Math.round(v.allowed_vs_actual)}%`}
            tone="text-amber-800 dark:text-amber-400"
          />
        ) : null}
        <Kpi label="Source Workloads" value={v.source_workloads} />
        {topCut && typeof topCut.closes_paths === "number" ? (
          <Kpi
            label="Top Cut"
            value={`−${topCut.closes_paths} paths`}
            tone="text-emerald-700 dark:text-emerald-400"
          />
        ) : null}
        {(isStale || ageLabel) && (
          <div className="ml-auto self-center">
            <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {ageLabel ? `snapshot · ${ageLabel} old` : "stale"}
            </span>
          </div>
        )}
      </div>

      {killer && (killer.business_sentence || killer.cj_name) && (
        <div className="border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Killer path
            </span>
            <span className="text-foreground leading-snug">
              {killer.business_sentence ??
                `${killer.workload_name ?? "workload"} → ${killer.cj_name}${
                  killer.hop_count ? ` · ${killer.hop_count} hops` : ""
                }`}
            </span>
          </div>
          {killer.damage_types?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {killer.damage_types.map((d) => (
                <span
                  key={d}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/25"
                >
                  {d}
                </span>
              ))}
              {killer.impact_confidence ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground border border-border bg-background">
                  conf {killer.impact_confidence}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
