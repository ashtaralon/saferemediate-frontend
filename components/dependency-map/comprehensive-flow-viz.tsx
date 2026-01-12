'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { RefreshCw, Maximize2, Minimize2, X, Search, Shield, Key, Database, HardDrive, Server, Globe } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface ExternalNode {
  id: string
  name: string
  type: string
  tier: string
  ip_range?: string
  total_inbound_flows: number
  total_outbound_flows: number
}

interface ComputeNode {
  id: string
  name: string
  type: string
  tier: string
  instance_id?: string
  private_ip?: string
  public_ip?: string
  security_groups: string[]
  iam_role?: string
  inbound_flows: number
  outbound_flows: number
  ports_listening: number[]
}

interface SecurityGroupNode {
  id: string
  name: string
  type: string
  tier: string
  vpc_id?: string
  ingress_rules: any[]
  egress_rules: any[]
  attached_resources: string[]
}

interface IAMRoleNode {
  id: string
  name: string
  type: string
  tier: string
  arn?: string
  trust_policy?: string
  permissions: any[]
  attached_resources: string[]
  unused_permissions_count: number
}

interface DataNode {
  id: string
  name: string
  type: string
  tier: string
  endpoint?: string
  port: number
  engine?: string
  access_sources: string[]
  total_connections: number
}

interface StorageNode {
  id: string
  name: string
  type: string
  tier: string
  arn?: string
  api_calls: any[]
}

interface Edge {
  id: string
  source: string
  target: string
  edge_type: string
  label?: string
  port?: number
  protocol?: string
  flows: number
  bytes_total: number
  action?: string
  style: string
  color: string
  // S3 operation details
  iam_action?: string  // e.g., s3:PutObject
  operation_category?: string  // READ, WRITE, DELETE, ADMIN
  assumed_role_arn?: string  // IAM role ARN used
  assumed_role_name?: string  // IAM role name
  source_instance?: string  // EC2 instance ID
}

type AnyNode = ExternalNode | ComputeNode | SecurityGroupNode | IAMRoleNode | DataNode | StorageNode

interface ComprehensiveMapResponse {
  system_id: string
  external_nodes: ExternalNode[]
  compute_nodes: ComputeNode[]
  security_nodes: SecurityGroupNode[]
  identity_nodes: IAMRoleNode[]
  data_nodes: DataNode[]
  storage_nodes: StorageNode[]
  edges: Edge[]
  total_nodes: number
  total_edges: number
  data_sources: { flow_logs: boolean; cloudtrail: boolean; config: boolean }
  last_updated: string
}

type Tier = 'external' | 'compute' | 'security' | 'identity' | 'data' | 'storage'

