"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow"
import "reactflow/dist/style.css"
import { Crosshair, Database, Fingerprint, Server, X } from "lucide-react"
import type {
  AtlasFootholdCandidate,
  AtlasLateralChain,
  AtlasLateralResponse,
} from "./use-atlas-lateral"

type AtlasNodeKind = "foothold" | "identity" | "movement" | "data" | "jewel"

interface AtlasFlowNodeData {
  kind: AtlasNodeKind
  kicker: string
  title: string
  subtitle: string
  primitive?: string
  result?: string | null
  evidenceIds?: string[]
}

const KIND_STYLE: Record<AtlasNodeKind, { border: string; icon: string }> = {
  foothold: { border: "#f59e0b", icon: "#fbbf24" },
  identity: { border: "#a855f7", icon: "#c084fc" },
  movement: { border: "#06b6d4", icon: "#22d3ee" },
  data: { border: "#f97316", icon: "#fb923c" },
  jewel: { border: "#ef4444", icon: "#f87171" },
}

function short(value: string, max = 38): string {
  const tail = value.split(/[/:]/).filter(Boolean).pop() ?? value
  return tail.length > max ? `${tail.slice(0, max - 1)}…` : tail
}

function primitiveKind(primitive: string): AtlasNodeKind {
  const value = primitive.toUpperCase()
  if (/ROLE|IDENTITY|PROFILE|CREDENTIAL|TRUST|POLICY/.test(value)) return "identity"
  if (/S3|DATA|OBJECT|SNAPSHOT|RESOURCE|SECRET|KMS/.test(value)) return "data"
  return "movement"
}

function stepResult(chain: AtlasLateralChain, index: number): string | null {
  const delta = chain.steps[index]?.state_delta
  return (
    delta?.added_captured_identities?.[0] ??
    delta?.added_accessible_resources?.[0] ??
    delta?.added_compromised_workloads?.[0] ??
    delta?.added_synthetic_nodes?.[0] ??
    null
  )
}

function iconFor(kind: AtlasNodeKind) {
  if (kind === "foothold") return <Server className="h-4 w-4" />
  if (kind === "identity") return <Fingerprint className="h-4 w-4" />
  if (kind === "data" || kind === "jewel") return <Database className="h-4 w-4" />
  return <Crosshair className="h-4 w-4" />
}

