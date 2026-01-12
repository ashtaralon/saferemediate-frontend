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

function getShortLabel(node: AnyNode): string {
  const name = node.name || node.id
  if (name.length > 22) return name.slice(0, 19) + '...'
  return name
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
// NODE CARD COMPONENT
// ============================================================================

const NodeCard: React.FC<{
  node: AnyNode
  tier: Tier
  isHighlighted: boolean
  isConnected: boolean
  hasHighlight: boolean
  onHover: (id: string | null) => void
  nodeRef: (el: HTMLDivElement | null) => void
}> = ({ node, tier, isHighlighted, isConnected, hasHighlight, onHover, nodeRef }) => {
  const tierColor = TIER_CONFIG[tier]?.color || '#64748b'
  const icon = getNodeIcon(node)

  // Get additional info based on node type
  const getExtraInfo = () => {
    if ('security_groups' in node && node.security_groups?.length) {
      return <span className="text-[9px] text-amber-400/70">{node.security_groups.length} SGs</span>
    }
    if ('iam_role' in node && node.iam_role) {
      return <span className="text-[9px] text-pink-400/70">IAM</span>
    }
    if ('ingress_rules' in node) {
      return <span className="text-[9px] text-amber-400/70">{node.ingress_rules?.length || 0} rules</span>
    }
    if ('unused_permissions_count' in node && node.unused_permissions_count > 0) {
      return <span className="text-[9px] text-red-400">{node.unused_permissions_count} unused</span>
    }
    if ('port' in node && node.port) {
      return <span className="text-[9px] text-violet-400">:{node.port}</span>
    }
    if ('attached_resources' in node && node.attached_resources?.length) {
      return <span className="text-[9px] text-slate-400">{node.attached_resources.length} attached</span>
    }
    return null
  }

  return (
    <div
      ref={nodeRef}
      className="relative cursor-pointer transition-all duration-200"
      style={{
        background: isHighlighted
          ? `linear-gradient(135deg, ${tierColor}22 0%, ${tierColor}11 100%)`
          : 'rgba(30, 41, 59, 0.6)',
        borderTop: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.1)'}`,
        borderRight: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.1)'}`,
        borderBottom: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.1)'}`,
        borderLeft: `3px solid ${tierColor}`,
        borderRadius: '8px',
        padding: '10px 12px',
        transform: isHighlighted ? 'scale(1.02) translateX(4px)' : 'scale(1)',
        boxShadow: isHighlighted ? `0 4px 20px ${tierColor}33` : 'none',
        opacity: hasHighlight && !isHighlighted && !isConnected ? 0.3 : 1,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-slate-100 truncate">{getShortLabel(node)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{node.type}</span>
        {getExtraInfo()}
      </div>

      {/* Flow badges */}
      {'inbound_flows' in node && (node.inbound_flows > 0 || node.outbound_flows > 0) && (
        <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
          {node.inbound_flows > 0 && (
            <div className="bg-green-500 text-black text-[8px] font-bold px-1 py-0.5 rounded-full">
              {formatCount(node.inbound_flows)}
            </div>
          )}
          {node.outbound_flows > 0 && (
            <div className="bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full">
              {formatCount(node.outbound_flows)}
            </div>
          )}
        </div>
      )}

      {/* Port badge for data nodes */}
      {'port' in node && node.port && (
        <div className="absolute -top-1.5 -right-1.5 bg-violet-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
          :{node.port}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EDGE PATH COMPONENT
// ============================================================================

const EdgePath: React.FC<{
  edge: Edge
  sourcePos: { x: number; y: number } | null
  targetPos: { x: number; y: number } | null
  isHighlighted: boolean
  hasHighlight: boolean
}> = ({ edge, sourcePos, targetPos, isHighlighted, hasHighlight }) => {
  if (!sourcePos || !targetPos) return null

  const edgeStyle = EDGE_STYLES[edge.edge_type] || EDGE_STYLES.TRAFFIC
  const baseColor = edgeStyle.color
  const opacity = isHighlighted ? 0.9 : hasHighlight ? 0.08 : 0.35
  const strokeWidth = Math.min(Math.max(Math.log10(edge.flows + 1) * 1.5 + 1, 1.5), 5)

  // Bezier curve
  const dx = targetPos.x - sourcePos.x
  const controlOffset = Math.min(Math.abs(dx) * 0.4, 120)

  const path = `M ${sourcePos.x} ${sourcePos.y}
                C ${sourcePos.x + controlOffset} ${sourcePos.y},
                  ${targetPos.x - controlOffset} ${targetPos.y},
                  ${targetPos.x} ${targetPos.y}`

  // Dash patterns
  let strokeDasharray = 'none'
  if (edgeStyle.style === 'dashed') strokeDasharray = '8,4'
  if (edgeStyle.style === 'dotted') strokeDasharray = '3,3'

  return (
    <g style={{ transition: 'opacity 0.2s ease' }}>
      {/* Glow effect for highlighted */}
      {isHighlighted && (
        <path d={path} fill="none" stroke={baseColor} strokeWidth={strokeWidth + 6} opacity={0.15} strokeLinecap="round" />
      )}

      {/* Main path */}
      <path
        d={path}
        fill="none"
        stroke={baseColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
      />

      {/* Animated particles for highlighted edges */}
      {isHighlighted && edge.flows > 0 && (
        <>
          <circle r="3" fill={baseColor} opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r="3" fill={baseColor} opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="0.7s" />
          </circle>
        </>
      )}

      {/* Label for highlighted */}
      {isHighlighted && (
        <g transform={`translate(${(sourcePos.x + targetPos.x) / 2}, ${(sourcePos.y + targetPos.y) / 2 - 14})`}>
          <rect x="-35" y="-12" width="70" height="24" rx="4" fill="rgba(15, 23, 42, 0.95)" stroke={baseColor} strokeWidth="1" />
          <text textAnchor="middle" dy="2" fill="#fff" fontSize="9" fontFamily="monospace">
            {edge.label || edge.edge_type}
          </text>
          {edge.flows > 0 && (
            <text textAnchor="middle" dy="12" fill={baseColor} fontSize="10" fontFamily="monospace" fontWeight="600">
              {formatCount(edge.flows)}
            </text>
          )}
        </g>
      )}
    </g>
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

  // Node ID to tier mapping
  const nodeIdToTier = useMemo(() => {
    const map = new Map<string, Tier>()
    Object.entries(nodesByTier).forEach(([tier, nodes]) => {
      nodes.forEach((n) => map.set(n.id, tier as Tier))
    })
    return map
  }, [nodesByTier])

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
    window.addEventListener('resize', updatePositions)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
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
        <RefreshCw className="w-10 h-10 text-green-400 animate-spin" />
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
      {/* Data Sources Banner */}
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/60 border-b border-slate-700/50 text-[10px]">
        <span className="text-slate-500 uppercase tracking-wider">Data Sources:</span>
        <div className="flex gap-3">
          <span className={data.data_sources.flow_logs ? 'text-green-400' : 'text-slate-600'}>
            {data.data_sources.flow_logs ? '✓' : '○'} VPC Flow Logs
          </span>
          <span className={data.data_sources.cloudtrail ? 'text-green-400' : 'text-slate-600'}>
            {data.data_sources.cloudtrail ? '✓' : '○'} CloudTrail
          </span>
          <span className={data.data_sources.config ? 'text-green-400' : 'text-slate-600'}>
            {data.data_sources.config ? '✓' : '○'} AWS Config
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700" style={{ height: '48px', flexShrink: 0 }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold text-sm">Comprehensive Infrastructure Map</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-green-400 font-bold">{formatCount(stats.totalFlows)} flows</span>
            <span className="text-slate-400">{stats.nodes} nodes</span>
            <span className="text-slate-400">{stats.edges} connections</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edge type filter */}
          <select
            value={edgeTypeFilter || ''}
            onChange={(e) => setEdgeTypeFilter(e.target.value || null)}
            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs"
          >
            <option value="">All Edges</option>
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
              className="pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm w-32 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <button onClick={() => { fetchData(); onRefresh?.() }} className="p-2 bg-green-600 rounded-lg hover:bg-green-700">
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
              startX = sourcePos.right
              endX = targetPos.left
            } else if (targetIsLeft) {
              startX = sourcePos.left
              endX = targetPos.right
            } else {
              startX = (sourcePos.left + sourcePos.right) / 2
              endX = (targetPos.left + targetPos.right) / 2
            }

            const isHighlighted = highlightedNode ? edge.source === highlightedNode || edge.target === highlightedNode : false

            return (
              <EdgePath
                key={edge.id}
                edge={edge}
                sourcePos={{ x: startX, y: sourcePos.centerY }}
                targetPos={{ x: endX, y: targetPos.centerY }}
                isHighlighted={isHighlighted}
                hasHighlight={!!highlightedNode}
              />
            )
          })}
        </svg>

        {/* Tier columns */}
        <div className="flex h-full p-4 gap-6 justify-center items-start overflow-x-auto" style={{ position: 'relative', zIndex: 2 }}>
          {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][])
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([tierId, config]) => {
              const tierNodes = nodesByTier[tierId] || []
              if (tierNodes.length === 0) return null

              return (
                <div key={tierId} className="flex flex-col gap-2 min-w-[180px] max-w-[240px]">
                  {/* Tier header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
                    style={{ background: config.bgColor, borderLeft: `3px solid ${config.color}` }}
                  >
                    <span style={{ color: config.color }}>{config.icon}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
                      {config.label}
                    </span>
                    <span className="ml-auto bg-slate-700/50 px-2 py-0.5 rounded-full text-[9px] text-slate-400">{tierNodes.length}</span>
                  </div>

                  {/* Nodes */}
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100%-50px)] pr-1">
                    {tierNodes.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        tier={tierId}
                        isHighlighted={highlightedNode === node.id}
                        isConnected={connectedNodes.has(node.id)}
                        hasHighlight={!!highlightedNode}
                        onHover={setHighlightedNode}
                        nodeRef={(el) => (nodeRefs.current[node.id] = el)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/95 backdrop-blur rounded-lg p-3 border border-slate-700 z-10">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Connection Types</div>
        <div className="space-y-1.5">
          {Object.entries(EDGE_STYLES).map(([type, config]) => (
            <div key={type} className="flex items-center gap-2 text-[10px]">
              <div
                className="w-6 h-0.5 rounded"
                style={{
                  background: config.style === 'solid'
                    ? config.color
                    : config.style === 'dashed'
                      ? `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 4px, transparent 4px, transparent 6px)`
                      : `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 2px, transparent 2px, transparent 4px)`
                }}
              />
              <span className="text-slate-400">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info panel when highlighting */}
      {highlightedNode && (
        <div className="absolute bottom-4 right-4 bg-slate-800/95 backdrop-blur rounded-lg p-3 border border-slate-700 z-10 min-w-[200px]">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Selected Resource</div>
          <div className="text-sm font-semibold text-white mb-2">{allNodes.find((n) => n.id === highlightedNode)?.name}</div>
          <div className="flex gap-4">
            <div>
              <div className="text-base font-bold text-amber-400">{connectedNodes.size - 1}</div>
              <div className="text-[9px] text-slate-500">Connected</div>
            </div>
            <div>
              <div className="text-base font-bold text-cyan-400">{edges.filter((e) => e.source === highlightedNode || e.target === highlightedNode).length}</div>
              <div className="text-[9px] text-slate-500">Edges</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
