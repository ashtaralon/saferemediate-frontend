"use client"

/**
 * Zoom 0 — jewel fan-in on the Attack Map engine (TrafficFlowMap).
 *
 * Same map as mode=attacker_map / Topology graph spotlight: TFM +
 * spotlightPaths from by-crown-jewel convergence. Adaptations for Zoom 0:
 *   - choke tiles when paths > threshold (filter spotlightPaths, no hairball)
 *   - no path URL yet — left list owns Zoom 1 drill-in
 *   - details panels (Current Access / Lateral / Exfiltration) — presentation
 *     filters until genuine lens canvases land; restored from TargetAttackMap
 *   - canvasV2 so the Laterals bright/dim toolbar control is visible
 */

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Loader2,
  Network,
  RefreshCw,
  Sliders,
  Zap,
} from "lucide-react"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import type {
  ConvergencePath,
  CrownJewelConvergence,
  JewelRiskSummary,
  PathCardinality,
} from "@/lib/attack-paths/convergence-types"
import { pathsWithAuthoritativeHops } from "@/lib/attack-paths/convergence-path-details"
import {
  formatFanInCardinality,
  summarizeFanInDrawability,
  type FanInDrawabilitySummary,
} from "@/lib/attack-paths/fan-in-path-model"
import {
  crownJewelFromArnName,
  useCrownJewelConvergence,
} from "@/lib/attack-paths/use-crown-jewel-convergence"
import {
  iapPathsToConvergence,
  matchConvergencePathId,
} from "@/lib/attack-paths/iap-to-convergence"
import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import {
  composePathVerdict,
  extractRouteVerdictToken,
} from "@/lib/attack-paths/path-feasibility-verdict"
import { pathHasObservedNetworkEvidence } from "@/lib/attack-paths/build-path-authority-architecture"
import {
  buildCurrentAccessDossier,
  findPinnedConvergencePath,
} from "@/lib/attack-paths/build-current-access-dossier"
import { ChokePointTilesBar } from "./choke-point-tiles-bar"
import {
  CHOKE_TILE_THRESHOLD,
  shouldCollapseToChokeTiles,
} from "./choke-point-tiles"
import { Zoom0RiskHeader } from "./zoom0-risk-header"
import { Zoom0ExfilLensPanel } from "./zoom0-exfil-lens-panel"
import { Zoom0LateralLensPanel } from "./zoom0-lateral-lens-panel"
import { CurrentAccessDossierPanel } from "./current-access-dossier-panel"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

/** Details-panel selector — presentation filter, not a real map lens yet. */
export type Zoom0DetailsPanel = "current_access" | "lateral" | "exfiltration"
/** @deprecated Use Zoom0DetailsPanel — kept for short-term import compat. */
export type Zoom0MapLens = Zoom0DetailsPanel

/** True N-of-M from server cardinality (eligible envelope, not drawn-only). */
export function zoom0NofMLine(cardinality: PathCardinality): string {
  return `${cardinality.returned_count} of ${cardinality.eligible_total} eligible`
}

/** Format SERVE path cardinality for fan-in chrome. */
export function zoom0CardinalityLine(
  cardinality: PathCardinality,
  drawability: FanInDrawabilitySummary | number,
): string {
  const summary =
    typeof drawability === "number"
      ? {
          drawnPaths: [],
          drawnCount: drawability,
          omittedCount: Math.max(cardinality.returned_count - drawability, 0),
          omittedPathIds: [],
          omittedByReason: {},
        }
      : drawability
  return formatFanInCardinality(cardinality, summary)
}

/** Resolve IAP ?path= id → convergence path_id for investigation pin. */
export function resolveZoom0PinPathId(
  data: CrownJewelConvergence | null | undefined,
  selectedPathId: string | null,
  iapPaths: IdentityAttackPath[],
): string | null {
  if (!data?.paths?.length) return selectedPathId
  return matchConvergencePathId(data.paths, selectedPathId, iapPaths)
}

