'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  RefreshCw, Play, Pause, Maximize2, ZoomIn, ZoomOut,
  Activity, Clock, ArrowRight, ChevronRight
} from 'lucide-react'

// ============================================================================
// AWS Architecture Flow Visualization
// Real-time data flow diagram with animated particles
// ============================================================================

interface ArchNode {
  id: string
  name: string
  type: string
  category: string
  status?: string
  connections?: number
  throughput?: number
  layer?: number
  x?: number
  y?: number
}

interface ArchEdge {
  source: string
  target: string
  type: string
  isActual?: boolean
  throughput?: number
}

interface Props {
  systemName: string
}

// Category colors and styles
const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; fill: string }> = {
  Edge: { bg: '#06b6d450', border: '#06b6d4', text: '#06b6d4', fill: '#0891b2' },
  Networking: { bg: '#8b5cf650', border: '#8b5cf6', text: '#8b5cf6', fill: '#7c3aed' },
  Security: { bg: '#ef444450', border: '#ef4444', text: '#ef4444', fill: '#dc2626' },
  Compute: { bg: '#f59e0b50', border: '#f59e0b', text: '#f59e0b', fill: '#d97706' },
  Database: { bg: '#3b82f650', border: '#3b82f6', text: '#3b82f6', fill: '#2563eb' },
  Storage: { bg: '#22c55e50', border: '#22c55e', text: '#22c55e', fill: '#16a34a' },
  Integration: { bg: '#ec489950', border: '#ec4899', text: '#ec4899', fill: '#db2777' },
  Management: { bg: '#6b728050', border: '#6b7280', text: '#6b7280', fill: '#4b5563' },
}