interface ComprehensiveFlowVizProps {
  systemName: string
  onNodeClick?: (node: any) => void
  onRefresh?: () => void
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const TIER_CONFIG: Record<Tier, { label: string; color: string; bgColor: string; order: number; icon: React.ReactNode }> = {
  external: { label: 'External', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.1)', order: 0, icon: <Globe className="w-4 h-4" /> },
  compute: { label: 'Compute', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', order: 1, icon: <Server className="w-4 h-4" /> },
  security: { label: 'Security Groups', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', order: 2, icon: <Shield className="w-4 h-4" /> },
  identity: { label: 'IAM Roles', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.1)', order: 3, icon: <Key className="w-4 h-4" /> },
  data: { label: 'Data Tier', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.1)', order: 4, icon: <Database className="w-4 h-4" /> },
  storage: { label: 'Storage', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.1)', order: 5, icon: <HardDrive className="w-4 h-4" /> },
}

const EDGE_STYLES: Record<string, { color: string; style: string; label: string }> = {
  TRAFFIC: { color: '#22c55e', style: 'solid', label: 'Network Traffic' },
  API_CALL: { color: '#3b82f6', style: 'dashed', label: 'API Calls' },
  PROTECTED_BY: { color: '#f59e0b', style: 'dashed', label: 'SG Protection' },
  HAS_ROLE: { color: '#ec4899', style: 'dotted', label: 'IAM Role' },
  ALLOWED: { color: '#22c55e', style: 'dotted', label: 'SG Allows' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

function getDisplayName(node: AnyNode): { line1: string; line2?: string } {
  const name = node.name || node.id

  // If name fits in one line (under 22 chars), return as is
  if (name.length <= 22) return { line1: name }

  // Try to split at natural break points (hyphens, underscores, dots, camelCase)
  const breakPoints = ['-', '_', '.', '/']

  // Find the best break point near the middle
  let bestBreak = -1
  const targetPos = Math.floor(name.length / 2)

  for (let i = Math.min(targetPos + 5, name.length - 3); i >= Math.max(targetPos - 10, 3); i--) {
    if (breakPoints.includes(name[i])) {
      bestBreak = i
      break
    }
    // Also break at camelCase transitions
    if (i < name.length - 1 && /[a-z]/.test(name[i]) && /[A-Z]/.test(name[i + 1])) {
      bestBreak = i
      break
    }
  }

  // If no good break point, force break at middle
  if (bestBreak === -1) {
    bestBreak = Math.min(18, Math.floor(name.length / 2))
  }

  const line1 = name.slice(0, bestBreak + 1)
  const line2 = name.slice(bestBreak + 1)

  return {
    line1: line1.length > 22 ? line1.slice(0, 20) + '..' : line1,
    line2: line2.length > 22 ? line2.slice(0, 20) + '..' : line2
  }
}

function getNodeIcon(node: AnyNode): string {
  const type = node.type?.toLowerCase() || ''
  if (type === 'ec2') return '🖥️'
  if (type === 'lambda') return 'λ'
  if (type === 'securitygroup') return '🛡️'
  if (type === 'iamrole') return '🔑'
  if (type === 'rds') return '🗄️'
  if (type === 'dynamodb') return '📊'
  if (type === 's3') return '📦'
  if (type === 'sts') return '🎫'
  if (type === 'external') return '🌍'
  return '•'
}

// ============================================================================
// NODE CARD COMPONENT - Enhanced with flow indicators
// ============================================================================

const NodeCard: React.FC<{
  node: AnyNode
  tier: Tier
  inboundFlows: number
  outboundFlows: number
  isHighlighted: boolean
  isConnected: boolean
  hasHighlight: boolean
  onHover: (id: string | null) => void
  nodeRef: (el: HTMLDivElement | null) => void
}> = ({ node, tier, inboundFlows, outboundFlows, isHighlighted, isConnected, hasHighlight, onHover, nodeRef }) => {
  const tierColor = TIER_CONFIG[tier]?.color || '#64748b'
  const icon = getNodeIcon(node)
  const hasFlows = inboundFlows > 0 || outboundFlows > 0

  return (
    <div
      ref={nodeRef}
      className="relative cursor-pointer transition-all duration-200"
      style={{
        background: isHighlighted
          ? `linear-gradient(135deg, ${tierColor}22 0%, ${tierColor}11 100%)`
          : 'rgba(30, 41, 59, 0.8)',
        borderTop: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.2)'}`,
        borderRight: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.2)'}`,
        borderBottom: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.2)'}`,
        borderLeft: `4px solid ${tierColor}`,
        borderRadius: '10px',
        padding: '12px 14px',
        transform: isHighlighted ? 'scale(1.03)' : 'scale(1)',
        boxShadow: isHighlighted ? `0 8px 30px ${tierColor}40` : '0 2px 8px rgba(0,0,0,0.3)',
        opacity: hasHighlight && !isHighlighted && !isConnected ? 0.25 : 1,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Connection indicator dot */}
      <div
        className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
        style={{
          background: hasFlows ? tierColor : 'rgba(100, 116, 139, 0.5)',
          boxShadow: hasFlows ? `0 0 8px ${tierColor}` : 'none'
        }}
      />

      {/* Node header - supports 2 lines for long names */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg flex-shrink-0">{icon}</span>
        <div className="flex flex-col flex-1 min-w-0">
          {(() => {
            const displayName = getDisplayName(node)
            return (
              <>
                <span className="text-sm font-semibold text-white leading-tight">{displayName.line1}</span>
                {displayName.line2 && (
                  <span className="text-sm font-semibold text-white leading-tight">{displayName.line2}</span>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Node type and details */}
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
        {node.type}
        {'instance_id' in node && node.instance_id && (
          <span className="ml-1 text-slate-500">• {node.instance_id.slice(-8)}</span>
        )}
      </div>

      {/* Flow indicators */}
      {hasFlows && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-700/50">
          {inboundFlows > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-green-400 text-xs">↓</span>
              <span className="text-green-400 text-xs font-bold">{formatCount(inboundFlows)}</span>
            </div>
          )}
          {outboundFlows > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-blue-400 text-xs">↑</span>
              <span className="text-blue-400 text-xs font-bold">{formatCount(outboundFlows)}</span>
            </div>
          )}
        </div>
      )}

      {/* Extra info badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {'security_groups' in node && node.security_groups?.length > 0 && (
          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{node.security_groups.length} SGs</span>
        )}
        {'port' in node && node.port && (
          <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded">:{node.port}</span>
        )}
        {'unused_permissions_count' in node && node.unused_permissions_count > 0 && (
          <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{node.unused_permissions_count} unused</span>
        )}
        {'ingress_rules' in node && (
          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{node.ingress_rules?.length || 0} rules</span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// ANIMATED EDGE PATH COMPONENT - With flowing particles
// ============================================================================

const AnimatedEdgePath: React.FC<{
  edge: Edge
  sourcePos: { x: number; y: number } | null
  targetPos: { x: number; y: number } | null
  isHighlighted: boolean
  hasHighlight: boolean
  showAnimation: boolean
}> = ({ edge, sourcePos, targetPos, isHighlighted, hasHighlight, showAnimation }) => {
  if (!sourcePos || !targetPos) return null

  const edgeStyle = EDGE_STYLES[edge.edge_type] || EDGE_STYLES.TRAFFIC
  const baseColor = edgeStyle.color
  const baseOpacity = isHighlighted ? 1 : hasHighlight ? 0.1 : 0.6
  const strokeWidth = Math.min(Math.max(Math.log10(edge.flows + 1) * 2 + 2, 2), 6)

  // Calculate bezier curve
  const dx = targetPos.x - sourcePos.x
  const dy = targetPos.y - sourcePos.y
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 150)

  const path = `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + controlOffset} ${sourcePos.y}, ${targetPos.x - controlOffset} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`

  // Midpoint for label
  const midX = (sourcePos.x + targetPos.x) / 2
  const midY = (sourcePos.y + targetPos.y) / 2 - 5

  // Animation speed based on flow count (faster = more flows)
  const animDuration = Math.max(0.8, 2.5 - Math.log10(edge.flows + 1) * 0.5)

  // Dash patterns
  let strokeDasharray = 'none'
  if (edgeStyle.style === 'dashed') strokeDasharray = '10,5'
  if (edgeStyle.style === 'dotted') strokeDasharray = '4,4'

  const shouldAnimate = showAnimation && edge.flows > 0

  return (
    <g>
      {/* Glow effect */}
      {isHighlighted && (
        <path
          d={path}
          fill="none"
          stroke={baseColor}
          strokeWidth={strokeWidth + 8}
          opacity={0.2}
          strokeLinecap="round"
        />
      )}

      {/* Main path with gradient */}
      <defs>
        <linearGradient id={`grad-${edge.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={baseColor} stopOpacity={baseOpacity * 0.5} />
          <stop offset="50%" stopColor={baseColor} stopOpacity={baseOpacity} />
          <stop offset="100%" stopColor={baseColor} stopOpacity={baseOpacity * 0.5} />
        </linearGradient>
      </defs>

      <path
        d={path}
        fill="none"
        stroke={`url(#grad-${edge.id})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
      />

      {/* Animated flowing particles with glow */}
      {shouldAnimate && (
        <>
          {/* Particle glow filter */}
          <defs>
            <filter id={`glow-${edge.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Large glowing particles - 5 particles for dense flow effect */}
          <circle r={8} fill={baseColor} filter={`url(#glow-${edge.id})`}>
            <animateMotion dur={`${animDuration}s`} repeatCount="indefinite" path={path} />
          </circle>
          <circle r={6} fill="#fff" opacity={0.9}>
            <animateMotion dur={`${animDuration}s`} repeatCount="indefinite" path={path} begin={`${animDuration * 0.2}s`} />
          </circle>
          <circle r={8} fill={baseColor} filter={`url(#glow-${edge.id})`}>
            <animateMotion dur={`${animDuration}s`} repeatCount="indefinite" path={path} begin={`${animDuration * 0.4}s`} />
          </circle>
          <circle r={6} fill="#fff" opacity={0.9}>
            <animateMotion dur={`${animDuration}s`} repeatCount="indefinite" path={path} begin={`${animDuration * 0.6}s`} />
          </circle>
          <circle r={8} fill={baseColor} filter={`url(#glow-${edge.id})`}>
            <animateMotion dur={`${animDuration}s`} repeatCount="indefinite" path={path} begin={`${animDuration * 0.8}s`} />
          </circle>
        </>
      )}

      {/* Flow count badge - shows operation details for API calls */}
      {edge.flows > 0 && (
        <g transform={`translate(${midX}, ${midY})`}>
          {/* Badge background - taller for S3/API operations */}
          {edge.operation_category ? (
            <>
              {/* Expanded badge for S3 operations */}
              <rect
                x="-55"
                y="-24"
                width="110"
                height="48"
                rx="8"
                fill="rgba(15, 23, 42, 0.97)"
                stroke={baseColor}
                strokeWidth={isHighlighted ? 2 : 1}
              />
              {/* Operation category icon and label */}
              <text
                textAnchor="middle"
                dy="-10"
                fill={edge.operation_category === 'WRITE' ? '#22c55e' : edge.operation_category === 'DELETE' ? '#ef4444' : edge.operation_category === 'ADMIN' ? '#f59e0b' : '#3b82f6'}
                fontSize="12"
                fontWeight="800"
              >
                {edge.operation_category === 'READ' ? '📖 READ' : edge.operation_category === 'WRITE' ? '✏️ WRITE' : edge.operation_category === 'DELETE' ? '🗑️ DELETE' : edge.operation_category === 'ADMIN' ? '⚙️ ADMIN' : edge.operation_category}
              </text>
              {/* IAM Action */}
              <text
                textAnchor="middle"
                dy="5"
                fill="#94a3b8"
                fontSize="9"
                fontFamily="monospace"
              >
                {edge.iam_action || edge.action || 'API Call'}
              </text>
              {/* Role name */}
              {edge.assumed_role_name && (
                <text
                  textAnchor="middle"
                  dy="18"
                  fill="#ec4899"
                  fontSize="8"
                >
                  🔑 {edge.assumed_role_name.length > 18 ? edge.assumed_role_name.substring(0, 18) + '...' : edge.assumed_role_name}
                </text>
              )}
            </>
          ) : (
            <>
              {/* Standard flow badge */}
              <rect
                x="-32"
                y="-10"
                width="64"
                height="20"
                rx="10"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={baseColor}
                strokeWidth={isHighlighted ? 2 : 1}
              />
              {/* Flow count text */}
              <text
                textAnchor="middle"
                dy="4"
                fill={baseColor}
                fontSize="11"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="700"
              >
                {formatCount(edge.flows)} {edge.flows === 1 ? 'flow' : 'flows'}
              </text>
              {/* Bidirectional arrows */}
              <text
                textAnchor="middle"
                dy="4"
                dx="-38"
                fill={baseColor}
                fontSize="10"
                opacity={0.7}
              >
                ↔
              </text>
            </>
          )}
        </g>
      )}

      {/* Directional arrow at target end */}
      <defs>
        <marker
          id={`arrow-end-${edge.id}`}
          markerWidth="14"
          markerHeight="14"
          refX="7"
          refY="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M3,3 L11,7 L3,11 L5,7 Z"
            fill={baseColor}
          />
        </marker>
      </defs>

      {/* Path with arrow marker at end */}
      <path
        d={path}
        fill="none"
        stroke={baseColor}
        strokeWidth={Math.max(strokeWidth - 1, 1)}
        strokeLinecap="round"
        opacity={baseOpacity * 0.9}
        markerEnd={`url(#arrow-end-${edge.id})`}
      />

      {/* Direction indicator arrow at 75% of the path */}
      {(() => {
        // Calculate point at 75% along the bezier curve for direction arrow
        const t = 0.75
        const t2 = t * t
        const t3 = t2 * t
        const mt = 1 - t
        const mt2 = mt * mt
        const mt3 = mt2 * mt

        // Control points
        const p0x = sourcePos.x
        const p0y = sourcePos.y
        const p1x = sourcePos.x + controlOffset
        const p1y = sourcePos.y
        const p2x = targetPos.x - controlOffset
        const p2y = targetPos.y
        const p3x = targetPos.x
        const p3y = targetPos.y

        // Point on curve
        const px = mt3 * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * p3x
        const py = mt3 * p0y + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * p3y

        // Tangent (derivative) for rotation
        const dPx = 3 * mt2 * (p1x - p0x) + 6 * mt * t * (p2x - p1x) + 3 * t2 * (p3x - p2x)
        const dPy = 3 * mt2 * (p1y - p0y) + 6 * mt * t * (p2y - p1y) + 3 * t2 * (p3y - p2y)
        const angle = Math.atan2(dPy, dPx) * 180 / Math.PI

        return (
          <g transform={`translate(${px}, ${py}) rotate(${angle})`}>
            {/* Arrow triangle pointing in direction of flow */}
            <path
              d="M-6,-5 L6,0 L-6,5 Z"
              fill={baseColor}
              opacity={baseOpacity}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
            />
          </g>
        )
      })()}
    </g>
  )
}

// ============================================================================
// INTER-TIER FLOW ARROW COMPONENT - Gradient line with flow badge
// ============================================================================

const InterTierArrow: React.FC<{
  leftFlows: number
  rightFlows: number
  leftColor: string
  rightColor: string
}> = ({ leftFlows, rightFlows, leftColor, rightColor }) => {
  const totalFlows = leftFlows + rightFlows
  const isBidirectional = leftFlows > 0 && rightFlows > 0
  const primaryColor = rightFlows >= leftFlows ? rightColor : leftColor
  const hasFlows = totalFlows > 0

  return (
    <div className="flex flex-col items-center justify-center mx-2 min-w-[110px]">
      {/* Flow count badge - only show if there are flows */}
      {hasFlows && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg mb-1"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: `1px solid ${primaryColor}40`,
            boxShadow: `0 2px 8px ${primaryColor}20`
          }}
        >
          <span className="text-sm font-bold" style={{ color: primaryColor }}>
            {formatCount(totalFlows)}
          </span>
          <span className="text-xs text-slate-400">
            {totalFlows === 1 ? 'flow' : 'flows'}
          </span>
          <span className="text-sm" style={{ color: primaryColor }}>
            {isBidirectional ? '↔' : (rightFlows > 0 ? '→' : '←')}
          </span>
        </div>
      )}

      {/* Gradient arrow line */}
      <svg width="110" height="18" viewBox="0 0 110 18" className="overflow-visible">
        <defs>
          <linearGradient id={`tier-arrow-grad-${leftColor.replace('#', '')}-${rightColor.replace('#', '')}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={leftColor} stopOpacity={hasFlows ? 0.9 : 0.3} />
            <stop offset="100%" stopColor={rightColor} stopOpacity={hasFlows ? 0.9 : 0.3} />
          </linearGradient>
        </defs>

        {/* Left arrow head (for leftward flow) */}
        {leftFlows > 0 && (
          <polygon
            points="2,9 14,4 14,14"
            fill={leftColor}
          />
        )}

        {/* Main line */}
        <line
          x1={leftFlows > 0 ? "14" : "5"}
          y1="9"
          x2={rightFlows > 0 || !hasFlows ? "96" : "105"}
          y2="9"
          stroke={`url(#tier-arrow-grad-${leftColor.replace('#', '')}-${rightColor.replace('#', '')})`}
          strokeWidth={hasFlows ? "4" : "2"}
          strokeLinecap="round"
        />

        {/* Center glowing dot */}
        <circle
          cx="55"
          cy="9"
          r={hasFlows ? "6" : "4"}
          fill={primaryColor}
          opacity={hasFlows ? 1 : 0.5}
          style={hasFlows ? { filter: `drop-shadow(0 0 6px ${primaryColor})` } : undefined}
        />

        {/* Right arrow head (for rightward flow) */}
        {(rightFlows > 0 || !hasFlows) && (
          <polygon
            points="108,9 96,4 96,14"
            fill={rightColor}
            opacity={hasFlows ? 1 : 0.4}
          />
        )}
      </svg>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ComprehensiveFlowViz({ systemName, onNodeClick, onRefresh }: ComprehensiveFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [nodePositions, setNodePositions] = useState<Record<string, { left: number; right: number; centerY: number }>>({})
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [data, setData] = useState<ComprehensiveMapResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [search, setSearch] = useState('')
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<string | null>(null)
  const [showAnimations, setShowAnimations] = useState(true)

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/proxy/dependency-map-comprehensive?systemId=${encodeURIComponent(systemName)}&window=7d`, { cache: 'no-store' })
      if (res.ok) {
        const result = await res.json()
        setData(result)
      }
    } catch (e) {
      console.error('[ComprehensiveFlowViz] Failed to fetch:', e)
    } finally {
      setIsLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Combine all nodes by tier
  const nodesByTier = useMemo((): Record<Tier, AnyNode[]> => {
    if (!data) return { external: [], compute: [], security: [], identity: [], data: [], storage: [] }

    const searchLower = search.toLowerCase()
    const filterNode = (n: AnyNode) => !search || n.name.toLowerCase().includes(searchLower) || n.id.toLowerCase().includes(searchLower)

    return {
      external: data.external_nodes.filter(filterNode),
      compute: data.compute_nodes.filter(filterNode),
      security: data.security_nodes.filter(filterNode),
      identity: data.identity_nodes.filter(filterNode),
      data: data.data_nodes.filter(filterNode),
      storage: data.storage_nodes.filter(filterNode),
    }
  }, [data, search])

  // All nodes flat
  const allNodes = useMemo(() => {
    return Object.values(nodesByTier).flat()
  }, [nodesByTier])

  // All edges with filtering
  const edges = useMemo(() => {
    if (!data) return []
    if (!edgeTypeFilter) return data.edges
    return data.edges.filter((e) => e.edge_type === edgeTypeFilter)
  }, [data, edgeTypeFilter])

  // Calculate flow counts per node
  const nodeFlowCounts = useMemo(() => {
    const counts: Record<string, { inbound: number; outbound: number }> = {}
    for (const edge of edges) {
      if (!counts[edge.source]) counts[edge.source] = { inbound: 0, outbound: 0 }
      if (!counts[edge.target]) counts[edge.target] = { inbound: 0, outbound: 0 }
      counts[edge.source].outbound += edge.flows
      counts[edge.target].inbound += edge.flows
    }
    return counts
  }, [edges])

  // Calculate inter-tier flows for flow arrows between columns
  // This captures ALL flows crossing each tier boundary (not just direct connections)
  const interTierFlows = useMemo(() => {
    if (!data) return {}

    // Map node IDs to their tier order
    const nodeToTierOrder: Record<string, number> = {}
    for (const node of data.external_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.external.order
    for (const node of data.compute_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.compute.order
    for (const node of data.security_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.security.order
    for (const node of data.identity_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.identity.order
    for (const node of data.data_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.data.order
    for (const node of data.storage_nodes) nodeToTierOrder[node.id] = TIER_CONFIG.storage.order

    // Get the list of displayed tiers in order
    const displayedTiers = (Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][])
      .sort(([, a], [, b]) => a.order - b.order)
      .filter(([tierId]) => (nodesByTier[tierId] || []).length > 0)
      .map(([tierId, config]) => ({ tierId, order: config.order }))

    // For each adjacent tier pair, count flows crossing that boundary
    const flows: Record<string, { left: number; right: number }> = {}

    for (let i = 0; i < displayedTiers.length - 1; i++) {
      const leftTier = displayedTiers[i]
      const rightTier = displayedTiers[i + 1]
      const key = `${leftTier.tierId}-${rightTier.tierId}`
      flows[key] = { left: 0, right: 0 }

      // Count all edges that cross this boundary
      for (const edge of edges) {
        const sourceOrder = nodeToTierOrder[edge.source]
        const targetOrder = nodeToTierOrder[edge.target]
        if (sourceOrder === undefined || targetOrder === undefined) continue
        if (sourceOrder === targetOrder) continue

        // Check if this edge crosses the boundary between leftTier and rightTier
        const crossesRight = sourceOrder <= leftTier.order && targetOrder >= rightTier.order
        const crossesLeft = sourceOrder >= rightTier.order && targetOrder <= leftTier.order

        if (crossesRight) {
          flows[key].right += edge.flows
        } else if (crossesLeft) {
          flows[key].left += edge.flows
        }
      }
    }

    return flows
  }, [data, edges, nodesByTier])

  // Connected nodes when highlighting
  const connectedNodes = useMemo(() => {
    if (!highlightedNode) return new Set<string>()
    const connected = new Set([highlightedNode])
    for (const edge of edges) {
      if (edge.source === highlightedNode) connected.add(edge.target)
      if (edge.target === highlightedNode) connected.add(edge.source)
    }
    return connected
  }, [edges, highlightedNode])

  // Update positions
  useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const positions: Record<string, { left: number; right: number; centerY: number }> = {}

      for (const [nodeId, ref] of Object.entries(nodeRefs.current)) {
        if (ref) {
          const rect = ref.getBoundingClientRect()
          positions[nodeId] = {
            left: rect.left - containerRect.left,
            right: rect.right - containerRect.left,
            centerY: rect.top + rect.height / 2 - containerRect.top,
          }
        }
      }
      setNodePositions(positions)
    }

    const timer1 = setTimeout(updatePositions, 50)
    const timer2 = setTimeout(updatePositions, 200)
    const timer3 = setTimeout(updatePositions, 500)
    const timer4 = setTimeout(updatePositions, 1000)
    window.addEventListener('resize', updatePositions)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
      window.removeEventListener('resize', updatePositions)
    }
  }, [allNodes])

  // Stats
  const stats = useMemo(() => {
    if (!data) return { totalFlows: 0, nodes: 0, edges: 0 }
    return {
      totalFlows: edges.reduce((sum, e) => sum + e.flows, 0),
      nodes: allNodes.length,
      edges: edges.length,
    }
  }, [data, edges, allNodes])

  if (isLoading) {
    return (
      <div className="w-full h-[700px] flex items-center justify-center bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-12 h-12 text-green-400 animate-spin" />
          <span className="text-slate-400">Loading infrastructure map...</span>
        </div>
      </div>
    )
  }

  if (!data || allNodes.length === 0) {
    return (
      <div className="w-full h-[700px] flex flex-col items-center justify-center bg-slate-900 rounded-xl">
        <Database className="w-16 h-16 text-slate-600 mb-4" />
        <p className="text-slate-400 text-lg">No infrastructure data available</p>
        <p className="text-slate-500 text-sm mt-2">Make sure VPC Flow Logs and AWS Config are enabled</p>
        <button onClick={fetchData} className="mt-6 px-4 py-2 bg-green-600 rounded-lg text-white hover:bg-green-700">
          Retry
        </button>
      </div>
    )
  }

  const containerClass = isFullscreen ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col' : 'w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col'

  return (
    <div ref={containerRef} className={containerClass} style={isFullscreen ? {} : { height: '700px' }}>
      {/* Header with stats */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-800/80 border-b border-slate-700">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-bold text-base">Infrastructure Traffic Flow</span>
          </div>

          {/* Stats badges */}
          <div className="flex gap-3">
            <div className="bg-slate-700/50 px-3 py-1 rounded-lg">
              <span className="text-green-400 font-bold text-lg">{formatCount(stats.totalFlows)}</span>
              <span className="text-slate-400 text-xs ml-1">TOTAL FLOWS</span>
            </div>
            <div className="bg-slate-700/50 px-3 py-1 rounded-lg">
              <span className="text-cyan-400 font-bold text-lg">{stats.nodes}</span>
              <span className="text-slate-400 text-xs ml-1">RESOURCES</span>
            </div>
            <div className="bg-slate-700/50 px-3 py-1 rounded-lg">
              <span className="text-amber-400 font-bold text-lg">{stats.edges}</span>
              <span className="text-slate-400 text-xs ml-1">CONNECTIONS</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Animation toggle - prominent with pulsing indicator */}
          <button
            onClick={() => setShowAnimations(!showAnimations)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              showAnimations
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${showAnimations ? 'bg-white animate-pulse' : 'bg-slate-500'}`}
            />
            {showAnimations ? 'Live' : 'Static'}
          </button>

          {/* Edge type filter */}
          <select
            value={edgeTypeFilter || ''}
            onChange={(e) => setEdgeTypeFilter(e.target.value || null)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"
          >
            <option value="">All Connections</option>
            {Object.entries(EDGE_STYLES).map(([type, config]) => (
              <option key={type} value={type}>{config.label}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-36 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <button onClick={() => { fetchData(); onRefresh?.() }} className="p-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
            <RefreshCw className="w-4 h-4 text-white" />
          </button>

          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>

          {isFullscreen && (
            <button onClick={() => setIsFullscreen(false)} className="p-2 bg-red-600 rounded-lg hover:bg-red-700">
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Data Sources Banner */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-800/40 border-b border-slate-700/50 text-[10px]">
        <span className="text-slate-500 uppercase tracking-wider">Data Sources:</span>
        <div className="flex gap-4">
          <span className={data.data_sources.flow_logs ? 'text-green-400 font-medium' : 'text-slate-600'}>
            {data.data_sources.flow_logs ? '✓' : '○'} VPC Flow Logs
          </span>
          <span className={data.data_sources.cloudtrail ? 'text-green-400 font-medium' : 'text-slate-600'}>
            {data.data_sources.cloudtrail ? '✓' : '○'} CloudTrail
          </span>
          <span className={data.data_sources.config ? 'text-green-400 font-medium' : 'text-slate-600'}>
            {data.data_sources.config ? '✓' : '○'} AWS Config
          </span>
        </div>
      </div>

      {/* Main visualization area */}
      <div className="flex-1 relative overflow-hidden">
        {/* SVG Layer for edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {edges.map((edge) => {
            const sourcePos = nodePositions[edge.source]
            const targetPos = nodePositions[edge.target]
            if (!sourcePos || !targetPos) return null

            // Determine edge direction based on positions
            const sourceIsLeft = sourcePos.right < targetPos.left
            const targetIsLeft = targetPos.right < sourcePos.left

            let startX: number, endX: number
            if (sourceIsLeft) {
              startX = sourcePos.right + 6
              endX = targetPos.left - 6
            } else if (targetIsLeft) {
              startX = sourcePos.left - 6
              endX = targetPos.right + 6
            } else {
              startX = (sourcePos.left + sourcePos.right) / 2
              endX = (targetPos.left + targetPos.right) / 2
            }

            const isHighlighted = highlightedNode ? edge.source === highlightedNode || edge.target === highlightedNode : false

            return (
              <AnimatedEdgePath
                key={edge.id}
                edge={edge}
                sourcePos={{ x: startX, y: sourcePos.centerY }}
                targetPos={{ x: endX, y: targetPos.centerY }}
                isHighlighted={isHighlighted}
                hasHighlight={!!highlightedNode}
                showAnimation={showAnimations}
              />
            )
          })}
        </svg>

        {/* Tier columns with inter-tier flow arrows */}
        <div className="flex flex-col h-full p-4" style={{ position: 'relative', zIndex: 2 }}>
          {(() => {
            const sortedTiers = (Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][])
              .sort(([, a], [, b]) => a.order - b.order)
              .filter(([tierId]) => (nodesByTier[tierId] || []).length > 0)

            return (
              <>
                {/* Row 1: Tier headers with flow arrows between them */}
                <div className="flex justify-center items-center gap-0 mb-4">
                  {sortedTiers.map(([tierId, config], index) => {
                    const tierNodes = nodesByTier[tierId] || []
                    const nextTier = sortedTiers[index + 1]

                    // Get inter-tier flow for arrow between this tier and next
                    let interTierFlow = { left: 0, right: 0 }
                    if (nextTier) {
                      const key = `${tierId}-${nextTier[0]}`
                      interTierFlow = interTierFlows[key] || { left: 0, right: 0 }
                    }

                    return (
                      <React.Fragment key={`header-${tierId}`}>
                        {/* Tier header */}
                        <div
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl min-w-[180px]"
                          style={{
                            background: `linear-gradient(135deg, ${config.bgColor} 0%, rgba(15, 23, 42, 0.8) 100%)`,
                            border: `1px solid ${config.color}40`
                          }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ background: config.color }} />
                          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: config.color }}>
                            {config.label}
                          </span>
                          <span
                            className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: `${config.color}30`, color: config.color }}
                          >
                            {tierNodes.length}
                          </span>
                        </div>

                        {/* Inter-tier flow arrow */}
                        {nextTier && (
                          <InterTierArrow
                            leftFlows={interTierFlow.left}
                            rightFlows={interTierFlow.right}
                            leftColor={config.color}
                            rightColor={nextTier[1].color}
                          />
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>

                {/* Row 2: Node columns */}
                <div className="flex flex-1 justify-center items-start gap-4 overflow-x-auto overflow-y-auto">
                  {sortedTiers.map(([tierId, config]) => {
                    const tierNodes = nodesByTier[tierId] || []

                    return (
                      <div key={`nodes-${tierId}`} className="flex flex-col gap-3 min-w-[200px] max-w-[260px]">
                        {tierNodes.map((node) => {
                          const flows = nodeFlowCounts[node.id] || { inbound: 0, outbound: 0 }
                          return (
                            <NodeCard
                              key={node.id}
                              node={node}
                              tier={tierId}
                              inboundFlows={flows.inbound}
                              outboundFlows={flows.outbound}
                              isHighlighted={highlightedNode === node.id}
                              isConnected={connectedNodes.has(node.id)}
                              hasHighlight={!!highlightedNode}
                              onHover={setHighlightedNode}
                              nodeRef={(el) => (nodeRefs.current[node.id] = el)}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-slate-700 z-10">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Connection Types</div>
        <div className="space-y-2">
          {Object.entries(EDGE_STYLES).map(([type, config]) => (
            <div key={type} className="flex items-center gap-3 text-[11px]">
              <div className="relative w-8 h-2 flex items-center">
                <div
                  className="w-full h-0.5 rounded"
                  style={{
                    background: config.style === 'solid'
                      ? config.color
                      : config.style === 'dashed'
                        ? `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 4px, transparent 4px, transparent 7px)`
                        : `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 2px, transparent 2px, transparent 5px)`
                  }}
                />
                {showAnimations && (
                  <div
                    className="absolute w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: config.color, left: '50%', transform: 'translateX(-50%)' }}
                  />
                )}
              </div>
              <span className="text-slate-300">{config.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-slate-700 text-[9px] text-slate-500">
          Hover nodes to highlight paths
        </div>
      </div>

      {/* Selected node info panel */}
      {highlightedNode && (
        <div className="absolute bottom-4 right-4 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 border border-slate-700 z-10 min-w-[220px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Selected Resource</div>
          <div className="text-base font-bold text-white mb-3">{allNodes.find((n) => n.id === highlightedNode)?.name}</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xl font-bold text-green-400">{formatCount(nodeFlowCounts[highlightedNode]?.inbound || 0)}</div>
              <div className="text-[9px] text-slate-500">Inbound</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-400">{formatCount(nodeFlowCounts[highlightedNode]?.outbound || 0)}</div>
              <div className="text-[9px] text-slate-500">Outbound</div>
            </div>
            <div>
              <div className="text-xl font-bold text-amber-400">{connectedNodes.size - 1}</div>
              <div className="text-[9px] text-slate-500">Connected</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
