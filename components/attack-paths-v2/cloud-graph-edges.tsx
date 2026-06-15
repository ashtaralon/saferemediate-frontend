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
import {
  EDGE_ROUTING_TOKENS,
  type EdgeRoutingClass,
} from "./cloud-graph-hierarchy"

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

/** Map FlowEdgeData to its semantic routing class (mirrors
 *  cloud-graph-hierarchy.ts::edgeRoutingClass but works against the
 *  ReactFlow-side data shape). */
function flowEdgeClass(data: FlowEdgeData | undefined): EdgeRoutingClass {
  if (!data) return "metadata"
  if (data.edgeStyle === "path" && data.layer === "path") return "spine"
  if (data.edgeStyle === "enc" || data.edgeStyle === "priv") return "infra"
  return "metadata"
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
    borderRadius: 14,
    // Larger offset routes edges further from node bodies so they stop
    // crossing through the middle of cards (was 28; lines were drawing
    // on top of node content). 64 gives enough room for the smoothstep
    // bend to clear the card without producing huge detours.
    offset: 64,
  })

  // Visual Hierarchy Contract §3 — every edge resolves to one of three
  // routing classes (spine / infra / metadata) and inherits its visual
  // treatment from EDGE_ROUTING_TOKENS. Hue per category (enc=teal, priv=
  // green) is preserved for legibility but width/opacity/animation now
  // come from the contract.
  const cls = flowEdgeClass(data)
  const token = EDGE_ROUTING_TOKENS[cls]
  const style = data?.edgeStyle ?? "path"

  // Spine = deep slate; infra keeps its category hue; metadata reads gray
  // (it'll be invisible at opacity 0 anyway).
  const color =
    cls === "spine" ? "#2b3a4b" :
    style === "enc" ? CG.encrypt :
    style === "priv" ? CG.priv :
    CG.faint

  const strokeWidth = token.width
  const dash =
    style === "enc" ? "6 4" : style === "priv" ? "2 5" : undefined
  // User-driven dim (full-environment "isolate" toggle) wins over contract
  // opacity; otherwise the contract token rules.
  const opacity = data?.dimmed ? 0.15 : token.opacity
  const animate = token.animated && data?.animate !== false
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
              dur="3s"
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
      {data?.label && token.labelVisibility !== "hover" ? (
        // Spine class only — labelVisibility === "always". Infra and metadata
        // labels are suppressed by default per the contract; they reappear
        // in a hover/drill-in view that's not implemented in v1.
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
