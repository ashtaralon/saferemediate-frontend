"use client"

import dynamic from "next/dynamic"
import { useMemo, type RefObject } from "react"
import { Loader2 } from "lucide-react"
import type { IdentityAttackPath, CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import { buildTrafficFlowPathFilter } from "./build-traffic-flow-path-filter"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

export function AttackPathLaneFlowMap({
  path,
  jewel,
  systemName,
  architecture,
  architectureLoading = false,
  canvasV2 = false,
  fullscreenContainerRef,
  onDamageScopeDataNode,
}: {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  architecture?: SystemArchitecture | null
  /** True while the facade's full graph-view architecture is still in
   *  flight. The map paints immediately from the sparse path-filter data
   *  (seed-render, 2026-06-25 — never a blank spinner), but that early
   *  render has fewer lanes than the full topology that replaces it. This
   *  flag surfaces an honest "partial view" chip so the swap doesn't read
   *  as the map mutating on its own (operator report, 2026-07-03). */
  architectureLoading?: boolean
  canvasV2?: boolean
  fullscreenContainerRef?: RefObject<HTMLDivElement | null>
  onDamageScopeDataNode?: (node: { id: string; name: string; type: string }) => void
}) {
  const pathFilter = useMemo(
    () => buildTrafficFlowPathFilter(path, jewel),
    [path, jewel],
  )
  const start = path.nodes?.[0]

  return (
    <div className="relative h-[520px] min-h-[480px] w-full">
      {architectureLoading && !architecture && (
        <div
          className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2"
          data-testid="flow-map-partial-chip"
        >
          <div className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm backdrop-blur-sm dark:text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Partial view — loading full path topology…
          </div>
        </div>
      )}
      <TrafficFlowMap
        systemName={systemName}
        architectureOverride={architecture ?? undefined}
        pathFilter={pathFilter}
        titleOverride=""
        innerTitleOverride="Flow Map"
        innerSubtitleOverride="On-path chain + lateral pivots"
        pathBadgeOverride={pathFilter.pathLabel}
        observedMode
        canvasV2={canvasV2}
        entryNodeId={canvasV2 ? start?.id : undefined}
        jewelEmphasis={canvasV2}
        jewelSeverity={canvasV2 ? path.severity?.severity : undefined}
        fullscreenContainerRef={fullscreenContainerRef}
        onDamageScopeDataNode={onDamageScopeDataNode}
      />
    </div>
  )
}
