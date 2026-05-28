"use client"

import React, { useMemo, useCallback, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow"
import "reactflow/dist/style.css"
import dagre from "dagre"
import { Globe, Server, UserCheck, Shield, Lock, Database, Crown, Network, Zap, Key } from "lucide-react"
import type { IdentityAttackPath, PathNodeDetail } from "@/components/identity-attack-paths/types"

// AllPathsGraph — fan-in DAG: every path to one crown jewel rendered
// in a single canvas with shared nodes (choke points) drawn ONCE.
// The whole point: if 14 Lambdas reach the same bucket through one
// shared IAM role, the CISO sees ONE role node with "14 paths through
// here" — not 14 separate path drawings. That's the Cyntro choke-point
// story per .cursorrules.

// ── Node category & colors — reuse the clean-attack-flow palette ────
type NodeCategory =
  | "entry"
  | "compute"
  | "identity"
  | "data"
  | "network"
  | "key"
  | "policy"
  | "service"
  | "other"

const CATEGORY_THEME: Record<NodeCategory, { bg: string; border: string; text: string; icon: React.ReactNode; label: string }> = {
  entry: { bg: "rgba(244,63,94,0.15)", border: "rgba(244,63,94,0.50)", text: "#fda4af", icon: <Globe className="w-3.5 h-3.5" />, label: "ENTRY" },
  compute: { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.50)", text: "#93c5fd", icon: <Server className="w-3.5 h-3.5" />, label: "COMPUTE" },
  identity: { bg: "rgba(168,85,247,0.15)", border: "rgba(168,85,247,0.50)", text: "#d8b4fe", icon: <UserCheck className="w-3.5 h-3.5" />, label: "IDENTITY" },
  data: { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.50)", text: "#6ee7b7", icon: <Crown className="w-3.5 h-3.5" />, label: "JEWEL" },
  network: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.40)", text: "#67e8f9", icon: <Network className="w-3.5 h-3.5" />, label: "NETWORK" },
  key: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.40)", text: "#fcd34d", icon: <Key className="w-3.5 h-3.5" />, label: "KEY" },
  policy: { bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.30)", text: "#d8b4fe", icon: <Lock className="w-3.5 h-3.5" />, label: "POLICY" },
  service: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.40)", text: "#cbd5e1", icon: <Zap className="w-3.5 h-3.5" />, label: "SERVICE" },
  other: { bg: "rgba(71,85,105,0.10)", border: "rgba(71,85,105,0.30)", text: "#94a3b8", icon: <Database className="w-3.5 h-3.5" />, label: "OTHER" },
}

function categorize(node: PathNodeDetail): NodeCategory {
  const t = (node.type || "").toLowerCase()
  const tier = (node.tier || "").toLowerCase()
  const lane = (node.lane || "").toLowerCase()
  if (tier === "crown_jewel" || lane === "crown_jewel") return "data"
  if (tier === "entry" || lane === "entry") return "entry"
  if (t.includes("vpc") || t.includes("subnet") || t.includes("nacl") || t.includes("internetgateway") || t.includes("routetable") || t.includes("natgateway") || t.includes("securitygroup")) return "network"
  if (t.includes("kms") || t.includes("secret")) return "key"
  if (t.includes("policy")) return "policy"
  if (t.includes("iam") || t.includes("role") || t.includes("instanceprofile") || t.includes("user") || t.includes("accesskey") || t.includes("stssession")) return "identity"
  if (t.includes("ec2") || t.includes("lambda") || t.includes("ecs") || t.includes("eks")) return "compute"
  return "other"
}

// ── Custom node ─────────────────────────────────────────────────────

interface FlowNodeData {
  label: string
  subtitle?: string
  category: NodeCategory
  isCrownJewel: boolean
  // True when the jewel for this view is reachable_only — surfaces a small
  // arrow glyph on every jewel-tier node so the cross-system semantics
  // stay visible no matter where the eye lands.
  isCrossSystem: boolean
  pathCount: number
  isChokePoint: boolean
  isHighlighted: boolean
  onClick?: () => void
}

function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const theme = CATEGORY_THEME[data.category]
  return (
    <div
      onClick={data.onClick}
      className="relative rounded-lg px-3 py-2 cursor-pointer transition-all hover:scale-105"
      style={{
        background: theme.bg,
        // Choke points get a thicker border. Crown jewel gets a red ring.
        border: `${data.isChokePoint ? 2 : 1}px solid ${data.isCrownJewel ? "#ef4444" : theme.border}`,
        minWidth: 140,
        maxWidth: 200,
        opacity: data.isHighlighted ? 1 : 0.95,
        boxShadow: data.isHighlighted ? `0 0 0 2px ${theme.text}` : "none",
      }}
      title={`${data.label}\n${data.pathCount} path${data.pathCount === 1 ? "" : "s"} through this node`}
    >
      <Handle type="target" position={Position.Left} style={{ background: theme.border, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: theme.border, width: 6, height: 6 }} />

      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color: theme.text }}>{theme.icon}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.text }}>
          {theme.label}
        </span>
        {data.isCrownJewel && data.isCrossSystem ? (
          <span
            className="text-[10px] font-bold leading-none"
            style={{ color: "#5eead4" }}
            title="Reached by this system's roles · jewel tagged to another system"
            aria-label="Cross-system jewel"
          >
            ↗
          </span>
        ) : null}
        {data.pathCount > 1 ? (
          <span
            className="ml-auto text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
            style={{ background: "rgba(20,184,166,0.2)", color: "#5eead4", border: "1px solid rgba(20,184,166,0.4)" }}
            title="Choke point — multiple paths share this node"
          >
            ×{data.pathCount}
          </span>
        ) : null}
      </div>
      <div className="text-xs font-medium text-white truncate" title={data.label}>
        {data.label}
      </div>
      {data.subtitle ? (
        <div className="text-[10px] text-slate-400 truncate mt-0.5" title={data.subtitle}>
          {data.subtitle}
        </div>
      ) : null}
    </div>
  )
}

