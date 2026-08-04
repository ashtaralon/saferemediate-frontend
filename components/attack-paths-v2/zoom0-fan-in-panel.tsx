"use client"

/**
 * Zoom 0 — jewel fan-in on the Attack Map engine (TrafficFlowMap).
 *
 * Same map as mode=attacker_map / Topology graph spotlight: TFM +
 * spotlightPaths from by-crown-jewel convergence. Adaptations for Zoom 0:
 *   - choke tiles when paths > threshold (filter spotlightPaths, no hairball)
 *   - no path URL yet — left list owns Zoom 1 drill-in
 *   - Current Access draws authoritative path topology and preserves each
 *     path's observed/configured evidence instead of hiding configured paths
 *   - Lateral runs ATLAS from an operator-selected compute foothold
 *   - Exfiltration explains the accessor-to-effective-exit chain
 */

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
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
import { pathVerdictFromServerFeasibility } from "@/lib/attack-paths/server-path-verdict"
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
import { useZoom0Exfil } from "./use-zoom0-exfil"
import { buildSelectedExfilArchitecture } from "./exfil-view-v3"
import { CurrentAccessDossierPanel } from "./current-access-dossier-panel"
import {
  AtlasLateralChainCanvas,
  AtlasLateralLensPanel,
} from "./atlas-lateral-lens"
import { useAtlasLateral } from "./use-atlas-lateral"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

/** Three distinct operator questions over the selected crown jewel. */
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

/** Current Access is behavior evidence, never configured or simulated reach. */
export function observedCurrentAccessPaths(
  paths: ConvergencePath[],
): ConvergencePath[] {
  return paths.filter((path) => {
    const activity = path.feasibility?.activity_state?.toUpperCase() ?? ""
    return (
      path.evidence?.toLowerCase() === "observed" ||
      activity.startsWith("OBSERVED")
    )
  })
}

/**
 * The Attack Path / Attack Map canvas is a topology surface, not an activity
 * classifier. Keep every authoritative, drawable SERVE path on the canvas and
 * let the path evidence/verdict chrome say whether it is observed, configured,
 * or unverified. Filtering the canvas to activity_state=OBSERVED made valid
 * configured paths disappear entirely for jewels whose execution location is
 * unbound.
 */
