'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  RefreshCw, ZoomIn, ZoomOut, ChevronDown, ChevronRight, Globe, Database,
  Server, Layers, HardDrive, Shield, Activity, Maximize2, Minimize2, X,
  ExternalLink, Lock, Search, Filter
} from 'lucide-react'
import { CoverageBanner } from './coverage-banner'

// ============================================================================
// TYPES
// ============================================================================

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

interface Cluster {
  id: string
  name: string
  tier: Tier
  nodes: ComponentNode[]
  expanded: boolean
  inboundFlows: number
  outboundFlows: number
  internalFlows: number
}

interface BundledEdge {
  id: string
  sourceCluster: string
  targetCluster: string
  edges: MapEdge[]
  totalFlows: number
  totalBytes: number
  kind: 'OBSERVED' | 'ALLOWED' | 'MIXED'
}

type Tier = 'internet' | 'frontend' | 'app' | 'data' | 'external'

interface TieredLayoutProps {
  systemName: string
  onNodeClick?: (node: ComponentNode) => void
  onRefresh?: () => void
}

// ============================================================================
// TIER CLASSIFICATION
// ============================================================================

function classifyTier(node: ComponentNode): Tier {
  const name = (node.name || '').toLowerCase()
  const type = (node.type || '').toLowerCase()

  // Internet-facing
  if (type.includes('internetgateway') || type.includes('natgateway')) {
    return 'internet'
  }
  if (type.includes('alb') || type.includes('elb') || type.includes('nlb')) {
    return 'frontend'
  }
  if (node.is_internet_exposed && (type.includes('ec2') || type.includes('ecs'))) {
    return 'frontend'
  }

  // Data tier
  if (type.includes('rds') || type.includes('aurora') || type.includes('dynamodb') ||
      type.includes('elasticache') || type.includes('redis')) {
    return 'data'
  }
  if (type.includes('s3') || name.includes('bucket')) {
    return 'data'
  }

  // App tier (compute not internet-exposed)
  if (type.includes('lambda') || type.includes('ec2') || type.includes('ecs') || type.includes('fargate')) {
    return 'app'
  }

  // External/Unknown
  if (name.includes('unknown') || name.match(/^\d+\.\d+\.\d+\.\d+/)) {
    return 'external'
  }

  return 'app' // Default
}

function getClusterName(tier: Tier, nodes: ComponentNode[]): string {
  if (nodes.length === 1) {
    return nodes[0].name || 'Unknown'
  }

  const type = nodes[0]?.type || 'Resource'
  switch (tier) {
    case 'internet': return 'Internet Gateway'
    case 'frontend': return `Frontend (${nodes.length})`
    case 'app': return `App Tier (${nodes.length})`
    case 'data': return `Data Tier (${nodes.length})`
    case 'external': return `External (${nodes.length})`
    default: return `${type} (${nodes.length})`
  }
}

// ============================================================================
// TIER COLORS & ICONS
// ============================================================================

const TIER_CONFIG: Record<Tier, { bg: string; border: string; icon: React.FC<any>; label: string }> = {
  internet: { bg: '#067F68', border: '#056654', icon: Globe, label: 'Internet' },
  frontend: { bg: '#8C4FFF', border: '#7B3FE4', icon: Layers, label: 'Frontend' },
  app: { bg: '#FF9900', border: '#EC7211', icon: Server, label: 'App Tier' },
  data: { bg: '#3B48CC', border: '#2E3AB5', icon: Database, label: 'Data Tier' },
  external: { bg: '#5A6B7A', border: '#475666', icon: ExternalLink, label: 'External' }
}

// ============================================================================
// CLUSTER COMPONENT
// ============================================================================

