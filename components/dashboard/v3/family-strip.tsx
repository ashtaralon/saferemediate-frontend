"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
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

const GRID_COLS_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
}

/**
 * `families` lets the home layout split the strip — e.g. Data tile
 * stacked under the BRSS hero, Permissions/Network rendered as a
 * separate 2-col strip below. Defaults to all three.
 *
 * Both call sites share the same /api/proxy/family-aggregate fetch
 * via the shared `family-aggregate` cacheKey: useCachedFetch reads
 * localStorage on mount, so the second consumer renders from cache
 * without an extra HTTP roundtrip on the warm path.
 */
export function FamilyStrip({ families }: { families?: string[] } = {}) {
  // Preserve the order the caller passed in (`families` is the source
  // of truth for ordering). Falling back to DISPLAY's natural order
  // when no prop is given.
  const byKey = new Map(DISPLAY.map((d) => [d.key, d]))
  const tiles = families
    ? families.map((k) => byKey.get(k)).filter((d): d is (typeof DISPLAY)[number] => Boolean(d))
    : DISPLAY
  const gridCols = GRID_COLS_BY_COUNT[tiles.length] ?? "grid-cols-1 sm:grid-cols-3"

  // useCachedFetch (stale-while-revalidate via localStorage). User
  // reported this card "loaded very very slow and stuck" — the
  // /api/proxy/family-aggregate endpoint fans out N+1 Cypher queries
  // and can take 30s+ on cold-start. Now: second visit (and every
  // subsequent visit) renders the cached data INSTANTLY while a
  // background fetch refreshes it. The user only ever sees a real
  // skeleton on the first visit ever; thereafter it's perceived-instant.
  const { data, loading, error, retry } = useCachedFetch<FamilyData>(
    "/api/proxy/family-aggregate",
    { cacheKey: "family-aggregate", fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) {
    return (
      <section className={`grid gap-5 ${gridCols}`}>
        {tiles.map((t) => (
          <LoadingCard key={t.key} label={t.label} />
        ))}
      </section>
    )
  }

  if (error && !data) {
    return <ErrorCard label="Family breakdown" error={error} onRetry={retry} />
  }

  if (!data) return null

  return (
    <section className={`grid gap-5 ${gridCols}`}>
      {tiles.map(({ key, label, accent, pip }) => {
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
