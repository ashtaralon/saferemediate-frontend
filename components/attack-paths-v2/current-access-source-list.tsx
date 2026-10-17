"use client"

/**
 * (AP201 / CP-B, revised for Rev 6 Day 3) Current Access, source-first: when a crown jewel is selected, every compute
 * source the by-crown-jewel answer names. The temporary authoritative reader of the approved plan (P5.1): served facts
 * inside the existing tab, no redesign, nothing inferred (lib/attack-paths/current-access-sources.ts).
 *
 * Each row carries three independent states: ACTIVITY in the window (the section it is listed under), ACCESS NOW (its
 * own chip; a blocked route keeps its activity), and APPROVAL (fixed "Approved need not recorded": no producer exists,
 * APD-09). Counts are relayed per observation and per route plane, never summed; cross-route dates are labelled.
 * Selecting a row pins the source's route that carries its best served activity word (the server's grade, said on the
 * row); the list stays (design §7).
 */

import { useMemo } from "react"
import { Cpu, ShieldCheck, Shield, HelpCircle, AlertTriangle } from "lucide-react"

import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import {
  currentAccessSources,
  operationOf,
  type CurrentAccessSource,
  type CurrentAccessSources,
  type RouteAccess,
  type RouteActivity,
  type SourceSection,
} from "@/lib/attack-paths/current-access-sources"