export function zoom0MapSpotlightPaths(
  paths: ConvergencePath[],
  detailsPanel: Zoom0DetailsPanel,
): ConvergencePath[] {
  return detailsPanel === "current_access" ? paths : []
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

  // Fan-in model: fetch EVERY summary path's hops (fanInAllDetails) so a
  // Lambda sibling cannot paint a false "IAM-only" map over EC2 paths that
  // still have subnet/SG/NACL hops. Pass the pin so /detail is pin-first,
  // then siblings at low concurrency with cold retries.
  const {
    data,
    loading,
    error,
    retry,
    detailsLoading,
    detailsReady,
    detailFailures,
  } = useCrownJewelConvergence(
    systemName,
    convergenceJewel,
    selectedPathId,
    paths,
    { fanInAllDetails: true },
  )

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

  // Pin opens Current Access dossier — deliberate for #451–453. Do NOT bounce
  // when the operator is already on Lateral (pin-while-on-Lateral friction).
  const prevPinRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevPinRef.current
    prevPinRef.current = pinPathId
    if (!pinPathId || pinPathId === prev) return
    if (detailsPanel === "lateral") return
    setDetailsPanel("current_access")
  }, [pinPathId, detailsPanel])

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
    /* SERVE is the ONLY authority. #642 made the backend own the composed
       verdict, so the frontend renders it literally or renders nothing.

       There is deliberately no local-compose fallback. A fallback that
       composes judgment locally is how Zoom0 quietly re-owns judgment: it
       looks like resilience, and it means two authorities can disagree with
       no way for an operator to tell which one they are reading. If SERVE
       omits feasibility, the honest answer is "unavailable", not a second
       opinion assembled from raw gates. */
    return pathVerdictFromServerFeasibility(
      verdictPath.feasibility as Record<string, unknown> | null | undefined,
    )
  }, [verdictPath])

  const riskSummary = useMemo(
    () => zoom0RiskSummary(effective.data),
    [effective.data],
  )

  const lateralJewelId =
    jewel.canonical_id ??
    (jewel.id.startsWith("arn:") ? jewel.id : jewel.name) ??
    null

  const atlasLateral = useAtlasLateral({
    systemName,
    jewelRef: lateralJewelId,
    enabled: detailsPanel === "lateral",
  })

  const zoom0Exfil = useZoom0Exfil({
    systemName,
    jewel,
    enabled: detailsPanel === "exfiltration",
  })
  const [selectedExfilPathId, setSelectedExfilPathId] = useState<string | null>(null)
  useEffect(() => {
    if (detailsPanel !== "exfiltration") return
    const paths = zoom0Exfil.data?.paths ?? []
    if (selectedExfilPathId && paths.some((path) => path.path_id === selectedExfilPathId)) return
    setSelectedExfilPathId(paths[0]?.path_id ?? null)
  }, [detailsPanel, selectedExfilPathId, zoom0Exfil.data])
  const selectedExfilPath = useMemo(
    () => zoom0Exfil.data?.paths?.find((path) => path.path_id === selectedExfilPathId) ?? null,
    [selectedExfilPathId, zoom0Exfil.data],
  )
  const exfilArchitecture = useMemo(
    () => zoom0Exfil.data?.ok
      ? buildSelectedExfilArchitecture(zoom0Exfil.data, selectedExfilPath)
      : null,
    [selectedExfilPath, zoom0Exfil.data],
  )

  const mapSpotlightPaths = useMemo(() => {
    return zoom0MapSpotlightPaths(spotlightPaths, detailsPanel)
  }, [detailsPanel, spotlightPaths])

  const mapObservedPathCount = useMemo(
    () => observedCurrentAccessPaths(mapSpotlightPaths).length,
    [mapSpotlightPaths],
  )
  const mapConfiguredPathCount =
    mapSpotlightPaths.length - mapObservedPathCount
  const mapIsObservedOnly =
    mapSpotlightPaths.length > 0 && mapConfiguredPathCount === 0

  const mapSpotlightPathId =
    mapSpotlightPaths.some((path) => path.path_id === pinPathId)
      ? pinPathId
      : null

  const collapsed =
    effective.data != null &&
    shouldCollapseToChokeTiles(
      effective.data.paths_total || effective.data.paths.length,
      CHOKE_TILE_THRESHOLD,
    )

  const hideMapUntilTile =
    collapsed && (!tileFilterIds || tileFilterIds.length === 0)

  // Stable alias lets TypeScript preserve the non-null branch below across
  // the nested three-lens JSX without changing the runtime contract.
  const convergenceData = effective.data

  const detailsSubtitle =
    detailsPanel === "lateral"
      ? "Lateral — assume compromise of any compute service and replay attacker chains to this jewel"
      : detailsPanel === "exfiltration"
        ? "Exfiltration — accessor, workload, effective route and exit capability from this jewel"
        : pinPathId
          ? "Current Access dossier — pinned path investigation (credential → network → authz → data → damage → cut)"
          : "Current Access — observed service and identity use of this jewel"

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
            data-path-state={pathVerdict.pathState}
            data-activity-state={pathVerdict.activityState}
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
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Activity
              </span>
              {/* Separate axis. Observation says whether it HAS happened, never
                  whether an attacker CAN — that conflation was the defect. */}
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                {pathVerdict.activityState.replace(/_/g, " ")}
              </span>
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="zoom0-activity-detail"
              >
                — {pathVerdict.activityDetail}
              </span>
            </div>
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
                      c.state === "PASS"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : c.state === "OPEN"
                          ? "text-foreground"
                          : c.state === "BLOCKED"
                            ? "text-sky-700 dark:text-sky-300"
                            : "text-muted-foreground"
                    }`}
                  >
                    {c.state === "OPEN" ? "ROUTE OPEN" : c.state}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] italic text-muted-foreground">
              {pathVerdict.pathState === "REACHABLE"
                ? "Every required checkpoint returned a server-backed pass."
                : pathVerdict.pathState === "BLOCKED"
                  ? "A server-backed control stops this path."
                  : pathVerdict.pathState === "OUT_OF_SCOPE"
                    ? "Outside the assessed scope."
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
            <AtlasLateralLensPanel
              candidates={atlasLateral.candidates}
              selectedFootholdId={atlasLateral.selectedFootholdId}
              selectedFoothold={atlasLateral.selectedFoothold}
              response={atlasLateral.response}
              evaluation={atlasLateral.evaluation}
              candidatesLoading={atlasLateral.candidatesLoading}
              simulationLoading={atlasLateral.simulationLoading}
              error={atlasLateral.error}
              onSelectFoothold={atlasLateral.selectFoothold}
              onRetry={atlasLateral.retry}
            />
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
            <Zoom0ExfilLensPanel
              data={zoom0Exfil.data ?? null}
              loading={zoom0Exfil.loading}
              error={zoom0Exfil.error}
              retry={zoom0Exfil.retry}
              selectedPathId={selectedExfilPathId}
              onSelectPath={setSelectedExfilPathId}
            />
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

      {detailsPanel === "current_access" && loading && !convergenceData?.paths?.length ? (
        <div className="flex flex-1 min-h-[400px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading attack paths to this jewel…
        </div>
      ) : detailsPanel === "current_access" && error && !convergenceData?.paths?.length ? (
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
      ) : detailsPanel === "current_access" &&
        (!convergenceData || convergenceData.paths.length === 0) ? (
        (() => {
          const empty = zoom0EmptyCanvasMessage(convergenceData)
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
      ) : detailsPanel === "lateral" ? (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 min-h-0 relative px-2 pb-2">
            <AtlasLateralChainCanvas
              selectedFoothold={atlasLateral.selectedFoothold}
              response={atlasLateral.response}
              loading={
                atlasLateral.candidatesLoading || atlasLateral.simulationLoading
              }
              jewelName={jewel.name}
              evaluation={atlasLateral.evaluation}
              recommendedFoothold={atlasLateral.candidates.find((candidate) => candidate.atlas_evaluation?.state === "REACHABLE") ?? null}
              onSelectFoothold={atlasLateral.selectFoothold}
            />
          </div>
        </div>
      ) : detailsPanel === "exfiltration" ? (
        <div className="flex flex-1 min-h-0 flex-col px-2 pb-2">
          {zoom0Exfil.loading && !zoom0Exfil.data ? (
            <div className="flex h-full min-h-[440px] items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400/40 bg-violet-500/5 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Mapping accessor, workload, effective route and exit…
            </div>
          ) : zoom0Exfil.error && !zoom0Exfil.data ? (
            <div className="flex h-full min-h-[440px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-red-400/40 bg-red-500/5 text-[12px] text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" /> {zoom0Exfil.error}
              <button type="button" onClick={zoom0Exfil.retry} className="underline">Retry</button>
            </div>
          ) : !selectedExfilPath || !exfilArchitecture ? (
            <div className="flex h-full min-h-[440px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground">
              No accessor-to-exit path is available to draw. Review the coverage statement above before treating this jewel as contained.
            </div>
          ) : (
            <div className={`h-full overflow-hidden ${isExpanded ? "min-h-0" : "min-h-[520px]"}`} data-testid="zoom0-exfil-interactive-map">
              <TrafficFlowMap
                key={`zoom0-exfil-${selectedExfilPath.path_id}`}
                systemName={systemName}
                architectureOverride={exfilArchitecture}
                observedMode={selectedExfilPath.accessor_provenance === "observed"}
                titleOverride="Exfiltration Map"
                innerTitleOverride={`Exfil path · ${selectedExfilPath.channel_label}`}
                innerSubtitleOverride={`${selectedExfilPath.accessor_name} · ${selectedExfilPath.workload_count} workload${selectedExfilPath.workload_count === 1 ? "" : "s"} · ${selectedExfilPath.gateway_count} effective exit${selectedExfilPath.gateway_count === 1 ? "" : "s"}`}
                pathBadgeOverride={`${jewel.name} → ${selectedExfilPath.destination_label ?? selectedExfilPath.channel_label}`}
                defaultShowVPCBoundaries
                fullscreenHeaderSlot={renderDetailsTabs("fullscreen")}
              />
            </div>
          )}
        </div>
      ) : (() => {
        // The preceding non-lateral empty branch guarantees this. Keep an
        // explicit local guard because TypeScript does not narrow through a
        // long nested JSX conditional reliably.
        if (!convergenceData) return null
        return (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="shrink-0 px-4 pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-mono text-muted-foreground">
              {convergenceData.cardinality ? (
                <span data-testid="zoom0-path-cardinality">
                  {zoom0CardinalityLine(
                    convergenceData.cardinality,
                    fanInDrawability,
                  )}
                </span>
              ) : (
                <>
                  <span>{convergenceData.paths_total} paths</span>
                  <span>{convergenceData.observed_paths} observed</span>
                </>
              )}
              {convergenceData.cj_type ? <span>{convergenceData.cj_type}</span> : null}
              <span>
                {pinPathId
                  ? `investigating 1 of ${convergenceData.cardinality?.eligible_total ?? convergenceData.paths.length} eligible`
                  : hideMapUntilTile
                    ? "choke tiles — expand a group to draw the map"
                    : tileFilterIds
                      ? `${spotlightPaths.length} paths in tile`
                      : `${spotlightPaths.length} paths on Attack Map`}
              </span>
            </div>
            <ChokePointTilesBar
              data={convergenceData}
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
              ) : mapSpotlightPaths.length === 0 ? (
                <div
                  className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground"
                  data-testid="zoom0-path-details-unavailable"
                >
                  {detailFailures.length > 0
                    ? `Hop detail failed for all ${detailFailures.length} path${detailFailures.length === 1 ? "" : "s"} — cannot draw an honest Attack Map.`
                    : "No observed access path is available for the selected view. Configured capability remains in Lateral."}
                </div>
              ) : (
                <div
                  className={`h-full overflow-hidden ${
                    isExpanded ? "min-h-0" : "min-h-[480px]"
                  }`}
                  data-testid="zoom0-current-access-tfm"
                >
                  <TrafficFlowMap
                    key={`zoom0-tfm-${detailsPanel}-${mapSpotlightPathId ?? "all"}-${mapSpotlightPaths.map((p) => p.path_id).join(",")}`}
                    systemName={systemName}
                    spotlightPaths={mapSpotlightPaths}
                    spotlightPathId={mapSpotlightPathId}
                    // Path-authority honesty: draw only selected SERVE DTO
                    // hops/edges — no dep-map estate merge, same-VPC IGW
                    // invention, or inferred topology. Evidence remains on the
                    // individual path and is never promoted to "observed" here.
                    pathAuthorityOnly
                    pathEligibleTotal={
                      convergenceData.cardinality?.eligible_total ?? null
                    }
                    spotlightJewel={{
                      id: jewel.id,
                      canonical_id: jewel.canonical_id ?? cjArn,
                      name: jewel.name,
                      type: jewel.type,
                    }}
                    titleOverride="Attack Map"
                    innerTitleOverride={mapSpotlightPathId ? "Pinned path" : "Authoritative paths"}
                    innerSubtitleOverride={
                      mapSpotlightPathId
                        ? (() => {
                            const card = convergenceData.cardinality
                            const evidence = mapIsObservedOnly
                              ? "observed"
                              : "configured / unverified"
                            return card
                              ? `${evidence} path evidence · investigating 1 · ${zoom0NofMLine(card)}`
                              : `${evidence} path evidence · investigating 1 path`
                          })()
                        : (() => {
                            const card = convergenceData.cardinality
                            const evidenceLine = `${mapObservedPathCount} observed · ${mapConfiguredPathCount} configured / unverified`
                            if (card) {
                              return `Authoritative path topology · ${mapSpotlightPaths.length} shown · ${evidenceLine}`
                            }
                            const classes = jewel.class_counts ?? {}
                            const outOfScope =
                              (classes.platform_access ?? 0) +
                              (classes.service_linked ?? 0) +
                              (classes.external_pivot ?? 0)
                            return outOfScope > 0
                              ? `Authoritative path topology · ${mapSpotlightPaths.length} shown · ${evidenceLine} · ${outOfScope} platform/out-of-scope not shown`
                              : `Authoritative path topology · ${mapSpotlightPaths.length} shown · ${evidenceLine}`
                          })()
                    }
                    pathBadgeOverride={
                      mapSpotlightPathId
                        ? `1 pinned → ${jewel.name}`
                        : `${mapSpotlightPaths.length} paths → ${jewel.name}`
                    }
                    observedMode={mapIsObservedOnly}
                    canvasV2
                    jewelEmphasis
                    fullscreenHeaderSlot={renderDetailsTabs("fullscreen")}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
