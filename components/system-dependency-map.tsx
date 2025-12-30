'use client'

import React, { useCallback, useEffect, useState, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  ConnectionLineType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { 
  Globe, Shield, Database, Server, Cloud, Lock, AlertTriangle, 
  CheckCircle, RefreshCw, Layers, ChevronRight, Eye, X,
  FileText, Key, Zap, HardDrive
} from 'lucide-react'

interface SystemNode {
  id: string
  name: string
  type: 'internet' | 'alb' | 'app' | 'database' | 'storage' | 'iam_role' | 'security_group'
  tier: number // 0 = internet, 1 = edge, 2 = app, 3 = data
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  securityGroup?: string
  iamRole?: string
  isPublic?: boolean
  isEncrypted?: boolean
  lpScore?: number
  unusedCount?: number
  rules?: any[]
}

interface SystemEdge {
  id: string
  source: string
  target: string
  protocol: string
  port: string
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  isActive?: boolean
  trafficCount?: number
}

interface DependencyPath {
  id: string
  name: string
  nodes: string[]
  controls: string[]
  overallRisk: 'critical' | 'high' | 'medium' | 'low'
}

interface Props {
  systemName: string
}

// Custom node components
const InternetNode = ({ data }: NodeProps) => (
  <div className="relative">
    <Handle type="source" position={Position.Bottom} className="!bg-red-500" />
    <div className="bg-gradient-to-br from-red-600 to-red-800 text-white px-6 py-4 rounded-xl shadow-xl border-2 border-red-400 min-w-[120px]">
      <div className="flex items-center gap-2 justify-center">
        <Globe className="w-6 h-6" />
        <span className="font-bold text-lg">INTERNET</span>
      </div>
      <div className="text-xs text-center mt-1 opacity-80">Public Network</div>
    </div>
  </div>
)

const SecurityGroupNode = ({ data }: NodeProps) => {
  const riskColors = {
    critical: 'from-red-500 to-red-700 border-red-400',
    high: 'from-orange-500 to-orange-700 border-orange-400',
    medium: 'from-yellow-500 to-yellow-600 border-yellow-400',
    low: 'from-green-500 to-green-700 border-green-400'
  }
  
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
      <div className={`bg-gradient-to-br ${riskColors[data.riskLevel]} text-white px-5 py-4 rounded-xl shadow-xl border-2 min-w-[180px]`}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <span className="font-bold">{data.label}</span>
        </div>
        <div className="text-xs mt-2 space-y-1 bg-black/20 rounded-lg p-2">
          <div className="flex items-center gap-1">
            <span className="opacity-70">SG:</span>
            <span className="font-mono">{data.securityGroup || 'N/A'}</span>
          </div>
          {data.iamRole && (
            <div className="flex items-center gap-1">
              <Key className="w-3 h-3" />
              <span className="font-mono text-xs truncate max-w-[120px]">{data.iamRole}</span>
            </div>
          )}
          {data.isPublic && (
            <div className="flex items-center gap-1 text-yellow-200">
              <AlertTriangle className="w-3 h-3" />
              <span>Public Access</span>
            </div>
          )}
          {data.isEncrypted && (
            <div className="flex items-center gap-1 text-green-200">
              <Lock className="w-3 h-3" />
              <span>Encrypted</span>
            </div>
          )}
        </div>
        {data.unusedCount !== undefined && data.unusedCount > 0 && (
          <div className="mt-2 text-xs bg-red-900/50 rounded px-2 py-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {data.unusedCount} unused rules
          </div>
        )}
        {data.lpScore !== undefined && (
          <div className="mt-1 text-xs opacity-80">
            LP Score: {data.lpScore}%
          </div>
        )}
      </div>
    </div>
  )
}

