'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { RefreshCw, Maximize2, Minimize2, X, Search } from 'lucide-react'
import { CoverageBanner } from './coverage-banner'

// ============================================================================
// TYPES
// ============================================================================

interface RawEdge {
  source: string
  target: string
  rel_type: string
  flows?: number
  bytes_total?: number
}

interface ProcessedNode {
  id: string
  tier: Tier
  label: string
  type: string
}

interface ProcessedEdge {
  source: string
  target: string
  type: string
  count: number
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

type Tier = 'external' | 'internet' | 'frontend' | 'app' | 'data' | 'services'

interface InfrastructureFlowVizProps {
  systemName: string
  onNodeClick?: (node: any) => void
  onRefresh?: () => void
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const INSTANCE_NAMES: Record<string, string> = {
  'i-03c72e120ff96216c': 'frontend-2',
  'i-0f51b8b7ad29a359b': 'frontend-1',
  'i-0df88ac8208f7607a': 'app-1',
  'i-0e9b891793b5b2dbd': 'app-2',
}

const TIER_CONFIG: Record<Tier, { label: string; color: string; bgColor: string; order: number; icon: string }> = {
  external: { label: 'External', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.1)', order: 0, icon: '🌐' },
  internet: { label: 'Internet', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.1)', order: 1, icon: '🌍' },
  frontend: { label: 'Frontend', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', order: 2, icon: '🖥️' },
  app: { label: 'App Tier', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', order: 3, icon: '⚙️' },
  data: { label: 'Data Tier', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.1)', order: 4, icon: '💾' },
  services: { label: 'AWS Services', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.1)', order: 5, icon: '☁️' },
}

const NODE_ICONS: Record<string, string> = {
  ec2: '🖥️',
  rds: '🗄️',
  s3: '📦',
  lambda: 'λ',
  sg: '🛡️',
  iam: '🔑',
  service: '☁️',
  external: '🌍',
  igw: '🌐',
  nat: '🔀',
  alb: '⚖️',
  unknown: '❓',
}

// ============================================================================
// DATA PROCESSING
// ============================================================================

function classifyNode(id: string): { tier: Tier; label: string; type: string } {
  if (!id || id === 'external') {
    return { tier: 'external', label: 'Internet', type: 'external' }
  }

  const idLower = id.toLowerCase()

  // Internet Gateway / NAT
  if (idLower.includes('internetgateway') || id.startsWith('igw-')) {
    return { tier: 'internet', label: 'Internet Gateway', type: 'igw' }
  }
  if (idLower.includes('natgateway') || id.startsWith('nat-')) {
    return { tier: 'internet', label: 'NAT Gateway', type: 'nat' }
  }

  // RDS
  if (id.startsWith('arn:aws:rds') || idLower.includes('rds')) {
    const dbName = id.split(':').pop() || 'RDS'
    return { tier: 'data', label: dbName, type: 'rds' }
  }

  // S3
  if (id.startsWith('arn:aws:s3') || idLower.includes('s3bucket') || idLower.includes('s3')) {
    const bucketName = id.split(':').pop() || id.split('/').pop() || 'S3'
    return { tier: 'data', label: bucketName.length > 25 ? bucketName.slice(0, 22) + '...' : bucketName, type: 's3' }
  }

  // DynamoDB
  if (idLower.includes('dynamodb')) {
    return { tier: 'data', label: 'DynamoDB', type: 'dynamodb' }
  }

  // Lambda
  if (idLower.includes('lambda')) {
    const fnName = id.split(':').pop() || 'Lambda'
    return { tier: 'app', label: fnName.length > 20 ? fnName.slice(0, 17) + '...' : fnName, type: 'lambda' }
  }

  // IAM
  if (id.startsWith('arn:aws:iam')) {
    const roleName = id.match(/role\/(.+)$/)?.[1]?.split('/').pop() || 'IAM Role'
    return { tier: 'services', label: roleName.length > 20 ? roleName.slice(0, 17) + '...' : roleName, type: 'iam' }
  }

  // AWS Services
  if (id.startsWith('service:')) {
    return { tier: 'services', label: id.replace('service:', '').toUpperCase(), type: 'service' }
  }

  // Security Group
  if (id.startsWith('sg-')) {
    return { tier: 'frontend', label: 'Security Group', type: 'sg' }
  }

  // ALB/ELB
  if (idLower.includes('alb') || idLower.includes('elb') || idLower.includes('loadbalancer')) {
    return { tier: 'frontend', label: 'Load Balancer', type: 'alb' }
  }

  // EC2
  if (id.startsWith('i-')) {
    const name = INSTANCE_NAMES[id]
    if (name?.includes('frontend')) return { tier: 'frontend', label: name, type: 'ec2' }
    if (name?.includes('app')) return { tier: 'app', label: name, type: 'ec2' }
    return { tier: 'app', label: name || `EC2 ${id.slice(-6)}`, type: 'ec2' }
  }

  // Default
  return { tier: 'services', label: id.length > 15 ? id.slice(-12) : id, type: 'unknown' }
}

function aggregateFlows(rawEdges: any[]): { nodes: ProcessedNode[]; edges: ProcessedEdge[] } {
  const edgeMap = new Map<string, ProcessedEdge>()
  const nodeMap = new Map<string, ProcessedNode>()

  for (const row of rawEdges) {
    const sourceId = row.source || 'external'
    const targetId = row.target || 'external'
    const flows = row.flows || 1

    // Add nodes
    if (!nodeMap.has(sourceId)) {
      nodeMap.set(sourceId, { id: sourceId, ...classifyNode(sourceId) })
    }
    if (!nodeMap.has(targetId)) {
      nodeMap.set(targetId, { id: targetId, ...classifyNode(targetId) })
    }

    // Skip self-loops
    if (sourceId === targetId) continue

    // Aggregate edges
    const key = `${sourceId}→${targetId}|${row.kind || 'OBSERVED'}`
    if (edgeMap.has(key)) {
      edgeMap.get(key)!.count += flows
    } else {
      edgeMap.set(key, {
        source: sourceId,
        target: targetId,
        type: row.kind || 'OBSERVED',
        count: flows,
      })
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  }
}

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

// ============================================================================
// NODE CARD COMPONENT
// ============================================================================

const NodeCard: React.FC<{
  node: ProcessedNode
  inFlow: number
  outFlow: number
  isHighlighted: boolean
  isConnected: boolean
  hasHighlight: boolean
  onHover: (id: string | null) => void
  nodeRef: (el: HTMLDivElement | null) => void
}> = ({ node, inFlow, outFlow, isHighlighted, isConnected, hasHighlight, onHover, nodeRef }) => {
  const tierColor = TIER_CONFIG[node.tier]?.color || '#64748b'
  const icon = NODE_ICONS[node.type] || '•'
  const totalFlow = inFlow + outFlow

  return (
    <div
      ref={nodeRef}
      className="relative cursor-pointer transition-all duration-200"
      style={{
        background: isHighlighted
          ? `linear-gradient(135deg, ${tierColor}22 0%, ${tierColor}11 100%)`
          : 'rgba(30, 41, 59, 0.6)',
        border: `1px solid ${isHighlighted ? tierColor : 'rgba(148, 163, 184, 0.1)'}`,
        borderLeft: `3px solid ${tierColor}`,
        borderRadius: '8px',
        padding: '12px 14px',
        transform: isHighlighted ? 'scale(1.02) translateX(4px)' : 'scale(1)',
        boxShadow: isHighlighted ? `0 4px 20px ${tierColor}33` : 'none',
        opacity: hasHighlight && !isHighlighted && !isConnected ? 0.3 : 1,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-slate-100 truncate">{node.label}</span>
      </div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{node.type}</div>

      {/* Flow badges */}
      {totalFlow > 0 && (
        <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
          {inFlow > 0 && (
            <div className="bg-green-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg shadow-green-500/30">
              ↓{formatCount(inFlow)}
            </div>
          )}
          {outFlow > 0 && (
            <div className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg shadow-blue-500/30">
              ↑{formatCount(outFlow)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EDGE PATH COMPONENT
// ============================================================================

const EdgePath: React.FC<{
  edge: ProcessedEdge
  sourcePos: { x: number; y: number } | null
  targetPos: { x: number; y: number } | null
  isHighlighted: boolean
  hasHighlight: boolean
}> = ({ edge, sourcePos, targetPos, isHighlighted, hasHighlight }) => {
  if (!sourcePos || !targetPos) return null

  const isApiCall = edge.type === 'ACTUAL_API_CALL'
  const baseColor = isApiCall ? '#3b82f6' : '#22c55e'
  const opacity = isHighlighted ? 0.9 : hasHighlight ? 0.1 : 0.35
  const strokeWidth = Math.min(Math.max(Math.log10(edge.count + 1) * 1.5 + 1, 1.5), 5)

  // Bezier curve
  const dx = targetPos.x - sourcePos.x
  const controlOffset = Math.min(Math.abs(dx) * 0.4, 120)

  const path = `M ${sourcePos.x} ${sourcePos.y}
                C ${sourcePos.x + controlOffset} ${sourcePos.y},
                  ${targetPos.x - controlOffset} ${targetPos.y},
                  ${targetPos.x} ${targetPos.y}`

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
        strokeDasharray={isApiCall ? '6,4' : 'none'}
      />

      {/* Animated particles for highlighted edges */}
      {isHighlighted && (
        <>
          <circle r="3" fill={baseColor} opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r="3" fill={baseColor} opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="0.7s" />
          </circle>
          <circle r="3" fill={baseColor} opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={path} begin="1.4s" />
          </circle>
        </>
      )}

      {/* Flow count label */}
      {isHighlighted && (
        <g transform={`translate(${(sourcePos.x + targetPos.x) / 2}, ${(sourcePos.y + targetPos.y) / 2 - 12})`}>
          <rect x="-22" y="-11" width="44" height="22" rx="4" fill="rgba(15, 23, 42, 0.95)" stroke={baseColor} strokeWidth="1" />
          <text textAnchor="middle" dy="5" fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="600">
            {formatCount(edge.count)}
          </text>
        </g>
      )}
    </g>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function InfrastructureFlowViz({ systemName, onNodeClick, onRefresh }: InfrastructureFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [nodePositions, setNodePositions] = useState<Record<string, { left: number; right: number; centerY: number }>>({})
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [rawEdges, setRawEdges] = useState<any[]>([])
  const [coverage, setCoverage] = useState<CoverageInfo>({
    flow_logs_enabled_enis_pct: 0,
    analysis_window: '7d',
    observed_edges: 0,
    total_flows: 0,
    notes: [],
  })
  const [mode, setMode] = useState<'observed' | 'observed+potential'>('observed')
  const [isLoading, setIsLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/proxy/dependency-map/v2?systemId=${encodeURIComponent(systemName)}&window=7d&mode=${mode}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setRawEdges(data.edges || [])
        setCoverage(data.coverage || { flow_logs_enabled_enis_pct: 0, analysis_window: '7d', observed_edges: 0, total_flows: 0, notes: [] })
      }
    } catch (e) {
      console.error('[InfrastructureFlowViz] Failed to fetch:', e)
    } finally {
      setIsLoading(false)
    }
  }, [systemName, mode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Process data
  const { nodes, edges } = useMemo(() => aggregateFlows(rawEdges), [rawEdges])

  // Filter by search
  const filteredNodes = useMemo(() => {
    if (!search) return nodes
    const s = search.toLowerCase()
    return nodes.filter((n) => n.label.toLowerCase().includes(s) || n.type.toLowerCase().includes(s))
  }, [nodes, search])

  // Group nodes by tier
  const nodesByTier = useMemo(() => {
    const grouped: Record<Tier, ProcessedNode[]> = { external: [], internet: [], frontend: [], app: [], data: [], services: [] }
    for (const node of filteredNodes) {
      grouped[node.tier].push(node)
    }
    return grouped
  }, [filteredNodes])

  // Calculate flow counts
  const flowData = useMemo(() => {
    const inbound: Record<string, number> = {}
    const outbound: Record<string, number> = {}
    for (const edge of edges) {
      outbound[edge.source] = (outbound[edge.source] || 0) + edge.count
      inbound[edge.target] = (inbound[edge.target] || 0) + edge.count
    }
    return { inbound, outbound }
  }, [edges])

  // Get connected nodes when highlighting
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
      setDimensions({ width: containerRect.width, height: containerRect.height })

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

    const timer = setTimeout(updatePositions, 100)
    window.addEventListener('resize', updatePositions)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updatePositions)
    }
  }, [filteredNodes])

  // Stats
  const totalFlows = edges.reduce((sum, e) => sum + e.count, 0)

  if (isLoading) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center bg-slate-900 rounded-xl">
        <RefreshCw className="w-10 h-10 text-green-400 animate-spin" />
      </div>
    )
  }

  const containerClass = isFullscreen ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col' : 'w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col'

  return (
    <div ref={containerRef} className={containerClass} style={isFullscreen ? {} : { height: '650px' }}>
      {/* Coverage Banner */}
      <CoverageBanner coverage={coverage} mode={mode} onModeChange={setMode} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700" style={{ height: '48px', flexShrink: 0 }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold text-sm">Infrastructure Flow Map</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-green-400 font-bold">{formatCount(totalFlows)} flows</span>
            <span className="text-slate-400">{filteredNodes.length} nodes</span>
            <span className="text-slate-400">{edges.length} connections</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            const sourceNode = filteredNodes.find((n) => n.id === edge.source)
            const targetNode = filteredNodes.find((n) => n.id === edge.target)
            if (!sourceNode || !targetNode) return null

            const sourcePos = nodePositions[edge.source]
            const targetPos = nodePositions[edge.target]
            if (!sourcePos || !targetPos) return null

            const sourceTierOrder = TIER_CONFIG[sourceNode.tier]?.order ?? 0
            const targetTierOrder = TIER_CONFIG[targetNode.tier]?.order ?? 0

            let startX: number, endX: number
            if (sourceTierOrder <= targetTierOrder) {
              startX = sourcePos.right
              endX = targetPos.left
            } else {
              startX = sourcePos.left
              endX = targetPos.right
            }

            const isHighlighted = highlightedNode ? edge.source === highlightedNode || edge.target === highlightedNode : false

            return (
              <EdgePath
                key={`${edge.source}-${edge.target}`}
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
        <div className="flex h-full p-4 gap-4" style={{ position: 'relative', zIndex: 2 }}>
          {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][])
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([tierId, config]) => {
              const tierNodes = nodesByTier[tierId] || []
              if (tierNodes.length === 0) return null

              return (
                <div key={tierId} className="flex-1 flex flex-col gap-2 min-w-[160px] max-w-[220px]">
                  {/* Tier header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
                    style={{ background: config.bgColor, borderLeft: `3px solid ${config.color}` }}
                  >
                    <span className="text-sm">{config.icon}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
                      {config.label}
                    </span>
                    <span className="ml-auto bg-slate-700/50 px-2 py-0.5 rounded-full text-[10px] text-slate-400">{tierNodes.length}</span>
                  </div>

                  {/* Nodes */}
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100%-50px)] pr-1">
                    {tierNodes.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        inFlow={flowData.inbound[node.id] || 0}
                        outFlow={flowData.outbound[node.id] || 0}
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
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-6 h-0.5 bg-green-500 rounded" />
            <span className="text-slate-400">Network Traffic (VPC Flow)</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-6 h-0.5 rounded" style={{ background: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 4px, transparent 4px, transparent 6px)' }} />
            <span className="text-slate-400">API Calls (CloudTrail)</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-700 text-[9px] text-slate-500">💡 Hover nodes to trace connections</div>
      </div>

      {/* Info panel when highlighting */}
      {highlightedNode && (
        <div className="absolute bottom-4 right-4 bg-slate-800/95 backdrop-blur rounded-lg p-3 border border-slate-700 z-10 min-w-[180px]">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Selected Resource</div>
          <div className="text-sm font-semibold text-white mb-2">{filteredNodes.find((n) => n.id === highlightedNode)?.label}</div>
          <div className="flex gap-4">
            <div>
              <div className="text-base font-bold text-green-400">{formatCount(flowData.inbound[highlightedNode] || 0)}</div>
              <div className="text-[9px] text-slate-500">Inbound</div>
            </div>
            <div>
              <div className="text-base font-bold text-blue-400">{formatCount(flowData.outbound[highlightedNode] || 0)}</div>
              <div className="text-[9px] text-slate-500">Outbound</div>
            </div>
            <div>
              <div className="text-base font-bold text-amber-400">{connectedNodes.size - 1}</div>
              <div className="text-[9px] text-slate-500">Connected</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
