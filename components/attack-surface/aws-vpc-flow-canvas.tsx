"use client"

import { useEffect, useMemo, useRef } from "react"
import ReactFlow, { Background, Controls, ReactFlowProvider, useReactFlow } from "reactflow"
import "reactflow/dist/style.css"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import { buildVpcFlowGraph } from "@/lib/attack-surface/build-vpc-flow"
import { awsVpcFlowNodeTypes } from "./aws-vpc-flow-nodes"
import { attackSurfaceEdgeTypes } from "./attack-surface-edges"

function FlowInner({
  architecture,
  path,
  height,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  height: number | string
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
    requestAnimationFrame(() => {
      fitRef.current({ padding: 0.06, duration: 300, minZoom: 0.45, maxZoom: 1.1 })
    })
  }, [graph?.nodes.length, graph?.edges.length])

  if (!graph) {
    return (
      <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
        VPC flow map unavailable.
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height }} className="aws-vpc-flow-root" data-testid="aws-vpc-flow-canvas">
      <style>{`
        .aws-vpc-flow-root .react-flow__node-group { padding: 0; background: transparent; border: none; }
        .aws-vpc-flow-root .react-flow__controls button {
          background: #fff; border-color: #DCDCDC;
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
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.4, maxZoom: 1.15 }}
        minZoom={0.25}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E0E0E0" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function AwsVpcFlowCanvas({
  architecture,
  path,
  height = 580,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  height?: number | string
}) {
  return (
    <ReactFlowProvider>
      <div style={{ background: "#FFFFFF", minHeight: typeof height === "number" ? height : 580 }}>
        <FlowInner architecture={architecture} path={path} height={height} />
      </div>
    </ReactFlowProvider>
  )
}
