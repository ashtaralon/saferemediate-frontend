"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, { Background, Controls, ReactFlowProvider, useReactFlow } from "reactflow"
import "reactflow/dist/style.css"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import { buildVpcFlowGraph } from "@/lib/attack-surface/build-vpc-flow"
import { awsVpcFlowNodeTypes } from "./aws-vpc-flow-nodes"
import { attackSurfaceEdgeTypes } from "./attack-surface-edges"
import { AttackPathContainmentMap } from "@/components/attack-paths-v2/attack-path-containment-map"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"

const MAP_BUILD = "surface-vpc-2026-06-17"

function FlowInner({
  architecture,
  path,
  pixelHeight,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  pixelHeight: number
}) {
  const { fitView } = useReactFlow()
  const fitRef = useRef(fitView)
  fitRef.current = fitView

  const graph = useMemo(
    () => buildVpcFlowGraph(architecture, path),
    [architecture, path],
  )

  useEffect(() => {
    if (!graph) return
    const t = window.setTimeout(() => {
      fitRef.current({ padding: 0.08, duration: 320, minZoom: 0.35, maxZoom: 1.05 })
    }, 80)
    return () => window.clearTimeout(t)
  }, [graph?.nodes.length, graph?.edges.length, pixelHeight])

  if (!graph) {
    return (
      <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
        VPC flow map unavailable for this path.
      </div>
    )
  }

  return (
    <div
      style={{ width: "100%", height: pixelHeight }}
      className="aws-vpc-flow-root"
      data-testid="aws-vpc-flow-canvas"
      data-map-build={MAP_BUILD}
    >
      <style>{`
        .aws-vpc-flow-root .react-flow__node-group {
          padding: 0;
          background: transparent;
          border-radius: 4px;
        }
        .aws-vpc-flow-root .react-flow__controls button {
          background: #fff;
          border-color: #DCDCDC;
        }
        @keyframes as-net-dash { to { stroke-dashoffset: -32; } }
        .as-net-dash { animation: as-net-dash 3.2s linear infinite; }
        @keyframes as-exfil-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.45; }
        }
        .as-exfil-pulse { animation: as-exfil-pulse 1.4s ease-in-out infinite; }
      `}</style>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={awsVpcFlowNodeTypes}
        edgeTypes={attackSurfaceEdgeTypes}
        style={{ width: "100%", height: "100%" }}
        fitView
        fitViewOptions={{ padding: 0.1, minZoom: 0.35, maxZoom: 1.05 }}
        minZoom={0.2}
        maxZoom={1.3}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E8E8E8" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function AwsVpcFlowCanvas({
  architecture,
  path,
  report,
  systemName,
  height = 600,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  report: AttackPathReport
  systemName?: string | null
  height?: number | string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pixelHeight, setPixelHeight] = useState(typeof height === "number" ? height : 600)
  const [useLegacyGraph, setUseLegacyGraph] = useState(false)

  useEffect(() => {
    if (typeof height === "number") {
      setPixelHeight(height)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPixelHeight(Math.max(520, Math.floor(el.clientWidth * 0.62)))
    })
    ro.observe(el)
    setPixelHeight(Math.max(520, Math.floor(el.clientWidth * 0.62)))
    return () => ro.disconnect()
  }, [height])

  const graph = useMemo(
    () => buildVpcFlowGraph(architecture, path),
    [architecture, path],
  )

  if (useLegacyGraph || !graph) {
    return (
      <div ref={containerRef} className="w-full">
        {!graph && !useLegacyGraph ? (
          <div className="px-3 py-2 mb-2 text-[11px] text-amber-700 bg-amber-500/10 rounded-md">
            VPC surface layout unavailable — showing Cloud Graph fallback.{" "}
            <button type="button" className="underline" onClick={() => setUseLegacyGraph(true)}>
              Open Cloud Graph
            </button>
          </div>
        ) : null}
        <AttackPathContainmentMap
          path={path}
          report={report}
          architecture={architecture}
          systemName={systemName}
          slot="flow"
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-center justify-end gap-2 px-1 pb-1">
        <span className="font-mono text-[9px] text-muted-foreground" data-testid="map-build-id">
          {MAP_BUILD}
        </span>
        <button
          type="button"
          className="text-[10px] text-muted-foreground underline hover:text-foreground"
          onClick={() => setUseLegacyGraph(true)}
        >
          Cloud Graph view
        </button>
      </div>
      <ReactFlowProvider>
        <FlowInner architecture={architecture} path={path} pixelHeight={pixelHeight} />
      </ReactFlowProvider>
    </div>
  )
}
