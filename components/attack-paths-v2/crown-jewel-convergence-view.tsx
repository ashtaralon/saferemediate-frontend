"use client"

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { convergenceToTargetTopology } from "@/lib/attack-paths/convergence-to-target-topology"
import { TargetAttackMap } from "@/components/attack-map/target-attack-map"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { useMemo } from "react"

export function CrownJewelConvergenceView({
  jewel,
  data,
  loading,
  error,
  retry,
  selectedPathId,
  source = "live",
}: {
  jewel: CrownJewelSummary
  data: CrownJewelConvergence | null
  loading: boolean
  error: string | null
  retry: () => void
  selectedPathId: string | null
  source?: "live" | "fallback"
}) {
  const topo = useMemo(
    () => (data ? convergenceToTargetTopology(data, selectedPathId) : null),
    [data, selectedPathId],
  )

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading convergence map…
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to load convergence view</p>
            <p className="mt-1 text-muted-foreground">{String(error)}</p>
            <button
              type="button"
              onClick={() => retry()}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data || !topo) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No paths reach this crown jewel — pick another jewel on the left.
      </div>
    )
  }

  if (topo.nodes.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Paths loaded ({data.paths_total}) but placement data is missing — subnet context may not be materialized yet.
      </div>
    )
  }

  const topChoke = Object.entries(data.choke_points).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
        <div className="font-medium">{jewel.name}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
          <span>{data.paths_total} paths</span>
          <span>{data.observed_paths} observed</span>
          {data.cj_type ? <span>{data.cj_type}</span> : null}
          {source === "fallback" ? (
            <span className="text-amber-600 dark:text-amber-400">
              preview from path list — deploy backend for subnet placement
            </span>
          ) : null}
          {topChoke ? (
            <span>
              choke: {topChoke[0].split("/").pop()} ×{topChoke[1]}
            </span>
          ) : null}
          {selectedPathId ? <span>filtering 1 path</span> : <span>all paths fanned</span>}
        </div>
      </div>
      <div className="min-h-[520px]">
        <TargetAttackMap topo={topo} />
      </div>
    </div>
  )
}