const NODE_TYPES = { flowNode: FlowNode }

// ── Layout via dagre ────────────────────────────────────────────────

const NODE_W = 180
const NODE_H = 60

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 70, edgesep: 12, marginx: 30, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of edges) g.setEdge(e.source, e.target)

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    }
  })
}

// ── Build merged graph from N paths ─────────────────────────────────
//
// Across all paths to one crown jewel, deduplicate node ids and edge
// (source, target, type) triples. Count how many distinct paths each
// node and edge participates in — that's the choke-point metric.
//
// Canonicalization step: the backend sometimes emits the same logical
// resource with two different node ids across paths — observed in
// alon-prod where `cyntro-demo-ec2-s3-role` (an IAMRole) appears once
// keyed by ARN and once by short name, splitting one choke point into
// two badges (×4 and ×3 instead of ×7). The dedup below collapses any
// group of nodes that share (lowercased name, lowercased type) onto a
// single canonical id. We prefer the ARN-shaped id (longest contains
// "arn:") to keep deterministic behavior, then fall back to the
// longest id, then to the first seen.
function pickCanonicalId(ids: string[]): string {
  if (ids.length === 1) return ids[0]
  const arnLike = ids.filter((i) => i.startsWith("arn:"))
  if (arnLike.length > 0) {
    arnLike.sort((a, b) => b.length - a.length)
    return arnLike[0]
  }
  const sorted = [...ids].sort((a, b) => b.length - a.length)
  return sorted[0]
}

function buildIdCanonicalizer(paths: IdentityAttackPath[]): Map<string, string> {
  // group nodes by (name, type) — both lowercased and trimmed so casing
  // and stray whitespace don't escape the merge.
  const groups = new Map<string, Set<string>>()
  for (const p of paths) {
    for (const n of p.nodes ?? []) {
      if (!n?.id || !n?.name || !n?.type) continue
      const key = `${(n.name || "").toLowerCase().trim()}|${(n.type || "").toLowerCase().trim()}`
      const set = groups.get(key) ?? new Set<string>()
      set.add(n.id)
      groups.set(key, set)
    }
  }
  const rewrite = new Map<string, string>()
  for (const ids of groups.values()) {
    if (ids.size < 2) continue
    const canonical = pickCanonicalId([...ids])
    for (const id of ids) rewrite.set(id, canonical)
  }
  return rewrite
}

