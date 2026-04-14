"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import {
  Shield,
  Database,
  Key,
  Globe,
  Server,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Loader2,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string
  label: string
  type: "IAMRole" | "SecurityGroup" | "S3Bucket" | "Service" | "External"
  lpScore: number
  gapCount: number
  usedCount: number
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  networkExposure?: { internetExposedRules: number; highRiskPorts: string[] }
  sgId?: string
}

interface GraphEdge {
  id: string
  source: string
  sourceType: string
  target: string
  targetType: string
  edgeType: string
  evidence?: {
    actions?: string[]
    bytes_transferred?: number | null
  }
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  summary: {
    totalNodes: number
    totalEdges: number
    byType: Record<string, number>
    edgesByType: Record<string, number>
    internetExposedNodes: number
  }
}

type Column = "identity" | "network" | "data"

interface LayoutNode {
  node: GraphNode
  column: Column
  x: number
  y: number
  w: number
  h: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: "rgba(239,68,68,0.10)",
  HIGH: "rgba(249,115,22,0.10)",
  MEDIUM: "rgba(234,179,8,0.08)",
  LOW: "rgba(34,197,94,0.08)",
}

const TYPE_ICON: Record<string, { icon: typeof Shield; color: string }> = {
  IAMRole: { icon: Key, color: "#8b5cf6" },
  SecurityGroup: { icon: Shield, color: "#3b82f6" },
  S3Bucket: { icon: Database, color: "#10b981" },
  Service: { icon: Server, color: "#6366f1" },
  External: { icon: Globe, color: "#ef4444" },
}

const MAX_VISIBLE = 5

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortName(label: string | null | undefined, type?: string, id?: string): string {
  if (!label && type === "External") return "Internet"
  if (!label) return id ? shortName(id, type) : type || "unknown"
  if (label === "Internet" || type === "External") return "Internet"
  // Hex-only IDs (e.g. Service principal hashes) → show type + short hash
  if (/^[0-9a-f]{32,}$/i.test(label)) return `${type || "Service"} (${label.slice(0, 6)}…)`
  let s = label
    .replace(/^aws-sam-cli-managed-default-/, "")
    .replace(/-\d{12}$/, "")
    .replace(/^saferemediate-/, "sr-")
  if (s.length > 22) s = s.slice(0, 20) + "…"
  return s
}

function classifyColumn(type: string): Column {
  if (type === "IAMRole" || type === "Service" || type === "External") return "identity"
  if (type === "SecurityGroup") return "network"
  return "data"
}

