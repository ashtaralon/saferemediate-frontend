'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  ArrowLeft, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, CheckCircle, AlertTriangle, Network, ExternalLink
} from 'lucide-react'
import ResourceSelector from './resource-selector'

interface Resource {
  id: string
  name: string
  type: string
  arn?: string
}

interface Connection {
  id: string
  name: string
  type: string
  port: number | string
  protocol: string
  direction: 'inbound' | 'outbound'
  verified: boolean
  lastSeen?: string
  hitCount?: number
}

interface DependencyData {
  inbound: Connection[]
  outbound: Connection[]
  iamRoles: { name: string; score?: number }[]
  securityGroups: string[]
  permissionScore: number
  loading: boolean
}

interface Props {
  systemName: string
  selectedResource: Resource | null
  resources: Resource[]
  resourcesLoading: boolean
  onSelectResource: (resource: Resource) => void
  onBackToGraph: () => void
}

const RESOURCE_COLORS: Record<string, string> = {
  Lambda: '#F58536',
  EC2: '#F58536',
  RDS: '#3F48CC',
  DynamoDB: '#3F48CC',
  S3Bucket: '#759C3E',
  S3: '#759C3E',
  SecurityGroup: '#7B2FBE',
  IAMRole: '#759C3E',
  Internet: '#D13212',
  IP: '#64748b',
  default: '#64748b',
}

const RESOURCE_ICONS: Record<string, any> = {
  Lambda: Cloud,
  EC2: Server,
  RDS: Database,
  DynamoDB: Database,
  S3Bucket: Database,
  S3: Database,
  SecurityGroup: Shield,
  IAMRole: Key,
  Internet: Globe,
  default: Layers,
}

// Custom node for the central resource
function CentralResourceNode({ data }: { data: any }) {
  const Icon = RESOURCE_ICONS[data.type] || RESOURCE_ICONS.default
  const color = RESOURCE_COLORS[data.type] || RESOURCE_COLORS.default
  const score = data.permissionScore || 0
  const scoreColor = score < 20 ? '#ef4444' : score < 50 ? '#f59e0b' : '#22c55e'

  return (
    <div className="relative">
      {/* Permission score ring */}
      <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)]" viewBox="0 0 120 120">
        {/* Background ring */}
        <circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="6"
        />
        {/* Score ring */}
        <circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke={scoreColor}
          strokeWidth="6"
          strokeDasharray={`${(score / 100) * 339.3} 339.3`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ filter: score < 20 ? 'drop-shadow(0 0 6px #ef4444)' : 'none' }}
        />
      </svg>

      {/* Main node */}
      <div
        className="relative w-24 h-24 rounded-2xl flex flex-col items-center justify-center shadow-lg border-2 z-10"
        style={{ backgroundColor: color, borderColor: scoreColor }}
      >
        <Icon className="w-8 h-8 text-white mb-1" />
        <div className="text-[10px] text-white font-medium text-center px-1 truncate max-w-[80px]">
          {data.label}
        </div>
        <div className="text-[8px] text-white/80">{data.type}</div>
      </div>

      {/* Score badge */}
      <div
        className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white z-20"
        style={{ backgroundColor: scoreColor }}
      >
        {score}% LP
      </div>
    </div>
  )
}