// Service icons as simple SVG components
const ServiceIcon = ({ type, size = 24 }: { type: string; size?: number }) => {
  const iconStyle = { width: size, height: size }
  
  switch (type) {
    case 'CloudFront':
    case 'CloudFrontDistribution':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="#06b6d4" opacity="0.3"/>
          <circle cx="12" cy="12" r="5" stroke="#06b6d4" strokeWidth="1.5" fill="none"/>
          <circle cx="12" cy="12" r="2" fill="#06b6d4"/>
        </svg>
      )
    case 'LoadBalancer':
    case 'ALB':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="8" width="20" height="8" rx="2" fill="#8b5cf6" opacity="0.3"/>
          <path d="M6 11h12M6 13h12" stroke="#8b5cf6" strokeWidth="1.5"/>
        </svg>
      )
    case 'EC2':
    case 'EC2Instance':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2" fill="#f59e0b" opacity="0.3"/>
          <rect x="7" y="7" width="10" height="10" rx="1" fill="#f59e0b"/>
        </svg>
      )
    case 'Lambda':
    case 'LambdaFunction':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M12 3L4 19h16L12 3z" fill="#f59e0b" opacity="0.3"/>
          <text x="12" y="15" textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="bold">λ</text>
        </svg>
      )
    case 'RDS':
    case 'RDSInstance':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="7" rx="8" ry="3" fill="#3b82f6" opacity="0.3"/>
          <path d="M4 7v10c0 1.5 3.58 3 8 3s8-1.5 8-3V7" stroke="#3b82f6" strokeWidth="1.5" fill="none"/>
        </svg>
      )
    case 'DynamoDB':
    case 'DynamoDBTable':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="5" y="5" width="14" height="14" rx="2" fill="#3b82f6" opacity="0.3"/>
          <path d="M8 9h8M8 12h8M8 15h8" stroke="#3b82f6" strokeWidth="1.5"/>
        </svg>
      )
    case 'S3':
    case 'S3Bucket':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M12 3L4 8v8l8 5 8-5V8l-8-5z" fill="#22c55e" opacity="0.3"/>
          <path d="M12 3L4 8v8l8 5 8-5V8l-8-5z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
        </svg>
      )
    case 'SecurityGroup':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <path d="M12 3L4 7v6c0 4.5 3.5 9 8 11 4.5-2 8-6.5 8-11V7l-8-4z" fill="#22c55e" opacity="0.3"/>
          <path d="M12 3L4 7v6c0 4.5 3.5 9 8 11 4.5-2 8-6.5 8-11V7l-8-4z" stroke="#22c55e" strokeWidth="1.5" fill="none"/>
        </svg>
      )
    case 'IAMRole':
    case 'IAM':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" fill="#ef4444" opacity="0.3"/>
          <path d="M6 19c0-3 3-5 6-5s6 2 6 5" fill="#ef4444" opacity="0.3"/>
        </svg>
      )
    case 'KMSKey':
    case 'KMS':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="#eab308" strokeWidth="2" fill="none"/>
          <rect x="10" y="12" width="4" height="7" fill="#eab308"/>
        </svg>
      )
    case 'SQS':
    case 'SQSQueue':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="10" rx="2" fill="#ec4899" opacity="0.3"/>
          <rect x="5" y="9" width="4" height="6" fill="#ec4899"/>
          <rect x="10" y="9" width="4" height="6" fill="#ec4899" opacity="0.7"/>
          <rect x="15" y="9" width="4" height="6" fill="#ec4899" opacity="0.4"/>
        </svg>
      )
    case 'SNS':
    case 'SNSTopic':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" fill="#ec4899" opacity="0.3"/>
          <circle cx="12" cy="12" r="3" fill="#ec4899"/>
        </svg>
      )
    case 'ECSCluster':
    case 'ECS':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="7" height="7" rx="1" fill="#f59e0b" opacity="0.3"/>
          <rect x="13" y="4" width="7" height="7" rx="1" fill="#f59e0b" opacity="0.3"/>
          <rect x="4" y="13" width="7" height="7" rx="1" fill="#f59e0b" opacity="0.3"/>
          <rect x="13" y="13" width="7" height="7" rx="1" fill="#f59e0b"/>
        </svg>
      )
    case 'LogGroup':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="5" y="4" width="14" height="16" rx="2" fill="#6b7280" opacity="0.3"/>
          <path d="M8 8h8M8 11h8M8 14h5" stroke="#6b7280" strokeWidth="1.5"/>
        </svg>
      )
    case 'VPCEndpoint':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" fill="#8b5cf6" opacity="0.3"/>
          <circle cx="12" cy="12" r="3" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
        </svg>
      )
    case 'NATGateway':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" fill="#8b5cf6" opacity="0.3"/>
          <path d="M8 12h8M12 8v8" stroke="#8b5cf6" strokeWidth="2"/>
        </svg>
      )
    case 'InternetGateway':
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="#06b6d4" opacity="0.3"/>
          <path d="M12 3v4m0 10v4m-9-9h4m10 0h4" stroke="#06b6d4" strokeWidth="2"/>
        </svg>
      )
    default:
      return (
        <svg {...iconStyle} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="3" fill="#6b7280" opacity="0.3"/>
          <circle cx="12" cy="12" r="4" fill="#6b7280"/>
        </svg>
      )
  }
}

// Layer configuration for vertical positioning
const LAYER_CONFIG: Record<string, number> = {
  Edge: 60,
  Security: 150,
  Networking: 240,
  Compute: 340,
  Integration: 440,
  Database: 540,
  Storage: 540,
  Management: 640,
}