/** Pure: which convergence paths feed TFM spotlight for Zoom 0. */
export function zoom0SpotlightPaths(
  data: CrownJewelConvergence,
  tileFilterIds: string[] | null,
  selectedPathId?: string | null,
): ConvergencePath[] {
  let paths = data.paths
  if (tileFilterIds && tileFilterIds.length > 0) {
    const allow = new Set(tileFilterIds)
    paths = paths.filter((p) => allow.has(p.path_id))
  }
  // Investigation pin can place an identity-only path. The unpinned fan-in
  // is compute-led and uses the shared drawability model so omitted paths
  // remain counted without producing disconnected cards.
  if (selectedPathId) {
    return pathsWithAuthoritativeHops(
      selectSpotlightPaths(paths, selectedPathId),
    )
  }
  return summarizeFanInDrawability(paths).drawnPaths
}

/** Server risk_summary only — never synthesize from paths[0]. */
export function zoom0RiskSummary(
  data: CrownJewelConvergence | null,
): JewelRiskSummary | null {
  if (!data?.risk_summary) return null
  return data.risk_summary
}

/** Authoritative coverage/serve from response root or risk_summary. */
export function zoom0ServeCoverage(data: CrownJewelConvergence | null): {
  serve_state: string | null
  coverage_state: string | null
} {
  if (!data) return { serve_state: null, coverage_state: null }
  return {
    serve_state: data.serve_state ?? data.risk_summary?.serve_state ?? null,
    coverage_state:
      data.coverage_state ?? data.risk_summary?.coverage_state ?? null,
  }
}

/**
 * Resolve what the canvas may show.
 * - Authoritative response present → always use it (including empty NOT_READY).
 * - IAP fallback only when the endpoint is genuinely unreachable.
 * - Never override NOT_READY / PARTIAL / ERROR with a legacy preview.
 */
export function resolveZoom0Effective(
  data: CrownJewelConvergence | null,
  iapFallback: CrownJewelConvergence | null,
  error: string | null,
): { data: CrownJewelConvergence | null; source: "live" | "fallback" } {
  // Any successful serve response is authoritative — including empty
  // NOT_READY / READY_ZERO / PARTIAL / ERROR envelopes.
  if (data != null) {
    return { data, source: "live" }
  }
  if (error && iapFallback?.paths?.length) {
    return { data: iapFallback, source: "fallback" }
  }
  return { data: null, source: "live" }
}

/** Canvas empty copy — never treat NOT_READY as "no paths today". */
export function zoom0EmptyCanvasMessage(
  data: CrownJewelConvergence | null,
): { state: string; message: string } {
  const { serve_state, coverage_state } = zoom0ServeCoverage(data)
  if (serve_state === "NOT_READY" || coverage_state === "NOT_READY") {
    return {
      state: "NOT_READY",
      message:
        "Attack-path materialization is not ready for this system. Paths are unknown — not absent.",
    }
  }
  if (coverage_state === "ERROR") {
    return {
      state: "ERROR",
      message: "Attack-path serve error — retry after the next projection.",
    }
  }
  if (coverage_state === "PARTIAL") {
    return {
      state: "PARTIAL",
      message:
        "Attack-path coverage is partial — do not treat an empty map as clear.",
    }
  }
  if (coverage_state === "READY_ZERO") {
    return {
      state: "READY_ZERO",
      message: "No attack paths to this crown jewel in the active projection.",
    }
  }
  return {
    state: "EMPTY",
    message: "No attack paths to this crown jewel today.",
  }
}

