"use client"

/**
 * Zoom 0 — jewel fan-in on the Attack Map engine (TrafficFlowMap).
 *
 * Same map as mode=attacker_map / Topology graph spotlight: TFM +
 * spotlightPaths from by-crown-jewel convergence. Adaptations for Zoom 0:
 *   - choke tiles when paths > threshold (filter spotlightPaths, no hairball)
 *   - no path URL yet — left list owns Zoom 1 drill-in
 *   - details panels (Reachability / Lateral / Exfiltration) — presentation
 *     filters until genuine lens canvases land; restored from TargetAttackMap
 *   - canvasV2 so the Laterals bright/dim toolbar control is visible
 */

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
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
} from "@/lib/attack-paths/convergence-types"
import { pathsWithAuthoritativeHops } from "@/lib/attack-paths/convergence-path-details"
import {
  crownJewelFromArnName,
  useCrownJewelConvergence,
} from "@/lib/attack-paths/use-crown-jewel-convergence"
import {
  iapPathsToConvergence,
} from "@/lib/attack-paths/iap-to-convergence"
import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import { ChokePointTilesBar } from "./choke-point-tiles-bar"
import {
  CHOKE_TILE_THRESHOLD,
  shouldCollapseToChokeTiles,
} from "./choke-point-tiles"
import { Zoom0RiskHeader } from "./zoom0-risk-header"
import { Zoom0ExfilLensPanel } from "./zoom0-exfil-lens-panel"
import { Zoom0LateralLensPanel } from "./zoom0-lateral-lens-panel"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

/** Details-panel selector — presentation filter, not a real map lens yet. */
export type Zoom0DetailsPanel = "reachability" | "lateral" | "exfiltration"
/** @deprecated Use Zoom0DetailsPanel — kept for short-term import compat. */
export type Zoom0MapLens = Zoom0DetailsPanel

