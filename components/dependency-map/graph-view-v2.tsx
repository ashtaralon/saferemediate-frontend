'use client'

/**
 * GraphViewV2 — Observed-First Map (custom SVG, container/component hierarchy).
 *
 * This is a pure DTO renderer:
 *   ❌ no regex on aws_id / arn
 *   ❌ no fuzzy name matching
 *   ❌ no "if missing, derive it from this other field" fallbacks
 *   ❌ no visual-proximity grouping (groups come from dto.containers + node.vpc_id only)
 *   ❌ no frontend-invented relationships
 *
 * "Public-facing only" filter trusts `node.is_internet_exposed` verbatim from the
 * producer. If a node's exposure flag is wrong, fix it in the producer, NOT here.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw, ZoomIn, ZoomOut, Search, Server, Database, Globe,
  HardDrive, Lock, Layers, Activity, Maximize2, Minimize2, X, Focus, XCircle,
  EyeOff
} from 'lucide-react'
import { CoverageBanner } from './coverage-banner'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// ============================================================================
// TYPES
// ============================================================================

interface ContainerNode {
  id: string
  name: string
  type: 'VPC' | 'Subnet'
  parent_id?: string
  is_public?: boolean
  availability_zone?: string
  cidr_block?: string
}

interface ComponentNode {
  id: string
  name: string
  type: string
  category: string
  vpc_id?: string
  subnet_id?: string
  is_internet_exposed: boolean
  arn?: string
  security_groups: string[]
  iam_role?: string
  permission_gaps: number
}

interface MapEdge {
  id: string
  source: string
  target: string
  kind: 'OBSERVED' | 'ALLOWED'
  port?: number
  protocol: string
  flows: number
  bytes_total: number
  first_seen?: string
  last_seen?: string
}

interface CoverageInfo {
  flow_logs_enabled_enis_pct: number
  analysis_window: string
  observed_edges: number
  total_flows: number
  first_seen?: string | null
  last_seen?: string | null
  notes: string[]
}

interface GraphViewV2Props {
  systemName: string
  onNodeClick?: (node: ComponentNode) => void
  onRefresh?: () => void
}

// ============================================================================
// AWS COLORS & ICONS - WITHOUT SG/IAM (they're badges, not nodes)
// ============================================================================

const AWS_COLORS: Record<string, { bg: string; border: string; gradient: string; label: string }> = {
  EC2: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'EC2' },
  Lambda: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'LAMBDA' },
  ECS: { bg: '#FF9900', border: '#EC7211', gradient: 'linear-gradient(135deg, #FF9900 0%, #EC7211 100%)', label: 'ECS' },
  RDS: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'RDS' },
  DynamoDB: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'DYNAMODB' },
  Aurora: { bg: '#3B48CC', border: '#2E3AB5', gradient: 'linear-gradient(135deg, #527FFF 0%, #3B48CC 100%)', label: 'AURORA' },
  S3: { bg: '#3F8624', border: '#2D6B19', gradient: 'linear-gradient(135deg, #6AAF35 0%, #3F8624 100%)', label: 'S3' },
  S3Bucket: { bg: '#3F8624', border: '#2D6B19', gradient: 'linear-gradient(135deg, #6AAF35 0%, #3F8624 100%)', label: 'S3' },
  InternetGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)', label: 'IGW' },
  NATGateway: { bg: '#067F68', border: '#056654', gradient: 'linear-gradient(135deg, #1A9E85 0%, #067F68 100%)', label: 'NAT' },
  VPC: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'VPC' },
  Subnet: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'SUBNET' },
  ALB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'ALB' },
  ELB: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'ELB' },
  VPCE: { bg: '#8C4FFF', border: '#7B3FE4', gradient: 'linear-gradient(135deg, #A166FF 0%, #8C4FFF 100%)', label: 'VPCE' },
  NetworkEndpoint: { bg: '#5A6B7A', border: '#475666', gradient: 'linear-gradient(135deg, #7A8B9A 0%, #5A6B7A 100%)', label: 'NET' },
  Default: { bg: '#5A6B7A', border: '#475666', gradient: 'linear-gradient(135deg, #7A8B9A 0%, #5A6B7A 100%)', label: '?' }
}

const LANE_ORDER: Record<string, number> = {
  'InternetGateway': 0, 'NATGateway': 0,
  'VPC': 1, 'Subnet': 1, 'VPCE': 1,
  'ALB': 2, 'ELB': 2, 'NLB': 2,
  'EC2': 3, 'ECS': 3, 'Lambda': 3,
  'RDS': 4, 'DynamoDB': 4, 'Aurora': 4, 'ElastiCache': 4,
  'S3': 5, 'S3Bucket': 5
}

const AWSIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 32 }) => {
  const p = { width: size, height: size, strokeWidth: 1.5, className: "text-white drop-shadow-md" }
  switch (type) {
    case 'EC2': case 'ECS': return <Server {...p} />
    case 'RDS': case 'DynamoDB': case 'Aurora': case 'ElastiCache': return <Database {...p} />
    case 'S3': case 'S3Bucket': return <HardDrive {...p} />
    case 'Lambda': return <Layers {...p} />
    case 'InternetGateway': case 'NATGateway': return <Globe {...p} />
    case 'VPC': case 'Subnet': case 'ALB': case 'ELB': case 'VPCE': return <Layers {...p} />
    default: return <Lock {...p} />
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getColors = (t: string) => AWS_COLORS[t] || AWS_COLORS.Default
const getLane = (t: string) => LANE_ORDER[t] ?? 3
const formatType = (t: string) => ({
  InternetGateway: "Internet Gateway",
  NATGateway: "NAT Gateway",
  S3Bucket: "S3",
  VPCE: "VPC Endpoint"
}[t] || t)

// Account-level types live outside any VPC (per AWS architecture).
// Don't fabricate a VPC for them and don't render them inside a VPC frame.
const ACCOUNT_LEVEL_TYPES = new Set(['S3', 'S3Bucket', 'InternetGateway', 'DynamoDB'])

// ============================================================================
// ANIMATED EDGE COMPONENT
// ============================================================================

const AnimatedEdge: React.FC<{
  path: string
  kind: 'OBSERVED' | 'ALLOWED'
  bytes?: number
  dimmed?: boolean
}> = ({ path, kind, bytes = 0, dimmed = false }) => {
  const isObserved = kind === 'OBSERVED'
  const speed = bytes > 100000 ? 0.8 : bytes > 10000 ? 1.5 : 2.5
  const opacity = dimmed ? 0.15 : 1

  return (
    <g style={{ opacity }}>
      {isObserved && !dimmed && (
        <path d={path} fill="none" stroke="#10B981" strokeWidth={6} strokeOpacity={0.15} />
      )}

      <path
        d={path}
        fill="none"
        stroke={isObserved ? '#10B981' : '#94A3B8'}
        strokeWidth={isObserved ? 2.5 : 1.5}
        strokeDasharray={isObserved ? 'none' : '6 4'}
        strokeOpacity={isObserved ? 1 : 0.75}
        markerEnd={isObserved ? 'url(#arrow-active)' : 'url(#arrow-inactive)'}
      />

      {isObserved && !dimmed && (
        <>
          <circle r="3" fill="#10B981">
            <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={path} />
          </circle>
          <circle r="3" fill="#10B981" opacity="0.5">
            <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={path} begin={`${speed / 2}s`} />
          </circle>
        </>
      )}
    </g>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GraphViewV2({
  systemName,
  onNodeClick,
  onRefresh
}: GraphViewV2Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containers, setContainers] = useState<ContainerNode[]>([])
  const [nodes, setNodes] = useState<ComponentNode[]>([])
  const [edges, setEdges] = useState<MapEdge[]>([])
  const [coverage, setCoverage] = useState<CoverageInfo>({
    flow_logs_enabled_enis_pct: 0,
    analysis_window: '7d',
    observed_edges: 0,
    total_flows: 0,
    notes: []
  })
  const [mode, setMode] = useState<'observed' | 'observed+potential'>('observed')
  const [timeWindow] = useState('7d')
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<ComponentNode | null>(null)
  const [focusedNode, setFocusedNode] = useState<string | null>(null) // For focus mode
  const [zoom, setZoom] = useState(0.55)
  const [pan, setPan] = useState({ x: 40, y: 20 })
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Public-facing-only filter. Default OFF — operators see everything until they opt in.
  const [publicOnly, setPublicOnly] = useState(false)

  // Fetch v2 data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/proxy/dependency-map/v2?systemId=${encodeURIComponent(systemName)}&window=${timeWindow}&mode=${mode}`,
        { cache: 'no-store' }
      )

      if (res.ok) {
        const data = await res.json()
        setContainers(data.containers || [])
        setNodes(data.nodes || [])
        setEdges(data.edges || [])
        setCoverage(data.coverage || {
          flow_logs_enabled_enis_pct: 0,
          analysis_window: timeWindow,
          observed_edges: 0,
          total_flows: 0,
          notes: []
        })
      }
    } catch (e) {
      console.error('[GraphViewV2] Failed to fetch data:', e)
    } finally {
      setIsLoading(false)
    }
  }, [systemName, timeWindow, mode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle mode change
  const handleModeChange = useCallback((newMode: 'observed' | 'observed+potential') => {
    setMode(newMode)
  }, [])

  // Focus mode: get 1-hop neighbors
  const focusNeighbors = useMemo(() => {
    if (!focusedNode) return null

    const neighbors = new Set<string>()
    neighbors.add(focusedNode)

    edges.forEach(e => {
      if (e.source === focusedNode) neighbors.add(e.target)
      if (e.target === focusedNode) neighbors.add(e.source)
    })

    return neighbors
  }, [focusedNode, edges])

  // Filter data (search). Public-facing filter dims rather than removes, so it's
  // not applied here — we keep every node positioned and lower opacity downstream.
  const filtered = useMemo(() => {
    let filteredNodes = nodes
    if (search) {
      const t = search.toLowerCase()
      filteredNodes = filteredNodes.filter(n =>
        n.name?.toLowerCase().includes(t) ||
        n.type?.toLowerCase().includes(t)
      )
    }
    const ids = new Set(filteredNodes.map(n => n.id))
    return {
      nodes: filteredNodes,
      edges: edges.filter(e => ids.has(e.source) && ids.has(e.target))
    }
  }, [nodes, edges, search])

  // Calculate layout - improved for many nodes
  const layout = useMemo(() => {
    const NODE_WIDTH = 110
    const NODE_HEIGHT = 75
    const LANE_GAP = 180
    const NODE_GAP_X = 125
    const NODE_GAP_Y = 95
    const PADDING = 40
    const MAX_NODES_PER_LANE = 20
    const GRID_COLS = 3 // For lanes with many nodes

    // Step 1: Find nodes that have edges (connected nodes)
    const connectedIds = new Set<string>()
    filtered.edges.forEach(e => {
      connectedIds.add(e.source)
      connectedIds.add(e.target)
    })

    // Step 2: Prioritize connected nodes, sort by edge count
    const edgeCounts = new Map<string, number>()
    filtered.edges.forEach(e => {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) || 0) + 1)
      edgeCounts.set(e.target, (edgeCounts.get(e.target) || 0) + 1)
    })

    // Step 3: Group by lane and limit per lane
    const lanes = new Map<number, ComponentNode[]>()
    const hiddenCounts = new Map<number, number>() // Track how many hidden per lane

    // Sort nodes: connected first, then by edge count
    const sortedNodes = [...filtered.nodes].sort((a, b) => {
      const aConnected = connectedIds.has(a.id) ? 1 : 0
      const bConnected = connectedIds.has(b.id) ? 1 : 0
      if (aConnected !== bConnected) return bConnected - aConnected
      return (edgeCounts.get(b.id) || 0) - (edgeCounts.get(a.id) || 0)
    })

    sortedNodes.forEach(n => {
      const l = getLane(n.type)
      if (!lanes.has(l)) lanes.set(l, [])
      const lane = lanes.get(l)!

      // Only add if under limit OR if connected
      if (lane.length < MAX_NODES_PER_LANE || connectedIds.has(n.id)) {
        if (lane.length < MAX_NODES_PER_LANE * 2) { // Hard limit
          lane.push(n)
        } else {
          hiddenCounts.set(l, (hiddenCounts.get(l) || 0) + 1)
        }
      } else {
        hiddenCounts.set(l, (hiddenCounts.get(l) || 0) + 1)
      }
    })

    const positions = new Map<string, { x: number; y: number }>()
    const sorted = Array.from(lanes.entries()).sort((a, b) => a[0] - b[0])
    let maxY = 0
    let totalWidth = 0

    // Position nodes in each lane
    sorted.forEach(([lane, nodes], laneIndex) => {
      const useManyNodes = nodes.length > 8
      const cols = useManyNodes ? GRID_COLS : 1
      const laneBaseX = PADDING + laneIndex * (useManyNodes ? LANE_GAP + NODE_GAP_X * (cols - 1) : LANE_GAP)

      nodes.forEach((n, j) => {
        const col = useManyNodes ? (j % cols) : 0
        const row = useManyNodes ? Math.floor(j / cols) : j
        const x = laneBaseX + col * NODE_GAP_X
        const y = PADDING + 45 + row * NODE_GAP_Y
        positions.set(n.id, { x, y })
        maxY = Math.max(maxY, y)
        totalWidth = Math.max(totalWidth, x + NODE_WIDTH)
      })
    })

    return {
      positions,
      width: totalWidth + PADDING * 2,
      height: maxY + NODE_HEIGHT + PADDING * 2,
      lanes: sorted,
      hiddenCounts,
      NODE_WIDTH,
      NODE_HEIGHT
    }
  }, [filtered])

  // ----------------------------------------------------------------------------
  // VPC container frames + public-facing membership
  //
  // The producer provides `containers` (VPCs/Subnets) and every component node
  // carries a `vpc_id` (or null for account-level resources like S3/IGW). We
  // group ALREADY-POSITIONED components by their vpc_id, compute a bounding
  // box per VPC, and use it to render a frame AND to decide whether the VPC
  // is "all-dimmed under the public-facing filter."
  //
  // No proximity inference — membership comes from `node.vpc_id` verbatim.
  // ----------------------------------------------------------------------------
  const vpcFrames = useMemo(() => {
    const FRAME_PAD_X = 16
    const FRAME_PAD_TOP = 22
    const FRAME_PAD_BOTTOM = 12

    // Build VPC id → name map from the explicit container DTO.
    const vpcMeta = new Map<string, { name: string }>()
    containers.forEach(c => {
      if (c.type === 'VPC') vpcMeta.set(c.id, { name: c.name })
    })

    // Bucket every positioned, non-account-level node by its declared vpc_id.
    const byVpc = new Map<string, ComponentNode[]>()
    filtered.nodes.forEach(n => {
      if (!layout.positions.has(n.id)) return
      if (ACCOUNT_LEVEL_TYPES.has(n.type)) return
      const vpc = n.vpc_id
      if (!vpc) return
      if (!byVpc.has(vpc)) byVpc.set(vpc, [])
      byVpc.get(vpc)!.push(n)
    })

    return Array.from(byVpc.entries()).map(([vpcId, members]) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      members.forEach(n => {
        const p = layout.positions.get(n.id)!
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x + layout.NODE_WIDTH)
        maxY = Math.max(maxY, p.y + layout.NODE_HEIGHT)
      })

      // Test BOTH sides of the partition: VPCs may have zero public members,
      // and the dimmed/empty state must read correctly for that case too.
      const publicCount = members.filter(n => n.is_internet_exposed).length
      const hiddenCount = members.length - publicCount

      return {
        vpcId,
        name: vpcMeta.get(vpcId)?.name || vpcId,
        memberIds: new Set(members.map(n => n.id)),
        memberCount: members.length,
        publicCount,
        hiddenCount,
        x: minX - FRAME_PAD_X,
        y: minY - FRAME_PAD_TOP,
        width: (maxX - minX) + FRAME_PAD_X * 2,
        height: (maxY - minY) + FRAME_PAD_TOP + FRAME_PAD_BOTTOM,
      }
    })
  }, [containers, filtered.nodes, layout])

  // How many public components exist across the whole filtered view? Used to
  // render an honest empty-state banner when the toggle is on but the producer
  // has zero internet-exposed nodes in this system.
  const publicCount = useMemo(
    () => filtered.nodes.filter(n => n.is_internet_exposed).length,
    [filtered.nodes],
  )

  // Count stats
  const stats = useMemo(() => {
    // Only count edges where both nodes have positions (are rendered)
    const renderedEdges = filtered.edges.filter(e =>
      layout.positions.has(e.source) && layout.positions.has(e.target)
    )
    const observedEdges = renderedEdges.filter(e => e.kind === 'OBSERVED')
    const allowedEdges = renderedEdges.filter(e => e.kind === 'ALLOWED')
    const renderedNodes = layout.positions.size
    const totalHidden = Array.from(layout.hiddenCounts.values()).reduce((a, b) => a + b, 0)

    return {
      totalNodes: filtered.nodes.length,
      renderedNodes,
      hiddenNodes: totalHidden,
      total: renderedEdges.length,
      observed: observedEdges.length,
      allowed: allowedEdges.length
    }
  }, [filtered, layout])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => setIsFullscreen(!isFullscreen), [isFullscreen])

  // Clear focus
  const clearFocus = useCallback(() => setFocusedNode(null), [])

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusedNode) setFocusedNode(null)
        else if (isFullscreen) setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, focusedNode])

  if (isLoading) {
    return (
      <div className="w-full h-[650px] flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-slate-900 rounded-xl">
          <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
        </div>
      </div>
    )
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-slate-900 flex flex-col"
    : "w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col"

  const containerStyle = isFullscreen ? {} : { height: '650px' }

  // Empty state for the filter: the toggle is ON but no internet-exposed nodes
  // exist anywhere in the producer output. Render an honest banner instead of
  // a misleading "everything is dimmed" view (which reads as a render bug).
  const showNoPublicBanner = publicOnly && publicCount === 0

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Coverage Banner */}
      <CoverageBanner coverage={coverage} mode={mode} onModeChange={handleModeChange} />

      {/* Header — two-row editorial layout.
          Row 1: title only (clean focal point).
          Row 2: stats on the left (with · separators), controls on the right.
          No more single-row cram-and-wrap. */}
      <div className="bg-slate-800/90 border-b border-slate-700 px-3 py-2.5 flex flex-col gap-2" style={{ flexShrink: 0 }}>
        {/* Row 1 — title */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-white font-semibold text-sm">Observed-First Map</span>
        </div>

        {/* Row 2 — stats (left) + controls (right) */}
        <div className="flex items-center justify-between gap-3">
          {/* Stats — uses middle-dot separators per editorial token. */}
          <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
            <span className="text-slate-400">
              Nodes: <span className="text-slate-200 font-mono">{stats.renderedNodes}</span>
              {stats.hiddenNodes > 0 && (
                <span className="text-amber-400/80 font-mono"> +{stats.hiddenNodes}</span>
              )}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              Edges: <span className="text-slate-200 font-mono">{stats.total}</span>
            </span>
            {stats.observed > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-green-400 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  <span className="font-mono">{stats.observed}</span> observed
                </span>
              </>
            )}
            {stats.allowed > 0 && mode === 'observed+potential' && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-violet-400">
                  <span className="font-mono">{stats.allowed}</span> potential
                </span>
              </>
            )}
            {publicOnly && publicCount > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-amber-400 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span className="font-mono">{publicCount}</span> public-facing
                </span>
              </>
            )}
          </div>

          {/* Controls — toggle, search, refresh, zoom, fullscreen. */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Public-facing-only filter (shadcn Switch + Tooltip). */}
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor="public-only-toggle"
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-medium cursor-pointer select-none transition-colors whitespace-nowrap ${
                    publicOnly
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-700/60 text-slate-300 border border-slate-600/60 hover:bg-slate-700'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  Public-facing only
                  <Switch
                    id="public-only-toggle"
                    checked={publicOnly}
                    onCheckedChange={setPublicOnly}
                    aria-label="Show public-facing components only"
                    className="ml-1"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Dim every component that the producer marked
                {' '}<span className="font-mono">is_internet_exposed: false</span>.
                Layout is preserved; nothing is removed from the graph.
              </TooltipContent>
            </Tooltip>

            {/* Focus Mode Indicator */}
            {focusedNode && (
              <button
                onClick={clearFocus}
                className="flex items-center gap-1.5 px-2 py-1 bg-amber-600 rounded text-xs font-medium text-white hover:bg-amber-700 whitespace-nowrap"
              >
                <Focus className="w-3 h-3" />
                Focus Mode
                <XCircle className="w-3 h-3" />
              </button>
            )}

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-7 pr-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
              />
            </div>

            <button onClick={() => { fetchData(); onRefresh?.() }} className="p-1.5 bg-blue-600 rounded hover:bg-blue-700" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5 text-white" />
            </button>

            <div className="flex items-center gap-0.5 bg-slate-700 rounded p-0.5">
              <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1 hover:bg-slate-600 rounded">
                <ZoomOut className="w-3.5 h-3.5 text-white" />
              </button>
              <span className="text-white text-xs w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 hover:bg-slate-600 rounded">
                <ZoomIn className="w-3.5 h-3.5 text-white" />
              </button>
            </div>

            <button onClick={toggleFullscreen} className="p-1.5 bg-slate-700 rounded hover:bg-slate-600" title="Fullscreen">
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
            </button>

            {isFullscreen && (
              <button onClick={() => setIsFullscreen(false)} className="p-1.5 bg-red-600 rounded hover:bg-red-700">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Honest empty-state banner when filter is on but producer returned no public nodes.
          Dashed border + as-of date matches the editorial empty-state token. */}
      {showNoPublicBanner && (
        <div className="mx-3 mt-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium uppercase tracking-wider text-slate-300">
              No public-facing components in this view
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            The producer marked every rendered component as{' '}
            <span className="font-mono">is_internet_exposed: false</span>. Turn the filter
            off to see the full map, or verify exposure data in the upstream collector.
          </div>
        </div>
      )}

      {/* Graph Container */}
      <div
        ref={containerRef}
        className="relative bg-slate-900"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          flex: 1,
          overflow: 'hidden'
        }}
        onMouseDown={e => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }) }}
        onMouseMove={e => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }) }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onWheel={e => setZoom(z => Math.max(0.2, Math.min(2, z + (e.deltaY > 0 ? -0.05 : 0.05))))}
      >
        {/* SVG Layer - VPC frames + edges */}
        <svg className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <defs>
            <marker id="arrow-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#10B981" />
            </marker>
            <marker id="arrow-inactive" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#64748B" />
            </marker>
          </defs>

          {/* VPC frames — drawn UNDER edges and component cards so they read as containers. */}
          {vpcFrames.map(v => {
            // A VPC is "all-dimmed" when the public-only filter is on AND it
            // has zero internet-exposed members of its own.
            const allDimmed = publicOnly && v.publicCount === 0
            const stroke = allDimmed ? '#475569' : '#7B3FE4'
            const fillOpacity = allDimmed ? 0.04 : 0.06
            const strokeOpacity = allDimmed ? 0.45 : 0.6
            return (
              <g key={`vpc-frame-${v.vpcId}`}>
                <rect
                  x={v.x}
                  y={v.y}
                  width={v.width}
                  height={v.height}
                  rx={10}
                  ry={10}
                  fill={stroke}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={1.5}
                  strokeDasharray={allDimmed ? '6 4' : 'none'}
                />
              </g>
            )
          })}

          {filtered.edges.map(e => {
            const s = layout.positions.get(e.source)
            const t = layout.positions.get(e.target)
            if (!s || !t) return null

            // Focus mode: dim edges not connected to focused node
            const focusDimmed = focusedNode && focusNeighbors && !focusNeighbors.has(e.source) && !focusNeighbors.has(e.target)

            // Public-only filter: dim any edge with a non-public endpoint, so
            // the visual weight follows the public-facing surface only.
            const sourceNode = filtered.nodes.find(n => n.id === e.source)
            const targetNode = filtered.nodes.find(n => n.id === e.target)
            const filterDimmed =
              publicOnly &&
              !(sourceNode?.is_internet_exposed && targetNode?.is_internet_exposed)

            const dimmed = focusDimmed || filterDimmed

            const startX = s.x + layout.NODE_WIDTH
            const startY = s.y + layout.NODE_HEIGHT / 2
            const endX = t.x
            const endY = t.y + layout.NODE_HEIGHT / 2
            const midX = (startX + endX) / 2
            const path = `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

            return <AnimatedEdge key={e.id} path={path} kind={e.kind} bytes={e.bytes_total} dimmed={dimmed || false} />
          })}
        </svg>

        {/* Overlay layer — VPC labels + "n hidden" chips, drawn in HTML on top
            of the SVG frame but BELOW component cards so card hover still wins. */}
        <div className="absolute inset-0 pointer-events-none" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {vpcFrames.map(v => {
            const allDimmed = publicOnly && v.publicCount === 0
            return (
              <div
                key={`vpc-label-${v.vpcId}`}
                className="absolute"
                style={{ left: v.x + 10, top: v.y + 4 }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] uppercase tracking-wider font-medium ${allDimmed ? 'text-slate-500' : 'text-violet-300/90'}`}>
                    VPC · {v.name}
                  </span>
                  {/* Hidden-count chip — only meaningful when the filter is on.
                      For all-dimmed VPCs the count is the full member count. */}
                  {publicOnly && v.hiddenCount > 0 && (
                    <span
                      className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
                        allDimmed
                          ? 'bg-slate-800/80 border-slate-600 text-slate-400'
                          : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      }`}
                      title={`${v.hiddenCount} non-public component${v.hiddenCount === 1 ? '' : 's'} dimmed in this VPC`}
                    >
                      <EyeOff className="w-2.5 h-2.5" />
                      {v.hiddenCount} hidden
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Nodes Layer */}
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Lane Headers */}
          {layout.lanes.map(([lane, nodes]) => {
            const p = layout.positions.get(nodes[0]?.id)
            if (!p) return null
            const hidden = layout.hiddenCounts.get(lane) || 0
            return (
              <div key={`lane-${lane}`} className="absolute"
                style={{ left: p.x, top: 8, minWidth: layout.NODE_WIDTH * 2 }}>
                <div className="text-cyan-400 text-lg font-bold tracking-wide">
                  {formatType(nodes[0]?.type)}
                </div>
                <div className="text-slate-400 text-xs">
                  {nodes.length} shown{hidden > 0 && <span className="text-amber-400"> (+{hidden} hidden)</span>}
                </div>
              </div>
            )
          })}

          {/* Nodes */}
          {filtered.nodes.map(n => {
            const p = layout.positions.get(n.id)
            if (!p) return null
            const c = getColors(n.type)

            // Focus mode: dim nodes not in neighborhood
            const focusDimmed = focusedNode && focusNeighbors && !focusNeighbors.has(n.id)
            const isFocused = focusedNode === n.id

            // Public-only filter: dim every non-public component. Layout stays
            // the same; only opacity changes — operators see WHERE the public
            // surface sits inside the broader map.
            const filterDimmed = publicOnly && !n.is_internet_exposed

            const dimmed = focusDimmed || filterDimmed

            return (
              <div
                key={n.id}
                className={`absolute cursor-pointer transition-all duration-150 ${dimmed ? 'opacity-25 saturate-50' : 'hover:scale-105 hover:z-10'} ${isFocused ? 'ring-2 ring-amber-400 scale-110 z-20' : ''}`}
                style={{ left: p.x, top: p.y, width: layout.NODE_WIDTH, height: layout.NODE_HEIGHT }}
                onClick={() => { setSelected(n); onNodeClick?.(n) }}
                onDoubleClick={() => setFocusedNode(focusedNode === n.id ? null : n.id)}
              >
                <div className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center shadow-lg ${selected?.id === n.id ? 'ring-2 ring-white/60 scale-105' : ''}`}
                  style={{ background: c.gradient, borderColor: c.border }}>
                  <AWSIcon type={n.type} size={24} />
                  <div className="text-[11px] text-white font-semibold w-full text-center px-1 mt-0.5 leading-tight" style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={n.name}>
                    {n.name || 'Unknown'}
                  </div>
                </div>

                {n.is_internet_exposed && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <Globe className="w-2.5 h-2.5 text-white" />
                  </div>
                )}

                {n.permission_gaps > 0 && (
                  <div className="absolute -top-1 -left-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                    {n.permission_gaps}
                  </div>
                )}

                {/* Security Group badge */}
                {n.security_groups.length > 0 && (
                  <div className="absolute -bottom-1.5 right-0 bg-rose-500/80 px-1 py-0.5 rounded text-[7px] text-white font-medium">
                    {n.security_groups.length} SG
                  </div>
                )}

                {/* IAM Role badge */}
                {n.iam_role && (
                  <div className="absolute -bottom-1.5 left-0 bg-violet-500/80 px-1 py-0.5 rounded text-[7px] text-white font-medium">
                    IAM
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-800/90 backdrop-blur rounded-lg p-2 border border-slate-700 text-xs z-10">
        <div className="text-white font-semibold mb-1.5 text-[10px]">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-green-500 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-green-500 rounded-full" />
            </div>
            <span className="text-slate-300 text-[10px]">Observed Traffic</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-px bg-slate-500 border-dashed border-t border-slate-500" />
            <span className="text-slate-300 text-[10px]">Potential (SG Allowed)</span>
          </div>
          {publicOnly && (
            <div className="flex items-center gap-2">
              <Globe className="w-3 h-3 text-amber-400" />
              <span className="text-slate-300 text-[10px]">Public-facing only · others dimmed</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-700">
            <Focus className="w-3 h-3 text-amber-400" />
            <span className="text-slate-300 text-[10px]">Double-click to focus</span>
          </div>
        </div>
      </div>

      {/* Selected Node Panel */}
      {selected && (
        <div className="absolute top-24 right-3 w-64 bg-slate-800/95 backdrop-blur rounded-lg border border-slate-700 shadow-xl z-20">
          <div className="flex items-center justify-between p-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <AWSIcon type={selected.type} size={16} />
              <span className="text-white font-semibold text-xs">{getColors(selected.type).label}</span>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2 space-y-1.5 text-xs">
            <div>
              <div className="text-slate-400 text-[10px]">Name</div>
              <div className="text-white break-all text-[11px]">{selected.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">ID</div>
              <div className="text-slate-300 text-[9px] font-mono break-all">{selected.id}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">Category</div>
              <div className="text-slate-300 text-[11px]">{selected.category}</div>
            </div>
            {selected.security_groups.length > 0 && (
              <div>
                <div className="text-slate-400 text-[10px]">Security Groups</div>
                <div className="text-rose-400 text-[11px]">{selected.security_groups.join(', ')}</div>
              </div>
            )}
            {selected.iam_role && (
              <div>
                <div className="text-slate-400 text-[10px]">IAM Role</div>
                <div className="text-violet-400 text-[11px]">{selected.iam_role}</div>
              </div>
            )}
            {selected.is_internet_exposed && (
              <div className="flex items-center gap-1.5 text-amber-400 text-[10px]">
                <Globe className="w-3 h-3" /> Internet Exposed
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
