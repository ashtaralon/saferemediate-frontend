"use client"

import { memo } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "reactflow"
import { CG } from "./cloud-graph-tokens"
import type { Layer } from "./containment-model"

export interface FlowEdgeData {
  label?: string
  edgeStyle: "path" | "enc" | "priv"
  /** Mirrors CMEdge.layer — accepts "frame" for containment-internal edges
   * even though the renderer only reacts to "path" today. */
  layer: Layer
  step?: number
  pulseDelay?: number
  dimmed?: boolean
  animate?: boolean
  flowActive?: boolean
}

export const CloudGraphEdge = memo(function CloudGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<FlowEdgeData>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: 28,
  })

  const style = data?.edgeStyle ?? "path"
  const color =
    style === "enc" ? CG.encrypt : style === "priv" ? CG.priv : CG.attack
  const strokeWidth = style === "path" ? 2 : 1.5
  const dash =
    style === "enc" ? "6 4" : style === "priv" ? "2 5" : undefined
  const opacity = data?.dimmed ? 0.15 : style === "priv" ? 0.4 : 1
  const animate =
    data?.animate !== false &&
    style === "path" &&
    (data?.layer === "path" || data?.flowActive === true)
  const pulseDelay = data?.pulseDelay ?? 0

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
      {animate ? (
        <>
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray="6 10"
            opacity={0.5}
            className="cg-flow-dash"
            style={{ animationDelay: `${pulseDelay}s` }}
          />
          <circle r={3.5} fill={color} opacity={0.95} className="cg-flow-dot">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              begin={`${pulseDelay}s`}
              path={path}
              rotate="auto"
            />
          </circle>
        </>
      ) : null}
      {data?.step != null ? (
        <EdgeLabelRenderer>
          <div
            className="absolute flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold text-white pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${sourceX + 14}px,${sourceY}px)`,
              background: CG.attack,
              border: "1.5px solid #fff",
            }}
          >
            {data.step}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="absolute rounded-md border bg-white px-2 py-0.5 text-[10px] font-semibold pointer-events-none nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              color,
              borderColor: `${color}55`,
              opacity: data.dimmed ? 0.2 : 1,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
})

export const cloudGraphEdgeTypes = {
  cloudGraph: CloudGraphEdge,
}
