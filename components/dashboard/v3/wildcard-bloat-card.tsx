"use client"

import { useEffect, useState } from "react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, heroNumberClass, scoreToneClass, unitClass } from "./styles"

/**
 * Wildcard Bloat — point-in-time only.
 *
 * Replaces the original "AUTO Surface this month" mockup card. AUTO
 * Surface % has no backend tracker; renaming wouldn't make data exist.
 *
 * What the metric IS (honest):
 *   averageBloatPercentage = unused_actions / total_allowed across the
 *   roles we've analyzed. It's the "how wide is your wildcard surface"
 *   number — *right now*, not a delta.
 *
 * What it ISN'T:
 *   - Not "narrowed this week" — there's no narrowing-history endpoint
 *   - Not a delta of any kind — single point-in-time observation
 *
 * Honest framing in the descriptor.
 */

type LpMetrics = {
  totalRoles: number
  analyzedRoles: number
  rolesWithBloat: number
  averageBloatPercentage: number
  totalUnusedPermissions: number
  lastAnalysisDate: string
}

export function WildcardBloatCard() {
  const [data, setData] = useState<LpMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/proxy/least-privilege/metrics", {
        cache: "no-store",
      })
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

  if (loading && !data) return <LoadingCard label="Wildcard bloat" />
  if (error) return <ErrorCard label="Wildcard bloat" error={error} onRetry={load} />
  if (!data) return null

  const pct = Math.round(data.averageBloatPercentage)
  // For bloat, lower is better. Invert score for color tone.
  const toneScore = 100 - pct

  return (
    <Section
      label="Wildcard bloat"
      descriptor="Allowed actions sitting unused — point-in-time, not a delta"
    >
      <div className="flex items-baseline gap-3">
        <span className={`${heroNumberClass} ${scoreToneClass(toneScore)}`}>
          {pct}
        </span>
        <span className={unitClass}>%</span>
      </div>

      <div className={`${descriptorClass} mt-3 space-y-1`}>
        <div>
          <span className="font-semibold text-slate-700">
            {data.totalUnusedPermissions.toLocaleString()}
          </span>{" "}
          unused permissions across{" "}
          <span className="font-semibold text-slate-700">
            {data.rolesWithBloat}
          </span>{" "}
          / {data.analyzedRoles} roles
        </div>
        <div className="text-slate-500">
          Week-over-week delta requires backend narrowing-history endpoint (not yet implemented).
        </div>
      </div>
    </Section>
  )
}