const ResourceCluster: React.FC<{
  cluster: Cluster
  expanded: boolean
  onToggle: () => void
  onNodeClick?: (node: ComponentNode) => void
  selected?: string | null
}> = ({ cluster, expanded, onToggle, onNodeClick, selected }) => {
  const config = TIER_CONFIG[cluster.tier]
  const Icon = config.icon
  const isSingleNode = cluster.nodes.length === 1
  const node = cluster.nodes[0]

  return (
    <div className="flex flex-col items-center">
      {/* Main cluster box */}
      <div
        className={`relative cursor-pointer transition-all duration-200 ${
          expanded ? 'ring-2 ring-white/30' : 'hover:scale-105'
        }`}
        onClick={isSingleNode ? () => onNodeClick?.(node) : onToggle}
        style={{
          background: `linear-gradient(135deg, ${config.bg}dd 0%, ${config.bg} 100%)`,
          borderColor: config.border,
          borderWidth: 2,
          borderStyle: 'solid',
          borderRadius: 12,
          padding: expanded ? '12px 16px' : '16px 24px',
          minWidth: expanded ? 200 : 140,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-white" />
          <div className="text-white">
            <div className="font-bold text-sm">{cluster.name}</div>
            {!isSingleNode && (
              <div className="text-xs text-white/70">{cluster.nodes.length} resources</div>
            )}
          </div>
          {!isSingleNode && (
            <div className="ml-2">
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-white/70" />
              ) : (
                <ChevronRight className="w-4 h-4 text-white/70" />
              )}
            </div>
          )}
        </div>

        {/* Flow badge */}
        {cluster.inboundFlows > 0 && (
          <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {formatFlows(cluster.inboundFlows + cluster.outboundFlows)}
          </div>
        )}

        {/* Internet exposed badge */}
        {cluster.nodes.some(n => n.is_internet_exposed) && (
          <div className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
            <Globe className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Expanded node list */}
      {expanded && !isSingleNode && (
        <div className="mt-2 bg-slate-800/90 rounded-lg border border-slate-700 p-2 max-h-48 overflow-y-auto w-full">
          {cluster.nodes.map(n => (
            <div
              key={n.id}
              className={`px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                selected === n.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
              onClick={(e) => { e.stopPropagation(); onNodeClick?.(n) }}
            >
              <div className="font-medium truncate">{n.name || 'Unknown'}</div>
              <div className="text-[10px] text-slate-400">{n.type}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CONNECTION BUNDLE COMPONENT
// ============================================================================

const ConnectionBundle: React.FC<{
  bundle: BundledEdge
  startX: number
  startY: number
  endX: number
  endY: number
  dimmed?: boolean
  onClick?: () => void
}> = ({ bundle, startX, startY, endX, endY, dimmed = false, onClick }) => {
  const isObserved = bundle.kind === 'OBSERVED' || bundle.kind === 'MIXED'
  const strokeColor = isObserved ? '#10B981' : '#64748B'
  const strokeWidth = Math.min(8, 2 + Math.log10(bundle.totalFlows + 1) * 2)

  // Curved path
  const midX = (startX + endX) / 2
  const path = `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

  return (
    <g style={{ opacity: dimmed ? 0.2 : 1 }} onClick={onClick} className="cursor-pointer">
      {/* Glow effect */}
      {isObserved && !dimmed && (
        <path d={path} fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 4} strokeOpacity={0.15} />
      )}

      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={isObserved ? 'none' : '8 4'}
        markerEnd="url(#arrow-bundle)"
      />

      {/* Flow label */}
      {!dimmed && (
        <text
          x={midX}
          y={(startY + endY) / 2 - 10}
          fill="white"
          fontSize="11"
          fontWeight="bold"
          textAnchor="middle"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
        >
          {formatFlows(bundle.totalFlows)} flows
        </text>
      )}

      {/* Animated particles */}
      {isObserved && !dimmed && (
        <>
          <circle r="4" fill={strokeColor}>
            <animateMotion dur="2s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r="4" fill={strokeColor} opacity="0.5">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="1s" />
          </circle>
        </>
      )}
    </g>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function formatFlows(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TieredLayout({
  systemName,
  onNodeClick,
  onRefresh
}: TieredLayoutProps) {
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
  const [isLoading, setIsLoading] = useState(true)
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<ComponentNode | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<BundledEdge | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/proxy/dependency-map/v2?systemId=${encodeURIComponent(systemName)}&window=7d&mode=${mode}`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        setNodes(data.nodes || [])
        setEdges(data.edges || [])
        setCoverage(data.coverage || { flow_logs_enabled_enis_pct: 0, analysis_window: '7d', observed_edges: 0, total_flows: 0, notes: [] })
      }
    } catch (e) {
      console.error('[TieredLayout] Failed to fetch:', e)
    } finally {
      setIsLoading(false)
    }
  }, [systemName, mode])

  useEffect(() => { fetchData() }, [fetchData])

  // Build clusters by tier
  const clusters = useMemo(() => {
    const tierMap = new Map<Tier, ComponentNode[]>()
    const tierOrder: Tier[] = ['external', 'internet', 'frontend', 'app', 'data']

    // Filter by search
    const filteredNodes = search
      ? nodes.filter(n => n.name?.toLowerCase().includes(search.toLowerCase()) || n.type?.toLowerCase().includes(search.toLowerCase()))
      : nodes

    // Group nodes by tier
    filteredNodes.forEach(node => {
      const tier = classifyTier(node)
      if (!tierMap.has(tier)) tierMap.set(tier, [])
      tierMap.get(tier)!.push(node)
    })

    // Create clusters - group similar resources within each tier
    const allClusters: Cluster[] = []

    tierOrder.forEach(tier => {
      const tierNodes = tierMap.get(tier) || []
      if (tierNodes.length === 0) return

      // Group by type within tier
      const typeGroups = new Map<string, ComponentNode[]>()
      tierNodes.forEach(n => {
        const key = n.type || 'Unknown'
        if (!typeGroups.has(key)) typeGroups.set(key, [])
        typeGroups.get(key)!.push(n)
      })

      // Create cluster for each type group
      typeGroups.forEach((groupNodes, type) => {
        // Calculate flows for this cluster
        const nodeIds = new Set(groupNodes.map(n => n.id))
        let inbound = 0, outbound = 0, internal = 0
        edges.forEach(e => {
          const srcIn = nodeIds.has(e.source)
          const dstIn = nodeIds.has(e.target)
          if (srcIn && dstIn) internal += e.flows
          else if (srcIn) outbound += e.flows
          else if (dstIn) inbound += e.flows
        })

        allClusters.push({
          id: `${tier}-${type}`,
          name: groupNodes.length === 1 ? (groupNodes[0].name || type) : `${type} (${groupNodes.length})`,
          tier,
          nodes: groupNodes,
          expanded: false,
          inboundFlows: inbound,
          outboundFlows: outbound,
          internalFlows: internal
        })
      })
    })

    return allClusters
  }, [nodes, edges, search])

  // Group clusters by tier for layout
  const tierClusters = useMemo(() => {
    const map = new Map<Tier, Cluster[]>()
    clusters.forEach(c => {
      if (!map.has(c.tier)) map.set(c.tier, [])
      map.get(c.tier)!.push(c)
    })
    return map
  }, [clusters])

  // Bundle edges between clusters
  const bundledEdges = useMemo(() => {
    const nodeToCluster = new Map<string, string>()
    clusters.forEach(c => {
      c.nodes.forEach(n => nodeToCluster.set(n.id, c.id))
    })

    const bundles = new Map<string, BundledEdge>()
    edges.forEach(e => {
      const srcCluster = nodeToCluster.get(e.source)
      const dstCluster = nodeToCluster.get(e.target)
      if (!srcCluster || !dstCluster || srcCluster === dstCluster) return

      const key = `${srcCluster}→${dstCluster}`
      if (!bundles.has(key)) {
        bundles.set(key, {
          id: key,
          sourceCluster: srcCluster,
          targetCluster: dstCluster,
          edges: [],
          totalFlows: 0,
          totalBytes: 0,
          kind: 'OBSERVED'
        })
      }
      const bundle = bundles.get(key)!
      bundle.edges.push(e)
      bundle.totalFlows += e.flows
      bundle.totalBytes += e.bytes_total
      if (e.kind === 'ALLOWED' && bundle.kind === 'OBSERVED') bundle.kind = 'MIXED'
      if (e.kind === 'ALLOWED' && bundle.edges.every(x => x.kind === 'ALLOWED')) bundle.kind = 'ALLOWED'
    })

    return Array.from(bundles.values())
  }, [clusters, edges])

  // Toggle cluster expansion
  const toggleCluster = useCallback((clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(clusterId)) next.delete(clusterId)
      else next.add(clusterId)
      return next
    })
  }, [])

  // Stats
  const stats = useMemo(() => ({
    totalNodes: nodes.length,
    clusters: clusters.length,
    connections: bundledEdges.length,
    totalFlows: edges.reduce((a, e) => a + e.flows, 0)
  }), [nodes, clusters, bundledEdges, edges])

  if (isLoading) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center bg-slate-900 rounded-xl">
        <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    )
  }

  const containerClass = isFullscreen ? "fixed inset-0 z-50 bg-slate-900 flex flex-col" : "w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col"
  const tierOrder: Tier[] = ['external', 'internet', 'frontend', 'app', 'data']

  return (
    <div className={containerClass} style={isFullscreen ? {} : { height: '650px' }}>
      {/* Coverage Banner */}
      <CoverageBanner coverage={coverage} mode={mode} onModeChange={setMode} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700" style={{ height: '48px', flexShrink: 0 }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-white font-semibold">Architecture View</span>
          </div>
          <span className="text-slate-400 text-sm">
            {stats.clusters} clusters | {stats.connections} connections | {formatFlows(stats.totalFlows)} flows
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resources..."
              className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button onClick={() => { fetchData(); onRefresh?.() }} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700">
            <RefreshCw className="w-4 h-4 text-white" />
          </button>

          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600">
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>

          {isFullscreen && (
            <button onClick={() => setIsFullscreen(false)} className="p-2 bg-red-600 rounded-lg hover:bg-red-700">
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 relative overflow-auto p-6">
        {/* Tier columns */}
        <div className="flex items-start justify-center gap-16 min-h-full">
          {tierOrder.map(tier => {
            const tierClusterList = tierClusters.get(tier) || []
            if (tierClusterList.length === 0) return null

            const config = TIER_CONFIG[tier]

            return (
              <div key={tier} className="flex flex-col items-center gap-4">
                {/* Tier header */}
                <div className="text-center mb-2">
                  <div className="text-lg font-bold" style={{ color: config.bg }}>{config.label}</div>
                  <div className="text-slate-500 text-xs">{tierClusterList.reduce((a, c) => a + c.nodes.length, 0)} resources</div>
                </div>

                {/* Clusters in this tier */}
                <div className="flex flex-col gap-4">
                  {tierClusterList.map(cluster => (
                    <ResourceCluster
                      key={cluster.id}
                      cluster={cluster}
                      expanded={expandedClusters.has(cluster.id)}
                      onToggle={() => toggleCluster(cluster.id)}
                      onNodeClick={(n) => { setSelectedNode(n); onNodeClick?.(n) }}
                      selected={selectedNode?.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Connection SVG overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <marker id="arrow-bundle" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <polygon points="0 0,10 4,0 8" fill="#10B981" />
            </marker>
          </defs>
          {/* Note: Connection lines would need position calculation from DOM elements */}
          {/* For now, showing stats in clusters is more practical */}
        </svg>
      </div>

      {/* Selected Node Panel */}
      {selectedNode && (
        <div className="absolute top-32 right-4 w-72 bg-slate-800/95 backdrop-blur rounded-xl border border-slate-700 shadow-2xl z-20">
          <div className="flex items-center justify-between p-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span className="text-white font-semibold text-sm">{selectedNode.type}</span>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-2 text-sm">
            <div>
              <div className="text-slate-400 text-xs">Name</div>
              <div className="text-white font-medium">{selectedNode.name}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">ID</div>
              <div className="text-slate-300 text-xs font-mono break-all">{selectedNode.id}</div>
            </div>
            {selectedNode.security_groups.length > 0 && (
              <div>
                <div className="text-slate-400 text-xs">Security Groups</div>
                <div className="text-rose-400 text-xs">{selectedNode.security_groups.length} attached</div>
              </div>
            )}
            {selectedNode.is_internet_exposed && (
              <div className="flex items-center gap-2 text-red-400 text-xs mt-2">
                <Globe className="w-3.5 h-3.5" /> Internet Exposed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur rounded-lg p-3 border border-slate-700">
        <div className="text-white font-semibold text-xs mb-2">Architecture Tiers</div>
        <div className="space-y-1.5">
          {tierOrder.filter(t => tierClusters.has(t)).map(tier => {
            const config = TIER_CONFIG[tier]
            const Icon = config.icon
            return (
              <div key={tier} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded" style={{ background: config.bg }} />
                <Icon className="w-3 h-3" style={{ color: config.bg }} />
                <span className="text-slate-300">{config.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
