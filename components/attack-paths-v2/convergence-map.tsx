"use client"

import { useMemo, useState } from "react"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { convergenceToTargetTopology } from "@/lib/attack-paths/convergence-to-target-topology"
import { TargetAttackMap } from "@/components/attack-map/target-attack-map"
import { ChokePointTilesBar } from "./choke-point-tiles-bar"
import {
  CHOKE_TILE_THRESHOLD,
  shouldCollapseToChokeTiles,
} from "./choke-point-tiles"

export function ConvergenceMap({
  data,
  selectedPathId,
  onSelectPath,
  source = "live",
}: {
  data: CrownJewelConvergence
  selectedPathId: string | null
  onSelectPath: (pathId: string | null) => void
  source?: "live" | "fallback"
}) {
  const [tileFilterIds, setTileFilterIds] = useState<string[] | null>(null)

  const displayData = useMemo(() => {
    if (!tileFilterIds || tileFilterIds.length === 0) return data
    const allow = new Set(tileFilterIds)
    const paths = data.paths.filter((p) => allow.has(p.path_id))
    return {
      ...data,
      paths,
      paths_total: paths.length,
      observed_paths: paths.filter((p) => p.confidence === "observed").length,
    }
  }, [data, tileFilterIds])

  const topo = useMemo(
    () => convergenceToTargetTopology(displayData, selectedPathId),
    [displayData, selectedPathId],
  )

  const topChoke = Object.entries(data.choke_points).sort((a, b) => b[1] - a[1])[0]
  const collapsed = shouldCollapseToChokeTiles(
    data.paths_total || data.paths.length,
    CHOKE_TILE_THRESHOLD,
  )

  // When collapsed and no path / tile filter: don't draw all edges (hairball).
  const hideFullFan =
    collapsed && !selectedPathId && (!tileFilterIds || tileFilterIds.length === 0)

  const pathChips = displayData.paths

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-mono text-muted-foreground">
        <span>{data.paths_total} paths</span>
        <span>{data.observed_paths} observed</span>
        {data.cj_type ? <span>{data.cj_type}</span> : null}
        {source === "fallback" ? (
          <span className="text-amber-600 dark:text-amber-400">
            offline preview — convergence API unavailable
          </span>
        ) : null}
        {topChoke ? (
          <span>
            choke {topChoke[0].split("/").pop()} ×{topChoke[1]}
          </span>
        ) : null}
        <span>
          {selectedPathId
            ? "1 path highlighted"
            : hideFullFan
              ? "choke tiles (expand a group)"
              : tileFilterIds
                ? `${pathChips.length} paths in tile`
                : "all paths fanned"}
        </span>
      </div>

      <ChokePointTilesBar data={data} onFilterPathIds={setTileFilterIds} />

      {pathChips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          <button
            type="button"
            onClick={() => onSelectPath(null)}
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              !selectedPathId
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All paths
          </button>
          {pathChips.map((p) => {
            const active = p.path_id === selectedPathId
            return (
              <button
                key={p.path_id}
                type="button"
                onClick={() => onSelectPath(active ? null : p.path_id)}
                className={`max-w-[180px] truncate rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  active
                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={p.source ?? p.path_id}
              >
                {p.source ?? p.path_id}
                <span className="ml-1 opacity-60">{p.confidence === "observed" ? "●" : "○"}</span>
              </button>
            )
          })}
        </div>
      )}

      {hideFullFan ? (
        <div
          className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-muted-foreground px-6 text-center"
          data-testid="choke-tiles-map-placeholder"
        >
          Fan-in collapsed — expand a choke-point tile above, or pick a path chip,
          to draw edges without spaghetti.
        </div>
      ) : topo.nodes.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center text-[12px] text-muted-foreground">
          Paths loaded but hop placement is empty — check hops_json materialization.
        </div>
      ) : (
        <TargetAttackMap topo={topo} />
      )}
    </div>
  )
}
