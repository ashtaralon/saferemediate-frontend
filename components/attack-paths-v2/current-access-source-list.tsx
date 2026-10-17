"use client"

/**
 * (AP201 / CP-B) Current Access, source-first: when a crown jewel is selected, every compute source the
 * by-crown-jewel answer names, grouped by what the server said about it. The temporary authoritative reader of the
 * approved plan (P5.1): a list of served facts inside the existing tab, no redesign.
 *
 * What a row says, and where each word comes from (lib/attack-paths/current-access-sources.ts):
 * - the canonical compute (name, kind) -- `source_compute`;
 * - the section -- the server's feasibility / classification; "Observed activity" is the only section whose sources
 *   were seen at all, and even those are NOT called legitimate: approval has no producer yet (APD-09), so every row
 *   says "Approval not recorded"; a source whose routes fall in several sections is said as mixed;
 * - first / last seen, hits per plane and kind, observed / allowed actions, the coverage the answer could not see --
 *   the route's `evidence_contract`; counts are per plane and per route, never summed;
 * - identity, damage, headline -- the server's assessed capability words.
 * Selecting a row pins the source's primary route (the strongest-evidence one) through the page's existing selection,
 * so the dossier opens on it while this list stays (design §7: selection belongs to the parent). The list reads the
 * same active set the path list shows, so a source never pins a route that list does not have.
 */

import { useMemo } from "react"
import { Cpu, ShieldCheck, ShieldOff, Shield, HelpCircle, Ban } from "lucide-react"

import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  currentAccessSources,
  type CurrentAccessSource,
  type CurrentAccessSources,
  type SourceSection,
} from "@/lib/attack-paths/current-access-sources"

