"use client"

import { useRetryFetch } from "@/lib/use-retry-fetch"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, labelClass, scorePillClass } from "./styles"

/**
 * Top systems by BRSS — with mix bar.
 *
 * Real source: /api/proxy/systems/with-families. Fans out to
 * /api/service-risk-scores/{system}.layers per system server-side.
 * Mix bar per row shows the per-system family allocation
 * (privilege/network/data) — each segment width = layer.resource_count
 * relative to the system's tracked resources.
 *
 * Honest empty mix when a system has no layer data — render the
 * mix-bar slot empty rather than inventing proportions.
 */

type Layer = { name: string; score: number; resource_count: number }
type LayerMap = Record<string, Layer>

type SystemRow = {
  name?: string
  displayName?: string
  SystemName?: string
  health_score?: number
  healthScore?: number
  resourceCount?: number
  criticality?: string
  environment?: string
  region?: string
  critical_count?: number
  criticalIssues?: number
  high_count?: number
  highIssues?: number
  layers?: LayerMap | null
}

type SystemsResponse = {
  systems?: SystemRow[]
  errors?: string[]
  error?: string
}

function rowName(s: SystemRow): string {
  return s.displayName || s.name || s.SystemName || "(unnamed)"
}

function rowScore(s: SystemRow): number | null {
  if (typeof s.health_score === "number") return s.health_score
  if (typeof s.healthScore === "number") return s.healthScore
  return null
}

function rowCritical(s: SystemRow): number {
  return s.critical_count ?? s.criticalIssues ?? 0
}

function rowHigh(s: SystemRow): number {
  return s.high_count ?? s.highIssues ?? 0
}

const FAMILY_COLOR: Record<string, string> = {
  privilege: "#8b5cf6", // violet (Permissions)
  network: "#3b82f6", // blue
  data: "#14b8a6", // teal
}

function MixBar({ layers }: { layers: LayerMap | null | undefined }) {
  if (!layers) {
    return (
      <div className="flex h-2 w-full items-center text-[10px] text-slate-400">
        <span>no family data</span>
      </div>
    )
  }
  const entries = (["privilege", "network", "data"] as const)
    .map((key) => ({
      key,
      layer: layers[key],
    }))
    .filter((e) => e.layer && e.layer.resource_count > 0)

  const total = entries.reduce((sum, e) => sum + e.layer!.resource_count, 0)
  if (total === 0) {
    return (
      <div className="flex h-2 w-full items-center text-[10px] text-slate-400">
        <span>no family data</span>
      </div>
    )
  }

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      {entries.map((e) => (
        <div
          key={e.key}
          title={`${e.key}: ${e.layer!.resource_count} resources, score ${e.layer!.score.toFixed(0)}`}
          className="h-2"
          style={{
            width: `${(e.layer!.resource_count / total) * 100}%`,
            backgroundColor: FAMILY_COLOR[e.key],
          }}
        />
      ))}
    </div>
  )
}

export function TopSystemsCard() {
  const { data, loading, error, attempt, retrying, retry } = useRetryFetch<SystemsResponse>(
    "/api/proxy/systems/with-families",
    { fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Top systems by blast radius" attempt={attempt} retrying={retrying} />
  if (error) return <ErrorCard label="Top systems by blast radius" error={error} onRetry={retry} />
  if (!data) return null

  const systems = (data.systems ?? [])
    .filter((s) => typeof rowScore(s) === "number")
    .sort((a, b) => (rowScore(a)! - rowScore(b)!))
    .slice(0, 5)

  if (systems.length === 0) {
    return (
      <Section label="Top systems by blast radius">
        <div className={descriptorClass}>No systems with computed scores yet.</div>
      </Section>
    )
  }

  return (
    <Section
      label="Top 5 systems by blast radius"
      descriptor="Lowest score = highest risk · mix bar shows per-system family allocation"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className={`${labelClass} pb-2`}>System</th>
            <th className={`${labelClass} pb-2`}>Env</th>
            <th className={`${labelClass} pb-2 text-right`}>Score</th>
            <th className={`${labelClass} w-[140px] pb-2`}>Mix</th>
            <th className={`${labelClass} pb-2 text-right`}>Critical</th>
            <th className={`${labelClass} pb-2 text-right`}>High</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((s, i) => {
            const score = rowScore(s)!
            return (
              <tr
                key={`${rowName(s)}-${i}`}
                className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="py-2.5 font-medium text-slate-900">{rowName(s)}</td>
                <td className="py-2.5 text-slate-500">{s.environment ?? "—"}</td>
                <td className="py-2.5 text-right">
                  <span className={`font-semibold tabular-nums ${scorePillClass(score)}`}>
                    {score.toFixed(0)}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <MixBar layers={s.layers} />
                </td>
                <td className="py-2.5 text-right tabular-nums text-rose-700">
                  {rowCritical(s) || "—"}
                </td>
                <td className="py-2.5 text-right tabular-nums text-amber-700">
                  {rowHigh(s) || "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
          Permissions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
          Network
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-teal-500" />
          Data
        </span>
        <span className="ml-auto">Mix proportional to per-family resource_count</span>
      </div>
    </Section>
  )
}