const StorageNode = ({ data }: NodeProps) => (
  <div className="relative">
    <Handle type="target" position={Position.Left} className="!bg-green-500" />
    <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white px-5 py-4 rounded-xl shadow-xl border-2 border-emerald-400 min-w-[140px]">
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5" />
        <span className="font-bold">{data.label}</span>
      </div>
      <div className="text-xs mt-2 space-y-1 bg-black/20 rounded-lg p-2">
        {data.buckets?.map((bucket: string, i: number) => (
          <div key={i} className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span className="font-mono text-xs">{bucket}</span>
          </div>
        ))}
        {data.isEncrypted && (
          <div className="flex items-center gap-1 text-green-200">
            <Lock className="w-3 h-3" />
            <span>Encrypted at rest</span>
          </div>
        )}
      </div>
    </div>
  </div>
)

const DatabaseNode = ({ data }: NodeProps) => (
  <div className="relative">
    <Handle type="target" position={Position.Top} className="!bg-blue-500" />
    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-5 py-4 rounded-xl shadow-xl border-2 border-blue-400 min-w-[160px]">
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5" />
        <span className="font-bold">{data.label}</span>
      </div>
      <div className="text-xs mt-2 space-y-1 bg-black/20 rounded-lg p-2">
        <div className="flex items-center gap-1">
          <span className="opacity-70">SG:</span>
          <span className="font-mono">{data.securityGroup || 'N/A'}</span>
        </div>
        {data.isEncrypted && (
          <div className="flex items-center gap-1 text-green-200">
            <Lock className="w-3 h-3" />
            <span>Encrypted</span>
          </div>
        )}
      </div>
    </div>
  </div>
)

const nodeTypes = {
  internet: InternetNode,
  securityGroup: SecurityGroupNode,
  storage: StorageNode,
  database: DatabaseNode,
}

