"use client"

import { useRetryFetch } from "@/lib/use-retry-fetch"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import {
  accentByCategory,
  descriptorClass,
  numberClass,
  scoreToneClass,
  unitClass,
} from "./styles"

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

const DISPLAY: Array<{
  key: string
  label: string
  accent: string
  pip: string
}> = [
  { key: "privilege", label: "Permissions", accent: accentByCategory.permissions, pip: "bg-violet-500" },
  { key: "network", label: "Network", accent: accentByCategory.network, pip: "bg-blue-500" },
  { key: "data", label: "Data", accent: accentByCategory.data, pip: "bg-teal-500" },
]

export function FamilyStrip() {
  const { data, loading, error, attempt, retrying, retry } = useRetryFetch<FamilyData>(
    "/api/proxy/family-aggregate",
    { fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) {
    return (
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <LoadingCard label="Permissions" attempt={attempt} retrying={retrying} />
        <LoadingCard label="Network" attempt={attempt} retrying={retrying} />
        <LoadingCard label="Data" attempt={attempt} retrying={retrying} />
      </section>
    )
  }

  if (error) {
    return <ErrorCard label="Family breakdown" error={error} onRetry={retry} />
  }

  if (!data) return null

  return (
    <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {DISPLAY.map(({ key, label, accent, pip }) => {
        const labelWithPip = (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${pip}`} />
            {label.toUpperCase()}
          </span>
        )
        const family = data.families[key]
        if (!family) {
          return (
            <Section
              key={key}
              label={label}
              className={accent}
            >
              <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span className={`inline-block h-2 w-2 rounded-full ${pip}`} />
                {label}
              </div>
              <div className={descriptorClass}>
                No systems contribute scores for this family yet.
              </div>
            </Section>
          )
        }
        return (
          <Section
            key={key}
            label={undefined}
            descriptor={`Avg across ${family.contributing_systems} system${family.contributing_systems === 1 ? "" : "s"} · ${family.weight.toLocaleString()} resources`}
            className={accent}
          >
            <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span className={`inline-block h-2 w-2 rounded-full ${pip}`} />
              {label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`${numberClass} ${scoreToneClass(family.score)}`}>
                {family.score.toFixed(0)}
              </span>
              <span className={unitClass}>/100</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
              <div
                className={`h-1.5 rounded-full ${pip}`}
                style={{ width: `${Math.max(0, Math.min(100, family.score))}%` }}
              />
            </div>
          </Section>
        )
      })}
    </section>
  )
}
