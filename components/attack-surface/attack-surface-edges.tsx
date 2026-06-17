"use client"

import { memo } from "react"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow"
import { AS } from "./attack-surface-tokens"
import type { SurfaceFlowKind } from "@/lib/attack-surface/edge-classification"
import { SURFACE_EDGE_COLORS } from "@/lib/attack-surface/edge-classification"

export interface AttackSurfaceEdgeData {
  flowKind: SurfaceFlowKind
  label?: string
  observed?: boolean | null
  onPath?: boolean
  pulseDelay?: number
  dimmed?: boolean
  severityOverride?: SurfaceFlowKind
}

function strokeForKind(kind: SurfaceFlowKind, observed?: boolean | null): string {
  const base = SURFACE_EDGE_COLORS[kind]
  if (kind === "network" && observed === false) return "#475569"
  return base
}

export const AttackSurfaceEdge = memo(function AttackSurfaceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<AttackSurfaceEdgeData>) {
  const kind = data?.severityOverride ?? data?.flowKind ?? "network"
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 48,
  })

  const color = strokeForKind(kind, data?.observed)
  const strokeWidth = kind === "exfil" ? 3 : 2
  const dash = kind === "identity" ? "5,5" : undefined
  const opacity = data?.dimmed ? 0.15 : data?.onPath === false ? 0.35 : 0.95
  const pulseDelay = data?.pulseDelay ?? 0
  const showLabel = Boolean(data?.label) && data?.onPath !== false

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth,
          strokeDasharray: dash,
          opacity,
        }}
      />
      {kind === "exfil" ? (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 3}
          opacity={0.2}
          className="as-exfil-pulse"
          style={{ animationDelay: `${pulseDelay}s` }}
        />
      ) : null}
      {kind === "network" || kind === "exfil" ? (
        <>
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray="6 10"
            opacity={0.5}
            className="as-net-dash"
            style={{ animationDelay: `${pulseDelay}s` }}
          />
          <circle r={3.5} fill={color} opacity={0.95} className="as-flow-dot">
            <animateMotion
              dur={kind === "exfil" ? "2.4s" : "3s"}
              repeatCount="indefinite"
              begin={`${pulseDelay}s`}
              path={path}
              rotate="auto"
            />
          </circle>
        </>
      ) : null}
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none nodrag nopan font-mono uppercase"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              color: kind === "identity" ? AS.identity : AS.faint,
              fontSize: 10,
              opacity: data?.dimmed ? 0.2 : 0.9,
            }}
          >
            {data?.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
})

export const attackSurfaceEdgeTypes = {
  surfaceEdge: AttackSurfaceEdge,
}
