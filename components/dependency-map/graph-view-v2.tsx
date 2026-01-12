'use client'

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw, ZoomIn, ZoomOut, Search, Shield, Server, Database, Globe,
  Key, HardDrive, Lock, Layers, Activity, Maximize2, Minimize2, X, Focus, XCircle
} from 'lucide-react'
import { CoverageBanner } from './coverage-banner'

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
const truncate = (s: string, m = 20) => !s ? 'Unknown' : s.length <= m ? s : s.slice(0, m - 2) + '..'
const formatType = (t: string) => ({
  InternetGateway: "Internet Gateway",
  NATGateway: "NAT Gateway",
  S3Bucket: "S3",
  VPCE: "VPC Endpoint"
}[t] || t)

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
  const [timeWindow, setTimeWindow] = useState('7d')
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<ComponentNode | null>(null)
  const [focusedNode, setFocusedNode] = useState<string | null>(null) // For focus mode
  const [zoom, setZoom] = useState(0.55)
  const [pan, setPan] = useState({ x: 40, y: 20 })
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  // Filter data
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

  // Calculate layout
  const layout = useMemo(() => {
    const lanes = new Map<number, ComponentNode[]>()
    filtered.nodes.forEach(n => {
      const l = getLane(n.type)
      if (!lanes.has(l)) lanes.set(l, [])
      lanes.get(l)!.push(n)
    })

    const positions = new Map<string, { x: number; y: number }>()
    const sorted = Array.from(lanes.entries()).sort((a, b) => a[0] - b[0])
    let maxY = 0

    const NODE_WIDTH = 130
    const NODE_HEIGHT = 90
    const LANE_GAP = 200
    const NODE_GAP = 120
    const PADDING = 40

    sorted.forEach(([_, nodes], i) => {
      nodes.forEach((n, j) => {
        const x = PADDING + i * LANE_GAP
        const y = PADDING + 30 + j * NODE_GAP
        positions.set(n.id, { x, y })
        maxY = Math.max(maxY, y)
      })
    })

    return { positions, width: PADDING * 2 + sorted.length * LANE_GAP, height: maxY + NODE_HEIGHT + PADDING * 2, lanes: sorted, NODE_WIDTH, NODE_HEIGHT }
  }, [filtered])

  // Count stats
  const stats = useMemo(() => {
    const observedEdges = filtered.edges.filter(e => e.kind === 'OBSERVED')
    const allowedEdges = filtered.edges.filter(e => e.kind === 'ALLOWED')
    return {
      total: filtered.edges.length,
      observed: observedEdges.length,
      allowed: allowedEdges.length
    }
  }, [filtered.edges])

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

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Coverage Banner */}
      <CoverageBanner coverage={coverage} mode={mode} onModeChange={handleModeChange} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700" style={{ height: '44px', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold text-sm">Observed-First Map</span>
          </div>
          <span className="text-slate-400 text-xs">
            Nodes: {filtered.nodes.length} | Edges: {filtered.edges.length}
          </span>
          {stats.observed > 0 && (
            <span className="text-green-400 text-xs flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {stats.observed} observed
            </span>
          )}
          {stats.allowed > 0 && mode === 'observed+potential' && (
            <span className="text-violet-400 text-xs flex items-center gap-1">
              {stats.allowed} potential
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Focus Mode Indicator */}
          {focusedNode && (
            <button
              onClick={clearFocus}
              className="flex items-center gap-1.5 px-2 py-1 bg-amber-600 rounded text-xs font-medium text-white hover:bg-amber-700"
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
              className="pl-7 pr-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button onClick={() => { fetchData(); onRefresh?.() }} className="p-1.5 bg-blue-600 rounded hover:bg-blue-700" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-white" />
          </button>

          <div className="flex items-center gap-0.5 bg-slate-700 rounded p-0.5">
            <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1 hover:bg-slate-600 rounded">
              <ZoomOut className="w-3.5 h-3.5 text-white" />
            </button>
            <span className="text-white text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
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
        {/* SVG Layer - Edges */}
        <svg className="absolute inset-0 w-full h-full" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <defs>
            <marker id="arrow-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#10B981" />
            </marker>
            <marker id="arrow-inactive" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#64748B" />
            </marker>
          </defs>

          {filtered.edges.map(e => {
            const s = layout.positions.get(e.source)
            const t = layout.positions.get(e.target)
            if (!s || !t) return null

            // Focus mode: dim edges not connected to focused node
            const dimmed = focusedNode && focusNeighbors && !focusNeighbors.has(e.source) && !focusNeighbors.has(e.target)

            const startX = s.x + layout.NODE_WIDTH
            const startY = s.y + layout.NODE_HEIGHT / 2
            const endX = t.x
            const endY = t.y + layout.NODE_HEIGHT / 2
            const midX = (startX + endX) / 2
            const path = `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

            return <AnimatedEdge key={e.id} path={path} kind={e.kind} bytes={e.bytes_total} dimmed={dimmed || false} />
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Lane Headers */}
          {layout.lanes.map(([lane, nodes]) => {
            const p = layout.positions.get(nodes[0]?.id)
            if (!p) return null
            return (
              <div key={`lane-${lane}`} className="absolute text-cyan-400 text-2xl font-black tracking-wide"
                style={{ left: p.x, top: 8, width: layout.NODE_WIDTH, textAlign: 'center' }}>
                {formatType(nodes[0]?.type)} ({nodes.length})
              </div>
            )
          })}

          {/* Nodes */}
          {filtered.nodes.map(n => {
            const p = layout.positions.get(n.id)
            if (!p) return null
            const c = getColors(n.type)

            // Focus mode: dim nodes not in neighborhood
            const dimmed = focusedNode && focusNeighbors && !focusNeighbors.has(n.id)
            const isFocused = focusedNode === n.id

            return (
              <div
                key={n.id}
                className={`absolute cursor-pointer transition-all duration-150 ${dimmed ? 'opacity-20' : 'hover:scale-105 hover:z-10'} ${isFocused ? 'ring-2 ring-amber-400 scale-110 z-20' : ''}`}
                style={{ left: p.x, top: p.y, width: layout.NODE_WIDTH, height: layout.NODE_HEIGHT }}
                onClick={() => { setSelected(n); onNodeClick?.(n) }}
                onDoubleClick={() => setFocusedNode(focusedNode === n.id ? null : n.id)}
              >
                <div className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center shadow-lg ${selected?.id === n.id ? 'ring-2 ring-white/60 scale-105' : ''}`}
                  style={{ background: c.gradient, borderColor: c.border }}>
                  <AWSIcon type={n.type} size={32} />
                  <div className="text-sm text-white font-bold w-full text-center px-1 mt-1 leading-tight" style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={n.name}>
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
              <div className="flex items-center gap-1.5 text-red-400 text-[10px]">
                <Globe className="w-3 h-3" /> Internet Exposed
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