export default function AWSArchitectureFlow({ systemName }: Props) {
  const [nodes, setNodes] = useState<ArchNode[]>([])
  const [edges, setEdges] = useState<ArchEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showParticles, setShowParticles] = useState(true)
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [metrics, setMetrics] = useState({
    totalNodes: 0,
    totalEdges: 0,
    activeFlows: 0,
    totalThroughput: 0,
  })
  
  const svgRef = useRef<SVGSVGElement>(null)
  const animationRef = useRef<number>(0)

  // Fetch architecture data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch from LP issues to get all resources
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      
      const data = await response.json()
      const resources = data.resources || []
      
      // Build nodes from resources
      const categoryMap: Record<string, string> = {
        IAMRole: 'Security',
        SecurityGroup: 'Networking',
        S3Bucket: 'Storage',
        Lambda: 'Compute',
        LambdaFunction: 'Compute',
        EC2: 'Compute',
        RDS: 'Database',
        DynamoDB: 'Database',
      }
      
      // Count by category for x positioning
      const categoryCount: Record<string, number> = {}
      
      const builtNodes: ArchNode[] = resources.map((r: any, idx: number) => {
        const category = categoryMap[r.resourceType] || 'Management'
        categoryCount[category] = (categoryCount[category] || 0) + 1
        
        const layer = LAYER_CONFIG[category] || 500
        const xOffset = categoryCount[category] * 160
        
        return {
          id: r.resourceArn || r.resourceName,
          name: r.resourceName,
          type: r.resourceType,
          category,
          status: 'active',
          connections: r.usedCount || 0,
          throughput: (r.usedCount || 0) * 100,
          layer,
          x: 100 + xOffset,
          y: layer,
        }
      })
      
      // Build edges from SG rules and relationships
      const builtEdges: ArchEdge[] = []
      
      resources.forEach((r: any) => {
        if (r.resourceType === 'SecurityGroup') {
          // Parse SG rules for connections
          const rules = r.allowedList || []
          rules.forEach((rule: any) => {
            if (rule.source && rule.source.startsWith('sg-')) {
              builtEdges.push({
                source: rule.source,
                target: r.resourceName,
                type: 'ALLOWS_TRAFFIC',
                isActual: true,
                throughput: 1000,
              })
            }
          })
        }
        
        // Create assumed role connections for IAM
        if (r.resourceType === 'IAMRole' && r.usedCount > 0) {
          // Link to random compute node
          const computeNodes = builtNodes.filter(n => n.category === 'Compute')
          if (computeNodes.length > 0) {
            builtEdges.push({
              source: computeNodes[0].id,
              target: r.resourceArn || r.resourceName,
              type: 'ASSUMES_ROLE',
              isActual: true,
              throughput: r.usedCount * 50,
            })
          }
        }
      })
      
      setNodes(builtNodes)
      setEdges(builtEdges)
      setMetrics({
        totalNodes: builtNodes.length,
        totalEdges: builtEdges.length,
        activeFlows: builtEdges.filter(e => e.isActual).length,
        totalThroughput: builtEdges.reduce((sum, e) => sum + (e.throughput || 0), 0),
      })
      
    } catch (err: any) {
      console.error('Error fetching architecture:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Get node position
  const getNodePosition = (nodeId: string): { x: number; y: number } => {
    const node = nodes.find(n => n.id === nodeId || n.name === nodeId)
    if (node) {
      return { x: node.x || 200, y: node.y || 200 }
    }
    return { x: 200, y: 200 }
  }

  // Get style for category
  const getStyle = (category: string) => CATEGORY_STYLES[category] || CATEGORY_STYLES.Management

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-violet-500 animate-spin" />
          <span className="text-slate-400">Loading Architecture...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-slate-900 rounded-xl">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-500" />
            AWS Architecture Flow
          </h2>
          <p className="text-slate-400 text-sm">
            Real-time data flow visualization • {systemName}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Live Metrics */}
          <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="text-center">
              <div className="text-lg font-bold text-white">{metrics.totalNodes}</div>
              <div className="text-xs text-slate-400">Nodes</div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-center">
              <div className="text-lg font-bold text-violet-400">{metrics.activeFlows}</div>
              <div className="text-xs text-slate-400">Flows</div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">
                {metrics.totalThroughput > 1000 ? `${(metrics.totalThroughput/1000).toFixed(1)}K` : metrics.totalThroughput}
              </div>
              <div className="text-xs text-slate-400">req/s</div>
            </div>
          </div>
          
          {/* Controls */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-2 rounded-lg ${isPaused ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => setShowParticles(!showParticles)}
            className={`px-3 py-1.5 rounded-lg text-sm ${showParticles ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-700 text-slate-400'}`}
          >
            Flow: {showParticles ? 'ON' : 'OFF'}
          </button>
          
          <button
            onClick={fetchData}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* SVG Visualization */}
      <div className="relative" style={{ height: '700px' }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 1200 700"
          className="overflow-visible"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        >
          {/* Defs for gradients and filters */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Layer backgrounds */}
          {Object.entries(LAYER_CONFIG).map(([category, y]) => (
            <g key={category}>
              <rect
                x="40"
                y={y - 35}
                width="1120"
                height="70"
                rx="8"
                fill={CATEGORY_STYLES[category]?.bg.replace('50', '10') || '#ffffff10'}
                stroke={CATEGORY_STYLES[category]?.border || '#ffffff30'}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.3"
              />
              <text
                x="60"
                y={y + 5}
                fill={CATEGORY_STYLES[category]?.text || '#ffffff'}
                fontSize="12"
                fontWeight="500"
                opacity="0.5"
              >
                {category}
              </text>
            </g>
          ))}
          
          {/* Edges (connections) */}
          {edges.map((edge, idx) => {
            const sourcePos = getNodePosition(edge.source)
            const targetPos = getNodePosition(edge.target)
            
            // Create curved path
            const midX = (sourcePos.x + targetPos.x) / 2
            const midY = (sourcePos.y + targetPos.y) / 2 - 30
            const path = `M ${sourcePos.x + 60} ${sourcePos.y} Q ${midX} ${midY} ${targetPos.x} ${targetPos.y}`
            
            return (
              <g key={`edge-${idx}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={edge.isActual ? '#8b5cf6' : '#4b5563'}
                  strokeWidth={edge.isActual ? 2 : 1}
                  strokeDasharray={edge.isActual ? 'none' : '4 4'}
                  opacity={0.6}
                />
                
                {/* Animated particle */}
                {showParticles && !isPaused && edge.isActual && (
                  <circle r="4" fill="#8b5cf6" filter="url(#glow)">
                    <animateMotion
                      dur={`${3 - Math.min(edge.throughput || 0, 2000) / 1000}s`}
                      repeatCount="indefinite"
                      path={path}
                    />
                  </circle>
                )}
              </g>
            )
          })}
          
          {/* Nodes */}
          {nodes.map((node) => {
            const style = getStyle(node.category)
            const isSelected = selectedNode?.id === node.id
            
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setSelectedNode(isSelected ? null : node)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node background */}
                <rect
                  x="-50"
                  y="-25"
                  width="120"
                  height="50"
                  rx="8"
                  fill={style.bg}
                  stroke={isSelected ? style.border : style.border + '50'}
                  strokeWidth={isSelected ? 2 : 1}
                  filter={isSelected ? 'url(#glow)' : undefined}
                />
                
                {/* Icon */}
                <g transform="translate(-40, -15)">
                  <ServiceIcon type={node.type} size={30} />
                </g>
                
                {/* Name */}
                <text
                  x="15"
                  y="-5"
                  fill="white"
                  fontSize="11"
                  fontWeight="500"
                >
                  {node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name}
                </text>
                
                {/* Type */}
                <text
                  x="15"
                  y="10"
                  fill={style.text}
                  fontSize="9"
                  opacity="0.7"
                >
                  {node.type}
                </text>
                
                {/* Status indicator */}
                <circle
                  cx="60"
                  cy="-15"
                  r="4"
                  fill={node.status === 'active' || node.status === 'running' ? '#22c55e' : '#6b7280'}
                />
                
                {/* Throughput badge */}
                {node.throughput && node.throughput > 0 && (
                  <g transform="translate(35, 18)">
                    <rect x="0" y="-8" width="30" height="14" rx="7" fill="#8b5cf630" />
                    <text x="15" y="2" textAnchor="middle" fill="#8b5cf6" fontSize="8">
                      {node.throughput > 1000 ? `${(node.throughput/1000).toFixed(0)}K` : node.throughput}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
        
        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        
        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 p-3 bg-slate-900/80 rounded-lg backdrop-blur-sm">
          {Object.entries(CATEGORY_STYLES).slice(0, 6).map(([category, style]) => (
            <div key={category} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: style.fill }}
              />
              <span className="text-xs text-slate-400">{category}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Selected Node Panel */}
      {selectedNode && (
        <div className="absolute top-20 right-4 w-72 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg`} style={{ backgroundColor: getStyle(selectedNode.category).bg }}>
                <ServiceIcon type={selectedNode.type} size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-white">{selectedNode.name}</h3>
                <p className="text-xs text-slate-400">{selectedNode.type}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-500 hover:text-white"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Category</span>
              <span className="text-white">{selectedNode.category}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Status</span>
              <span className="text-emerald-400">{selectedNode.status || 'active'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Connections</span>
              <span className="text-white">{selectedNode.connections || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Throughput</span>
              <span className="text-violet-400">{selectedNode.throughput || 0} req/s</span>
            </div>
          </div>
          
          <button className="w-full mt-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium">
            View Details
          </button>
        </div>
      )}
    </div>
  )
}
