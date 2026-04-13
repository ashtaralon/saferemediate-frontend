"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { SeverityBadge } from "./severity-badge"
import type { IdentityAttackPath, PathNodeDetail, PathEdgeDetail } from "./types"

interface AttackPathFlowVizProps {
  paths: IdentityAttackPath[]
  selectedPathIndex: number
  onNodeClick: (nodeId: string) => void
  selectedNodeId: string | null
}

// ── Tier config ──────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string; order: number }> = {
  entry: { label: "Entry Points", color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.08)", order: 0 },
  identity: { label: "Identity & Access", color: "#ec4899", bgColor: "rgba(236, 72, 153, 0.08)", order: 1 },
  network_control: { label: "Security Controls", color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.08)", order: 2 },
  crown_jewel: { label: "Crown Jewels", color: "#8b5cf6", bgColor: "rgba(139, 92, 246, 0.08)", order: 3 },
}

function getNodeIcon(type: string): string {
  const t = type?.toLowerCase() || ""
  if (t.includes("s3")) return "📦"
  if (t.includes("rds")) return "🗄️"
  if (t.includes("dynamo")) return "📊"
  if (t.includes("iam") || t.includes("role")) return "🔑"
  if (t.includes("ec2") || t.includes("instance")) return "🖥️"
  if (t.includes("lambda")) return "λ"
  if (t.includes("security") || t.includes("sg")) return "🛡️"
  if (t.includes("nacl")) return "🚧"
  if (t.includes("secret")) return "🔐"
  if (t.includes("kms")) return "🗝️"
  if (t.includes("external") || t.includes("internet") || t.includes("principal")) return "🌍"
  if (t.includes("user")) return "👤"
  return "•"
}

function getDisplayName(name: string): { line1: string; line2?: string } {
  if (name.length <= 24) return { line1: name }
  const breakPoints = ["-", "_", ".", "/"]
  const target = Math.floor(name.length / 2)
  let best = -1
  for (let i = Math.min(target + 5, name.length - 3); i >= Math.max(target - 10, 3); i--) {
    if (breakPoints.includes(name[i])) { best = i; break }
    if (i < name.length - 1 && /[a-z]/.test(name[i]) && /[A-Z]/.test(name[i + 1])) { best = i; break }
  }
  if (best === -1) best = Math.min(20, target)
  return {
    line1: name.slice(0, best + 1).slice(0, 22),
    line2: name.slice(best + 1).slice(0, 22),
  }
}