export default function SystemDependencyMap({ systemName }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPaths, setShowPaths] = useState(false)
  const [selectedPath, setSelectedPath] = useState<DependencyPath | null>(null)
  const [rawData, setRawData] = useState<any>(null)
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [paths, setPaths] = useState<DependencyPath[]>([])

  // Fetch data and build graph
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch from dependency-map/graph endpoint
        const response = await fetch(`/api/proxy/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }
        
        const data = await response.json()
        console.log('[SystemDepMap] Received data:', data)
        setRawData(data)
        
        // Build React Flow nodes and edges from backend data
        buildGraph(data)
        
      } catch (err: any) {
        console.error('[SystemDepMap] Error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [systemName])

  const buildGraph = (data: any) => {
    const backendNodes = data.nodes || []
    const backendEdges = data.edges || []
    
    // Group nodes by type for tiered layout
    const sgNodes = backendNodes.filter((n: any) => n.type === 'SecurityGroup')
    const iamNodes = backendNodes.filter((n: any) => n.type === 'IAMRole')
    const s3Nodes = backendNodes.filter((n: any) => n.type === 'S3Bucket')
    const serviceNodes = backendNodes.filter((n: any) => n.type === 'Service')
    const externalNodes = backendNodes.filter((n: any) => n.type === 'External')
    
    // Check for internet exposure
    const hasInternetExposure = backendEdges.some((e: any) => e.edgeType === 'internet' || e.source === 'Internet')
    
    const flowNodes: Node[] = []
    const flowEdges: Edge[] = []
    
    // Layout constants
    const TIER_Y = {
      internet: 50,
      edge: 200,
      app: 400,
      data: 600,
      storage: 400
    }
    const NODE_SPACING = 250
    
    // Add Internet node if there's exposure
    if (hasInternetExposure) {
      flowNodes.push({
        id: 'Internet',
        type: 'internet',
        position: { x: 400, y: TIER_Y.internet },
        data: { label: 'Internet' }
      })
    }
    
    // Add Security Group nodes in tiers
    let sgIndex = 0
    sgNodes.forEach((sg: any, i: number) => {
      // Determine tier based on internet exposure
      const hasInternetEdge = backendEdges.some((e: any) => 
        (e.source === 'Internet' && e.target === sg.id) ||
        (e.edgeType === 'internet' && e.target === sg.id)
      )
      
      // Check if this SG receives traffic from another SG (deeper tier)
      const receivesFromSg = backendEdges.some((e: any) =>
        e.sourceType === 'SecurityGroup' && e.target === sg.id
      )
      
      const tier = hasInternetEdge ? 'edge' : receivesFromSg ? 'data' : 'app'
      
      // Determine risk level based on exposure and LP score
      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low'
      if (hasInternetEdge) {
        riskLevel = 'critical'
      } else if (sg.networkExposure?.internetExposedRules > 0) {
        riskLevel = 'high'
      } else if (sg.gapCount > 0) {
        riskLevel = 'medium'
      }
      
      flowNodes.push({
        id: sg.id,
        type: 'securityGroup',
        position: { 
          x: 100 + (sgIndex % 3) * NODE_SPACING, 
          y: TIER_Y[tier] + Math.floor(sgIndex / 3) * 150
        },
        data: {
          label: sg.label || sg.id,
          securityGroup: sg.id,
          riskLevel,
          isPublic: hasInternetEdge,
          lpScore: sg.lpScore,
          unusedCount: sg.gapCount,
          isEncrypted: false
        }
      })
      sgIndex++
    })
    
    // Add S3 bucket nodes
    s3Nodes.forEach((s3: any, i: number) => {
      flowNodes.push({
        id: s3.id,
        type: 'storage',
        position: { x: 700, y: TIER_Y.storage + i * 120 },
        data: {
          label: 'S3 Storage',
          buckets: [s3.label || s3.id],
          isEncrypted: true
        }
      })
    })
    
    // Add Service nodes (for IAM relationships)
    serviceNodes.forEach((svc: any, i: number) => {
      flowNodes.push({
        id: svc.id,
        type: 'securityGroup',
        position: { x: -100, y: TIER_Y.app + i * 100 },
        data: {
          label: svc.label || svc.id,
          riskLevel: 'low',
          iamRole: svc.id
        }
      })
    })
    
    // Build edges with styling
    backendEdges.forEach((edge: any) => {
      // Skip edges where source/target nodes don't exist
      if (!flowNodes.find(n => n.id === edge.source) || !flowNodes.find(n => n.id === edge.target)) {
        return
      }
      
      let strokeColor = '#22c55e' // green
      let animated = false
      let strokeWidth = 2
      let label = ''
      
      if (edge.edgeType === 'internet') {
        strokeColor = '#ef4444' // red
        animated = true
        strokeWidth = 3
        label = `${edge.protocol || 'TCP'}:${edge.port || '443'}`
      } else if (edge.edgeType === 'network') {
        strokeColor = edge.status === 'USED' ? '#22c55e' : '#f59e0b'
        animated = edge.status === 'USED'
        label = `${edge.protocol || 'TCP'}:${edge.port || '*'}`
      } else if (edge.edgeType === 'iam_trust') {
        strokeColor = '#8b5cf6' // purple
        strokeWidth = 1.5
        label = 'IAM'
      }
      
      flowEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated,
        style: { stroke: strokeColor, strokeWidth },
        label,
        labelStyle: { fill: strokeColor, fontWeight: 600, fontSize: 10 },
        labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 20,
          height: 20
        }
      })
    })
    
    // Build dependency paths
    const builtPaths: DependencyPath[] = []
    
    // Find paths from Internet to each SG
    if (hasInternetExposure) {
      const internetEdges = backendEdges.filter((e: any) => e.source === 'Internet' || e.edgeType === 'internet')
      
      internetEdges.forEach((edge: any, i: number) => {
        const targetNode = sgNodes.find((n: any) => n.id === edge.target)
        if (targetNode) {
          builtPaths.push({
            id: `path-${i}`,
            name: `Internet → ${targetNode.label || targetNode.id}`,
            nodes: ['Internet', edge.target],
            controls: [
              `Port ${edge.port || '443'} open to 0.0.0.0/0`,
              targetNode.lpScore ? `LP Score: ${targetNode.lpScore}%` : 'LP Score: N/A',
              targetNode.gapCount > 0 ? `⚠️ ${targetNode.gapCount} unused rules` : '✅ All rules in use'
            ],
            overallRisk: 'critical'
          })
        }
      })
    }
    
    setPaths(builtPaths)
    setNodes(flowNodes)
    setEdges(flowEdges)
  }

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/proxy/dependency-map/graph?systemName=${encodeURIComponent(systemName)}&refresh=true`)
      const data = await response.json()
      setRawData(data)
      buildGraph(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
          <span className="text-white text-lg">Building system dependency map...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <span className="text-white text-lg">Failed to load dependency map</span>
          <span className="text-slate-400 text-sm">{error}</span>
          <button 
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
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
            System Architecture
          </h2>
          <p className="text-slate-500">
            Real-time dependency visualization • {nodes.length} components • {edges.length} connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPaths(!showPaths)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showPaths ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            {showPaths ? 'Hide' : 'Show'} Paths
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm bg-slate-50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Critical (Public)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span>High Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Secured</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="w-6 h-0.5 bg-green-500" style={{ animation: 'pulse 1s infinite' }} />
          <span>Active Traffic</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-orange-500" />
          <span>Unused Rule</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4">
        {/* Graph */}
        <div className={`bg-slate-900 rounded-xl overflow-hidden border border-slate-700 ${showPaths ? 'flex-1' : 'w-full'}`} style={{ height: '600px' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          >
            <Background color="#475569" gap={20} />
            <Controls className="!bg-slate-800 !border-slate-600 [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button]:!text-white" />
            <MiniMap 
              className="!bg-slate-800 !border-slate-600" 
              nodeColor={(node) => {
                if (node.type === 'internet') return '#ef4444'
                if (node.type === 'storage') return '#10b981'
                if (node.type === 'database') return '#3b82f6'
                return '#64748b'
              }}
            />
          </ReactFlow>
        </div>

        {/* Paths Panel */}
        {showPaths && (
          <div className="w-80 bg-white border rounded-xl p-4 overflow-y-auto" style={{ height: '600px' }}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-500" />
              Dependency Paths
            </h3>
            
            {paths.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-8">
                No critical paths detected
              </div>
            ) : (
              <div className="space-y-3">
                {paths.map((path) => (
                  <div 
                    key={path.id}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedPath?.id === path.id 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-slate-200 hover:border-purple-300'
                    }`}
                    onClick={() => setSelectedPath(selectedPath?.id === path.id ? null : path)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{path.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        path.overallRisk === 'critical' ? 'bg-red-100 text-red-700' :
                        path.overallRisk === 'high' ? 'bg-orange-100 text-orange-700' :
                        path.overallRisk === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {path.overallRisk.toUpperCase()}
                      </span>
                    </div>
                    
                    {selectedPath?.id === path.id && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium text-slate-500">Security Controls:</div>
                        {path.controls.map((control, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                            <span>{control}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-600">
            {edges.filter(e => e.animated).length}
          </div>
          <div className="text-slate-500 text-sm">Active Flows</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-orange-600">
            {paths.filter(p => p.overallRisk === 'critical').length}
          </div>
          <div className="text-slate-500 text-sm">Critical Paths</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">
            {nodes.filter(n => n.type === 'securityGroup').length}
          </div>
          <div className="text-slate-500 text-sm">Security Groups</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">
            {rawData?.summary?.byType?.IAMRole || 0}
          </div>
          <div className="text-slate-500 text-sm">IAM Roles</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-green-600">
            {rawData?.summary?.byType?.S3Bucket || 0}
          </div>
          <div className="text-slate-500 text-sm">S3 Buckets</div>
        </div>
      </div>
    </div>
  )
}