/** Pure: which convergence paths feed TFM spotlight for Zoom 0. */
export function zoom0SpotlightPaths(
  data: CrownJewelConvergence,
  tileFilterIds: string[] | null,
): ConvergencePath[] {
  let paths = data.paths
  if (tileFilterIds && tileFilterIds.length > 0) {
    const allow = new Set(tileFilterIds)
    paths = paths.filter((p) => allow.has(p.path_id))
  }
  // Union all (workload) paths to the jewel — same selectSpotlightPaths(null)
  // as dependency-map CJ spotlight. Only paths with settled hop DTOs —
  // pending summary rows must not paint a false "no network" spine.
  return pathsWithAuthoritativeHops(selectSpotlightPaths(paths, null))
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
  selectedPathId: _selectedPathId,
  onRequestMode,
  isExpanded = false,
}: {
  systemName: string
  jewel: CrownJewelSummary
  paths: IdentityAttackPath[]
  /** Call-site compat; fan-in always loads hop detail for all paths. */
  selectedPathId: string | null
  /** Optional: jump to full Lateral Movement / Exfiltration presentation. */
  onRequestMode?: (mode: "lateral" | "exfil") => void
  /** When map expand hides left columns, keep fan-in chrome pinned. */
  isExpanded?: boolean
}) {
  const cjArn =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null)
  const convergenceJewel = crownJewelFromArnName(cjArn, jewel.name)

  // Fan-in model: never pin a single path_id into the detail fetch.
  // Pinning would load hops for only one sibling (often Lambda) and paint
  // a false "IAM-only" map over EC2 paths that still have network hops.
  const { data, loading, error, retry, detailsLoading, detailsReady } =
    useCrownJewelConvergence(systemName, convergenceJewel, null, paths)

  const iapFallback = useMemo(() => {
    if (paths.length === 0) return null
    return iapPathsToConvergence(systemName, jewel, paths)
  }, [systemName, jewel, paths])

  const effective = useMemo(
    () => resolveZoom0Effective(data, iapFallback, error),
    [data, iapFallback, error],
  )

  const [tileFilterIds, setTileFilterIds] = useState<string[] | null>(null)
  const [detailsPanel, setDetailsPanel] =
    useState<Zoom0DetailsPanel>("reachability")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const spotlightPaths = useMemo(() => {
    if (!effective.data) return []
    return zoom0SpotlightPaths(effective.data, tileFilterIds)
  }, [effective.data, tileFilterIds])

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
        : "Reachability details — initial-access paths to this crown jewel (default map)"

  const openRankedPath = () => {
    const pathId =
      riskSummary?.top_risk?.path_id ?? riskSummary?.path_id ?? null
    if (!pathId) return
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("path", pathId)
    if (!params.get("system") && systemName) params.set("system", systemName)
    router.push(`${pathname}?${params.toString()}`)
  }

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
              Jewel fan-in
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {(() => {
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
                // Drawn = paths actually returned for the map (Neo4j in-scope).
                const drawn = paths.length
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
                    {scopeNote}) on the Attack Map. Sorted on the left by
                    Reachable Damage Priority — pick a path to investigate.
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
                Non-authoritative preview — convergence API unreachable; map
                uses legacy IAP paths. Not SERVE truth.
              </p>
            ) : null}
          </div>

          {/* Details panels — not genuine map lenses until canvas DTOs land */}
          <div
            className="flex shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1"
            data-testid="zoom0-map-details"
            role="tablist"
            aria-label="Jewel details"
          >
            {(
              [
                { id: "reachability" as const, label: "Reachability", Icon: Zap },
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
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-xs transition-all ${
                    on
                      ? id === "reachability"
                        ? "border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                        : id === "lateral"
                          ? "border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                          : "border border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {riskSummary ? (
          <div className="mt-3">
            <Zoom0RiskHeader
              risk={riskSummary}
              onMitigate={
                riskSummary.top_risk?.path_id || riskSummary.path_id
                  ? openRankedPath
                  : undefined
              }
            />
          </div>
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
              <span>{effective.data.paths_total} paths</span>
              <span>{effective.data.observed_paths} observed</span>
              {effective.data.cj_type ? <span>{effective.data.cj_type}</span> : null}
              <span>
                {hideMapUntilTile
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

          <div
            className="flex-1 min-h-0 relative px-2 pb-2"
            data-testid="zoom0-attack-map-slot"
          >
            {hideMapUntilTile ? (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground">
                Many paths converge here. Expand a choke-point tile above to
                draw that subset on the Attack Map — avoids spaghetti.
              </div>
            ) : !detailsReady || detailsLoading ? (
              <div
                className="flex h-full min-h-[360px] items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground"
                data-testid="zoom0-path-details-loading"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hop topology for all paths to this jewel…
              </div>
            ) : spotlightPaths.length === 0 ? (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-[12px] text-muted-foreground">
                Path hop details unavailable — cannot draw an honest Attack Map.
              </div>
            ) : (
              <div
                className={`h-full overflow-hidden ${
                  isExpanded ? "min-h-0" : "min-h-[480px]"
                }`}
              >
                <TrafficFlowMap
                  key={`zoom0-tfm-${detailsPanel}-${spotlightPaths.map((p) => p.path_id).join(",")}`}
                  systemName={systemName}
                  spotlightPaths={spotlightPaths}
                  spotlightPathId={null}
                  // Path-authority honesty (P0a/P0b): Reachability draws
                  // only selected-path DTO hops/edges — no dep-map estate
                  // merge, no same-VPC IGW invention, no unbound traffic.
                  pathAuthorityOnly
                  spotlightJewel={{
                    id: jewel.id,
                    canonical_id: jewel.canonical_id ?? cjArn,
                    name: jewel.name,
                    type: jewel.type,
                  }}
                  titleOverride="Attack Map"
                  innerTitleOverride="Jewel fan-in"
                  innerSubtitleOverride={
                    detailsPanel === "lateral"
                      ? "Lateral pivots on fan-in · Laterals bright"
                      : detailsPanel === "exfiltration"
                        ? "Paths that can reach data egress from this jewel"
                        : (() => {
                            const classes = jewel.class_counts ?? {}
                            const outOfScope =
                              (classes.platform_access ?? 0) +
                              (classes.service_linked ?? 0) +
                              (classes.external_pivot ?? 0)
                            const drawn = spotlightPaths.length
                            return outOfScope > 0
                              ? `${drawn} Neo4j path${drawn === 1 ? "" : "s"} drawn · ${outOfScope} platform/out-of-scope not shown · observed vs configured`
                              : `${drawn} Neo4j path${drawn === 1 ? "" : "s"} · observed vs configured`
                          })()
                  }
                  pathBadgeOverride={`${spotlightPaths.length} path${spotlightPaths.length === 1 ? "" : "s"} → ${jewel.name}`}
                  observedMode
                  canvasV2
                  jewelEmphasis
                  defaultShowLaterals={detailsPanel === "lateral"}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