// ── Node Card ────────────────────────────────────────────────────────
const FlowNodeCard: React.FC<{
  node: PathNodeDetail
  isSelected: boolean
  isHovered: boolean
  hasHover: boolean
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  nodeRef: (el: HTMLDivElement | null) => void
}> = ({ node, isSelected, isHovered, hasHover, onHover, onClick, nodeRef }) => {
  const tier = TIER_CONFIG[node.tier] || TIER_CONFIG.identity
  const displayName = getDisplayName(node.name || node.id)

  return (
    <div
      ref={nodeRef}
      className="relative cursor-pointer transition-all duration-200"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${tier.color}22 0%, ${tier.color}11 100%)`
          : isHovered
          ? `rgba(30, 41, 59, 0.95)`
          : "rgba(30, 41, 59, 0.8)",
        borderTop: `1px solid ${isSelected || isHovered ? tier.color : "rgba(148, 163, 184, 0.2)"}`,
        borderRight: `1px solid ${isSelected || isHovered ? tier.color : "rgba(148, 163, 184, 0.2)"}`,
        borderBottom: `1px solid ${isSelected || isHovered ? tier.color : "rgba(148, 163, 184, 0.2)"}`,
        borderLeft: `4px solid ${tier.color}`,
        borderRadius: "10px",
        padding: "12px 14px",
        width: "180px",
        transform: isSelected ? "scale(1.05)" : isHovered ? "scale(1.03)" : "scale(1)",
        boxShadow: isSelected
          ? `0 8px 30px ${tier.color}40`
          : isHovered
          ? `0 4px 20px ${tier.color}30`
          : "0 2px 8px rgba(0,0,0,0.3)",
        opacity: hasHover && !isHovered && !isSelected ? 0.4 : 1,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node.id)}
    >
      {/* Internet exposed pulse */}
      {node.is_internet_exposed && (
        <div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
          style={{ background: "#ef4444", boxShadow: "0 0 8px #ef4444" }}
        />
      )}

      {/* Connection dot */}
      <div
        className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
        style={{ background: tier.color, boxShadow: `0 0 8px ${tier.color}` }}
      />

      {/* Node header */}
      <div className="flex items-start gap-2 mb-1">
        <span className="text-lg flex-shrink-0">{getNodeIcon(node.type)}</span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs font-semibold text-white leading-tight">{displayName.line1}</span>
          {displayName.line2 && (
            <span className="text-xs font-semibold text-white leading-tight">{displayName.line2}</span>
          )}
        </div>
      </div>

      {/* Type label */}
      <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-2">{node.type}</div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {node.gap_count > 0 && (
          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
            {node.gap_count} gaps
          </span>
        )}
        {node.lp_score !== null && node.lp_score !== undefined && (
          <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            LP {node.lp_score}%
          </span>
        )}
        {node.is_internet_exposed && (
          <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">exposed</span>
        )}
      </div>
    </div>
  )
}

// ── Animated Edge ────────────────────────────────────────────────────
const AnimatedEdge: React.FC<{
  edge: PathEdgeDetail
  sourcePos: { x: number; y: number } | null
  targetPos: { x: number; y: number } | null
  isHighlighted: boolean
  hasHighlight: boolean
}> = ({ edge, sourcePos, targetPos, isHighlighted, hasHighlight }) => {
  if (!sourcePos || !targetPos) return null

  const isObserved = edge.is_observed
  const baseColor = isObserved ? "#22c55e" : "#64748b"
  const opacity = isHighlighted ? 1 : hasHighlight ? 0.1 : 0.6
  const strokeWidth = isHighlighted ? 3 : 2

  const controlOffset = Math.min(Math.abs(targetPos.x - sourcePos.x) * 0.4, 120)
  const path = `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + controlOffset} ${sourcePos.y}, ${targetPos.x - controlOffset} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`

  const midX = (sourcePos.x + targetPos.x) / 2
  const midY = (sourcePos.y + targetPos.y) / 2 - 8

  return (
    <g>
      {isHighlighted && (
        <path d={path} fill="none" stroke={baseColor} strokeWidth={strokeWidth + 6} opacity={0.15} strokeLinecap="round" />
      )}

      <defs>
        <linearGradient id={`ap-grad-${edge.source}-${edge.target}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={baseColor} stopOpacity={opacity * 0.4} />
          <stop offset="50%" stopColor={baseColor} stopOpacity={opacity} />
          <stop offset="100%" stopColor={baseColor} stopOpacity={opacity * 0.4} />
        </linearGradient>
      </defs>

      <path
        d={path}
        fill="none"
        stroke={`url(#ap-grad-${edge.source}-${edge.target})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={isObserved ? "none" : "6,4"}
      />

      {/* Animated particles for observed edges */}
      {isObserved && (
        <>
          <defs>
            <filter id={`ap-glow-${edge.source}-${edge.target}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle r={5} fill={baseColor} filter={`url(#ap-glow-${edge.source}-${edge.target})`}>
            <animateMotion dur="2s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={4} fill="#fff" opacity={0.8}>
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="0.7s" />
          </circle>
          <circle r={5} fill={baseColor} filter={`url(#ap-glow-${edge.source}-${edge.target})`}>
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="1.4s" />
          </circle>
        </>
      )}

      {/* Edge label badge */}
      {edge.label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x="-40" y="-10" width="80" height="20" rx="6" fill="rgba(15, 23, 42, 0.95)" stroke={baseColor} strokeWidth={1} opacity={opacity} />
          <text textAnchor="middle" dy="4" fill={isObserved ? "#22c55e" : "#94a3b8"} fontSize="9" fontWeight="600">
            {edge.label.length > 14 ? edge.label.slice(0, 12) + ".." : edge.label}
          </text>
        </g>
      )}

      {/* Arrow head */}
      <circle cx={targetPos.x - 4} cy={targetPos.y} r={3} fill={baseColor} opacity={opacity} />
    </g>
  )
}

