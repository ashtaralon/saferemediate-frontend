"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from "reactflow"
import "reactflow/dist/style.css"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { ContainmentModel } from "./containment-model"
import type { ContainmentViewMode } from "./build-containment-from-architecture"
import { layoutCloudGraphFlow } from "./build-cloud-graph-flow"
import { cloudGraphNodeTypes } from "./cloud-graph-nodes"
import { cloudGraphEdgeTypes } from "./cloud-graph-edges"
import { CG } from "./cloud-graph-tokens"

function FlowInner({
  model,
  path,
  viewMode,
  height,
}: {
  model: ContainmentModel
  path: IdentityAttackPath
  viewMode: ContainmentViewMode
  height: number | string
}) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<ReturnType<typeof layoutCloudGraphFlow> extends Promise<infer R> ? R["edges"] : never>([])
  const [loading, setLoading] = useState(true)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const { fitView } = useReactFlow()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void layoutCloudGraphFlow(model, path, viewMode).then((result) => {
      if (cancelled) return
      setNodes(result.nodes)
      setEdges(result.edges)
      setLoading(false)
      requestAnimationFrame(() => {
        fitView({ padding: 0.12, duration: 200 })
      })
    })
    return () => {
      cancelled = true
    }
  }, [model, path, viewMode, fitView])

  const pathNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const n of path.nodes ?? []) ids.add(n.id)
    for (const c of model.cards.filter((c) => c.onPath)) ids.add(c.id)
    return ids
  }, [path.nodes, model.cards])

  const styledNodes = useMemo(() => {
    if (!focusNodeId) return nodes
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        focused: pathNodeIds.has(n.id) || n.id === focusNodeId,
        dimmed: !pathNodeIds.has(n.id) && n.id !== focusNodeId && n.type === "resource",
      },
    }))
  }, [nodes, focusNodeId, pathNodeIds])

  const styledEdges = useMemo(() => {
    if (!focusNodeId) return edges
    return edges.map((e) => ({
      ...e,
      data: {
        ...e.data,
        dimmed:
          e.data?.layer !== "path" &&
          !pathNodeIds.has(e.source) &&
          !pathNodeIds.has(e.target),
      },
    }))
  }, [edges, focusNodeId, pathNodeIds])

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type === "resource") {
      setFocusNodeId((prev) => (prev === node.id ? null : node.id))
    }
  }, [])

  const onPaneClick = useCallback(() => setFocusNodeId(null), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center text-[11px]" style={{ height, color: CG.faint }}>
        Laying out cloud graph…
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height }} className="cg-flow-root">
      <style>{`
        .cg-flow-root .react-flow__controls button {
          width: 26px; height: 26px; border-radius: 6px;
        }
        .cg-flow-root .react-flow__minimap {
          border-radius: 8px; border: 1px solid ${CG.border};
        }
        @keyframes cg-dash { to { stroke-dashoffset: -32; } }
        .cg-flow-dash {
          animation: cg-dash 1.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cg-flow-dash, .cg-flow-dot { display: none; }
        }
      `}</style>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={cloudGraphNodeTypes}
        edgeTypes={cloudGraphEdgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.35}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e8edf3" gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.type === "container" ? "#dce3ec" : CG.attack)}
          maskColor="rgba(251,252,254,0.75)"
          style={{ width: 120, height: 80 }}
        />
      </ReactFlow>
    </div>
  )
}

export function CloudGraphFlowCanvas({
  model,
  path,
  viewMode,
  displaySize = "inline",
}: {
  model: ContainmentModel
  path: IdentityAttackPath
  viewMode: ContainmentViewMode
  displaySize?: "inline" | "expanded"
}) {
  const height = displaySize === "expanded" ? "calc(92vh - 8rem)" : 420
  return (
    <ReactFlowProvider>
      <FlowInner model={model} path={path} viewMode={viewMode} height={height} />
    </ReactFlowProvider>
  )
}
