"use client"

import Link from "next/link"
import {
  useCachedFetch,
  type UseCachedFetchResult,
} from "@/lib/use-cached-fetch"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, labelClass, scorePillClass } from "./styles"
import {
  catalogEntryHref,
  familyMetricsAttributable,
  useScopedSystemCatalog,
  useScopedSystemCatalogEntries,
  type CatalogEntry,
  type FamilyResponseScope,
} from "@/lib/scoped-system-catalog"
import { useAccountScope } from "@/lib/account-scope-context"
import { AccountLinks } from "@/components/system-guard"

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
  health_score?: number | null
  healthScore?: number | null
  resourceCount?: number
  criticality?: string
  environment?: string
  region?: string
  critical_count?: number | null
  criticalIssues?: number | null
  high_count?: number | null
  highIssues?: number | null
  layers?: LayerMap | null
}

type SystemsResponse = {
  systems?: SystemRow[]
  errors?: string[]
  error?: string
  scope?: FamilyResponseScope | null
}

/** The row's CANONICAL label (never the decorated displayName): what the catalogue join and the link use. */
function canonicalName(s: SystemRow): string {
  return s.name || s.SystemName || ""
}

function catalogueMatches(s: SystemRow, entries: readonly CatalogEntry[]): CatalogEntry[] {
  const key = canonicalName(s).trim().toLocaleLowerCase()
  return key ? entries.filter((entry) => entry.name.trim().toLocaleLowerCase() === key) : []
}

const WITHHELD_TITLE =
  "Not attributable to one account: narrow the scope to this system's account and region to see its values"

function rowName(s: SystemRow): string {
  return s.displayName || s.name || s.SystemName || "(unnamed)"
}

function rowScore(s: SystemRow): number | null {
  if (typeof s.health_score === "number") return s.health_score
  if (typeof s.healthScore === "number") return s.healthScore
  return null
}

function rowCritical(s: SystemRow): number | null {
  return s.critical_count ?? s.criticalIssues ?? null
}

