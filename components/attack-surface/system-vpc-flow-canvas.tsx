"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow"
import "reactflow/dist/style.css"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"
import type { AttackGraphSelection, SystemAttackGraph } from "@/lib/attack-surface/system-attack-graph-types"
import {
  buildVpcSystemFlow,
  selectionFromFlowEdge,
  selectionFromFlowNode,
} from "@/lib/attack-surface/build-vpc-system-flow"
import { awsVpcFlowNodeTypes } from "./aws-vpc-flow-nodes"
import { attackSurfaceEdgeTypes } from "./attack-surface-edges"

const MAP_BUILD = "system-vpc-flow-v1"

function FlowInner({
  nodes,
  edges,
  graph,
  selection,
  onSelectionChange,
  pixelHeight,
}: {
  nodes: Node[]
  edges: Edge[]
  graph: SystemAttackGraph
  selection: AttackGraphSelection
  onSelectionChange: (s: AttackGraphSelection) => void
  pixelHeight: number
}) {
  const { fitView } = useReactFlow()
  const fitRef = useRef(fitView)
  fitRef.current = fitView

  useEffect(() => {
    if (!nodes.length) return
    const t = window.setTimeout(() => {
      fitRef.current({ padding: 0.22, duration: 360, minZoom: 0.42, maxZoom: 1.05 })
    }, 100)
    return () => window.clearTimeout(t)
  }, [nodes.length, edges.length, pixelHeight, selection?.kind, selection?.key])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "group") return
      const next = selectionFromFlowNode(graph, node.id)
      onSelectionChange(next)
    },
    [graph, onSelectionChange],
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const next = selectionFromFlowEdge(edge.id)
      onSelectionChange(next)
    },
    [onSelectionChange],
  )

  return (
    <div
      style={{ width: "100%", height: pixelHeight }}
      className="aws-vpc-flow-root system-vpc-flow-root"
      data-testid="system-vpc-flow-canvas"
      data-map-build={MAP_BUILD}
    >
      <style>{`
        .system-vpc-flow-root .react-flow__node-group {
          padding: 0;
          background: transparent;
          border-radius: 4px;
        }
        .system-vpc-flow-root .react-flow__controls button {
          background: #0e1726;
          border-color: #26395a;
          color: #c2cee0;
        }
        .system-vpc-flow-root .react-flow__controls button:hover {
          background: #142440;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={awsVpcFlowNodeTypes}
        edgeTypes={attackSurfaceEdgeTypes}
        style={{ width: "100%", height: "100%" }}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.42, maxZoom: 1.05 }}
        minZoom={0.35}
        maxZoom={1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => onSelectionChange(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1b2942" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export interface SystemVpcFlowCanvasProps {
  topology: TopologyResponse
  graph: SystemAttackGraph
  selection: AttackGraphSelection
  onSelectionChange: (s: AttackGraphSelection) => void
  height?: number | "fill"
}

export function SystemVpcFlowCanvas({
  topology,
  graph,
  selection,
  onSelectionChange,
  height = "fill",
}: SystemVpcFlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pixelHeight, setPixelHeight] = useState(560)

  useEffect(() => {
    if (typeof height === "number") {
      setPixelHeight(height)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPixelHeight(Math.max(480, el.clientHeight))
    })
    ro.observe(el)
    setPixelHeight(Math.max(480, el.clientHeight))
    return () => ro.disconnect()
  }, [height])

  const flow = useMemo(
    () => buildVpcSystemFlow(topology, graph, selection),
    [topology, graph, selection],
  )

  if (!flow) {
    return (
      <div
        ref={containerRef}
        className="flex h-full min-h-[480px] items-center justify-center text-[12px] text-[#8195b1]"
      >
        VPC topology unavailable for this system.
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full min-h-[480px] w-full">
      <ReactFlowProvider>
        <FlowInner
          nodes={flow.nodes}
          edges={flow.edges}
          graph={graph}
          selection={selection}
          onSelectionChange={onSelectionChange}
          pixelHeight={pixelHeight}
        />
      </ReactFlowProvider>
    </div>
  )
}
