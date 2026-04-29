"use client"

import { useEffect, useState } from "react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, numberClass, scoreToneClass, unitClass } from "./styles"

/**
 * Family breakdown strip — Permissions / Network / Data.
 *
 * Real source: /api/proxy/family-aggregate (fans out service-risk-scores
 * across systems server-side, returns resource-weighted per-layer
 * average).
 *
 * Layer-name mapping (from backend service-risk-scores):
 *   privilege  → Permissions
 *   network    → Network
 *   data       → Data
 *
 * Other layers (compute, etc.) collapse into "Other" if present.
 *
 * Honest: shows contributing-systems count per family so the operator
 * can see how broad the average is.
 */

type FamilyData = {
  families: Record<string, { score: number; weight: number; contributing_systems: number }>
  contributing_systems: number
  total_systems: number
  errors?: string[]
}

const DISPLAY: Array<{ key: string; label: string }> = [
  { key: "privilege", label: "Permissions" },
  { key: "network", label: "Network" },
  { key: "data", label: "Data" },
]

export function FamilyStrip() {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/proxy/family-aggregate", { cache: "no-store" })
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

  if (loading && !data) {
    return (
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <LoadingCard label="Permissions" />
        <LoadingCard label="Network" />
        <LoadingCard label="Data" />
      </section>
    )
  }

  if (error) {
    return <ErrorCard label="Family breakdown" error={error} onRetry={load} />
  }

  if (!data) return null

  return (
    <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {DISPLAY.map(({ key, label }) => {
        const family = data.families[key]
        if (!family) {
          return (
            <Section key={key} label={label}>
              <div className={descriptorClass}>
                No systems contribute scores for this family yet.
              </div>
            </Section>
          )
        }
        return (
          <Section
            key={key}
            label={label}
            descriptor={`Avg across ${family.contributing_systems} system${family.contributing_systems === 1 ? "" : "s"} · ${family.weight.toLocaleString()} resources`}
          >
            <div className="flex items-baseline gap-2">
              <span className={`${numberClass} ${scoreToneClass(family.score)}`}>
                {family.score.toFixed(0)}
              </span>
              <span className={unitClass}>/100</span>
            </div>
          </Section>
        )
      })}
    </section>
  )
}