// Custom node for dependency nodes
function DependencyNode({ data }: { data: any }) {
  const Icon = RESOURCE_ICONS[data.type] || RESOURCE_ICONS.default
  const color = RESOURCE_COLORS[data.type] || RESOURCE_COLORS.default
  const isInbound = data.direction === 'inbound'

  return (
    <div
      className={`px-3 py-2 rounded-lg shadow-md border-2 min-w-[100px] max-w-[140px] ${
        data.verified ? 'bg-white' : 'bg-slate-50'
      }`}
      style={{ borderColor: isInbound ? '#22c55e' : '#3b82f6' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-800 truncate">
            {data.label}
          </div>
          <div className="text-[9px] text-slate-500">{data.type}</div>
        </div>
      </div>

      {data.port && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 rounded font-mono">
            :{data.port}
          </span>
          <span className="text-[9px] text-slate-400">{data.protocol}</span>
          {data.verified && (
            <CheckCircle className="w-3 h-3 text-green-500" />
          )}
        </div>
      )}
    </div>
  )
}

// Custom node for IAM role nodes
function IAMNode({ data }: { data: any }) {
  return (
    <div className="px-3 py-2 rounded-lg shadow-md border-2 border-purple-400 bg-purple-50 min-w-[90px]">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-purple-600" />
        <div className="text-[10px] font-medium text-purple-800 truncate max-w-[80px]">
          {data.label}
        </div>
      </div>
    </div>
  )
}

// Custom node for group labels
function GroupLabelNode({ data }: { data: any }) {
  return (
    <div className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${data.className}`}>
      {data.label} ({data.count})
    </div>
  )
}

const nodeTypes = {
  centralResource: CentralResourceNode,
  dependency: DependencyNode,
  iam: IAMNode,
  groupLabel: GroupLabelNode,
}

export default function ResourceView({
  systemName,
  selectedResource,
  resources,
  resourcesLoading,
  onSelectResource,
  onBackToGraph
}: Props) {
  const [dependencies, setDependencies] = useState<DependencyData>({
    inbound: [],
    outbound: [],
    iamRoles: [],
    securityGroups: [],
    permissionScore: 0,
    loading: true
  })

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Fetch dependency data
  useEffect(() => {
    if (!selectedResource) return

    const fetchDependencies = async () => {
      setDependencies(prev => ({ ...prev, loading: true }))

      try {
        // Fetch connections
        const connectionsRes = await fetch(
          `/api/proxy/resource-view/${encodeURIComponent(selectedResource.id)}/connections`
        )

        let inbound: Connection[] = []
        let outbound: Connection[] = []

        if (connectionsRes.ok) {
          const data = await connectionsRes.json()
          const connections = data.connections || {}

          // Process inbound
          ;(connections.inbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const source = conn.source || {}
            if (rel.type === 'ACTUAL_TRAFFIC' || rel.relationship_type === 'ACTUAL_TRAFFIC') {
              inbound.push({
                id: source.id || source.arn || `inbound-${Math.random()}`,
                name: source.name || source.id || 'Unknown',
                type: source.type || 'IP',
                port: rel.port || 0,
                protocol: (rel.protocol || 'TCP').toUpperCase(),
                direction: 'inbound',
                verified: true,
                lastSeen: rel.last_seen,
                hitCount: rel.hit_count || 0
              })
            }
          })

          // Process outbound
          ;(connections.outbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const target = conn.target || {}
            if (rel.type === 'ACTUAL_TRAFFIC' || rel.relationship_type === 'ACTUAL_TRAFFIC') {
              outbound.push({
                id: target.id || target.arn || `outbound-${Math.random()}`,
                name: target.name || target.id || 'Unknown',
                type: target.type || 'IP',
                port: rel.port || 0,
                protocol: (rel.protocol || 'TCP').toUpperCase(),
                direction: 'outbound',
                verified: true,
                lastSeen: rel.last_seen,
                hitCount: rel.hit_count || 0
              })
            }
          })
        }

        // Fetch IAM data
        let iamRoles: { name: string; score?: number }[] = []
        let permissionScore = 0
        try {
          const iamRes = await fetch(
            `/api/proxy/resource-view/${encodeURIComponent(selectedResource.id)}/iam`
          )
          if (iamRes.ok) {
            const iamData = await iamRes.json()
            iamRoles = (iamData.roles || []).map((r: any) => ({
              name: r.name || r.role_name || r.id,
              score: r.lp_score
            }))
            permissionScore = iamData.permission_score || iamData.lp_score || 0
          }
        } catch (e) {
          console.warn('Failed to fetch IAM data:', e)
        }

        setDependencies({
          inbound,
          outbound,
          iamRoles,
          securityGroups: [],
          permissionScore,
          loading: false
        })
      } catch (err) {
        console.error('Failed to fetch dependencies:', err)
        setDependencies(prev => ({ ...prev, loading: false }))
      }
    }

    fetchDependencies()
  }, [selectedResource])

  // Generate orbital layout
  useEffect(() => {
    if (!selectedResource || dependencies.loading) return

    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    const centerX = 400
    const centerY = 300

    // Central resource node
    newNodes.push({
      id: 'center',
      type: 'centralResource',
      position: { x: centerX - 48, y: centerY - 48 },
      data: {
        label: selectedResource.name,
        type: selectedResource.type,
        permissionScore: dependencies.permissionScore,
      },
      draggable: false,
    })

    // Group inbound by type for clustering
    const inboundGroups = dependencies.inbound.reduce((acc, conn) => {
      const key = conn.type || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(conn)
      return acc
    }, {} as Record<string, Connection[]>)

    // Group outbound by type
    const outboundGroups = dependencies.outbound.reduce((acc, conn) => {
      const key = conn.type || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(conn)
      return acc
    }, {} as Record<string, Connection[]>)

    // Place inbound nodes on the left (spread in arc)
    const inboundRadius = 250
    const inboundConnections = dependencies.inbound.slice(0, 15) // Limit for visibility
    const inboundAngleStep = Math.PI / Math.max(inboundConnections.length + 1, 2)
    const inboundStartAngle = Math.PI / 2 + Math.PI / 4

    // Inbound group label
    if (dependencies.inbound.length > 0) {
      newNodes.push({
        id: 'inbound-label',
        type: 'groupLabel',
        position: { x: centerX - inboundRadius - 60, y: centerY - 180 },
        data: {
          label: 'Inbound',
          count: dependencies.inbound.length,
          className: 'bg-green-100 text-green-700 border border-green-300'
        },
        draggable: false,
      })
    }

    inboundConnections.forEach((conn, i) => {
      const angle = inboundStartAngle + (i + 1) * inboundAngleStep
      const x = centerX + Math.cos(angle) * inboundRadius - 50
      const y = centerY - Math.sin(angle) * inboundRadius - 20

      const nodeId = `inbound-${i}`
      newNodes.push({
        id: nodeId,
        type: 'dependency',
        position: { x, y },
        data: {
          label: conn.name,
          type: conn.type,
          port: conn.port,
          protocol: conn.protocol,
          verified: conn.verified,
          direction: 'inbound',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })

      newEdges.push({
        id: `edge-${nodeId}`,
        source: nodeId,
        target: 'center',
        type: 'smoothstep',
        animated: conn.verified,
        style: { stroke: '#22c55e', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
      })
    })

    // Show "+X more" indicator for inbound
    if (dependencies.inbound.length > 15) {
      newNodes.push({
        id: 'inbound-more',
        type: 'groupLabel',
        position: { x: centerX - inboundRadius - 40, y: centerY + 120 },
        data: {
          label: `+${dependencies.inbound.length - 15} more`,
          count: '',
          className: 'bg-slate-100 text-slate-600 border border-slate-300'
        },
        draggable: false,
      })
    }

    // Place outbound nodes on the right (spread in arc)
    const outboundRadius = 250
    const outboundConnections = dependencies.outbound.slice(0, 15)
    const outboundAngleStep = Math.PI / Math.max(outboundConnections.length + 1, 2)
    const outboundStartAngle = -Math.PI / 4

    // Outbound group label
    if (dependencies.outbound.length > 0) {
      newNodes.push({
        id: 'outbound-label',
        type: 'groupLabel',
        position: { x: centerX + outboundRadius - 20, y: centerY - 180 },
        data: {
          label: 'Outbound',
          count: dependencies.outbound.length,
          className: 'bg-blue-100 text-blue-700 border border-blue-300'
        },
        draggable: false,
      })
    }

    outboundConnections.forEach((conn, i) => {
      const angle = outboundStartAngle + (i + 1) * outboundAngleStep
      const x = centerX + Math.cos(angle) * outboundRadius - 50
      const y = centerY - Math.sin(angle) * outboundRadius - 20

      const nodeId = `outbound-${i}`
      newNodes.push({
        id: nodeId,
        type: 'dependency',
        position: { x, y },
        data: {
          label: conn.name,
          type: conn.type,
          port: conn.port,
          protocol: conn.protocol,
          verified: conn.verified,
          direction: 'outbound',
        },
        sourcePosition: Position.Left,
        targetPosition: Position.Right,
      })

      newEdges.push({
        id: `edge-${nodeId}`,
        source: 'center',
        target: nodeId,
        type: 'smoothstep',
        animated: conn.verified,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      })
    })

    // Show "+X more" indicator for outbound
    if (dependencies.outbound.length > 15) {
      newNodes.push({
        id: 'outbound-more',
        type: 'groupLabel',
        position: { x: centerX + outboundRadius - 20, y: centerY + 120 },
        data: {
          label: `+${dependencies.outbound.length - 15} more`,
          count: '',
          className: 'bg-slate-100 text-slate-600 border border-slate-300'
        },
        draggable: false,
      })
    }

    // Place IAM roles above
    const iamRadius = 150
    const iamRoles = dependencies.iamRoles.slice(0, 5)
    const iamAngleStep = Math.PI / Math.max(iamRoles.length + 1, 2)

    iamRoles.forEach((role, i) => {
      const angle = Math.PI / 2 + (i - (iamRoles.length - 1) / 2) * 0.4
      const x = centerX + Math.cos(angle) * iamRadius - 45
      const y = centerY - Math.sin(angle) * iamRadius - 20

      const nodeId = `iam-${i}`
      newNodes.push({
        id: nodeId,
        type: 'iam',
        position: { x, y },
        data: { label: role.name },
      })

      newEdges.push({
        id: `edge-${nodeId}`,
        source: 'center',
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: '#a855f7', strokeWidth: 1, strokeDasharray: '5,5' },
      })
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [selectedResource, dependencies, setNodes, setEdges])

  const totalConnections = dependencies.inbound.length + dependencies.outbound.length

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToGraph}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Graph
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <div className="w-[280px]">
            <ResourceSelector
              systemName={systemName}
              selectedResource={selectedResource}
              onSelectResource={onSelectResource}
              resources={resources}
              isLoading={resourcesLoading}
            />
          </div>
        </div>

        {/* Stats Summary */}
        {selectedResource && !dependencies.loading && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-slate-600">{dependencies.inbound.length} inbound</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-slate-600">{dependencies.outbound.length} outbound</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-slate-600">{dependencies.iamRoles.length} IAM</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setDependencies(prev => ({ ...prev, loading: true }))}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {!selectedResource ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center mb-3">
              <Layers className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700 mb-1">Select a Resource</h3>
            <p className="text-sm text-slate-500">Choose a resource to view its dependencies</p>
          </div>
        ) : dependencies.loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-sm text-slate-500">Loading dependencies...</p>
          </div>
        ) : (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.3}
              maxZoom={1.5}
              defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e2e8f0" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg p-3 text-xs shadow-lg border">
              <div className="font-medium mb-2 text-slate-700">Legend</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-green-500" />
                  <span className="text-slate-600">Inbound Traffic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-blue-500" />
                  <span className="text-slate-600">Outbound Traffic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-purple-500 border-dashed" style={{ borderTopWidth: 2, height: 0 }} />
                  <span className="text-slate-600">IAM Role</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-red-500" />
                  <span className="text-slate-600">Low Permission Score</span>
                </div>
              </div>
            </div>

            {/* Empty state overlay */}
            {totalConnections === 0 && dependencies.iamRoles.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80">
                <div className="text-center">
                  <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-slate-700 mb-1">No Dependencies Found</h3>
                  <p className="text-sm text-slate-500">
                    No verified traffic or IAM dependencies detected
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