export interface CurrentAccessSourceListProps {
  data: CrownJewelConvergence | null | undefined
  activePaths?: ReadonlyArray<{ id: string }> | null
  jewelName: string | null
  /** The selected target's served resource type (catalog kind). */
  jewelType?: string | null
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

const SECTION_ORDER: SourceSection[] = ["observed", "not_observed", "unknown"]

const SECTION_COPY: Record<SourceSection, { title: string; detail: string; Icon: typeof Shield; tone: string }> = {
  observed: {
    title: "Observed activity",
    detail: "The server bound observed activity to a route from this compute (on every plane, or on the planes the row names). Observed is not approved.",
    Icon: ShieldCheck,
    tone: "text-emerald-700 dark:text-emerald-300",
  },
  not_observed: {
    title: "Allowed, no observed activity",
    detail: "Configured access the observations covered and saw nothing on. Never drawn as traffic; each row says whether access is open now.",
    Icon: Shield,
    tone: "text-amber-700 dark:text-amber-300",
  },
  unknown: {
    title: "Unknown activity or coverage",
    detail: "The server could not establish activity on these routes (coverage missing or not reported). Unknown, not absent, and never zero.",
    Icon: HelpCircle,
    tone: "text-slate-600 dark:text-slate-300",
  },
}

const ACTIVITY_WORD: Record<RouteActivity, string> = {
  OBSERVED: "observed",
  PARTIALLY_OBSERVED: "observed on part of the route",
  NOT_OBSERVED: "not observed",
  UNKNOWN: "unknown",
}
const ACCESS_WORD: Record<RouteAccess, string> = {
  REACHABLE: "reachable",
  UNVERIFIED: "unverified",
  BLOCKED: "blocked",
  OUT_OF_SCOPE: "out of scope",
  UNKNOWN: "unknown",
}
const ACCESS_ORDER: RouteAccess[] = ["REACHABLE", "UNVERIFIED", "BLOCKED", "OUT_OF_SCOPE", "UNKNOWN"]
const ACTIVITY_ORDER: RouteActivity[] = ["OBSERVED", "PARTIALLY_OBSERVED", "NOT_OBSERVED", "UNKNOWN"]

function sectionSources(s: CurrentAccessSources, section: SourceSection): CurrentAccessSource[] {
  return section === "observed" ? s.observed : section === "not_observed" ? s.notObserved : s.unknown
}

function shortIso(value: string | null): string | null {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : value
}

function windowText(s: CurrentAccessSources): string {
  if (!s.window) return "observation window not reported"
  return `window ${shortIso(s.window.start) ?? "start not reported"} → ${shortIso(s.window.end) ?? "end not reported"}`
}

function cardinalityChip(c: CurrentAccessSources["cardinality"]): string | null {
  if (c && typeof c.returned_count === "number" && typeof c.eligible_total === "number") {
    const base = `${c.returned_count} returned of ${c.eligible_total} eligible routes`
    const total = typeof c.generation_total === "number" ? ` · ${c.generation_total} in the generation` : ""
    return c.truncated ? `${base}${total} · truncated` : `${base}${total}`
  }
  return null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function breakdown<K extends string>(counts: Partial<Record<K, number>>, order: K[], word: Record<K, string>): string {
  return order.filter((k) => counts[k]).map((k) => `${counts[k]} ${word[k]}`).join(" · ")
}

export function CurrentAccessSourceList({ data, activePaths, jewelName, jewelType, selectedPathId, onSelectPath }: CurrentAccessSourceListProps) {
  const activePathIds = useMemo(() => (activePaths ? new Set(activePaths.map((p) => p.id)) : null), [activePaths])
  const sources = useMemo(() => currentAccessSources(data, { activePathIds, jewelType }), [data, activePathIds, jewelType])
  if (!sources) return null
  if (sources.sourceCount === 0 && sources.nonCompute.length === 0 && sources.conflictingOrigin.length === 0
    && sources.excludedInactive === 0) return null

  const jewel = jewelName ?? "this crown jewel"
  const chip = cardinalityChip(sources.cardinality)
  const observedCount = sources.observed.length
  // Every listed source's activity is unknown: say that, never "0 ... with observed activity".
  const allUnknown = sources.sourceCount > 0 && sources.unknown.length === sources.sourceCount
  const dataPlane = sources.dataPlane

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
          <div className="text-xs text-foreground" data-testid="current-access-header">
            {allUnknown
              ? `Activity unknown for ${sources.sourceCount === 1 ? "the one compute source" : `all ${sources.sourceCount} compute sources`} listed toward ${jewel}`
              : `${plural(observedCount, "compute source")} with observed activity (whole route or some planes) toward ${jewel}`}
            {` · ${windowText(sources)}`}
          </div>
          <div className="text-[10px] text-muted-foreground" data-testid="current-access-totals">
            {plural(sources.sourceCount, "compute source")} · {plural(sources.routeCount, "compute route")} listed
            {sources.asOf ? ` · as of ${sources.asOf}` : ""}
            {sources.generation ? ` · generation ${sources.generation}` : ""}
          </div>
        </div>
        {chip ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground" data-testid="current-access-cardinality">
            {chip}
          </span>
        ) : null}
      </header>

      <p className="px-4 pb-2 text-[10px] text-muted-foreground" data-testid="current-access-reconciliation">
        Listed: the compute sources this attack-path answer names. This install does not serve a reconciliation against
        the admitted observations, so whether every observed compute is listed is not reported.
      </p>
      {dataPlane && dataPlane.observedRouteCount === 0 && (dataPlane.routeCount > 0 || dataPlane.summaryAbsent) ? (
        <p className="px-4 pb-2 text-[10px] text-amber-800 dark:text-amber-300" data-testid="current-access-data-plane">
          {/* "No data-plane observation" only when every listed route served a data-plane state (S7). */}
          {dataPlane.summaryAbsent
            ? "Data-plane observations are not projected on this install — network plane only."
            : dataPlane.noDataObservation
              ? "No data-plane observation is bound to any listed route — network and identity planes only."
              : "No listed route served an observed data plane."}
          {` ${sources.jewelType} use is seen on the data plane; an empty Observed section is not "no traffic".`}
          {dataPlane.notReportedRouteCount > 0
            ? ` Data-plane state not reported for ${dataPlane.notReportedRouteCount} of ${plural(dataPlane.routeCount, "listed route")}; its activity there is unknown.`
            : ""}
          {` Served data-plane states: ${dataPlane.servedStates.join(", ") || "none served"}.`}
        </p>
      ) : null}
      {sources.partial ? (
        <p className="px-4 pb-2 text-[10px] text-amber-700 dark:text-amber-300" data-testid="current-access-partial">
          Not every route is listed ({sources.partial}); a source missing here is unknown, not absent.
        </p>
      ) : null}
      {sources.excludedInactive > 0 ? (
        <p className="px-4 pb-2 text-[10px] text-muted-foreground" data-testid="current-access-inactive">
          {plural(sources.excludedInactive, "route")} in the answer {sources.excludedInactive === 1 ? "is" : "are"} not in the page&apos;s active path list and {sources.excludedInactive === 1 ? "is" : "are"} not listed here.
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
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${copy.tone}`}>{copy.title}</span>
              <span className="text-[10px] text-muted-foreground" data-testid={`current-access-section-count-${section}`}>
                ({plural(rows.length, "compute source")} · {windowText(sources)})
              </span>
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

      {sources.conflictingOrigin.length > 0 ? (
        <div data-testid="current-access-conflicting-origin" className="border-t border-border/60 px-4 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Unknown origin (conflicting metadata) ({sources.conflictingOrigin.length})
          </div>
          <ul className="mt-1 space-y-0.5">
            {sources.conflictingOrigin.map((row) => (
              <li key={row.pathId} className="text-[10px] text-foreground" title={row.pathId} data-testid="current-access-conflict-row">
                <span className="font-mono">{row.label}</span>
                <span className="text-muted-foreground">
                  {" "}· origin class: {row.conflict?.originClass ?? "not reported"} · compute reference:{" "}
                  {row.conflict?.computeKind || row.conflict?.computeUid
                    ? `${row.conflict?.computeKind ?? "kind not reported"} ${row.conflict?.computeUid ?? "uid not reported"}`
                    : "none"}
                  {" "}· {row.conflict?.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sources.nonCompute.length > 0 ? (
        <div data-testid="current-access-non-compute" className="border-t border-border/60 px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Other origins ({sources.nonCompute.length})
          </div>
          <p className="text-[10px] text-muted-foreground">
            Routes whose point A is not a registered compute; the server&apos;s origin class is shown where it sent one. They stay in the path list below.
          </p>
          <ul className="mt-1 space-y-0.5">
            {sources.nonCompute.map((row) => (
              <li key={row.pathId} className="truncate font-mono text-[10px] text-foreground" title={row.pathId}>
                {row.label}{row.originClass ? <span className="text-muted-foreground"> · {row.originClass.replace(/_/g, " ")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function AccessChip({ source }: { source: CurrentAccessSource }) {
  const kinds = ACCESS_ORDER.filter((k) => source.accessCounts[k])
  const single = kinds.length === 1 ? kinds[0] : null
  const tone = single === "BLOCKED"
    ? "border-sky-300/70 text-sky-800 dark:text-sky-300"
    : single === "REACHABLE"
      ? "border-rose-300/70 text-rose-800 dark:text-rose-300"
      : "border-border text-muted-foreground"
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone}`}
      data-testid="current-access-access-now"
      data-access={single ?? "MIXED"}
      title={source.routes.map((r) => `${r.pathId}: ${ACCESS_WORD[r.access]}${r.accessReason ? ` — ${r.accessReason}` : ""}`).join("\n")}
    >
      Access now: {single ? ACCESS_WORD[single] : breakdown(source.accessCounts, ACCESS_ORDER, ACCESS_WORD)}
    </span>
  )
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
  const first = shortIso(source.firstSeen)
  const last = shortIso(source.lastSeen)
  const activityKinds = ACTIVITY_ORDER.filter((k) => source.activityCounts[k])
  const mixed = activityKinds.length > 1 || ACCESS_ORDER.filter((k) => source.accessCounts[k]).length > 1
  const observedRoute = source.routes.find((r) => r.observations.length > 0)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectPath(selected && selectedPathId ? selectedPathId : source.primaryPathId)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${source.name} (${source.kind}): activity ${ACTIVITY_WORD[primary.activity]}; access now ${ACCESS_WORD[primary.access]}; approved need not recorded`}
        data-testid="current-access-source"
        data-source-key={source.key}
        data-section={source.section}
        data-activity={primary.activity}
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
            <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={source.identities.join(", ")} data-testid="current-access-identity">
              identity: {source.identities.length > 0 ? source.identities.join(", ") : "not reported"}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <AccessChip source={source} />
            <span
              className="rounded border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              data-testid="current-access-approval"
              title="No approved-need record exists for this source; observed activity is not approval."
            >
              Approved need not recorded
            </span>
          </span>
        </span>

        <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
          <span className="text-muted-foreground">Activity</span>
          <span className="text-foreground" data-testid="current-access-qualifier">
            {mixed
              ? `${breakdown(source.activityCounts, ACTIVITY_ORDER, ACTIVITY_WORD)} across ${plural(source.routes.length, "route")}`
              : `${ACTIVITY_WORD[primary.activity]} — ${primary.activityDetail}`}
          </span>

          <span className="text-muted-foreground">Seen</span>
          <span className="text-foreground" data-testid="current-access-seen">
            {first || last
              ? `first seen ${first ?? "not reported"} · last seen ${last ?? "not reported"}${source.seenRouteCount > 1 ? ` (across ${source.seenRouteCount} routes)` : ""}`
              : "not reported"}
            {source.sharedActivity ? (
              <span className="text-amber-700 dark:text-amber-300" data-testid="current-access-shared"> · shared activity, not attributable to this compute</span>
            ) : null}
          </span>

          <span className="text-muted-foreground">Operation</span>
          <span className="font-mono text-foreground" data-testid="current-access-operations">
            {source.operations.length > 0 ? source.operations.join(" · ") : <span className="font-sans">not reported</span>}
          </span>

          <span className="text-muted-foreground">{observedRoute ? "Observations" : source.routes.length > 1 ? "Evidence (opened route)" : "Evidence"}</span>
          <span className="text-foreground" data-testid="current-access-planes">
            {observedRoute
              ? observedRoute.observations.map((o, i) => (
                  <span key={i} className="mr-2 inline-block" data-testid="current-access-observation">
                    {o.hopOrdinal != null ? `hop ${o.hopOrdinal} · ` : ""}{o.plane} {o.kind.replace(/_/g, " ")}
                    {operationOf(o) ? ` · ${operationOf(o)}` : ""}
                    {` · ${o.hitCount != null ? plural(o.hitCount, "hit") : "hits not reported"}`}
                    {` · ${o.bytes != null ? `${o.bytes} bytes` : "bytes not reported"}`}
                  </span>
                ))
              : primary.planes
                ? primary.planes.map((p) => (
                    <span key={p.plane} className="mr-2 inline-block">
                      <span className="text-muted-foreground">{p.plane}</span>{" "}
                      <span className={p.state === "observed" ? "text-emerald-700 dark:text-emerald-300" : ""}>{p.state.replace(/_/g, " ")}</span>
                      {p.state === "observed" ? ` · ${p.hitCount != null ? `${plural(p.hitCount, "hit")} (server plane total)` : "hits not reported"}` : ""}
                      {p.state === "observed" && p.kinds.length ? ` (${p.kinds.join(", ")})` : ""}
                    </span>
                  ))
                : "no evidence contract served for this route"}
            {observedRoute && source.routes.length > 1 ? <span className="text-muted-foreground"> (route {observedRoute.pathId}; per route, never summed)</span> : null}
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
                <span className="font-sans text-muted-foreground"> (assessed capability under this foothold, not activity)</span>
              </span>
            </>
          ) : null}

          {source.coverageGaps.length > 0 ? (
            <>
              <span className="text-muted-foreground">Coverage</span>
              <span className="text-amber-800 dark:text-amber-300" data-testid="current-access-coverage">
                {source.coverageGaps.join(" · ")}
              </span>
            </>
          ) : null}

          {source.routes.length > 1 ? (
            <>
              <span className="text-muted-foreground">Routes</span>
              <span className="text-foreground" data-testid="current-access-routes">
                {plural(source.routes.length, "route")} listed · opens a route the server grades {ACTIVITY_WORD[primary.activity]}
              </span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  )
}
