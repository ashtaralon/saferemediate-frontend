"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import {
  Server, Shield, Lock, Key, HardDrive, Database, Zap, Globe,
  AlertTriangle, ArrowRightLeft, Crown,
} from "lucide-react"
import { SeverityBadge } from "./severity-badge"
import type { IdentityAttackPath, PathNodeDetail, PathEdgeDetail, RiskReduction } from "./types"

// ── Props ───────────────────────────────────────────────────────────
interface AttackPathFlowVizProps {
  paths: IdentityAttackPath[]
  selectedPathIndex: number
  onNodeClick: (nodeId: string) => void
  selectedNodeId: string | null
}

// ── Lane (column) configuration ─────────────────────────────────────
const LANE_CONFIG: Record<
  string,
  {
    label: string
    textColor: string
    bgColor: string
    borderColor: string
    hoverShadow: string
    Icon: React.FC<{ className?: string }>
    order: number
  }
> = {
  compute: {
    label: "COMPUTE",
    textColor: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/50",
    hoverShadow: "hover:shadow-blue-500/20",
    Icon: Server,
    order: 0,
  },
  security_group: {
    label: "SECURITY GROUPS",
    textColor: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500/50",
    hoverShadow: "hover:shadow-orange-500/20",
    Icon: Shield,
    order: 1,
  },
  nacl: {
    label: "NACLs",
    textColor: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    borderColor: "border-cyan-500/50",
    hoverShadow: "hover:shadow-cyan-500/20",
    Icon: Lock,
    order: 2,
  },
  iam: {
    label: "IAM ROLES",
    textColor: "text-pink-400",
    bgColor: "bg-pink-500/20",
    borderColor: "border-pink-500/50",
    hoverShadow: "hover:shadow-pink-500/20",
    Icon: Key,
    order: 3,
  },
  crown_jewel: {
    label: "CROWN JEWEL",
    textColor: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/50",
    hoverShadow: "hover:shadow-purple-500/20",
    Icon: Crown,
    order: 4,
  },
}

// Fallback mapping: tier -> lane
const TIER_TO_LANE: Record<string, string> = {
  entry: "compute",
  identity: "iam",
  network_control: "security_group",
  crown_jewel: "crown_jewel",
}

function resolveNodeLane(node: PathNodeDetail): string {
  if (node.lane) return node.lane
  // Infer from type
  const t = (node.type ?? "").toLowerCase()
  if (t.includes("nacl")) return "nacl"
  if (t.includes("security") || t.includes("sg")) return "security_group"
  if (t.includes("iam") || t.includes("role")) return "iam"
  if (t.includes("s3") || t.includes("rds") || t.includes("dynamo") || t.includes("secret") || t.includes("kms")) return "crown_jewel"
  // Fallback to tier
  return TIER_TO_LANE[node.tier] ?? "compute"
}

