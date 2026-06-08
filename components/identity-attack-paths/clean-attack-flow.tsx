"use client"

/**
 * Clean Attack Flow — reactflow + dagre auto-layout DAG.
 *
 * Replaces the rigid 5-lane column layout with a proper directed graph:
 *   - Auto-layout left → right via dagre (no manual positioning)
 *   - Curved arrows with arrowheads showing attack direction
 *   - Severity-aware node coloring
 *   - Renders the BFS path nodes + infra_context (VPC, Subnet, SG, IAM
 *     role, KMS, ALB) as one unified graph
 *   - Hover highlights the path; click selects the node
 *   - Hides empty lanes naturally (a node only appears if it exists)
 *
 * Per CISO ask "I want to see the entire flow between all the services,
 * beautiful clean flow describing the entire flow to the crown jewel".
 */

import React, { useMemo, useCallback } from "react"
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
import {
  Globe, Server, UserCheck, Crown, Shield, Lock, Key, Database, Zap,
  Network, Skull,
} from "lucide-react"
import type { IdentityAttackPath, PathNodeDetail } from "./types"

// ── Node category & colors ───────────────────────────────────────────
type NodeCategory = "entry" | "compute" | "identity" | "data" | "network" | "key" | "policy" | "service" | "lb" | "other"

const CATEGORY_THEME: Record<NodeCategory, {
  bg: string; border: string; text: string; icon: React.ReactNode; label: string
}> = {
  entry:    { bg: "rgba(244, 63,  94, 0.15)", border: "rgba(244, 63,  94, 0.50)", text: "#fda4af",  icon: <Globe className="w-3.5 h-3.5" />,    label: "ENTRY" },
  compute:  { bg: "rgba(59,  130, 246, 0.15)", border: "rgba(59,  130, 246, 0.50)", text: "#93c5fd", icon: <Server className="w-3.5 h-3.5" />,   label: "COMPUTE" },
  identity: { bg: "rgba(168, 85,  247, 0.15)", border: "rgba(168, 85,  247, 0.50)", text: "#d8b4fe", icon: <UserCheck className="w-3.5 h-3.5" />,label: "IDENTITY" },
  data:     { bg: "rgba(16,  185, 129, 0.15)", border: "rgba(16,  185, 129, 0.50)", text: "#6ee7b7", icon: <Crown className="w-3.5 h-3.5" />,    label: "DATA" },
  network:  { bg: "rgba(6,   182, 212, 0.12)", border: "rgba(6,   182, 212, 0.40)", text: "#67e8f9", icon: <Network className="w-3.5 h-3.5" />,  label: "NETWORK" },
  key:      { bg: "rgba(251, 191, 36,  0.12)", border: "rgba(251, 191, 36,  0.40)", text: "#fcd34d", icon: <Key className="w-3.5 h-3.5" />,      label: "KEY" },
  policy:   { bg: "rgba(168, 85,  247, 0.10)", border: "rgba(168, 85,  247, 0.30)", text: "#d8b4fe", icon: <Lock className="w-3.5 h-3.5" />,     label: "POLICY" },
  service:  { bg: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.40)", text: "#cbd5e1", icon: <Zap className="w-3.5 h-3.5" />,      label: "SERVICE" },
  lb:       { bg: "rgba(99,  102, 241, 0.12)", border: "rgba(99,  102, 241, 0.40)", text: "#a5b4fc", icon: <Shield className="w-3.5 h-3.5" />,   label: "LB" },
  other:    { bg: "rgba(71,  85,  105, 0.10)", border: "rgba(71,  85,  105, 0.30)", text: "#94a3b8", icon: <Database className="w-3.5 h-3.5" />, label: "OTHER" },
}

