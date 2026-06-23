"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow"
import "reactflow/dist/style.css"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import { buildAttackSurfaceFlow } from "@/lib/attack-surface/build-attack-surface-flow"
import { attackSurfaceNodeTypes } from "./attack-surface-nodes"
import { attackSurfaceEdgeTypes } from "./attack-surface-edges"
import type { SurfaceFlowKind } from "@/lib/attack-surface/edge-classification"
import { AS } from "./attack-surface-tokens"

/** Optional live edge severity overrides (WebSocket / SSE deltas). */
export type SurfaceEdgeOverrides = Record<string, SurfaceFlowKind>

function FlowInner({
  architecture,
  path,
  height,
  edgeOverrides,
  focusNodeId,
  onNodeClick,
  onPaneClick,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  height: number | string
  edgeOverrides?: SurfaceEdgeOverrides
  focusNodeId?: string | null
  onNodeClick: (_: React.MouseEvent, node: { id: string; type?: string }) => void
  onPaneClick: () => void
}) {
  const { fitView } = useReactFlow()
  const fitViewRef = useRef(fitView)
  fitViewRef.current = fitView

  const graph = useMemo(
    () => buildAttackSurfaceFlow({ architecture, path }),
    [architecture, path],
  )

  useEffect(() => {
    requestAnimationFrame(() => {
      fitViewRef.current({ padding: 0.06, duration: 280, minZoom: 0.45, maxZoom: 1.15 })
    })
  }, [graph.width, graph.height, graph.nodes.length, graph.edges.length])

  const styledNodes = useMemo(() => {
    if (!focusNodeId) return graph.nodes
    return graph.nodes.map((n) => {
      if (n.type !== "surfaceResource") return n
      const dimmed = n.id !== focusNodeId
      return { ...n, data: { ...n.data, dimmed } }
    })
  }, [graph.nodes, focusNodeId])

  const styledEdges = useMemo(() => {
    if (!edgeOverrides || Object.keys(edgeOverrides).length === 0) return graph.edges
    return graph.edges.map((e) => {
      const override = edgeOverrides[e.id]
      if (!override) return e
      return {
        ...e,
        data: { ...e.data, severityOverride: override, flowKind: override },
        animated: true,
      }
    })
  }, [graph.edges, edgeOverrides])

  return (
    <div style={{ width: "100%", height }} className="as-flow-root" data-testid="attack-surface-canvas">
      <style>{`
        .as-flow-root .react-flow__controls button {
          width: 26px; height: 26px; border-radius: 6px;
          background: ${AS.surface}; border-color: ${AS.laneBorder}; color: ${AS.ink};
        }
        .as-flow-root .react-flow__minimap {
          border-radius: 8px; border: 1px solid ${AS.laneBorder}; background: ${AS.surface};
        }
        .as-flow-root .react-flow__background pattern circle { fill: #1E293B; }
        @keyframes as-net-dash { to { stroke-dashoffset: -32; } }
        @keyframes as-id-dash { to { stroke-dashoffset: -24; } }
        @keyframes as-exfil-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.45; }
        }
        .as-net-dash { animation: as-net-dash 3.2s linear infinite; }
        .as-id-dash { animation: as-id-dash 1.8s linear infinite; }
        .as-exfil-pulse { animation: as-exfil-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .as-net-dash, .as-id-dash, .as-exfil-pulse, .as-flow-dot { display: none; }
        }
      `}</style>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={attackSurfaceNodeTypes}
        edgeTypes={attackSurfaceEdgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.4, maxZoom: 1.2 }}
        minZoom={0.25}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1A1A3A" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.type === "surfaceResource" ? AS.network : "#334155")}
          maskColor="rgba(11,15,20,0.82)"
          style={{ width: 110, height: 72 }}
        />
      </ReactFlow>
    </div>
  )
}

export function AttackSurfaceCanvas({
  architecture,
  path,
  height = 520,
  edgeOverrides,
}: {
  architecture: SystemArchitecture
  path: IdentityAttackPath
  height?: number | string
  edgeOverrides?: SurfaceEdgeOverrides
}) {
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string; type?: string }) => {
    if (node.type === "surfaceResource") {
      setFocusNodeId((prev) => (prev === node.id ? null : node.id))
    }
  }, [])

  const onPaneClick = useCallback(() => setFocusNodeId(null), [])

  return (
    <ReactFlowProvider>
      <FlowInner
        architecture={architecture}
        path={path}
        height={height}
        edgeOverrides={edgeOverrides}
        focusNodeId={focusNodeId}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
      />
    </ReactFlowProvider>
  )
}