// ── Icons ───────────────────────────────────────────────────────────
function getNodeIcon(type: string): React.ReactNode {
  const t = (type ?? "").toLowerCase()
  if (t.includes("s3")) return <HardDrive className="w-4 h-4 text-emerald-400" />
  if (t.includes("dynamo")) return <Database className="w-4 h-4 text-amber-400" />
  if (t.includes("rds") || t.includes("database")) return <Database className="w-4 h-4 text-emerald-400" />
  if (t.includes("lambda")) return <Zap className="w-4 h-4 text-yellow-400" />
  if (t.includes("iam") || t.includes("role")) return <Key className="w-4 h-4 text-pink-400" />
  if (t.includes("security") || t.includes("sg")) return <Shield className="w-4 h-4 text-orange-400" />
  if (t.includes("nacl")) return <Lock className="w-4 h-4 text-cyan-400" />
  if (t.includes("ec2") || t.includes("instance") || t.includes("compute")) return <Server className="w-4 h-4 text-blue-400" />
  if (t.includes("secret") || t.includes("kms")) return <Key className="w-4 h-4 text-purple-400" />
  if (t.includes("external") || t.includes("internet") || t.includes("principal")) return <Globe className="w-4 h-4 text-red-400" />
  return <Server className="w-4 h-4 text-slate-400" />
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "0 B"
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

function truncateName(name: string | null | undefined, max: number = 26): string {
  if (!name) return "Unknown"
  if (name.length <= max) return name
  return name.slice(0, max - 1) + "\u2026"
}

// ── Node Card Metric Badges ─────────────────────────────────────────
function NodeBadges({ node }: { node: PathNodeDetail }) {
  const lane = resolveNodeLane(node)
  const badges: React.ReactNode[] = []

  // IAM badges
  if (lane === "iam") {
    const unusedPerms = node.permissions?.unused
    if (unusedPerms != null && unusedPerms > 0) {
      badges.push(
        <span key="unused" className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
          {unusedPerms} unused perms
        </span>
      )
    }
    if (node.lp_score != null) {
      badges.push(
        <span key="lp" className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
          LP {node.lp_score}%
        </span>
      )
    }
    const wildcards = node.policy_details?.wildcards
    if (wildcards && wildcards.length > 0) {
      badges.push(
        <span key="wild" className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
          {wildcards.length} wildcard{wildcards.length !== 1 ? "s" : ""}
        </span>
      )
    }
  }

  // Security Group badges
  if (lane === "security_group") {
    const openPorts = node.open_ports?.length ?? 0
    const unusedPorts = node.unused_ports?.length ?? 0
    if (openPorts > 0) {
      badges.push(
        <span key="open" className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
          {openPorts} open port{openPorts !== 1 ? "s" : ""}
        </span>
      )
    }
    if (unusedPorts > 0) {
      badges.push(
        <span key="unused-ports" className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
          {unusedPorts} unused
        </span>
      )
    }
    if (node.rules?.open_to_internet) {
      badges.push(
        <span key="inet" className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
          0.0.0.0/0
        </span>
      )
    }
  }

  // NACL badges
  if (lane === "nacl") {
    const total = (node.rules?.inbound_count ?? 0) + (node.rules?.outbound_count ?? 0)
    if (total > 0) {
      badges.push(
        <span key="rules" className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-medium">
          {total} rules
        </span>
      )
    }
    if (node.gap_count > 0) {
      badges.push(
        <span key="gaps" className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
          {node.gap_count} gaps
        </span>
      )
    }
  }

  // Compute badges
  if (lane === "compute") {
    const traffic = node.traffic_summary
    if (traffic) {
      const total = (traffic.inbound_bytes ?? 0) + (traffic.outbound_bytes ?? 0)
      if (total > 0) {
        badges.push(
          <span key="traffic" className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
            {formatBytes(total)}
          </span>
        )
      }
    }
    if (node.is_internet_exposed) {
      badges.push(
        <span key="exposed" className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          exposed
        </span>
      )
    }
  }

  // Crown Jewel badges
  if (lane === "crown_jewel") {
    if (node.data_classification) {
      badges.push(
        <span key="class" className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-medium uppercase">
          {node.data_classification}
        </span>
      )
    }
    const vol = node.access_summary?.data_volume_bytes
    if (vol != null && vol > 0) {
      badges.push(
        <span key="vol" className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
          {formatBytes(vol)}
        </span>
      )
    }
    if (node.encryption) {
      const allEnc = node.encryption.at_rest && node.encryption.in_transit
      badges.push(
        <span
          key="enc"
          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            allEnc ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
          }`}
        >
          {allEnc ? "encrypted" : "partial enc"}
        </span>
      )
    }
  }

  // Generic fallbacks
  if (badges.length === 0) {
    if (node.gap_count > 0) {
      badges.push(
        <span key="gaps" className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
          {node.gap_count} gaps
        </span>
      )
    }
    if (node.lp_score != null) {
      badges.push(
        <span key="lp" className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
          LP {node.lp_score}%
        </span>
      )
    }
  }

  if (badges.length === 0) return null
  return <div className="flex flex-wrap gap-1 mt-2">{badges}</div>
}

// ── Severity indicator bar ──────────────────────────────────────────
function riskColor(node: PathNodeDetail): string {
  const score = node.lp_score ?? node.gap_count * 10
  if (score >= 75) return "#ef4444"
  if (score >= 50) return "#f97316"
  if (score >= 25) return "#eab308"
  return "#22c55e"
}

// ── Node Card ───────────────────────────────────────────────────────
const FlowNodeCard: React.FC<{
  node: PathNodeDetail
  lane: string
  isSelected: boolean
  isHighlighted: boolean
  isDimmed: boolean
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  nodeRef: (el: HTMLDivElement | null) => void
}> = ({ node, lane, isSelected, isHighlighted, isDimmed, onHover, onClick, nodeRef }) => {
  const cfg = LANE_CONFIG[lane] ?? LANE_CONFIG.compute

  // Tailwind classes for color
  const borderClass = isSelected
    ? cfg.borderColor.replace("/50", "/80")
    : isHighlighted
    ? cfg.borderColor
    : "border-slate-700/60"

  return (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 cursor-pointer
        ${borderClass}
        ${isSelected ? `${cfg.bgColor} shadow-lg` : "bg-slate-900/80"}
        ${isHighlighted && !isSelected ? `${cfg.bgColor} hover:shadow-lg ${cfg.hoverShadow}` : ""}
        ${isDimmed ? "opacity-30" : ""}
        hover:border-opacity-80 hover:shadow-lg hover:scale-[1.02]
      `}
      style={{
        minWidth: 200,
        maxWidth: 260,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node.id)}
    >
      {/* Internet exposed pulse dot */}
      {node.is_internet_exposed && (
        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 8px #ef4444" }} />
      )}

      {/* Icon + content */}
      <div className="flex-shrink-0">{getNodeIcon(node.type)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white truncate leading-tight">{truncateName(node.name ?? node.id)}</p>
        <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{node.type}</p>
        <NodeBadges node={node} />
      </div>

      {/* Bottom risk bar */}
      <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min((node.lp_score ?? node.gap_count * 10), 100)}%`,
            background: riskColor(node),
          }}
        />
      </div>
    </div>
  )
}

// ── Animated Edge ───────────────────────────────────────────────────
const AnimatedEdge: React.FC<{
  edge: PathEdgeDetail
  sourcePos: { x: number; y: number } | null
  targetPos: { x: number; y: number } | null
  isHighlighted: boolean
  hasHighlight: boolean
  showLabel: boolean
}> = ({ edge, sourcePos, targetPos, isHighlighted, hasHighlight, showLabel }) => {
  if (!sourcePos || !targetPos) return null

  const isObserved = edge.is_observed
  const baseColor = isObserved ? "#22c55e" : "#64748b"
  const opacity = isHighlighted ? 1 : hasHighlight ? 0.08 : 0.5
  const strokeWidth = isHighlighted ? 3 : 1.5

  const dx = targetPos.x - sourcePos.x
  const controlOffset = Math.min(Math.abs(dx) * 0.4, 140)
  const pathD = `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + controlOffset} ${sourcePos.y}, ${targetPos.x - controlOffset} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`

  const midX = (sourcePos.x + targetPos.x) / 2
  const midY = (sourcePos.y + targetPos.y) / 2 - 10

  const edgeId = `${edge.source}-${edge.target}`

  return (
    <g>
      {/* Glow behind highlighted edges */}
      {isHighlighted && (
        <path d={pathD} fill="none" stroke={baseColor} strokeWidth={strokeWidth + 6} opacity={0.12} strokeLinecap="round" />
      )}

      <defs>
        <linearGradient id={`ap-grad-${edgeId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={baseColor} stopOpacity={opacity * 0.3} />
          <stop offset="50%" stopColor={baseColor} stopOpacity={opacity} />
          <stop offset="100%" stopColor={baseColor} stopOpacity={opacity * 0.3} />
        </linearGradient>
      </defs>

      <path
        d={pathD}
        fill="none"
        stroke={`url(#ap-grad-${edgeId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={isObserved ? "none" : "6,4"}
      />

      {/* Animated particles for observed edges */}
      {isObserved && opacity > 0.3 && (
        <>
          <defs>
            <filter id={`ap-glow-${edgeId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle r={4} fill={baseColor} filter={`url(#ap-glow-${edgeId})`} opacity={opacity}>
            <animateMotion dur="2.5s" repeatCount="indefinite" path={pathD} />
          </circle>
          <circle r={3} fill="#fff" opacity={opacity * 0.7}>
            <animateMotion dur="2.5s" repeatCount="indefinite" path={pathD} begin="0.8s" />
          </circle>
          <circle r={4} fill={baseColor} filter={`url(#ap-glow-${edgeId})`} opacity={opacity}>
            <animateMotion dur="2.5s" repeatCount="indefinite" path={pathD} begin="1.6s" />
          </circle>
        </>
      )}

      {/* Edge label on hover */}
      {showLabel && edge.label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x="-44" y="-11" width="88" height="22" rx="6" fill="rgba(15, 23, 42, 0.95)" stroke={baseColor} strokeWidth={1} />
          <text textAnchor="middle" dy="4" fill={isObserved ? "#22c55e" : "#94a3b8"} fontSize="9" fontWeight="600" fontFamily="ui-monospace, monospace">
            {(edge.label?.length ?? 0) > 14 ? edge.label.slice(0, 12) + ".." : edge.label}
          </text>
        </g>
      )}

      {/* Arrow dot */}
      <circle cx={targetPos.x - 4} cy={targetPos.y} r={3} fill={baseColor} opacity={opacity} />
    </g>
  )
}

