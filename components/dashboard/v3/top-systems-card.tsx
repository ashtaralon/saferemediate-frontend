"use client"

import { useEffect, useState } from "react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, labelClass, scoreToneClass } from "./styles"

/**
 * Top systems by BRSS.
 *
 * Real source: /api/proxy/systems → /api/systems (real Neo4j data).
 * Sort by health_score ascending (lowest = highest risk = top of list).
 * Show top 5.
 *
 * What's NOT shown (Phase C):
 *   - Mix-bar showing per-system Permissions/Network/Data allocation.
 *     Requires fan-out to /api/service-risk-scores/{system}.layers per
 *     row — needs a new aggregating proxy.
 *   - Top driver per row.
 */

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
}

type SystemsResponse = {
  systems?: SystemRow[]
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

export function TopSystemsCard() {
  const [data, setData] = useState<SystemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/proxy/systems", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading && !data) return <LoadingCard label="Top systems by blast radius" />
  if (error) return <ErrorCard label="Top systems by blast radius" error={error} onRetry={load} />
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
      descriptor="Click a system to drill in (lowest score = highest risk)"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className={`${labelClass} pb-2`}>System</th>
            <th className={`${labelClass} pb-2`}>Env</th>
            <th className={`${labelClass} pb-2 text-right`}>Score</th>
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
                className="border-b border-slate-50 last:border-b-0"
              >
                <td className="py-2 font-medium text-slate-900">{rowName(s)}</td>
                <td className="py-2 text-slate-500">{s.environment ?? "—"}</td>
                <td className={`py-2 text-right font-semibold ${scoreToneClass(score)}`}>
                  {score.toFixed(0)}
                </td>
                <td className="py-2 text-right tabular-nums text-rose-700">
                  {rowCritical(s) || "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-amber-700">
                  {rowHigh(s) || "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className={`${descriptorClass} mt-3`}>
        Family mix bar (Permissions / Network / Data) requires per-system fan-out to
        /api/service-risk-scores; arrives in Phase C.
      </p>
    </Section>
  )
}