// ── Main Component ───────────────────────────────────────────────────
export function AttackPathFlowViz({ paths, selectedPathIndex, onNodeClick, selectedNodeId }: AttackPathFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const path = paths[selectedPathIndex] || null

  // Group nodes by tier
  const tierGroups = useMemo(() => {
    if (!path) return { entry: [], identity: [], network_control: [], crown_jewel: [] } as Record<string, PathNodeDetail[]>
    const groups: Record<string, PathNodeDetail[]> = { entry: [], identity: [], network_control: [], crown_jewel: [] }
    for (const node of path.nodes) {
      const tier = node.tier || "identity"
      if (!groups[tier]) groups[tier] = []
      groups[tier].push(node)
    }
    return groups
  }, [path])

  // Connected nodes for hover highlighting
  const connectedNodes = useMemo(() => {
    if (!hoveredNodeId || !path) return new Set<string>()
    const connected = new Set<string>([hoveredNodeId])
    for (const edge of path.edges) {
      if (edge.source === hoveredNodeId) connected.add(edge.target)
      if (edge.target === hoveredNodeId) connected.add(edge.source)
    }
    return connected
  }, [hoveredNodeId, path])

  // Recalculate positions on resize / path change
  const updatePositions = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    const newPositions: Record<string, { x: number; y: number }> = {}
    Object.keys(nodeRefs.current).forEach((id) => {
      const el = nodeRefs.current[id]
      if (!el) return
      const rect = el.getBoundingClientRect()
      newPositions[id] = {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      }
    })
    setPositions(newPositions)
  }, [])

  const pathId = path?.id
  useEffect(() => {
    const timer = setTimeout(updatePositions, 100)
    window.addEventListener("resize", updatePositions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", updatePositions)
    }
  }, [updatePositions, pathId])

  if (!path) return <div className="flex-1 flex items-center justify-center text-slate-400">No path selected</div>

  const activeTiers = Object.entries(TIER_CONFIG)
    .filter(([key]) => tierGroups[key]?.length > 0)
    .sort(([, a], [, b]) => a.order - b.order)

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-auto"
      style={{ background: "rgba(2, 6, 23, 0.95)" }}
    >
      {/* Path header bar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b"
        style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.15)" }}
      >
        <div className="flex items-center gap-3">
          <SeverityBadge severity={path.severity.severity} score={path.severity.overall_score} />
          <span className="text-xs text-slate-400">
            {path.hop_count} hops &middot; {path.evidence_type}
          </span>
          {path.path_kind && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              {path.path_kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{path.id}</span>
        </div>
      </div>

      {/* Tier columns */}
      <div className="flex items-stretch min-h-[500px] p-6 gap-6">
        {activeTiers.map(([tierKey, config], tierIdx) => (
          <React.Fragment key={tierKey}>
            {/* Tier column */}
            <div className="flex flex-col items-center min-w-[200px]">
              {/* Tier header */}
              <div
                className="mb-4 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: config.bgColor, color: config.color, border: `1px solid ${config.color}30` }}
              >
                {config.label}
              </div>

              {/* Nodes */}
              <div className="flex flex-col gap-3 items-center">
                {(tierGroups[tierKey] || []).map((node) => (
                  <FlowNodeCard
                    key={node.id}
                    node={node}
                    isSelected={selectedNodeId === node.id}
                    isHovered={hoveredNodeId === node.id || connectedNodes.has(node.id)}
                    hasHover={hoveredNodeId !== null}
                    onHover={setHoveredNodeId}
                    onClick={onNodeClick}
                    nodeRef={(el) => { nodeRefs.current[node.id] = el }}
                  />
                ))}
              </div>
            </div>

            {/* Arrow between tiers */}
            {tierIdx < activeTiers.length - 1 && (
              <div className="flex items-center justify-center px-2">
                <svg width="40" height="20" viewBox="0 0 40 20" className="text-slate-600">
                  <path d="M 0 10 L 30 10" stroke="currentColor" strokeWidth="2" strokeDasharray="4,3" />
                  <path d="M 26 5 L 34 10 L 26 15" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* SVG edge overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
        {path.edges.map((edge, i) => {
          const sourcePos = positions[edge.source]
            ? { x: positions[edge.source].x + 90, y: positions[edge.source].y }
            : null
          const targetPos = positions[edge.target]
            ? { x: positions[edge.target].x - 90, y: positions[edge.target].y }
            : null

          return (
            <AnimatedEdge
              key={`${edge.source}-${edge.target}-${i}`}
              edge={edge}
              sourcePos={sourcePos}
              targetPos={targetPos}
              isHighlighted={hoveredNodeId !== null && (connectedNodes.has(edge.source) || connectedNodes.has(edge.target))}
              hasHighlight={hoveredNodeId !== null}
            />
          )
        })}
      </svg>

      {/* Legend */}
      <div
        className="sticky bottom-0 flex items-center gap-4 px-4 py-2 border-t"
        style={{ background: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(148, 163, 184, 0.1)" }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 rounded" style={{ background: "#22c55e" }} />
          <span className="text-[10px] text-slate-400">Observed Traffic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 rounded" style={{ background: "#64748b", borderTop: "1px dashed #64748b" }} />
          <span className="text-[10px] text-slate-400">Configured</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#ef4444" }} />
          <span className="text-[10px] text-slate-400">Internet Exposed</span>
        </div>
      </div>
    </div>
  )
}
