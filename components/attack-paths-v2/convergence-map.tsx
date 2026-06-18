"use client"

import { useMemo } from "react"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { convergenceToTargetTopology } from "@/lib/attack-paths/convergence-to-target-topology"
import { TargetAttackMap } from "@/components/attack-map/target-attack-map"

export function ConvergenceMap({
  data,
  selectedPathId,
  onSelectPath,
}: {
  data: CrownJewelConvergence
  selectedPathId: string | null
  onSelectPath: (pathId: string | null) => void
}) {
  const topo = useMemo(
    () => convergenceToTargetTopology(data, selectedPathId),
    [data, selectedPathId],
  )

  const topChoke = Object.entries(data.choke_points).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-mono text-muted-foreground">
        <span>{data.paths_total} paths</span>
        <span>{data.observed_paths} observed</span>
        {data.cj_type ? <span>{data.cj_type}</span> : null}
        {topChoke ? (
          <span>
            choke {topChoke[0].split("/").pop()} ×{topChoke[1]}
          </span>
        ) : null}
        <span>{selectedPathId ? "1 path highlighted" : "all paths fanned"}</span>
      </div>

      {data.paths.length > 1 && (
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
          {data.paths.map((p) => {
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

      {topo.nodes.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center text-[12px] text-muted-foreground">
          Paths loaded but hop placement is empty — check hops_json materialization.
        </div>
      ) : (
        <TargetAttackMap topo={topo} />
      )}
    </div>
  )
}