export interface CurrentAccessSourceListProps {
  /** The by-crown-jewel answer behind the rail (null while nothing is loaded). */
  data: CrownJewelConvergence | null | undefined
  /** The paths the path list below shows (its active filter applied); routes outside it are counted, not listed. */
  activePaths?: ReadonlyArray<{ id: string }> | null
  jewelName: string | null
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

const SECTION_ORDER: SourceSection[] = ["observed", "allowed_not_observed", "unverified", "out_of_scope", "blocked"]

const SECTION_COPY: Record<SourceSection, { title: string; short: string; detail: string; Icon: typeof Shield; tone: string }> = {
  observed: {
    title: "Observed activity toward",
    short: "observed",
    detail: "The server bound observed activity to a route from this compute. A row says whether the contract covers the whole path. Observed is not approved: no approval record exists yet.",
    Icon: ShieldCheck,
    tone: "text-emerald-700 dark:text-emerald-300",
  },
  allowed_not_observed: {
    title: "Allowed, no observed activity",
    short: "allowed, not observed",
    detail: "Configured or reachable; the server recorded no activity on the route (not observed) or could not tell (unknown) — each row says which.",
    Icon: Shield,
    tone: "text-amber-700 dark:text-amber-300",
  },
  unverified: {
    title: "Unverified",
    short: "unverified",
    detail: "The server could not verify the route: unknown, not absent.",
    Icon: HelpCircle,
    tone: "text-slate-600 dark:text-slate-300",
  },
  out_of_scope: {
    title: "Out of scope",
    short: "out of scope",
    detail: "Outside the assessed scope (platform or service-linked), as the server said.",
    Icon: Ban,
    tone: "text-slate-500 dark:text-slate-400",
  },
  blocked: {
    title: "Blocked",
    short: "blocked",
    detail: "A server-backed control stops every route of this source.",
    Icon: ShieldOff,
    tone: "text-sky-700 dark:text-sky-300",
  },
}

function sectionSources(s: CurrentAccessSources, section: SourceSection): CurrentAccessSource[] {
  switch (section) {
    case "observed": return s.observed
    case "allowed_not_observed": return s.allowedNotObserved
    case "unverified": return s.unverified
    case "out_of_scope": return s.outOfScope
    case "blocked": return s.blocked
  }
}

function shortIso(value: string | null): string | null {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : value
}

function cardinalityChip(c: CurrentAccessSources["cardinality"]): string | null {
  if (c && typeof c.returned_count === "number" && typeof c.eligible_total === "number") {
    const base = `${c.returned_count} of ${c.eligible_total} routes listed`
    return c.truncated ? `${base} · truncated` : base
  }
  return null
}

const words = (s: string) => s.replace(/_/g, " ")

export function CurrentAccessSourceList({ data, activePaths, jewelName, selectedPathId, onSelectPath }: CurrentAccessSourceListProps) {
  const activePathIds = useMemo(() => (activePaths ? new Set(activePaths.map((p) => p.id)) : null), [activePaths])
  const sources = useMemo(() => currentAccessSources(data, { activePathIds }), [data, activePathIds])
  if (!sources) return null
  if (sources.sourceCount === 0 && sources.nonCompute.length === 0 && sources.excludedInactive === 0) return null

  const jewel = jewelName ?? "this crown jewel"
  const chip = cardinalityChip(sources.cardinality)

  return (
    <section
      className="border-b border-border"
      data-testid="current-access-sources"
      data-source-count={sources.sourceCount}
      data-route-count={sources.routeCount}
      aria-label={`Current access to ${jewel}: compute sources`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current access · by source</div>
          <div className="text-xs text-foreground">
            {sources.sourceCount} compute source{sources.sourceCount === 1 ? "" : "s"} · {sources.routeCount} compute route{sources.routeCount === 1 ? "" : "s"} to {jewel}
            {sources.nonCompute.length > 0 ? ` · ${sources.nonCompute.length} other-origin route${sources.nonCompute.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        {chip ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground" data-testid="current-access-cardinality">
            {chip}
          </span>
        ) : null}
      </header>
      {sources.partial ? (
        <p className="px-4 pb-2 text-[10px] text-amber-700 dark:text-amber-300" data-testid="current-access-partial">
          Not every route is listed ({sources.partial}); a source missing here is unknown, not absent.
        </p>
      ) : null}
      {sources.excludedInactive > 0 ? (
        <p className="px-4 pb-2 text-[10px] text-muted-foreground" data-testid="current-access-inactive">
          {sources.excludedInactive} route{sources.excludedInactive === 1 ? "" : "s"} in the answer {sources.excludedInactive === 1 ? "is" : "are"} not in the page&apos;s active path list and {sources.excludedInactive === 1 ? "is" : "are"} not listed here.
        </p>
      ) : null}

      {SECTION_ORDER.map((section) => {
        const rows = sectionSources(sources, section)
        if (rows.length === 0) return null
        const copy = SECTION_COPY[section]
        return (
          <div key={section} data-testid={`current-access-section-${section}`} className="border-t border-border/60">
            <div className="flex items-center gap-1.5 px-4 pt-2 pb-1">
              <copy.Icon className={`h-3 w-3 ${copy.tone}`} aria-hidden="true" />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${copy.tone}`}>
                {copy.title}{section === "observed" ? ` ${jewel}` : ""}
              </span>
              <span className="text-[10px] text-muted-foreground">({rows.length})</span>
            </div>
            <p className="px-4 pb-1 text-[10px] text-muted-foreground">{copy.detail}</p>
            <ul className="divide-y divide-border/60">
              {rows.map((source) => (
                <SourceRow key={source.key} source={source} selectedPathId={selectedPathId} onSelectPath={onSelectPath} />
              ))}
            </ul>
          </div>
        )
      })}

      {sources.nonCompute.length > 0 ? (
        <div data-testid="current-access-non-compute" className="border-t border-border/60 px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Other origins ({sources.nonCompute.length})
          </div>
          <p className="text-[10px] text-muted-foreground">
            Routes whose point A is not a registered compute (standing access, identity, external, unknown). They stay in the path list below.
          </p>
          <ul className="mt-1 space-y-0.5">
            {sources.nonCompute.map((row) => (
              <li key={row.pathId} className="truncate font-mono text-[10px] text-foreground" title={row.pathId}>
                {row.label}{row.originClass ? <span className="text-muted-foreground"> · {row.originClass}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/** The observed section's qualifier for one source: what kind of "observed" the server meant, in the order the
 *  section was decided -- feasibility first, so a contract that classifies the route otherwise is never credited
 *  with "observed"; the contract branch is reached only when the contract itself put the route here. */
function observedQualifier(source: CurrentAccessSource): string | null {
  if (source.section !== "observed") return null
  const primary = source.routes[0]
  if (primary.activityState === "OBSERVED") {
    const pathNote = primary.pathState && primary.pathState !== "REACHABLE" ? ` · path ${words(primary.pathState.toLowerCase())}` : ""
    return `activity observed (server feasibility)${pathNote}`
  }
  if (primary.fromContract) {
    return primary.wholePathObserved === true ? "whole path observed (contract)" : "activity observed on part of the route (contract)"
  }
  return "observed (legacy whole-path word)"
}

/** The allowed section's qualifier: not observed vs unknown, from the route's own words. */
function allowedQualifier(source: CurrentAccessSource): string | null {
  if (source.section !== "allowed_not_observed") return null
  const primary = source.routes[0]
  if (primary.activityState === "UNKNOWN") return "activity unknown (server feasibility)"
  if (primary.activityState === "NOT_OBSERVED") return "activity not observed (server feasibility)"
  if (primary.fromContract) return "no observed activity (contract)"
  return "configured (legacy whole-path word)"
}

function SourceRow({
  source,
  selectedPathId,
  onSelectPath,
}: {
  source: CurrentAccessSource
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}) {
  const selected = selectedPathId != null && source.routes.some((r) => r.pathId === selectedPathId)
  const primary = source.routes[0]
  const planes = primary.planes
  const first = shortIso(source.firstSeen)
  const last = shortIso(source.lastSeen)
  const sectionEntries = (Object.entries(source.sectionCounts) as Array<[SourceSection, number]>)
    .sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]))
  const mixed = sectionEntries.length > 1
  const qualifier = observedQualifier(source) ?? allowedQualifier(source)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectPath(selected && selectedPathId ? selectedPathId : source.primaryPathId)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${source.name} (${source.kind}): ${mixed ? "mixed routes" : SECTION_COPY[source.section].short}; approval not recorded`}
        data-testid="current-access-source"
        data-source-key={source.key}
        data-section={source.section}
        data-mixed={mixed ? "true" : undefined}
        data-primary-path={source.primaryPathId}
        className={`block w-full px-4 py-2 text-left transition-colors hover:bg-accent/50 ${selected ? "bg-accent/60" : ""}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="block min-w-0">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-xs font-semibold text-foreground" title={source.arn ?? source.key}>{source.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{source.kind}</span>
            </span>
            {source.identities.length > 0 ? (
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={source.identities.join(", ")}>
                via {source.identities.join(", ")}
              </span>
            ) : null}
          </span>
          <span
            className="shrink-0 rounded border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
            data-testid="current-access-approval"
            title="No approved-need record exists for this source; observed activity is not approval."
          >
            Approval not recorded
          </span>
        </span>

        <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
          {qualifier || mixed ? (
            <>
              <span className="text-muted-foreground">Status</span>
              <span className="text-foreground" data-testid="current-access-qualifier">
                {mixed
                  ? `mixed · ${sectionEntries.map(([s, n]) => `${n} ${SECTION_COPY[s].short}`).join(" · ")} (listed under the strongest route)`
                  : qualifier}
              </span>
            </>
          ) : null}

          <span className="text-muted-foreground">Seen</span>
          <span className="text-foreground" data-testid="current-access-seen">
            {first || last ? `${first ?? "?"} → ${last ?? "?"}` : "not measured"}
            {source.routes.length > 1 && (first || last) ? " (across its routes)" : ""}
            {source.sharedActivity ? <span className="text-amber-700 dark:text-amber-300"> · shared activity on a role, not attributed to this source</span> : null}
          </span>

          <span className="text-muted-foreground">{source.routes.length > 1 ? "Evidence (strongest route)" : "Evidence"}</span>
          <span className="text-foreground" data-testid="current-access-planes">
            {planes
              ? planes.map((p) => (
                  <span key={p.plane} className="mr-2 inline-block">
                    <span className="text-muted-foreground">{p.plane}</span>{" "}
                    <span className={p.state === "observed" ? "text-emerald-700 dark:text-emerald-300" : ""}>{words(p.state)}</span>
                    {p.state === "observed" && p.hitCount != null ? ` · ${p.hitCount} hit${p.hitCount === 1 ? "" : "s"}` : ""}
                    {p.state === "observed" && p.kinds.length ? ` (${p.kinds.join(", ")})` : ""}
                  </span>
                ))
              : source.observations.length > 0
                ? source.observations.map((o, i) => (
                    <span key={i} className="mr-2 inline-block">
                      {o.plane} {o.kind}
                      {o.hitCount != null ? ` · ${o.hitCount} hit${o.hitCount === 1 ? "" : "s"}` : ""}
                      {o.dstPort != null ? ` · port ${o.dstPort}` : ""}
                      {o.apiOperation ? ` · ${o.apiOperation}` : ""}
                    </span>
                  ))
                : "no evidence contract served for this route"}
          </span>

          {source.observedActions.length > 0 || source.allowedUnobservedActions.length > 0 ? (
            <>
              <span className="text-muted-foreground">Actions</span>
              <span className="font-mono text-foreground" data-testid="current-access-actions">
                {source.observedActions.map((a) => (
                  <span key={a} className="mr-2 text-emerald-700 dark:text-emerald-300">{a} · observed</span>
                ))}
                {source.allowedUnobservedActions.map((a) => (
                  <span key={a} className="mr-2 text-amber-700 dark:text-amber-300">{a} · allowed, not observed</span>
                ))}
              </span>
            </>
          ) : null}

          {source.damage.length > 0 ? (
            <>
              <span className="text-muted-foreground">Damage</span>
              <span className="font-mono text-foreground" data-testid="current-access-damage">
                {source.damage.join(" · ")}
                <span className="font-sans text-muted-foreground"> (assessed capability, not activity)</span>
              </span>
            </>
          ) : null}

          {source.coverageGaps.length > 0 ? (
            <>
              <span className="text-muted-foreground">Not seen</span>
              <span className="text-amber-800 dark:text-amber-300" data-testid="current-access-coverage">
                {source.coverageGaps.join(" · ")}
              </span>
            </>
          ) : null}

          {source.routes.length > 1 ? (
            <>
              <span className="text-muted-foreground">Routes</span>
              <span className="text-foreground" data-testid="current-access-routes">
                {source.routes.length} listed · {sectionEntries.map(([s, n]) => `${n} ${SECTION_COPY[s].short}`).join(" · ")} · opens the strongest-evidence route
              </span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  )
}
