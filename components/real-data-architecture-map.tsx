'use client'

import React, { useEffect, useState, useRef } from 'react'
import { 
  Globe, Shield, Database, Server, Key, HardDrive, 
  RefreshCw, AlertTriangle, CheckCircle, X, ChevronRight,
  Layers, Activity, Lock, Zap, Eye, EyeOff
} from 'lucide-react'

interface Resource {
  id: string
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket'
  resourceName: string
  resourceArn?: string
  lpScore?: number
  gapCount?: number
  usedCount?: number
  allowedCount?: number
  severity?: string
  networkExposure?: {
    score: number
    totalRules: number
    internetExposedRules: number
    highRiskPorts: string[]
  }
  allowedList?: any[]
}

interface ArchNode {
  id: string
  name: string
  type: 'internet' | 'iam' | 'sg' | 's3'
  tier: number
  x: number
  y: number
  lpScore?: number
  gapCount?: number
  usedCount?: number
  isPublic?: boolean
  severity?: string
  raw?: Resource
}

interface ArchEdge {
  id: string
  from: string
  to: string
  type: 'internet' | 'sg-sg' | 'iam-service'
  port?: string
  protocol?: string
  status?: string
}

interface Props {
  systemName: string
}

export default function RealDataArchitectureMap({ systemName }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<ArchNode[]>([])
  const [edges, setEdges] = useState<ArchEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [summary, setSummary] = useState({ iam: 0, sg: 0, s3: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetchAndBuildGraph()
  }, [systemName])

  const fetchAndBuildGraph = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('[RealDataArch] Fetching from LP issues...')
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${encodeURIComponent(systemName)}`)
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      
      const data = await response.json()
      console.log('[RealDataArch] Received:', data)
      
      const resources: Resource[] = data.resources || []
      
      if (resources.length === 0) {
        setError('No resources found')
        setLoading(false)
        return
      }
      
      // Build graph from resources
      buildGraphFromResources(resources)
      
    } catch (err: any) {
      console.error('[RealDataArch] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const buildGraphFromResources = (resources: Resource[]) => {
    const archNodes: ArchNode[] = []
    const archEdges: ArchEdge[] = []
    
    // Constants
    const WIDTH = 1400
    const HEIGHT = 800
    const PADDING = 100
    
    // Group by type
    const iamRoles = resources.filter(r => r.resourceType === 'IAMRole')
    const sgs = resources.filter(r => r.resourceType === 'SecurityGroup')
    const s3Buckets = resources.filter(r => r.resourceType === 'S3Bucket')
    
    setSummary({ iam: iamRoles.length, sg: sgs.length, s3: s3Buckets.length })
    
    // Categorize SGs by exposure
    const publicSgs = sgs.filter(sg => (sg.networkExposure?.internetExposedRules || 0) > 0)
    const privateSgs = sgs.filter(sg => (sg.networkExposure?.internetExposedRules || 0) === 0)
    
    // Check if we need internet node
    if (publicSgs.length > 0) {
      archNodes.push({
        id: 'internet',
        name: 'Internet',
        type: 'internet',
        tier: 0,
        x: WIDTH / 2,
        y: 60,
        isPublic: true
      })
    }
    
    // Position public SGs (tier 1 - edge)
    publicSgs.forEach((sg, i) => {
      const totalWidth = Math.min(publicSgs.length * 200, WIDTH - 2 * PADDING)
      const startX = (WIDTH - totalWidth) / 2 + 100
      const spacing = publicSgs.length > 1 ? totalWidth / (publicSgs.length) : 0
      
      archNodes.push({
        id: sg.resourceName,
        name: sg.resourceName,
        type: 'sg',
        tier: 1,
        x: startX + i * spacing,
        y: 180,
        lpScore: sg.lpScore,
        gapCount: sg.gapCount,
        usedCount: sg.usedCount,
        isPublic: true,
        severity: sg.severity,
        raw: sg
      })
      
      // Add edge from internet
      archEdges.push({
        id: `internet-${sg.resourceName}`,
        from: 'internet',
        to: sg.resourceName,
        type: 'internet',
        port: sg.networkExposure?.highRiskPorts?.[0] || '443',
        status: 'active'
      })
    })
    
    // Position private SGs (tier 2 - app/db)
    privateSgs.forEach((sg, i) => {
      const totalWidth = Math.min(privateSgs.length * 200, WIDTH - 2 * PADDING)
      const startX = (WIDTH - totalWidth) / 2 + 100
      const spacing = privateSgs.length > 1 ? totalWidth / (privateSgs.length) : 0
      
      // Determine tier based on name patterns
      const isDbSg = sg.resourceName.toLowerCase().includes('db') || 
                     sg.resourceName.toLowerCase().includes('data') ||
                     sg.resourceName.toLowerCase().includes('rds')
      
      archNodes.push({
        id: sg.resourceName,
        name: sg.resourceName,
        type: 'sg',
        tier: isDbSg ? 3 : 2,
        x: startX + i * spacing,
        y: isDbSg ? 450 : 320,
        lpScore: sg.lpScore,
        gapCount: sg.gapCount,
        usedCount: sg.usedCount,
        isPublic: false,
        severity: sg.severity,
        raw: sg
      })
    })
    
    // Parse SG rules to find SG→SG connections
    sgs.forEach(sg => {
      const rules = sg.allowedList || []
      rules.forEach((rule: any) => {
        const sources = rule.sources || []
        sources.forEach((source: any) => {
          if (source.sgId || source.sgName) {
            const sourceSgName = source.sgName || source.sgId
            // Find if source SG exists in our nodes
            const sourceNode = archNodes.find(n => n.id === sourceSgName || n.name === sourceSgName)
            if (sourceNode) {
              archEdges.push({
                id: `${sourceSgName}-${sg.resourceName}-${rule.port || 'all'}`,
                from: sourceSgName,
                to: sg.resourceName,
                type: 'sg-sg',
                port: rule.port || 'all',
                protocol: rule.protocol || 'TCP',
                status: rule.status
              })
            }
          }
        })
      })
    })
    
    // Position IAM roles (left column)
    iamRoles.forEach((iam, i) => {
      const visibleCount = Math.min(iamRoles.length, 10) // Show max 10
      const spacing = (HEIGHT - 200) / visibleCount
      
      if (i < 10) {
        archNodes.push({
          id: iam.resourceName,
          name: iam.resourceName,
          type: 'iam',
          tier: 2,
          x: 80,
          y: 100 + i * spacing,
          lpScore: iam.lpScore,
          gapCount: iam.gapCount,
          usedCount: iam.usedCount,
          severity: iam.severity,
          raw: iam
        })
      }
    })
    
    // Position S3 buckets (right column)
    s3Buckets.forEach((s3, i) => {
      const visibleCount = Math.min(s3Buckets.length, 8)
      const spacing = (HEIGHT - 200) / visibleCount
      
      if (i < 8) {
        archNodes.push({
          id: s3.resourceName,
          name: s3.resourceName,
          type: 's3',
          tier: 3,
          x: WIDTH - 80,
          y: 120 + i * spacing,
          lpScore: s3.lpScore,
          gapCount: s3.gapCount,
          usedCount: s3.usedCount,
          severity: s3.severity,
          raw: s3
        })
      }
    })
    
    setNodes(archNodes)
    setEdges(archEdges)
  }

  const getNodeStyle = (node: ArchNode) => {
    const styles = {
      internet: { bg: '#dc2626', border: '#b91c1c', icon: Globe },
      iam: { bg: '#8b5cf6', border: '#7c3aed', icon: Key },
      sg: { bg: node.isPublic ? '#f97316' : '#22c55e', border: node.isPublic ? '#ea580c' : '#16a34a', icon: Shield },
      s3: { bg: '#10b981', border: '#059669', icon: HardDrive }
    }
    return styles[node.type]
  }

  const getEdgeColor = (edge: ArchEdge) => {
    if (edge.type === 'internet') return '#ef4444'
    if (edge.type === 'sg-sg') return edge.status === 'USED' ? '#22c55e' : '#f59e0b'
    return '#6366f1'
  }

  const getPath = (from: string, to: string) => {
    const fromNode = nodes.find(n => n.id === from)
    const toNode = nodes.find(n => n.id === to)
    if (!fromNode || !toNode) return ''
    
    const dx = toNode.x - fromNode.x
    const dy = toNode.y - fromNode.y
    const midX = fromNode.x + dx / 2
    const midY = fromNode.y + dy / 2
    const curve = Math.min(Math.abs(dx) * 0.3, 60)
    
    return `M ${fromNode.x} ${fromNode.y + 30} Q ${midX} ${midY + curve} ${toNode.x} ${toNode.y - 30}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[800px] bg-slate-900 rounded-2xl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-12 h-12 text-blue-400 animate-spin" />
          <span className="text-white text-lg">Loading architecture from AWS...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[800px] bg-slate-900 rounded-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="w-14 h-14 text-red-400" />
          <span className="text-white text-xl">Failed to load architecture</span>
          <span className="text-slate-400">{error}</span>
          <button 
            onClick={fetchAndBuildGraph}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-500" />
            AWS Architecture Map
          </h2>
          <p className="text-slate-500">
            Built from real AWS data • {nodes.length} resources • {edges.length} connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              showLabels ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Labels
          </button>
          <button
            onClick={fetchAndBuildGraph}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Key className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{summary.iam}</div>
            <div className="text-slate-500 text-sm">IAM Roles</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
            <Shield className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{summary.sg}</div>
            <div className="text-slate-500 text-sm">Security Groups</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
            <HardDrive className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{summary.s3}</div>
            <div className="text-slate-500 text-sm">S3 Buckets</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
            <Activity className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <div className="text-2xl font-bold">{edges.filter(e => e.type === 'internet').length}</div>
            <div className="text-slate-500 text-sm">Public Endpoints</div>
          </div>
        </div>
      </div>

      {/* Main diagram */}
      <div className="flex gap-4">
        <div className="flex-1 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden relative" style={{ height: '700px' }}>
          {/* Legend */}
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm rounded-xl p-3 z-10">
            <div className="text-white text-sm font-semibold mb-2">Legend</div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500" />
                <span className="text-slate-300">Internet</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500" />
                <span className="text-slate-300">Public SG</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500" />
                <span className="text-slate-300">Private SG</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-purple-500" />
                <span className="text-slate-300">IAM Role</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-500" />
                <span className="text-slate-300">S3 Bucket</span>
              </div>
            </div>
          </div>

          {/* Tier labels */}
          <div className="absolute left-4 top-20 text-slate-500 text-xs font-mono">IAM</div>
          <div className="absolute right-4 top-20 text-slate-500 text-xs font-mono">STORAGE</div>

          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 1400 700"
            className="absolute inset-0"
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((edge) => {
              const path = getPath(edge.from, edge.to)
              const color = getEdgeColor(edge)
              
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeOpacity={0.5}
                    strokeDasharray={edge.type === 'internet' ? '6,4' : undefined}
                    markerEnd="url(#arrow)"
                  />
                  
                  {/* Animated particles */}
                  {[0, 1, 2].map((i) => (
                    <circle key={`${edge.id}-p${i}`} r={3} fill={color} filter="url(#glow)">
                      <animateMotion
                        dur="3s"
                        repeatCount="indefinite"
                        begin={`${i}s`}
                        path={path}
                      />
                    </circle>
                  ))}
                  
                  {/* Port label */}
                  {showLabels && edge.port && (
                    <text
                      fill={color}
                      fontSize={9}
                      textAnchor="middle"
                      className="font-mono"
                    >
                      <textPath href={`#path-${edge.id}`} startOffset="50%">
                        {edge.protocol}:{edge.port}
                      </textPath>
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const style = getNodeStyle(node)
              const Icon = style.icon
              const isSelected = selectedNode?.id === node.id
              
              return (
                <g 
                  key={node.id}
                  transform={`translate(${node.x - 50}, ${node.y - 30})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                >
                  {/* Node box */}
                  <rect
                    x={0}
                    y={0}
                    width={100}
                    height={60}
                    rx={10}
                    fill={style.bg}
                    stroke={isSelected ? '#fff' : style.border}
                    strokeWidth={isSelected ? 3 : 2}
                    className="transition-all"
                    filter={isSelected ? 'url(#glow)' : undefined}
                  />
                  
                  {/* Icon */}
                  <foreignObject x={35} y={8} width={30} height={24}>
                    <div className="flex items-center justify-center text-white">
                      <Icon className="w-5 h-5" />
                    </div>
                  </foreignObject>
                  
                  {/* Name */}
                  {showLabels && (
                    <text x={50} y={45} fill="white" fontSize={9} textAnchor="middle" fontWeight="500">
                      {node.name.length > 14 ? node.name.slice(0, 12) + '...' : node.name}
                    </text>
                  )}
                  
                  {/* LP Score badge */}
                  {node.lpScore !== undefined && (
                    <g transform="translate(75, -5)">
                      <circle r={12} fill={node.lpScore >= 90 ? '#22c55e' : node.lpScore >= 70 ? '#f59e0b' : '#ef4444'} />
                      <text fill="white" fontSize={8} textAnchor="middle" dy={3} fontWeight="600">
                        {Math.round(node.lpScore)}
                      </text>
                    </g>
                  )}
                  
                  {/* Public indicator */}
                  {node.isPublic && node.type === 'sg' && (
                    <g transform="translate(10, -5)">
                      <circle r={8} fill="#ef4444" />
                      <text fill="white" fontSize={8} textAnchor="middle" dy={3}>🌐</text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Details panel */}
        {selectedNode && (
          <div className="w-80 bg-white border rounded-xl p-4 overflow-y-auto" style={{ height: '700px' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Resource Details</h3>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-500">Name</div>
                <div className="font-mono text-sm break-all">{selectedNode.name}</div>
              </div>
              
              <div>
                <div className="text-sm text-slate-500">Type</div>
                <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                  selectedNode.type === 'iam' ? 'bg-purple-100 text-purple-700' :
                  selectedNode.type === 'sg' ? 'bg-orange-100 text-orange-700' :
                  selectedNode.type === 's3' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedNode.type === 'iam' ? 'IAM Role' : 
                   selectedNode.type === 'sg' ? 'Security Group' :
                   selectedNode.type === 's3' ? 'S3 Bucket' : 'Internet'}
                </div>
              </div>
              
              {selectedNode.lpScore !== undefined && (
                <div>
                  <div className="text-sm text-slate-500">LP Score</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          selectedNode.lpScore >= 90 ? 'bg-green-500' :
                          selectedNode.lpScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${selectedNode.lpScore}%` }}
                      />
                    </div>
                    <span className="font-bold">{selectedNode.lpScore}%</span>
                  </div>
                </div>
              )}
              
              {selectedNode.gapCount !== undefined && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-green-600">{selectedNode.usedCount || 0}</div>
                    <div className="text-xs text-green-700">Used</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-red-600">{selectedNode.gapCount}</div>
                    <div className="text-xs text-red-700">Unused</div>
                  </div>
                </div>
              )}
              
              {selectedNode.isPublic && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium text-sm">Public Internet Exposure</span>
                  </div>
                </div>
              )}
              
              {/* Connections */}
              <div>
                <div className="text-sm text-slate-500 mb-2">Connections</div>
                <div className="space-y-2">
                  {edges.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).map(edge => (
                    <div key={edge.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg p-2">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <span className="font-mono text-xs">
                        {edge.from === selectedNode.id ? edge.to : edge.from}
                      </span>
                      {edge.port && (
                        <span className="ml-auto text-xs text-slate-500">:{edge.port}</span>
                      )}
                    </div>
                  ))}
                  {edges.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).length === 0 && (
                    <div className="text-sm text-slate-400">No connections</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