export function Zoom0FanInPanel({
  systemName,
  jewel,
  paths,
  selectedPathId,
  onRequestMode,
  onClearPath,
  isExpanded = false,
}: {
  systemName: string
  jewel: CrownJewelSummary
  paths: IdentityAttackPath[]
  /** Investigation pin — spotlights one path on the Attack Map when set. */
  selectedPathId: string | null
  /** Optional: jump to full Lateral Movement / Exfiltration presentation. */
  onRequestMode?: (mode: "lateral" | "exfil") => void
  /** Clear ?path= pin and return to fan-in selection. */
  onClearPath?: () => void
  /** When map expand hides left columns, keep fan-in chrome pinned. */
  isExpanded?: boolean
}) {
  const cjArn =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null)
  const convergenceJewel = crownJewelFromArnName(cjArn, jewel.name)

  // Fan-in model: never pin a single path_id into the detail fetch.
  // Pinning would load hops for only one sibling (often Lambda) and paint
  // a false "IAM-only" map over EC2 paths that still have network hops.
  const {
    data,
    loading,
    error,
    retry,
    detailsLoading,
    detailsReady,
    detailFailures,
  } = useCrownJewelConvergence(systemName, convergenceJewel, null, paths)

  const iapFallback = useMemo(() => {
    if (paths.length === 0) return null
    return iapPathsToConvergence(systemName, jewel, paths)
  }, [systemName, jewel, paths])

  const effective = useMemo(
    () => resolveZoom0Effective(data, iapFallback, error),
    [data, iapFallback, error],
  )
  const fanInDrawability = useMemo(
    () => summarizeFanInDrawability(effective.data?.paths ?? []),
    [effective.data?.paths],
  )

  const [tileFilterIds, setTileFilterIds] = useState<string[] | null>(null)
  const [detailsPanel, setDetailsPanel] =
    useState<Zoom0DetailsPanel>("current_access")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pinPathId = useMemo(
    () => resolveZoom0PinPathId(effective.data, selectedPathId, paths),
    [effective.data, selectedPathId, paths],
  )

  // Pin forces Current Access — dossier is the investigation surface.
  useEffect(() => {
    if (pinPathId) setDetailsPanel("current_access")
  }, [pinPathId])

  const spotlightPaths = useMemo(() => {
    if (!effective.data) return []
    return zoom0SpotlightPaths(effective.data, tileFilterIds, pinPathId)
  }, [effective.data, tileFilterIds, pinPathId])

  const pinnedPath = useMemo(() => {
    if (!effective.data || !pinPathId) return null
    return findPinnedConvergencePath(effective.data.paths, pinPathId)
  }, [effective.data, pinPathId])

  const dossier = useMemo(
    () => (pinPathId ? buildCurrentAccessDossier(pinnedPath) : null),
    [pinPathId, pinnedPath],
  )

  /* Composed feasibility for the path actually being DRAWN. Single path only:
     a verdict spanning several paths would be a composite claim we cannot make. */
  const verdictPath = useMemo(() => {
    if (pinnedPath) return pinnedPath
    return spotlightPaths.length === 1 ? spotlightPaths[0] : null
  }, [pinnedPath, spotlightPaths])

  const pathVerdict = useMemo(() => {
    if (!verdictPath) return null
    return composePathVerdict({
      routeGate: verdictPath.route_gate ?? null,
      // The SPECIFIC verdict wins over route_gate. Shipped reversed: an
      // OPEN_CONFIG gate read as reachable while the verdict said
      // EXECUTION_LOCATION_UNBOUND.
      routeVerdict: extractRouteVerdictToken(verdictPath.route_verdict),
      coverageState: zoom0ServeCoverage(effective.data).coverage_state,
      observedTrafficBound: pathHasObservedNetworkEvidence(
        [verdictPath],
        verdictPath.path_id,
      ),
      roleAssumptionObserved: Boolean(verdictPath.role_assumption_observed),
      // No path-bound data-plane observation on the DTO, so this stays
      // CONFIGURED. Failing closed is the point.
      dataAccessObserved: false,
    })
  }, [verdictPath, effective.data])

  const riskSummary = useMemo(
    () => zoom0RiskSummary(effective.data),
    [effective.data],
  )

  const lateralIdentityId = useMemo(() => {
    return (
      riskSummary?.top_risk?.identity ??
      riskSummary?.identity ??
      riskSummary?.current_state?.identity ??
      null
    )
  }, [riskSummary])

  const collapsed =
    effective.data != null &&
    shouldCollapseToChokeTiles(
      effective.data.paths_total || effective.data.paths.length,
      CHOKE_TILE_THRESHOLD,
    )

  const hideMapUntilTile =
    collapsed && (!tileFilterIds || tileFilterIds.length === 0)

  const detailsSubtitle =
    detailsPanel === "lateral"
      ? "Lateral details — blast from the on-path identity (DTO fan-out, not the kill-chain spine)"
      : detailsPanel === "exfiltration"
        ? "Exfiltration details — configured egress from this jewel (observed transport when collected)"
        : pinPathId
          ? "Current Access dossier — pinned path investigation (credential → network → authz → data → damage → cut)"
          : "Current Access — fan-in selection surface; pin a path to open the dossier"

  const openRankedPath = () => {
    const pathId =
      riskSummary?.top_risk?.path_id ?? riskSummary?.path_id ?? null
    if (!pathId) return
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("path", pathId)
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.push(`${pathname}?${params.toString()}`)
  }

  const clearPin = () => {
    if (onClearPath) {
      onClearPath()
      return
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.delete("path")
    router.replace(`${pathname}?${params.toString()}`)
  }

  const renderDetailsTabs = (surface: "panel" | "fullscreen") => (
    <div
      className={`flex shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1 ${
        surface === "panel" && !isExpanded ? "w-full" : ""
      }`}
      data-testid={
        surface === "fullscreen"
          ? "zoom0-fullscreen-map-details"
          : "zoom0-map-details"
      }
      role="tablist"
      aria-label={
        surface === "fullscreen"
          ? "Jewel details in fullscreen map"
          : "Jewel details"
      }
    >
      {(
        [
          { id: "current_access" as const, label: "Current Access", Icon: Zap },
          { id: "lateral" as const, label: "Lateral", Icon: Sliders },
          { id: "exfiltration" as const, label: "Exfiltration", Icon: Network },
        ]
      ).map(({ id, label, Icon }) => {
        const on = detailsPanel === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setDetailsPanel(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1.5 font-mono text-xs transition-all ${
              surface === "panel" && !isExpanded ? "flex-1 justify-center" : ""
            } ${
              on
                ? id === "current_access"
                  ? "border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                  : id === "lateral"
                    ? "border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                    : "border border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      className={`flex flex-col min-h-0 ${isExpanded ? "flex-1 h-full overflow-hidden" : "h-full"}`}
      data-testid="zoom0-fan-in"
      data-expanded={isExpanded ? "true" : "false"}
    >
      <div
        className={`px-6 py-3 border-b border-border bg-background shrink-0 z-10 ${
          isExpanded ? "sticky top-0 shadow-sm" : ""
        }`}
        data-testid="zoom0-fan-in-bar"
      >
        <div
          className={`flex flex-col gap-3 ${
            isExpanded ? "sm:flex-row sm:items-start sm:justify-between" : ""
          }`}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
              Jewel fan-in
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {(() => {
                const cardinality = effective.data?.cardinality
                const drawn = spotlightPaths.length
                if (cardinality) {
                  return (
                    <>
                      Neo4j paths to{" "}
                      <span className="font-mono text-foreground">{jewel.name}</span>
                      {" "}
                      — {zoom0CardinalityLine(cardinality, fanInDrawability)}.
                      {pinPathId
                        ? " Path pinned — dossier is authoritative for this investigation."
                        : " Sorted on the left by Reachable Damage Priority — pick a path to pin."}
                    </>
                  )
                }
                const classes = jewel.class_counts ?? {}
                const inSystem =
                  typeof classes.in_system === "number" ? classes.in_system : null
                const outOfScope =
                  (typeof classes.platform_access === "number"
                    ? classes.platform_access
                    : 0) +
                  (typeof classes.service_linked === "number"
                    ? classes.service_linked
                    : 0) +
                  (typeof classes.external_pivot === "number"
                    ? classes.external_pivot
                    : 0)
                const scopeNote =
                  outOfScope > 0
                    ? ` · ${outOfScope} platform/out-of-scope path${outOfScope === 1 ? "" : "s"} not drawn`
                    : ""
                return (
                  <>
                    Neo4j paths to{" "}
                    <span className="font-mono text-foreground">{jewel.name}</span>
                    {" "}({drawn} drawn
                    {inSystem != null ? ` · ${inSystem} in-system` : ""}
                    {scopeNote}) on the Attack Map.
                    {" "}
                    <span className="text-amber-700 dark:text-amber-400">
                      Cardinality unavailable — showing returned paths only; not
                      the full generation.
                    </span>
                    {" "}
                    Sorted on the left by Reachable Damage Priority — pick a
                    path to pin.
                  </>
                )
              })()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{detailsSubtitle}</p>
            {effective.source === "fallback" ? (
              <p
                className="text-[11px] text-amber-700 dark:text-amber-400 mt-1"
                data-testid="zoom0-non-authoritative-preview"
              >
                Non-authoritative preview — convergence API unreachable; Attack
                Map stays blank until SERVE hop DTOs load. Not SERVE truth.
              </p>
            ) : null}
            {detailFailures.length > 0 &&
            effective.source === "live" &&
            detailsReady &&
            !detailsLoading ? (
              <p
                className="text-[11px] text-amber-700 dark:text-amber-400 mt-1"
                data-testid="zoom0-partial-detail-failure"
              >
                Drew {spotlightPaths.length} of{" "}
                {(effective.data?.paths ?? []).length} path
                {(effective.data?.paths ?? []).length === 1 ? "" : "s"} — hop
                detail failed for {detailFailures.length} path
                {detailFailures.length === 1 ? "" : "s"} (
                {detailFailures
                  .slice(0, 3)
                  .map((f) => f.pathId)
                  .join(", ")}
                {detailFailures.length > 3
                  ? ` +${detailFailures.length - 3} more`
                  : ""}
                ). Map is incomplete — not a clear estate.
              </p>
            ) : null}
          </div>

          {/* Details panels — not genuine map lenses until canvas DTOs land */}
          {renderDetailsTabs("panel")}
        </div>

        {/* Composed feasibility, ABOVE the risk summary and the graph.
            The graph draws a clean three-node chain that reads as a completed
            attack path, while the DTO behind it said coverage PARTIAL, route
            verdict EXECUTION_LOCATION_UNBOUND, and a configured-not-observed
            data edge. The verdict must be read first, not found as a detail. */}
        {pathVerdict ? (
          <div
            className={`mt-3 rounded-md border px-3 py-2 ${
              pathVerdict.isFinding
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-muted/20"
            }`}
            data-testid="zoom0-path-verdict"
            data-path-feasibility={pathVerdict.feasibility}
            data-path-verdict-finding={pathVerdict.isFinding ? "true" : "false"}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Overall
              </span>
              <span
                className={`text-[13px] font-bold uppercase tracking-wide ${
                  pathVerdict.isFinding
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-foreground"
                }`}
              >
                {pathVerdict.headline}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {pathVerdict.reason}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {`Observed traffic: ${
                pathVerdict.observedTrafficBound
                  ? "bound to this path"
                  : "none bound to this path"
              }`}
            </p>
            <div className="mt-2 divide-y divide-border border-t border-border">
              {pathVerdict.checkpoints.map((c) => (
                <div
                  key={c.key}
                  className="flex items-baseline justify-between gap-3 py-1"
                  data-checkpoint={c.key}
                  data-checkpoint-state={c.state}
                >
                  <span className="text-[11px] text-muted-foreground">
                    {c.label}
                  </span>
                  <span
                    title={c.detail}
                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                      c.state === "VERIFIED"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : c.state === "BLOCKED"
                          ? "text-sky-700 dark:text-sky-300"
                          : c.state === "CONFIGURED"
                            ? "text-foreground"
                            : "text-muted-foreground"
                    }`}
                  >
                    {c.state}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] italic text-muted-foreground">
              {pathVerdict.feasibility === "REACHABLE_NOW"
                ? "Every checkpoint composed — reachable now."
                : pathVerdict.feasibility === "BLOCKED"
                  ? "A checkpoint prevents this path."
                  : "Candidate path — a configured access chain, not proven reachable."}
            </p>
          </div>
        ) : null}

        {riskSummary ? (
          <details
            className="mt-3 rounded-md border border-border bg-muted/20"
            data-testid="zoom0-risk-summary-disclosure"
          >
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              Risk summary
              {riskSummary.severity_label
                ? ` · ${riskSummary.severity_label}`
                : ""}
              {` · ${riskSummary.observed_paths} observed · ${riskSummary.configured_paths} configured`}
              {typeof riskSummary.unverified_paths === "number"
                ? ` · ${riskSummary.unverified_paths} unverified`
                : ""}
            </summary>
            <div className="border-t border-border p-2">
              <Zoom0RiskHeader
                risk={riskSummary}
                onMitigate={
                  riskSummary.top_risk?.path_id || riskSummary.path_id
                    ? openRankedPath
                    : undefined
                }
              />
            </div>
          </details>
        ) : !loading && effective.data ? (
          <p
            className="mt-3 text-[11px] text-muted-foreground"
            data-testid="zoom0-risk-summary-unavailable"
          >
            Risk summary unavailable — waiting for server-authored jewel header.
          </p>
        ) : null}

        {detailsPanel === "lateral" ? (
          <div className="mt-3 space-y-2">
            <p
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200"
              data-testid="zoom0-lens-not-authoritative"
            >
              Not yet authoritative — contracts pending
            </p>
            {lateralIdentityId ? (
              <Zoom0LateralLensPanel
                systemName={systemName}
                jewel={jewel}
                identityId={lateralIdentityId}
                identityName={
                  riskSummary?.top_risk?.identity_name ??
                  riskSummary?.identity_name ??
                  null
                }
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No path identity yet — wait for jewel risk summary.
              </p>
            )}
            {onRequestMode ? (
              <button
                type="button"
                onClick={() => onRequestMode("lateral")}
                className="text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                data-testid="zoom0-open-lateral-movement"
              >
                Open full Lateral Movement view →
              </button>
            ) : null}
          </div>
        ) : null}
        {detailsPanel === "exfiltration" ? (
          <div className="mt-3 space-y-2">
            <p
              className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-900 dark:text-violet-200"
              data-testid="zoom0-lens-not-authoritative"
            >
              Not yet authoritative — contracts pending
            </p>
            <Zoom0ExfilLensPanel systemName={systemName} jewel={jewel} />
            {onRequestMode ? (
              <button
                type="button"
                onClick={() => onRequestMode("exfil")}
                className="text-[11px] font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
                data-testid="zoom0-open-exfiltration"
              >
                Open full Exfiltration view →
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Dossier lives in sticky chrome so overflow-hidden map ancestors cannot clip it. */}
        {pinPathId && detailsPanel === "current_access" ? (
          <div className="mt-3 max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-border">
            <CurrentAccessDossierPanel
              dossier={dossier}
              jewelName={jewel.name}
              hopsPending={
                Boolean(pinPathId) &&
                (!detailsReady ||
                  detailsLoading ||
                  pinnedPath?.hops_load_state === "pending")
              }
              onClearPin={clearPin}
            />
          </div>
        ) : null}
      </div>

      {loading && !effective.data?.paths?.length ? (
        <div className="flex flex-1 min-h-[400px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading attack paths to this jewel…
        </div>
      ) : error && !effective.data?.paths?.length ? (
        <div className="flex flex-1 min-h-[400px] flex-col items-center justify-center gap-3 text-[12px] text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span>Couldn&apos;t load jewel fan-in: {error}</span>
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-1.5 text-foreground hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : !effective.data || effective.data.paths.length === 0 ? (
        (() => {
          const empty = zoom0EmptyCanvasMessage(effective.data)
          return (
            <div
              className="flex flex-1 min-h-[400px] items-center justify-center px-6 text-center text-[12px] text-muted-foreground"
              data-testid="zoom0-empty-canvas"
              data-empty-state={empty.state}
            >
              {empty.message}
            </div>
          )
        })()
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="shrink-0 px-4 pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-mono text-muted-foreground">
              {effective.data.cardinality ? (
                <span data-testid="zoom0-path-cardinality">
                  {zoom0CardinalityLine(
                    effective.data.cardinality,
                    fanInDrawability,
                  )}
                </span>
              ) : (
                <>
                  <span>{effective.data.paths_total} paths</span>
                  <span>{effective.data.observed_paths} observed</span>
                </>
              )}
              {effective.data.cj_type ? <span>{effective.data.cj_type}</span> : null}
              <span>
                {pinPathId
                  ? `investigating 1 of ${effective.data.cardinality?.eligible_total ?? effective.data.paths.length} eligible`
                  : hideMapUntilTile
                    ? "choke tiles — expand a group to draw the map"
                    : tileFilterIds
                      ? `${spotlightPaths.length} paths in tile`
                      : `${spotlightPaths.length} paths on Attack Map`}
              </span>
            </div>
            <ChokePointTilesBar
              data={effective.data}
              onFilterPathIds={setTileFilterIds}
            />
          </div>

          <div className="flex flex-1 min-h-0 flex-col">
            <div
              className="flex-1 min-h-0 relative px-2 pb-2"
              data-testid="zoom0-attack-map-slot"
            >
              {hideMapUntilTile ? (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground">
                  Many paths converge here. Expand a choke-point tile above to
                  draw that subset on the Attack Map — avoids spaghetti.
                </div>
              ) : effective.source === "fallback" ? (
                <div
                  className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-6 text-center text-[12px] text-amber-800 dark:text-amber-300"
                  data-testid="zoom0-fallback-map-blocked"
                >
                  Convergence API unreachable — refusing to draw a synthetic
                  Attack Map. Retry when SERVE hop DTOs are available.
                </div>
              ) : !detailsReady || detailsLoading ? (
                <div
                  className="flex h-full min-h-[360px] items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground"
                  data-testid="zoom0-path-details-loading"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading hop topology for all paths to this jewel…
                </div>
              ) : detailsPanel !== "current_access" ? (
                <div
                  className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-[12px] text-muted-foreground"
                  data-testid="zoom0-lens-map-unavailable"
                >
                  Not yet authoritative — contracts pending. Switch to Current Access
                  for the path-authority Attack Map.
                </div>
              ) : spotlightPaths.length === 0 ? (
                <div
                  className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground"
                  data-testid="zoom0-path-details-unavailable"
                >
                  {detailFailures.length > 0
                    ? `Hop detail failed for all ${detailFailures.length} path${detailFailures.length === 1 ? "" : "s"} — cannot draw an honest Attack Map.`
                    : "Path hop details unavailable — cannot draw an honest Attack Map."}
                </div>
              ) : (
                <div
                  className={`h-full overflow-hidden ${
                    isExpanded ? "min-h-0" : "min-h-[480px]"
                  }`}
                >
                  <TrafficFlowMap
                    key={`zoom0-tfm-${detailsPanel}-${pinPathId ?? "all"}-${spotlightPaths.map((p) => p.path_id).join(",")}`}
                    systemName={systemName}
                    spotlightPaths={spotlightPaths}
                    spotlightPathId={pinPathId}
                    // Path-authority honesty (P0a/P0b): Current Access draws
                    // only selected-path DTO hops/edges — no dep-map estate
                    // merge, no same-VPC IGW invention, no unbound traffic.
                    pathAuthorityOnly
                    pathEligibleTotal={
                      effective.data.cardinality?.eligible_total ?? null
                    }
                    spotlightJewel={{
                      id: jewel.id,
                      canonical_id: jewel.canonical_id ?? cjArn,
                      name: jewel.name,
                      type: jewel.type,
                    }}
                    titleOverride="Attack Map"
                    innerTitleOverride={
                      pinPathId ? "Pinned path" : "Jewel fan-in"
                    }
                    innerSubtitleOverride={
                      pinPathId
                        ? (() => {
                            const card = effective.data.cardinality
                            return card
                              ? `Compressed evidence view · investigating 1 · ${zoom0NofMLine(card)}`
                              : "Compressed evidence view · investigating 1 path"
                          })()
                        : (() => {
                            const card = effective.data.cardinality
                            if (card) {
                              return `Compressed evidence view · ${zoom0CardinalityLine(card, fanInDrawability)} · observed vs configured`
                            }
                            const classes = jewel.class_counts ?? {}
                            const outOfScope =
                              (classes.platform_access ?? 0) +
                              (classes.service_linked ?? 0) +
                              (classes.external_pivot ?? 0)
                            return outOfScope > 0
                              ? `Compressed evidence view · ${fanInDrawability.drawnCount} drawn · ${outOfScope} platform/out-of-scope not shown`
                              : `Compressed evidence view · ${fanInDrawability.drawnCount} drawn · observed vs configured`
                          })()
                    }
                    pathBadgeOverride={
                      pinPathId
                        ? `1 pinned → ${jewel.name}`
                        : `${spotlightPaths.length} shown → ${jewel.name}`
                    }
                    observedMode
                    canvasV2
                    jewelEmphasis
                    fullscreenHeaderSlot={renderDetailsTabs("fullscreen")}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