function severityRank(s: string): number {
  if (s === "CRITICAL") return 0
  if (s === "HIGH") return 1
  if (s === "MEDIUM") return 2
  return 3
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SystemMapPreview({ systemName }: { systemName: string }) {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  /* Fetch */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/proxy/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [systemName])

  /* Classify & sort nodes per column */
  const columns = useMemo(() => {
    if (!data) return { identity: [] as GraphNode[], network: [] as GraphNode[], data: [] as GraphNode[] }

    const buckets: Record<Column, GraphNode[]> = { identity: [], network: [], data: [] }
    for (const n of data.nodes) {
      buckets[classifyColumn(n.type)].push(n)
    }

    // Sort each column: highest severity first, then by gapCount desc
    const sort = (arr: GraphNode[]) =>
      arr.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.gapCount - a.gapCount)

    sort(buckets.identity)
    sort(buckets.network)
    sort(buckets.data)

    return buckets
  }, [data])

  /* Build layout positions */
  const { layoutNodes, svgWidth, svgHeight } = useMemo(() => {
    const COL_X = { identity: 0, network: 220, data: 440 }
    const COL_W = 190
    const NODE_H = 54
    const NODE_GAP = 8
    const TOP_OFFSET = 52

    const result: LayoutNode[] = []

    for (const col of ["identity", "network", "data"] as Column[]) {
      const items = columns[col].slice(0, MAX_VISIBLE)
      items.forEach((node, i) => {
        result.push({
          node,
          column: col,
          x: COL_X[col],
          y: TOP_OFFSET + i * (NODE_H + NODE_GAP),
          w: COL_W,
          h: NODE_H,
        })
      })
    }

    const maxRows = Math.max(
      Math.min(columns.identity.length, MAX_VISIBLE),
      Math.min(columns.network.length, MAX_VISIBLE),
      Math.min(columns.data.length, MAX_VISIBLE)
    )

    return {
      layoutNodes: result,
      svgWidth: 630,
      svgHeight: TOP_OFFSET + maxRows * (NODE_H + NODE_GAP) + 28,
    }
  }, [columns])

  /* Build edges for SVG connections */
  const svgEdges = useMemo(() => {
    if (!data) return []

    const nodePositions = new Map<string, LayoutNode>()
    for (const ln of layoutNodes) nodePositions.set(ln.node.id, ln)

    const edges: { from: LayoutNode; to: LayoutNode; type: string }[] = []

    for (const e of data.edges) {
      const from = nodePositions.get(e.source)
      const to = nodePositions.get(e.target)
      if (from && to && from.column !== to.column) {
        edges.push({ from, to, type: e.edgeType })
      }
    }

    return edges
  }, [data, layoutNodes])

  /* Hovered node's connected edges */
  const connectedIds = useMemo(() => {
    if (!hoveredNode || !data) return new Set<string>()
    const ids = new Set<string>()
    for (const e of data.edges) {
      if (e.source === hoveredNode) ids.add(e.target)
      if (e.target === hoveredNode) ids.add(e.source)
    }
    ids.add(hoveredNode)
    return ids
  }, [hoveredNode, data])

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#2D51DA]" />
          <span className="text-sm text-[var(--muted-foreground,#6b7280)]">Loading system map…</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-10 h-10 text-[#ef4444]" />
          <span className="text-sm font-medium text-[var(--foreground,#111827)]">Failed to load map</span>
          <span className="text-xs text-[var(--muted-foreground,#6b7280)]">{error}</span>
        </div>
      </div>
    )
  }

  const summary = data.summary

  // Count severity across all nodes
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const n of data.nodes) {
    if (n.severity in severityCounts) severityCounts[n.severity as keyof typeof severityCounts]++
  }

  const columnMeta: Record<Column, { label: string; icon: typeof Key; color: string; count: number }> = {
    identity: { label: "Identity & Access", icon: Key, color: "#8b5cf6", count: (summary.byType.IAMRole || 0) + (summary.byType.Service || 0) + (summary.byType.External || 0) },
    network: { label: "Network Controls", icon: Shield, color: "#3b82f6", count: summary.byType.SecurityGroup || 0 },
    data: { label: "Data Stores", icon: Database, color: "#10b981", count: summary.byType.S3Bucket || 0 },
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-4 flex-1">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
            <div key={sev} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLORS[sev] }}
              />
              <span className="text-xs font-medium" style={{ color: SEVERITY_COLORS[sev] }}>
                {severityCounts[sev]}
              </span>
              <span className="text-xs text-[var(--muted-foreground,#6b7280)]">{sev.charAt(0) + sev.slice(1).toLowerCase()}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground,#6b7280)]">
          <span className="font-semibold text-[var(--foreground,#111827)]">{summary.totalNodes}</span> resources
          <span className="mx-1">·</span>
          <span className="font-semibold text-[var(--foreground,#111827)]">{summary.totalEdges}</span> connections
        </div>
      </div>

      {/* Architecture diagram */}
      <div className="relative overflow-hidden rounded-lg border border-[var(--border,#e5e7eb)] bg-[#f8fafc]">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="select-none"
        >
          {/* Column headers */}
          {(["identity", "network", "data"] as Column[]).map((col) => {
            const meta = columnMeta[col]
            const x = col === "identity" ? 0 : col === "network" ? 220 : 440
            return (
              <g key={col}>
                {/* Column background */}
                <rect
                  x={x}
                  y={0}
                  width={190}
                  height={svgHeight}
                  fill={col === "identity" ? "rgba(139,92,246,0.03)" : col === "network" ? "rgba(59,130,246,0.03)" : "rgba(16,185,129,0.03)"}
                  rx={0}
                />
                {/* Vertical separator lines */}
                {col !== "identity" && (
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={svgHeight}
                    stroke="var(--border, #e5e7eb)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}
                {/* Column header */}
                <text
                  x={x + 95}
                  y={18}
                  textAnchor="middle"
                  className="text-[11px] font-semibold"
                  fill={meta.color}
                >
                  {meta.label}
                </text>
                <text
                  x={x + 95}
                  y={34}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="#9ca3af"
                >
                  {meta.count} resources
                </text>
              </g>
            )
          })}

          {/* Connection edges (draw before nodes so they sit behind) */}
          {svgEdges.map((edge, i) => {
            const fromX = edge.from.x + edge.from.w
            const fromY = edge.from.y + edge.from.h / 2
            const toX = edge.to.x
            const toY = edge.to.y + edge.to.h / 2

            const dx = (toX - fromX) * 0.5
            const isHighlighted = hoveredNode && (connectedIds.has(edge.from.node.id) && connectedIds.has(edge.to.node.id))
            const isDimmed = hoveredNode && !isHighlighted

            const strokeColor = edge.type === "s3_access"
              ? "#10b981"
              : edge.type === "iam_trust"
              ? "#8b5cf6"
              : edge.type === "internet"
              ? "#ef4444"
              : "#94a3b8"

            return (
              <g key={i} style={{ opacity: isDimmed ? 0.12 : 1, transition: "opacity 0.2s" }}>
                <path
                  d={`M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeOpacity={isHighlighted ? 0.9 : 0.5}
                />
                {/* Arrow head */}
                <circle
                  cx={toX}
                  cy={toY}
                  r={2.5}
                  fill={strokeColor}
                  fillOpacity={isHighlighted ? 0.9 : 0.6}
                />
              </g>
            )
          })}

          {/* Node cards */}
          {layoutNodes.map((ln) => {
            const { node, x, y, w, h } = ln
            const typeInfo = TYPE_ICON[node.type] || TYPE_ICON.Service
            const Icon = typeInfo.icon
            const isHovered = hoveredNode === node.id
            const isConnected = connectedIds.has(node.id)
            const isDimmed = hoveredNode !== null && !isConnected

            const sevColor = SEVERITY_COLORS[node.severity] || SEVERITY_COLORS.LOW
            const lpPct = Math.max(0, Math.min(100, node.lpScore || 0))

            return (
              <g
                key={node.id}
                style={{ opacity: isDimmed ? 0.3 : 1, transition: "opacity 0.2s" }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                {/* Card background */}
                <rect
                  x={x + 4}
                  y={y}
                  width={w - 8}
                  height={h}
                  rx={8}
                  fill="white"
                  stroke={isHovered ? sevColor : "var(--border, #e5e7eb)"}
                  strokeWidth={isHovered ? 1.5 : 1}
                  filter={isHovered ? "url(#cardShadow)" : undefined}
                />

                {/* Severity indicator bar (left edge) */}
                <rect
                  x={x + 4}
                  y={y + 8}
                  width={3}
                  height={h - 16}
                  rx={1.5}
                  fill={sevColor}
                />

                {/* Type icon */}
                <foreignObject x={x + 14} y={y + 8} width={22} height={22}>
                  <div
                    className="w-[22px] h-[22px] rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${typeInfo.color}15` }}
                  >
                    <Icon
                      style={{ width: 13, height: 13, color: typeInfo.color }}
                    />
                  </div>
                </foreignObject>

                {/* Name */}
                <text
                  x={x + 42}
                  y={y + 20}
                  className="text-[11px] font-medium"
                  fill="var(--foreground, #111827)"
                >
                  {shortName(node.label, node.type, node.id)}
                </text>

                {/* LP Score bar */}
                <rect
                  x={x + 42}
                  y={y + 28}
                  width={w - 60}
                  height={4}
                  rx={2}
                  fill="#f1f5f9"
                />
                <rect
                  x={x + 42}
                  y={y + 28}
                  width={Math.max(0, (w - 60) * (lpPct / 100))}
                  height={4}
                  rx={2}
                  fill={lpPct >= 80 ? "#22c55e" : lpPct >= 50 ? "#eab308" : "#ef4444"}
                />

                {/* LP Score text + gap count */}
                <text
                  x={x + 42}
                  y={y + 45}
                  className="text-[9px]"
                  fill="#9ca3af"
                >
                  LP {lpPct.toFixed(0)}%
                  {node.gapCount > 0 ? ` · ${node.gapCount} gaps` : ""}
                </text>

                {/* Severity badge */}
                <rect
                  x={x + w - 48}
                  y={y + 37}
                  width={38}
                  height={14}
                  rx={7}
                  fill={SEVERITY_BG[node.severity]}
                />
                <text
                  x={x + w - 29}
                  y={y + 47}
                  textAnchor="middle"
                  className="text-[8px] font-bold"
                  fill={sevColor}
                >
                  {node.severity}
                </text>
              </g>
            )
          })}

          {/* "+N more" indicators */}
          {(["identity", "network", "data"] as Column[]).map((col) => {
            const total = columns[col].length
            const overflow = total - MAX_VISIBLE
            if (overflow <= 0) return null
            const x = col === "identity" ? 0 : col === "network" ? 220 : 440
            const lastY = 52 + MAX_VISIBLE * 62
            return (
              <text
                key={`more-${col}`}
                x={x + 95}
                y={lastY}
                textAnchor="middle"
                className="text-[10px]"
                fill="#9ca3af"
              >
                +{overflow} more
              </text>
            )
          })}

          {/* Drop shadow filter */}
          <defs>
            <filter id="cardShadow" x="-4%" y="-4%" width="108%" height="116%">
              <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Flow legend */}
      <div className="flex items-center gap-5 text-[11px] text-[var(--muted-foreground,#6b7280)] px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[2px] rounded-full bg-[#10b981]" />
          <span>S3 Access</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[2px] rounded-full bg-[#8b5cf6]" />
          <span>IAM Trust</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[2px] rounded-full bg-[#ef4444]" />
          <span>Internet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[2px] rounded-full bg-[#3b82f6]" />
          <span>Network</span>
        </div>
      </div>
    </div>
  )
}