// ── Risk Reduction Bar ──────────────────────────────────────────────
function RiskReductionBar({ riskReduction }: { riskReduction: RiskReduction }) {
  const { current_score, achievable_score, top_actions } = riskReduction
  const reduction = current_score > 0 ? Math.round(((current_score - achievable_score) / current_score) * 100) : 0

  return (
    <div className="flex items-center gap-4 w-full">
      {/* Progress bar */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400">Risk Reduction Potential</span>
          <span className="text-[10px] font-bold text-emerald-400">-{reduction}%</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden bg-slate-800">
          {/* achievable (green) */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/60"
            style={{ width: `${Math.min(current_score, 100)}%` }}
          />
          {/* current overshoot (red part that would be removed) */}
          <div
            className="absolute inset-y-0 rounded-full bg-red-500/60"
            style={{
              left: `${Math.min(achievable_score, 100)}%`,
              width: `${Math.min(current_score - achievable_score, 100)}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[9px] text-slate-500 font-mono">{achievable_score}</span>
          <span className="text-[9px] text-red-400 font-mono">{current_score}</span>
        </div>
      </div>

      {/* Top actions */}
      <div className="flex items-center gap-2">
        {(top_actions ?? []).slice(0, 3).map((a, i) => (
          <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/50">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] text-slate-300 max-w-[100px] truncate">{a.action}</span>
            <span className="text-[9px] text-emerald-400 font-bold">-{a.impact}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────
export function AttackPathFlowViz({ paths, selectedPathIndex, onNodeClick, selectedNodeId }: AttackPathFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)

  const path = paths?.[selectedPathIndex] ?? null

  // Group nodes into lanes
  const laneGroups = useMemo(() => {
    const groups: Record<string, PathNodeDetail[]> = {
      compute: [],
      security_group: [],
      nacl: [],
      iam: [],
      crown_jewel: [],
    }
    if (!path) return groups
    for (const node of path.nodes ?? []) {
      const lane = resolveNodeLane(node)
      if (!groups[lane]) groups[lane] = []
      groups[lane].push(node)
    }
    return groups
  }, [path])

  // Active lanes (ones that have nodes)
  const activeLanes = useMemo(() => {
    // If backend provides lane definitions, use their order but only show populated ones
    if (path?.lanes && path.lanes.length > 0) {
      return path.lanes
        .filter((l) => (laneGroups[l.id]?.length ?? 0) > 0)
        .map((l) => l.id)
    }
    return Object.entries(LANE_CONFIG)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key]) => key)
      .filter((key) => (laneGroups[key]?.length ?? 0) > 0)
  }, [path, laneGroups])

  // Connected nodes for hover highlighting
  const connectedNodes = useMemo(() => {
    if (!hoveredNodeId || !path) return new Set<string>()
    const connected = new Set<string>([hoveredNodeId])
    for (const edge of path.edges ?? []) {
      if (edge.source === hoveredNodeId) connected.add(edge.target)
      if (edge.target === hoveredNodeId) connected.add(edge.source)
    }
    return connected
  }, [hoveredNodeId, path])

  // Recalculate positions
  const updatePositions = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    const newPositions: Record<string, { x: number; y: number }> = {}
    for (const id of Object.keys(nodeRefs.current)) {
      const el = nodeRefs.current[id]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      newPositions[id] = {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      }
    }
    setPositions(newPositions)
  }, [])

  const pathId = path?.id
  useEffect(() => {
    const timer = setTimeout(updatePositions, 120)
    window.addEventListener("resize", updatePositions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", updatePositions)
    }
  }, [updatePositions, pathId])

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p className="text-sm">No path selected</p>
      </div>
    )
  }

  const hasHover = hoveredNodeId !== null

  return (
    <div ref={containerRef} className="flex-1 relative overflow-auto flex flex-col" style={{ background: "rgba(2, 6, 23, 0.95)" }}>
      {/* ── Path header bar ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b"
        style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.15)" }}
      >
        <div className="flex items-center gap-3">
          <SeverityBadge severity={path.severity?.severity ?? "LOW"} score={path.severity?.overall_score} />
          <span className="text-xs text-slate-400">
            {path.hop_count ?? path.nodes?.length ?? 0} hops &middot; {path.evidence_type ?? "configured"}
          </span>
          {path.path_kind && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              {path.path_kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded bg-green-500" />
            <span className="text-[10px] text-slate-500">Observed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded border-t border-dashed border-slate-500" />
            <span className="text-[10px] text-slate-500">Configured</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-slate-500">Internet Exposed</span>
          </div>
        </div>
      </div>

      {/* ── Flow columns ── */}
      <div className="flex-1 flex items-stretch p-6 gap-4 min-h-[480px]">
        {activeLanes.map((laneKey, laneIdx) => {
          const cfg = LANE_CONFIG[laneKey] ?? LANE_CONFIG.compute
          const nodes = laneGroups[laneKey] ?? []
          const LaneIcon = cfg.Icon
          const isEdge = laneIdx === 0 || laneIdx === activeLanes.length - 1

          return (
            <React.Fragment key={laneKey}>
              <div className={`flex flex-col items-center ${isEdge ? "flex-1" : "min-w-[220px]"}`}>
                {/* Column header */}
                <div className={`flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.textColor} ${cfg.bgColor} border ${cfg.borderColor}`}>
                  <LaneIcon className="w-3.5 h-3.5" />
                  <span>{cfg.label}</span>
                  <span className="opacity-60">({nodes.length})</span>
                </div>

                {/* Nodes */}
                <div className="flex flex-col gap-3 items-center w-full">
                  {nodes.map((node) => (
                    <FlowNodeCard
                      key={node.id}
                      node={node}
                      lane={laneKey}
                      isSelected={selectedNodeId === node.id}
                      isHighlighted={hoveredNodeId === node.id || connectedNodes.has(node.id)}
                      isDimmed={hasHover && !connectedNodes.has(node.id) && selectedNodeId !== node.id}
                      onHover={setHoveredNodeId}
                      onClick={onNodeClick}
                      nodeRef={(el) => {
                        nodeRefs.current[node.id] = el
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Arrow separator between columns */}
              {laneIdx < activeLanes.length - 1 && (
                <div className="flex items-center justify-center px-1 self-center">
                  <svg width="32" height="16" viewBox="0 0 32 16" className="text-slate-600">
                    <path d="M 0 8 L 22 8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                    <path d="M 18 4 L 26 8 L 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── SVG edge overlay ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
        {(path.edges ?? []).map((edge, i) => {
          const srcEl = nodeRefs.current[edge.source]
          const tgtEl = nodeRefs.current[edge.target]

          const sourcePos = positions[edge.source]
            ? { x: positions[edge.source].x + (srcEl ? srcEl.offsetWidth / 2 + 4 : 90), y: positions[edge.source].y }
            : null
          const targetPos = positions[edge.target]
            ? { x: positions[edge.target].x - (tgtEl ? tgtEl.offsetWidth / 2 + 4 : 90), y: positions[edge.target].y }
            : null

          const edgeKey = `${edge.source}-${edge.target}`
          const isEdgeHighlighted =
            hoveredNodeId !== null &&
            (connectedNodes.has(edge.source) && connectedNodes.has(edge.target))

          return (
            <AnimatedEdge
              key={`${edgeKey}-${i}`}
              edge={edge}
              sourcePos={sourcePos}
              targetPos={targetPos}
              isHighlighted={isEdgeHighlighted}
              hasHighlight={hasHover}
              showLabel={isEdgeHighlighted || hoveredEdge === edgeKey}
            />
          )
        })}
      </svg>

      {/* ── Risk Reduction Footer ── */}
      {path.risk_reduction && (
        <div
          className="sticky bottom-0 z-20 px-4 py-2.5 border-t"
          style={{ background: "rgba(15, 23, 42, 0.97)", borderColor: "rgba(148, 163, 184, 0.12)" }}
        >
          <RiskReductionBar riskReduction={path.risk_reduction} />
        </div>
      )}
    </div>
  )
}