function rowHigh(s: SystemRow): number | null {
  return s.high_count ?? s.highIssues ?? null
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

export function TopSystemsCard({
  limit = 8,
  /**
   * Optional lifted fetch. The executive cockpit already reads
   * /api/proxy/systems/with-families for its KPI row; letting this card
   * fetch it AGAIN under a different cache key produced a page that
   * contradicted itself — the status banner said "Business systems:
   * unavailable" while this table rendered systems, because one copy
   * succeeded and the other did not. One page, one reading.
   */
  shared,
}: {
  limit?: number
  shared?: UseCachedFetchResult<SystemsResponse>
} = {}) {
  const scope = useAccountScope()
  const catalogue = useScopedSystemCatalogEntries()
  const systemsCatalog = useScopedSystemCatalog("/api/proxy/systems/with-families")
  // SWR via localStorage — N+1 fan-out endpoint, slow on cold start.
  // Skipped entirely when the parent supplies its copy (see `shared`).
  // url=null is the hook's existing skip — no second request to a slow
  // N+1 endpoint when the parent already read it.
  const own = useCachedFetch<SystemsResponse>(
    shared ? null : systemsCatalog.url,
    {
      cacheKey: `ciso-brief-systems:${systemsCatalog.scopeKey}`,
      fetchInit: { cache: "no-store" },
      isCacheable: () => systemsCatalog.available,
    },
  )
  // ONE reading, metadata included. Selecting `data` from `shared` but
  // `isStale`/`cachedAt` from `own` split the reading in half: in Executive
  // `own` has url=null and never refreshes, so a card hydrated from stale
  // cache kept rendering "as of N ago, refreshing" forever while the
  // parent's fresh payload was already on screen. Freshness metadata IS
  // part of the reading.
  const { data, loading, error, retry } = shared ?? own

  if ((loading && !data) || catalogue.state === "loading") return <LoadingCard label="Business systems by potential damage" />
  if (error && !data) return <ErrorCard label="Business systems by potential damage" error={error} onRetry={retry} />
  if (catalogue.state === "unavailable") {
    return (
      <ErrorCard
        label="Business systems by potential damage"
        error="The systems catalogue of this scope could not be read."
        onRetry={catalogue.retry}
      />
    )
  }
  if (!data) return null

  // T10 S1: a row's graph metrics are shown only for the account they were computed for; otherwise withheld.
  const attributable = (s: SystemRow) => {
    const matches = catalogueMatches(s, catalogue.entries)
    return familyMetricsAttributable(matches.length === 1 ? matches[0] : null, scope, data.scope)
  }

  // EVERY system the backend returned stays visible.
  //
  // The previous filter dropped systems without a score, which emptied the
  // table entirely while the header claimed 4 of 8 systems needed attention:
  // "I found your estate" and "I can't show you any of it" in one viewport.
  // Worse, an unscored system is not a low-risk one — it is one we failed to
  // measure, which is often exactly the one worth opening. Absence of a score
  // was rendering as absence from the estate.
  const all = data.systems ?? []
  const scored = all.filter((s) => attributable(s) && typeof rowScore(s) === "number")
  const unscored = all.filter((s) => !(attributable(s) && typeof rowScore(s) === "number"))

  // Lowest BRSS first among scored; unscored pinned ABOVE them, because
  // "unknown" outranks "known and merely bad" when you are triaging.
  const systems = [
    ...unscored,
    ...scored.sort((a, b) => rowScore(a)! - rowScore(b)!),
  ].slice(0, limit)

  if (all.length === 0) {
    return (
      <Section label="Business systems by potential damage">
        <div className={descriptorClass}>
          The backend returned no business systems. This is an absence of data, not an
          absence of risk — discovery may not have run yet.
        </div>
      </Section>
    )
  }

  return (
    <Section
      label="Business systems by potential damage"
      descriptor="Unmeasured systems first, then lowest BRSS · unmeasured is not low risk"
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
            const shown = attributable(s)
            const score = shown ? rowScore(s) : null
            const unmeasured = score === null
            const matches = catalogueMatches(s, catalogue.entries)
            const href = matches.length === 1 ? catalogEntryHref("/systems", matches[0], "systemName") : null
            return (
              <tr
                key={`${rowName(s)}-${i}`}
                className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="py-2.5 font-medium text-slate-900" data-attributable={shown ? "true" : "false"}>
                  {matches.length > 1 ? (
                    <>
                      <span>{rowName(s)}</span>
                      <AccountLinks name={rowName(s)} entries={matches} path="/systems" param="systemName" />
                    </>
                  ) : href ? (
                    <Link href={href} className="underline-offset-4 hover:text-violet-700 hover:underline">
                      {rowName(s)}
                    </Link>
                  ) : (
                    <span className="text-slate-500" title="This system's account identity is unavailable">{rowName(s)}</span>
                  )}
                </td>
                <td className="py-2.5 text-slate-500">{s.environment ?? "—"}</td>
                <td className="py-2.5 text-right">
                  {!shown ? (
                    <span title={WITHHELD_TITLE} className="text-xs text-slate-400">—</span>
                  ) : unmeasured ? (
                    <span
                      title="No blast-radius score could be computed for this system. Unmeasured is not low risk."
                      className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                    >
                      unmeasured
                    </span>
                  ) : (
                    <span className={`font-semibold tabular-nums ${scorePillClass(score!)}`}>
                      {score!.toFixed(0)}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  {shown ? <MixBar layers={s.layers} /> : <span title={WITHHELD_TITLE} className="text-xs text-slate-400">—</span>}
                </td>
                <td className="py-2.5 text-right tabular-nums text-rose-700">
                  {shown ? rowCritical(s) || "—" : "—"}
                </td>
                <td className="py-2.5 text-right tabular-nums text-amber-700">
                  {shown ? rowHigh(s) || "—" : "—"}
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