function AtlasNodeCard({ data, selected }: NodeProps<AtlasFlowNodeData>) {
  const style = KIND_STYLE[data.kind]
  return (
    <div
      className="w-[230px] rounded-xl border-2 bg-[#13263a] px-3.5 py-3 text-left shadow-lg transition-shadow"
      style={{
        borderColor: style.border,
        boxShadow: selected ? `0 0 0 3px ${style.border}45, 0 12px 30px #02061780` : undefined,
      }}
      data-atlas-node-kind={data.kind}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-[#0b1828] !bg-slate-400" />
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-lg bg-white/5 p-2" style={{ color: style.icon }}>
          {iconFor(data.kind)}
        </span>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{data.kicker}</div>
          <div className="mt-1 break-words text-[12px] font-semibold leading-snug text-slate-50">{data.title}</div>
          <div className="mt-1 truncate font-mono text-[9px] text-slate-400" title={data.subtitle}>{data.subtitle}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-[#0b1828] !bg-slate-400" />
    </div>
  )
}

const nodeTypes = { atlasNode: AtlasNodeCard }

export function buildAtlasLateralFlowGraph(
  chain: AtlasLateralChain,
  foothold: AtlasFootholdCandidate,
  jewelName: string,
): { nodes: Array<Node<AtlasFlowNodeData>>; edges: Edge[] } {
  const nodes: Array<Node<AtlasFlowNodeData>> = [
    {
      id: "foothold",
      type: "atlasNode",
      position: { x: 20, y: 80 },
      data: {
        kind: "foothold",
        kicker: "Initial foothold",
        title: foothold.workload_name,
        subtitle: `${foothold.workload_type} · ${short(foothold.workload_id)}`,
      },
    },
  ]
  const edges: Edge[] = []
  let previous = "foothold"

  chain.steps.forEach((step, index) => {
    const kind = primitiveKind(step.primitive_id)
    const result = stepResult(chain, index)
    const id = `step-${step.step_index}`
    nodes.push({
      id,
      type: "atlasNode",
      position: { x: 300 * (index + 1), y: 80 },
      data: {
        kind,
        kicker: `Move ${index + 1}`,
        title: step.primitive_id.replaceAll("_", " "),
        subtitle: result ? short(result) : "State transition",
        primitive: step.primitive_id,
        result,
        evidenceIds: step.edge_evidence_ids,
      },
    })
    edges.push({
      id: `${previous}-${id}`,
      source: previous,
      target: id,
      type: "smoothstep",
      animated: true,
      label: kind === "identity" ? "identity" : kind === "data" ? "data access" : "movement",
      labelStyle: { fill: "#cbd5e1", fontSize: 9, fontWeight: 600 },
      labelBgStyle: { fill: "#0f2235", fillOpacity: 0.94 },
      style: { stroke: KIND_STYLE[kind].border, strokeWidth: 2.2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: KIND_STYLE[kind].border },
    })
    previous = id
  })

  const targetX = 300 * (chain.steps.length + 1)
  nodes.push({
    id: "jewel",
    type: "atlasNode",
    position: { x: targetX, y: 80 },
    data: {
      kind: "jewel",
      kicker: "Crown jewel reached",
      title: jewelName,
      subtitle: "Replay-validated target",
    },
  })
  edges.push({
    id: `${previous}-jewel`,
    source: previous,
    target: "jewel",
    type: "smoothstep",
    animated: true,
    style: { stroke: KIND_STYLE.jewel.border, strokeWidth: 2.4 },
    markerEnd: { type: MarkerType.ArrowClosed, color: KIND_STYLE.jewel.border },
  })
  return { nodes, edges }
}

function Flow({
  chain,
  foothold,
  jewelName,
}: {
  chain: AtlasLateralChain
  foothold: AtlasFootholdCandidate
  jewelName: string
}) {
  const { fitView } = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const [selected, setSelected] = useState<AtlasFlowNodeData | null>(null)
  const graph = useMemo(() => buildAtlasLateralFlowGraph(chain, foothold, jewelName), [chain, foothold, jewelName])
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)

  useEffect(() => {
    setNodes(graph.nodes)
  }, [graph.nodes, setNodes])

  useEffect(() => {
    if (!nodesInitialized) return
    setSelected(null)
    const timer = window.setTimeout(
      () => fitView({ padding: 0.1, duration: 350, minZoom: 0.65, maxZoom: 1.05 }),
      60,
    )
    return () => window.clearTimeout(timer)
  }, [chain.chain_id, fitView, nodesInitialized])

  return (
    <div className="relative h-full min-h-[440px] overflow-hidden bg-[#0b1828]" data-testid="atlas-interactive-flow-map">
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => setSelected(node.data as AtlasFlowNodeData)}
        onPaneClick={() => setSelected(null)}
        fitView
        fitViewOptions={{ padding: 0.1, minZoom: 0.65, maxZoom: 1.05 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#294158" gap={24} size={1} />
        <Controls showInteractive={false} className="!border-slate-700 !bg-[#13263a] !fill-slate-200" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => KIND_STYLE[(node.data as AtlasFlowNodeData).kind]?.border ?? "#64748b"}
          maskColor="rgba(2, 10, 20, 0.72)"
          className="!border !border-slate-700 !bg-[#13263a]"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 flex gap-2 rounded-lg border border-slate-700 bg-[#0f2235]/95 px-2.5 py-1.5 text-[9px] text-slate-300">
        <span className="text-purple-300">● identity</span>
        <span className="text-cyan-300">● movement</span>
        <span className="text-orange-300">● data access</span>
        <span className="text-red-300">● target</span>
      </div>

      {selected ? (
        <div className="absolute bottom-4 right-4 w-[min(360px,calc(100%-2rem))] rounded-xl border border-slate-600 bg-[#13263a]/98 p-4 text-slate-100 shadow-2xl">
          <button type="button" onClick={() => setSelected(null)} className="absolute right-3 top-3 text-slate-400 hover:text-white" aria-label="Close node details"><X className="h-4 w-4" /></button>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{selected.kicker}</div>
          <div className="mt-1 pr-5 text-sm font-semibold">{selected.title}</div>
          <div className="mt-1 break-all font-mono text-[10px] text-slate-400">{selected.result ?? selected.subtitle}</div>
          {selected.evidenceIds?.length ? (
            <div className="mt-3 border-t border-slate-700 pt-2 text-[10px] text-slate-300">
              Evidence: {selected.evidenceIds.map(short).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AtlasLateralFlowMap({
  selectedFoothold,
  response,
  jewelName,
}: {
  selectedFoothold: AtlasFootholdCandidate
  response: AtlasLateralResponse
  jewelName: string
}) {
  const [chainIndex, setChainIndex] = useState(0)
  useEffect(() => setChainIndex(0), [response.graph_snapshot_id, selectedFoothold.workload_id])
  const chain = response.chains[chainIndex] ?? response.chains[0]
  if (!chain) return null

  return (
    <div className="flex h-full min-h-[440px] flex-col bg-[#0b1828]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-[#102236] px-3 py-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Replay-validated attack chains">
          {response.chains.map((item, index) => (
            <button
              key={item.chain_id}
              type="button"
              role="tab"
              aria-selected={index === chainIndex}
              onClick={() => setChainIndex(index)}
              className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold ${index === chainIndex ? "border-red-400 bg-red-500/15 text-red-200" : "border-slate-600 bg-slate-800/60 text-slate-300 hover:border-slate-400"}`}
            >
              Chain {index + 1} · {item.steps.length} moves
            </button>
          ))}
        </div>
        <div className="font-mono text-[9px] text-slate-400">
          feasibility {Math.round(chain.feasibility_score * 100)}% · cost {chain.total_cost} · drag nodes · scroll to zoom
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Flow chain={chain} foothold={selectedFoothold} jewelName={jewelName} />
        </ReactFlowProvider>
      </div>
      {chain.assumptions_consumed.length ? (
        <div className="border-t border-slate-700 bg-[#102236] px-3 py-2 text-[9px] text-slate-400">
          Assumptions: {chain.assumptions_consumed.join(" · ").replaceAll("_", " ")}
        </div>
      ) : null}
    </div>
  )
}