function buildMergedGraph(
  paths: IdentityAttackPath[],
  hoveredNodeId: string | null,
  onClick: (node: PathNodeDetail) => void,
  jewelSource: string | null,
): { nodes: Node[]; edges: Edge[]; nodePathIndex: Map<string, Set<number>> } {
  const nodeIndex = new Map<string, { node: PathNodeDetail; pathIndexes: Set<number> }>()
  const edgeIndex = new Map<string, { source: string; target: string; type: string; pathIndexes: Set<number>; isObserved: boolean }>()

  // Build the (name, type) → canonical id rewrite map ONCE per render.
  const canonical = buildIdCanonicalizer(paths)
  const canonicalize = (id: string): string => canonical.get(id) ?? id

  paths.forEach((p, pi) => {
    for (const n of p.nodes ?? []) {
      if (!n?.id) continue
      const cid = canonicalize(n.id)
      const prev = nodeIndex.get(cid)
      if (prev) {
        prev.pathIndexes.add(pi)
      } else {
        // Use the node payload from the canonical id when we see it, else
        // keep whichever was first — both should describe the same
        // logical resource; we just need stable display fields.
        nodeIndex.set(cid, { node: n, pathIndexes: new Set([pi]) })
      }
    }
    for (const e of p.edges ?? []) {
      if (!e?.source || !e?.target) continue
      const src = canonicalize(e.source)
      const tgt = canonicalize(e.target)
      // Skip self-loops that the canonicalization may have produced if a
      // path had two ids for the same resource adjacent in the chain.
      if (src === tgt) continue
      const key = `${src}::${tgt}::${e.type ?? ""}`
      const prev = edgeIndex.get(key)
      const isObserved = !!e.is_observed || (e.type ?? "").startsWith("ACTUAL_")
      if (prev) {
        prev.pathIndexes.add(pi)
        if (isObserved) prev.isObserved = true
      } else {
        edgeIndex.set(key, {
          source: src,
          target: tgt,
          type: e.type ?? "",
          pathIndexes: new Set([pi]),
          isObserved,
        })
      }
    }
  })

  // Build hover-highlight set: paths through the hovered node, then
  // every node that those paths visit, then every edge between them.
  const highlightNodes = new Set<string>()
  const highlightEdges = new Set<string>()
  if (hoveredNodeId && nodeIndex.has(hoveredNodeId)) {
    const targetPaths = nodeIndex.get(hoveredNodeId)!.pathIndexes
    for (const [id, info] of nodeIndex.entries()) {
      for (const pi of info.pathIndexes) {
        if (targetPaths.has(pi)) {
          highlightNodes.add(id)
          break
        }
      }
    }
    for (const [key, info] of edgeIndex.entries()) {
      for (const pi of info.pathIndexes) {
        if (targetPaths.has(pi)) {
          highlightEdges.add(key)
          break
        }
      }
    }
  }

  const nodes: Node[] = []
  for (const [id, info] of nodeIndex.entries()) {
    const cat = categorize(info.node)
    const pathCount = info.pathIndexes.size
    nodes.push({
      id,
      type: "flowNode",
      position: { x: 0, y: 0 },
      data: {
        label: info.node.name || id,
        subtitle: info.node.type,
        category: cat,
        isCrownJewel: cat === "data",
        isCrossSystem: cat === "data" && jewelSource === "reachable_only",
        pathCount,
        isChokePoint: pathCount >= 2,
        isHighlighted: hoveredNodeId == null ? true : highlightNodes.has(id),
        onClick: () => onClick(info.node),
      } as FlowNodeData,
    })
  }

  const edges: Edge[] = []
  for (const [key, info] of edgeIndex.entries()) {
    const inHover = hoveredNodeId == null ? true : highlightEdges.has(key)
    edges.push({
      id: key,
      source: info.source,
      target: info.target,
      type: "smoothstep",
      animated: info.isObserved && inHover,
      label: info.pathIndexes.size > 1 ? `×${info.pathIndexes.size}` : undefined,
      labelStyle: { fontSize: 9, fill: "#94a3b8", fontWeight: 600 },
      labelBgStyle: { fill: "rgba(15, 23, 42, 0.92)" },
      labelBgPadding: [3, 3],
      style: {
        stroke: info.isObserved ? "#22c55e" : "#64748b",
        strokeWidth: info.isObserved ? 2 : 1.4,
        strokeDasharray: info.isObserved ? undefined : "5,4",
        opacity: inHover ? 1 : 0.25,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: info.isObserved ? "#22c55e" : "#64748b",
        width: 14,
        height: 14,
      },
    })
  }

  const laidOut = autoLayout(nodes, edges)
  const nodePathIndex = new Map<string, Set<number>>()
  for (const [id, info] of nodeIndex.entries()) nodePathIndex.set(id, info.pathIndexes)
  return { nodes: laidOut, edges, nodePathIndex }
}

// ── Public component ────────────────────────────────────────────────

interface AllPathsGraphProps {
  paths: IdentityAttackPath[]
  onNodeClick: (node: PathNodeDetail) => void
  // Forwarded from the active CrownJewelSummary so jewel-tier nodes can
  // render a cross-system glyph when applicable. See attacker-map.tsx.
  jewelSource?: string | null
}

function AllPathsGraphInner({ paths, onNodeClick, jewelSource }: AllPathsGraphProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const { nodes, edges, chokePointCount } = useMemo(() => {
    const merged = buildMergedGraph(paths, hoveredNodeId, onNodeClick, jewelSource ?? null)
    const chokes = [...merged.nodePathIndex.values()].filter((s) => s.size >= 2).length
    return { ...merged, chokePointCount: chokes }
  }, [paths, hoveredNodeId, onNodeClick, jewelSource])

  const handleMouseEnter = useCallback((_evt: any, node: Node) => setHoveredNodeId(node.id), [])
  const handleMouseLeave = useCallback(() => setHoveredNodeId(null), [])

  if (paths.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No paths to this jewel
      </div>
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden relative"
      style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(148,163,184,0.12)", height: 540 }}
    >
      <div
        className="absolute top-2 left-2 z-10 px-2.5 py-1.5 rounded text-[10px] flex items-center gap-2"
        style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.2)" }}
      >
        <span className="text-slate-300">
          <span className="font-semibold text-slate-100 tabular-nums">{paths.length}</span> paths
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-300">
          <span className="font-semibold text-emerald-400 tabular-nums">{chokePointCount}</span> choke points
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400 text-[9px]">hover a node to highlight the paths through it</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={handleMouseEnter}
        onNodeMouseLeave={handleMouseLeave}
      >
        <Background color="#1e293b" gap={16} />
        <Controls showInteractive={false} className="!bg-slate-800/80 !border-slate-700" />
      </ReactFlow>
    </div>
  )
}

export function AllPathsGraph(props: AllPathsGraphProps) {
  return (
    <ReactFlowProvider>
      <AllPathsGraphInner {...props} />
    </ReactFlowProvider>
  )
}

export default AllPathsGraph