function categorizeType(t: string, lane?: string): NodeCategory {
  const lt = (t || "").toLowerCase()
  if (lane === "entry" || lt.includes("internetgateway") || lt.includes("apigateway") || lt.includes("loadbalancer") || lt.includes("cloudfront") || lt.includes("networkendpoint") || lt.includes("cloudtrailprincipal") || lt.includes("principal")) return "entry"
  if (lt.includes("loadbalancer") || lt === "alb" || lt === "nlb" || lt === "elb") return "lb"
  if (lt.includes("vpc") || lt.includes("subnet") || lt.includes("nacl") || lt.includes("securitygroup")) return "network"
  if (lt.includes("kms") || lt.includes("secret")) return "key"
  if (lt.includes("policy")) return "policy"
  if (lt.includes("iamrole") || lt.includes("iamuser") || lt.includes("instanceprofile") || lt.includes("accesskey") || lt.includes("stssession")) return "identity"
  if (lt.includes("ec2") || lt.includes("lambda") || lt.includes("ecs") || lt.includes("eks") || lt.includes("container")) return "compute"
  if (lt.includes("s3") || lt.includes("dynamo") || lt.includes("rds") || lt.includes("redshift") || lt.includes("elasticache")) return "data"
  if (lt === "service") return "service"
  return "other"
}

// ── Custom Node ───────────────────────────────────────────────────────
interface FlowNodeData {
  label: string
  subtitle?: string
  category: NodeCategory
  type: string
  isPathNode: boolean
  isCrownJewel: boolean
  isInternetExposed?: boolean
  destructive?: boolean
  onClick?: () => void
}

