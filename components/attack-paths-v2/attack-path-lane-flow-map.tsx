"use client"

import dynamic from "next/dynamic"
import { useMemo, useRef } from "react"
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
  canvasV2 = false,
  fullscreenContainerRef,
  onDamageScopeDataNode,
}: {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  architecture?: SystemArchitecture | null
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
    <div className="h-[520px] min-h-[480px] w-full">
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
