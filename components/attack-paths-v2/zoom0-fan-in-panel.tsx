"use client"

/**
 * Zoom 0 — jewel fan-in on the Attack Map engine (TrafficFlowMap).
 *
 * Same map as mode=attacker_map / Topology graph spotlight: TFM +
 * spotlightPaths from by-crown-jewel convergence. Adaptations for Zoom 0:
 *   - choke tiles when paths > threshold (filter spotlightPaths, no hairball)
 *   - no path URL yet — left list owns Zoom 1 drill-in
 *   - presentation lenses (Reachability / Lateral / Exfiltration) restored
 *     from the previous TargetAttackMap chrome
 *   - canvasV2 so the Laterals bright/dim toolbar control is visible
 */

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
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
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
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

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

/** Same lenses as TargetAttackMap — presentation filter, not a mode switch. */
export type Zoom0MapLens = "reachability" | "lateral" | "exfiltration"

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
  // as dependency-map CJ spotlight.
  return selectSpotlightPaths(paths, null)
}

export function Zoom0FanInPanel({
  systemName,
  jewel,
  paths,
  selectedPathId,
  onRequestMode,
}: {
  systemName: string
  jewel: CrownJewelSummary
  paths: IdentityAttackPath[]
  selectedPathId: string | null
  /** Optional: jump to full Lateral Movement / Exfiltration presentation. */
  onRequestMode?: (mode: "lateral" | "exfil") => void
}) {
  const cjArn =
    jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null)
  const convergenceJewel = crownJewelFromArnName(cjArn, jewel.name)

  const { data, loading, error, retry } = useCrownJewelConvergence(
    systemName,
    convergenceJewel,
    selectedPathId,
    paths,
  )

  const iapFallback = useMemo(() => {
    if (paths.length === 0) return null
    return iapPathsToConvergence(systemName, jewel, paths)
  }, [systemName, jewel, paths])

  const effective = useMemo(() => {
    if (data?.paths?.length) return { data, source: "live" as const }
    if (iapFallback?.paths?.length) {
      return { data: iapFallback, source: "fallback" as const }
    }
    return { data: data ?? null, source: "live" as const }
  }, [data, iapFallback])

  const [tileFilterIds, setTileFilterIds] = useState<string[] | null>(null)
  const [mapLens, setMapLens] = useState<Zoom0MapLens>("reachability")

  const spotlightPaths = useMemo(() => {
    if (!effective.data) return []
    return zoom0SpotlightPaths(effective.data, tileFilterIds)
  }, [effective.data, tileFilterIds])

  const collapsed =
    effective.data != null &&
    shouldCollapseToChokeTiles(
      effective.data.paths_total || effective.data.paths.length,
      CHOKE_TILE_THRESHOLD,
    )

  const hideMapUntilTile =
    collapsed && (!tileFilterIds || tileFilterIds.length === 0)

  const lensSubtitle =
    mapLens === "lateral"
      ? "Lateral — bright pivot edges + identity blast surface on the Attack Map"
      : mapLens === "exfiltration"
        ? "Exfiltration — data-egress doors from this jewel (full view via Exfiltration tab)"
        : "Reachability — all initial-access paths to this crown jewel"

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="zoom0-fan-in">
      <div className="px-6 py-3 border-b border-border bg-background shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Jewel fan-in
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Every initial-access path to{" "}
              <span className="font-mono text-foreground">{jewel.name}</span>
              {" "}({paths.length || effective.data?.paths_total || 0}) on the Attack Map.
              Sorted on the left by Reachable Damage Priority — pick a path to investigate.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{lensSubtitle}</p>
            {effective.source === "fallback" ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                Offline preview — convergence API unavailable; map uses IAP paths.
              </p>
            ) : null}
          </div>

          {/* Presentation lenses — same labels as the previous TargetAttackMap */}
          <div
            className="flex shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1"
            data-testid="zoom0-map-lenses"
            role="tablist"
            aria-label="Map presentation"
          >
            {(
              [
                { id: "reachability" as const, label: "Reachability", Icon: Zap },
                { id: "lateral" as const, label: "Lateral", Icon: Sliders },
                { id: "exfiltration" as const, label: "Exfiltration", Icon: Network },
              ]
            ).map(({ id, label, Icon }) => {
              const on = mapLens === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setMapLens(id)}
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

        {mapLens === "lateral" && onRequestMode ? (
          <button
            type="button"
            onClick={() => onRequestMode("lateral")}
            className="mt-2 text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
            data-testid="zoom0-open-lateral-movement"
          >
            Open full Lateral Movement view →
          </button>
        ) : null}
        {mapLens === "exfiltration" && onRequestMode ? (
          <button
            type="button"
            onClick={() => onRequestMode("exfil")}
            className="mt-2 text-[11px] font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
            data-testid="zoom0-open-exfiltration"
          >
            Open full Exfiltration view →
          </button>
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
        <div className="flex flex-1 min-h-[400px] items-center justify-center text-[12px] text-muted-foreground">
          No attack paths to this crown jewel today.
        </div>
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
            ) : (
              <div className="h-full min-h-[520px]">
                <TrafficFlowMap
                  key={`zoom0-tfm-${mapLens}`}
                  systemName={systemName}
                  spotlightPaths={spotlightPaths}
                  spotlightPathId={null}
                  spotlightJewel={{
                    id: jewel.id,
                    canonical_id: jewel.canonical_id ?? cjArn,
                  }}
                  titleOverride="Attack Map"
                  innerTitleOverride="Jewel fan-in"
                  innerSubtitleOverride={
                    mapLens === "lateral"
                      ? "Lateral pivots on fan-in · Laterals bright"
                      : mapLens === "exfiltration"
                        ? "Paths that can reach data egress from this jewel"
                        : "All paths to this crown jewel · observed vs configured"
                  }
                  pathBadgeOverride={`${spotlightPaths.length} path${spotlightPaths.length === 1 ? "" : "s"} → ${jewel.name}`}
                  observedMode
                  canvasV2
                  defaultShowLaterals={mapLens === "lateral"}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