function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const theme = CATEGORY_THEME[data.category]
  return (
    <div
      onClick={data.onClick}
      className={`relative rounded-lg border-2 px-3 py-2 cursor-pointer transition-all hover:scale-105 ${
        data.isCrownJewel ? "ring-2 ring-red-500 ring-offset-2 ring-offset-slate-900" : ""
      }`}
      style={{
        background: theme.bg,
        borderColor: data.isPathNode ? theme.border : "rgba(71, 85, 105, 0.3)",
        minWidth: 140,
        maxWidth: 200,
        opacity: data.isPathNode ? 1 : 0.75,
      }}
      title={`${data.type} · ${data.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: theme.border, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: theme.border, width: 6, height: 6 }} />

      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color: theme.text }}>{theme.icon}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.text }}>
          {theme.label}
        </span>
        {data.isInternetExposed && (
          <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Internet exposed" />
        )}
      </div>
      <div className="text-xs font-semibold text-white truncate" title={data.label}>
        {data.label}
      </div>
      {data.subtitle && (
        <div className="text-[10px] text-slate-400 truncate mt-0.5" title={data.subtitle}>
          {data.subtitle}
        </div>
      )}
      {data.destructive && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center" title="Destructive capability">
          <Skull className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  )
}

const NODE_TYPES = { flowNode: FlowNode }

// ── Layout via dagre ──────────────────────────────────────────────────
const NODE_W = 180
const NODE_H = 64

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 64, edgesep: 12, marginx: 30, marginy: 30 })
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

// ── Build graph from path data ────────────────────────────────────────
function buildGraph(
  path: IdentityAttackPath,
  onNodeClick: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const pathNodeIds = new Set(path.nodes.map((n) => n.id))
  const lastNode = path.nodes[path.nodes.length - 1]
  const lastNodeId = lastNode?.id

  // 1) Add the path nodes
  for (const n of path.nodes) {
    const cat = categorizeType(n.type, n.lane)
    const isCrownJewel = n.id === lastNodeId
    const subtitle = (n as any).ip_metadata?.org
      ? `${(n as any).ip_metadata.org}${(n as any).ip_metadata.country ? " · " + (n as any).ip_metadata.country : ""}`
      : (n as any).ip_metadata?.aws
      ? `AWS ${(n as any).ip_metadata.aws.service}${(n as any).ip_metadata.aws.region && (n as any).ip_metadata.aws.region !== "GLOBAL" ? " · " + (n as any).ip_metadata.aws.region : ""}`
      : n.type
    nodes.set(n.id, {
      id: n.id,
      type: "flowNode",
      position: { x: 0, y: 0 },
      data: {
        label: n.name || n.id,
        subtitle,
        category: cat,
        type: n.type,
        isPathNode: true,
        isCrownJewel,
        isInternetExposed: n.is_internet_exposed,
        destructive: false,
        onClick: () => onNodeClick(n.id),
      },
    })
  }

  // 2) Add the path edges (BFS chain)
  for (const e of path.edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue
    const observed = (e as any).is_observed || e.type === "ACTUAL_TRAFFIC" || e.type?.startsWith("ACTUAL_")
    edges.push({
      id: `${e.source}--${e.type}--${e.target}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: observed,
      label: e.label || (e.type ?? "").replace(/_/g, " ").toLowerCase(),
      labelStyle: { fontSize: 9, fill: "#94a3b8", fontWeight: 600 },
      labelBgStyle: { fill: "rgba(15, 23, 42, 0.92)" },
      labelBgPadding: [3, 3],
      style: {
        stroke: observed ? "#22c55e" : "#64748b",
        strokeWidth: observed ? 2 : 1.5,
        strokeDasharray: observed ? undefined : "5,4",
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: observed ? "#22c55e" : "#64748b",
        width: 16, height: 16,
      },
    })
  }

  // 3) Add infra_context neighbors as orbiting nodes connected to their parent
  for (const n of path.nodes) {
    const ic = (n as any).infra_context
    if (!ic) continue
    const buckets = ["vpcs", "subnets", "security_groups", "nacls", "iam_roles", "iam_policies", "instance_profiles", "kms_keys", "load_balancers", "target_groups", "log_groups"] as const
    for (const bucket of buckets) {
      const items: Array<{ id: string; name: string; type: string; edge_type: string }> = ic[bucket] || []
      for (const item of items.slice(0, 3)) {
        // Skip if neighbor is already a path node
        if (pathNodeIds.has(item.id) || nodes.has(item.id)) continue
        const cat = categorizeType(item.type)
        nodes.set(item.id, {
          id: item.id,
          type: "flowNode",
          position: { x: 0, y: 0 },
          data: {
            label: item.name,
            subtitle: item.type,
            category: cat,
            type: item.type,
            isPathNode: false,  // dimmed, context only
            isCrownJewel: false,
            onClick: () => onNodeClick(item.id),
          },
        })
        // Edge from parent to neighbor (faded, no animation)
        edges.push({
          id: `${n.id}--${item.edge_type}--${item.id}`,
          source: n.id,
          target: item.id,
          type: "smoothstep",
          label: item.edge_type.replace(/_/g, " ").toLowerCase(),
          labelStyle: { fontSize: 8, fill: "#64748b" },
          labelBgStyle: { fill: "rgba(15, 23, 42, 0.8)" },
          labelBgPadding: [2, 2],
          style: { stroke: "#475569", strokeWidth: 1, strokeDasharray: "3,3" },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#475569",
            width: 12, height: 12,
          },
        })
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges }
}

// ── Public component ──────────────────────────────────────────────────
interface CleanAttackFlowProps {
  path: IdentityAttackPath
  onNodeClick: (id: string) => void
  selectedNodeId: string | null
  height?: number | string
}

export function CleanAttackFlow({ path, onNodeClick, height = 600 }: CleanAttackFlowProps) {
  const handleNodeClick = useCallback((id: string) => onNodeClick(id), [onNodeClick])

  const { nodes, edges } = useMemo(() => {
    const raw = buildGraph(path, handleNodeClick)
    return { nodes: autoLayout(raw.nodes, raw.edges), edges: raw.edges }
  }, [path, handleNodeClick])

  return (
    <div style={{ height, background: "rgba(2, 6, 23, 0.95)", borderRadius: 12 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{ type: "smoothstep" }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={24} />
          <Controls
            position="bottom-right"
            style={{ background: "rgba(15, 23, 42, 0.95)", border: "1px solid rgba(148, 163, 184, 0.2)" }}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
