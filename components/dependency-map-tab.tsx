'use client'

import React, { useState, useEffect } from 'react'
import { Network, Table, Search, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertCircle, Activity, Shield, Database, Globe, Users, Link2 } from 'lucide-react'

interface CloudTrailEvent {
  event_id: string
  event_name: string
  event_source: string
  event_time: string
  username: string | null
  resources: { type: string; name: string }[]
}

interface DependencyEdge {
  id: string
  source: string
  sourceType: string
  action: string
  target: string
  targetType: string
  service: string
  timestamp: string
  count: number
}

interface DependencyNode {
  id: string
  name: string
  type: 'User' | 'Role' | 'SecurityGroup' | 'S3Bucket' | 'Service' | 'IAMRole'
  arn?: string
  lpScore?: number
  usedCount?: number
  unusedCount?: number
  region?: string
  connections: number
}

interface Summary {
  totalNodes: number
  iamRoles: number
  securityGroups: number
  s3Buckets: number
  services: number
  users: number
  connections: number
}

interface Props {
  systemName: string
}

export default function DependencyMapTab({ systemName }: Props) {
  const [activeTab, setActiveTab] = useState<'graph' | 'table'>('graph')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [edges, setEdges] = useState<DependencyEdge[]>([])
  const [nodes, setNodes] = useState<DependencyNode[]>([])
  const [filter, setFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d')
  const [summary, setSummary] = useState<Summary>({
    totalNodes: 0,
    iamRoles: 0,
    securityGroups: 0,
    s3Buckets: 0,
    services: 0,
    users: 0,
    connections: 0
  })

  useEffect(() => {
    fetchDependencyData()
  }, [systemName, timeRange])

  const fetchDependencyData = async () => {
      setLoading(true)
        setError(null)
    try {
      // 1. Fetch ALL resources (nodes) from least-privilege
      const resourcesResponse = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}`)
      const resourcesData = await resourcesResponse.json()
      
      // 2. Fetch CloudTrail events (edges/connections)
      const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
      const eventsResponse = await fetch(`/api/proxy/cloudtrail/events?limit=500&days=${days}`)
      const eventsData = await eventsResponse.json()
      
      // 3. Build nodes from ALL resources
      const nodeMap = new Map<string, DependencyNode>()
      
      // Add all resources as nodes
      resourcesData.resources?.forEach((resource: any) => {
        nodeMap.set(resource.resourceName, {
          id: resource.resourceName,
          name: resource.resourceName,
          type: resource.resourceType as DependencyNode['type'],
          arn: resource.resourceArn,
          lpScore: resource.lpScore,
          usedCount: resource.usedCount || 0,
          unusedCount: resource.gapCount || 0,
          region: resource.evidence?.coverage?.regions?.[0] || 'eu-west-1',
          connections: 0
        })
      })
      
      // 4. Build edges from CloudTrail events
      const edgeMap = new Map<string, DependencyEdge>()
      
      eventsData.events?.forEach((event: CloudTrailEvent) => {
        const source = event.username || 'Unknown'
        const service = event.event_source.replace('.amazonaws.com', '')
        const action = event.event_name
        
        // Add source as node if not exists
        if (!nodeMap.has(source)) {
          nodeMap.set(source, {
            id: source,
            name: source,
            type: source === 'root' ? 'User' : 'Role',
            connections: 0
          })
        }
        
        // Add service as node if not exists
        if (!nodeMap.has(service)) {
          nodeMap.set(service, {
            id: service,
            name: service,
            type: 'Service',
            connections: 0
          })
        }
        
        // Create edge
        const edgeKey = `${source}-${action}-${service}`
        if (edgeMap.has(edgeKey)) {
          edgeMap.get(edgeKey)!.count++
        } else {
          edgeMap.set(edgeKey, {
            id: edgeKey,
            source,
            sourceType: source === 'root' ? 'User' : 'Role',
            action,
            target: service,
            targetType: 'Service',
            service,
            timestamp: event.event_time,
            count: 1
          })
        }
        
        // Update connection counts
        const sourceNode = nodeMap.get(source)
        const serviceNode = nodeMap.get(service)
        if (sourceNode) sourceNode.connections++
        if (serviceNode) serviceNode.connections++
        
        // Link to actual resources mentioned in the event
        event.resources?.forEach((res: any) => {
          if (res.name) {
            const resourceName = res.name.split('/').pop() || res.name
            // Find matching resource node
            for (const [key, node] of nodeMap) {
              if (key.includes(resourceName) || resourceName.includes(key)) {
                node.connections++
                // Create edge from service to resource
                const resourceEdgeKey = `${service}-accesses-${key}`
                if (!edgeMap.has(resourceEdgeKey)) {
                  edgeMap.set(resourceEdgeKey, {
                    id: resourceEdgeKey,
                    source: service,
                    sourceType: 'Service',
                    action: 'accesses',
                    target: key,
                    targetType: node.type,
                    service,
                    timestamp: event.event_time,
                    count: 1
                  })
      } else {
                  edgeMap.get(resourceEdgeKey)!.count++
                }
                break
              }
            }
          }
        })
      })
      
      const nodesArray = Array.from(nodeMap.values())
      const edgesArray = Array.from(edgeMap.values())
      
      setNodes(nodesArray)
      setEdges(edgesArray)
      setSummary({
        totalNodes: nodeMap.size,
        iamRoles: nodesArray.filter(n => n.type === 'IAMRole').length,
        securityGroups: nodesArray.filter(n => n.type === 'SecurityGroup').length,
        s3Buckets: nodesArray.filter(n => n.type === 'S3Bucket').length,
        services: nodesArray.filter(n => n.type === 'Service').length,
        users: nodesArray.filter(n => n.type === 'User' || n.type === 'Role').length,
        connections: edgeMap.size
      })
      
    } catch (err: any) {
      console.error('Failed to fetch dependency data:', err)
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const filteredEdges = edges.filter(edge => {
    const matchesSearch = filter === '' || 
      edge.source.toLowerCase().includes(filter.toLowerCase()) ||
      edge.target.toLowerCase().includes(filter.toLowerCase()) ||
      edge.action.toLowerCase().includes(filter.toLowerCase())
    
    const matchesService = serviceFilter === 'all' || edge.service === serviceFilter
    
    return matchesSearch && matchesService
  })

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = filter === '' || 
      node.name.toLowerCase().includes(filter.toLowerCase())
    
    const matchesType = typeFilter === 'all' || node.type === typeFilter
    
    return matchesSearch && matchesType
  })

  const uniqueServices = [...new Set(edges.map(e => e.service))].sort()
  const resourceTypes = ['all', 'IAMRole', 'SecurityGroup', 'S3Bucket', 'Service', 'User', 'Role']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Dependency Map</h2>
          <p className="text-gray-500">
            All resources and their behavioral connections • {summary.totalNodes} resources • {summary.connections} connections
          </p>
          </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          
            <button
            onClick={fetchDependencyData}
              disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
            </button>
          </div>
        </div>

      {/* Stats Cards - 6 columns */}
        <div className="grid grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-blue-600">{summary.iamRoles}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Users className="w-4 h-4" />
            IAM Roles
          </div>
          </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-orange-600">{summary.securityGroups}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Shield className="w-4 h-4" />
            Security Groups
          </div>
          </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-600">{summary.s3Buckets}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Database className="w-4 h-4" />
            S3 Buckets
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-purple-600">{summary.services}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Globe className="w-4 h-4" />
            AWS Services
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-600">{summary.users}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Users className="w-4 h-4" />
            Users/Roles
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-slate-600">{summary.connections}</div>
          <div className="text-gray-500 text-sm flex items-center justify-center gap-1">
            <Link2 className="w-4 h-4" />
            Connections
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('graph')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
            activeTab === 'graph' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Network className="w-5 h-5" />
          Graph View
        </button>
        <button
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
            activeTab === 'table' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Table className="w-5 h-5" />
          Table View
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search resources, connections..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
            <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Types</option>
          <option value="IAMRole">IAM Roles</option>
          <option value="SecurityGroup">Security Groups</option>
          <option value="S3Bucket">S3 Buckets</option>
          <option value="Service">AWS Services</option>
          <option value="User">Users</option>
          <option value="Role">Roles</option>
            </select>
        {activeTab === 'table' && (
            <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Services ({uniqueServices.length})</option>
            {uniqueServices.map(service => (
              <option key={service} value={service}>{service}</option>
            ))}
            </select>
        )}
          </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="font-medium text-red-700">Failed to load dependency data</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-xl">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-500">Loading resources and connections...</p>
        </div>
      ) : activeTab === 'graph' ? (
        <GraphView nodes={filteredNodes} edges={filteredEdges} />
      ) : (
        <TableView nodes={filteredNodes} edges={filteredEdges} />
      )}
    </div>
  )
}

// Helper function to get node styling
const getNodeStyle = (type: string) => {
  switch (type) {
    case 'IAMRole':
      return { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', icon: '👤', color: 'blue' }
    case 'SecurityGroup':
      return { bg: 'bg-gradient-to-br from-orange-500 to-orange-600', icon: '🛡️', color: 'orange' }
    case 'S3Bucket':
      return { bg: 'bg-gradient-to-br from-green-500 to-green-600', icon: '📦', color: 'green' }
    case 'Service':
      return { bg: 'bg-gradient-to-br from-purple-500 to-purple-600', icon: '⚙️', color: 'purple' }
    case 'User':
      return { bg: 'bg-gradient-to-br from-red-500 to-red-600', icon: '👑', color: 'red' }
    case 'Role':
      return { bg: 'bg-gradient-to-br from-indigo-500 to-indigo-600', icon: '🔑', color: 'indigo' }
    default:
      return { bg: 'bg-gradient-to-br from-slate-500 to-slate-600', icon: '📄', color: 'slate' }
  }
}

// Graph View Component
function GraphView({ nodes, edges }: { nodes: DependencyNode[], edges: DependencyEdge[] }) {
  // Group nodes by type for better layout
  const nodesByType = {
    IAMRole: nodes.filter(n => n.type === 'IAMRole'),
    SecurityGroup: nodes.filter(n => n.type === 'SecurityGroup'),
    S3Bucket: nodes.filter(n => n.type === 'S3Bucket'),
    Service: nodes.filter(n => n.type === 'Service'),
    User: nodes.filter(n => n.type === 'User'),
    Role: nodes.filter(n => n.type === 'Role')
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 min-h-[700px] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button className="p-2 bg-slate-700/80 backdrop-blur rounded-lg hover:bg-slate-600 transition-colors">
          <ZoomIn className="w-4 h-4 text-white" />
            </button>
        <button className="p-2 bg-slate-700/80 backdrop-blur rounded-lg hover:bg-slate-600 transition-colors">
          <ZoomOut className="w-4 h-4 text-white" />
            </button>
        <button className="p-2 bg-slate-700/80 backdrop-blur rounded-lg hover:bg-slate-600 transition-colors">
          <Maximize2 className="w-4 h-4 text-white" />
            </button>
          </div>

      {/* Graph Content - Grid Layout by Resource Type */}
      <div className="relative z-0 py-4 space-y-8">
        {/* Row 1: IAM Roles */}
        {nodesByType.IAMRole.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-blue-400 font-medium px-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              IAM Roles ({nodesByType.IAMRole.length})
              </div>
            <div className="flex flex-wrap gap-3">
              {nodesByType.IAMRole.slice(0, 15).map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
              {nodesByType.IAMRole.length > 15 && (
                <div className="flex items-center px-3 text-slate-400 text-sm">
                  +{nodesByType.IAMRole.length - 15} more
              </div>
              )}
              </div>
            </div>
        )}

        {/* Row 2: Security Groups */}
        {nodesByType.SecurityGroup.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-orange-400 font-medium px-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Security Groups ({nodesByType.SecurityGroup.length})
          </div>
            <div className="flex flex-wrap gap-3">
              {nodesByType.SecurityGroup.slice(0, 15).map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
              {nodesByType.SecurityGroup.length > 15 && (
                <div className="flex items-center px-3 text-slate-400 text-sm">
                  +{nodesByType.SecurityGroup.length - 15} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Row 3: S3 Buckets */}
        {nodesByType.S3Bucket.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-green-400 font-medium px-2 flex items-center gap-2">
              <Database className="w-4 h-4" />
              S3 Buckets ({nodesByType.S3Bucket.length})
            </div>
            <div className="flex flex-wrap gap-3">
              {nodesByType.S3Bucket.slice(0, 15).map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
              {nodesByType.S3Bucket.length > 15 && (
                <div className="flex items-center px-3 text-slate-400 text-sm">
                  +{nodesByType.S3Bucket.length - 15} more
            </div>
          )}
        </div>
          </div>
        )}

        {/* Row 4: AWS Services (from CloudTrail) */}
        {nodesByType.Service.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-purple-400 font-medium px-2 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              AWS Services ({nodesByType.Service.length})
                </div>
            <div className="flex flex-wrap gap-3">
              {nodesByType.Service.slice(0, 15).map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
              {nodesByType.Service.length > 15 && (
                <div className="flex items-center px-3 text-slate-400 text-sm">
                  +{nodesByType.Service.length - 15} more
              </div>
                )}
              </div>
            </div>
        )}

        {/* Row 5: Users/Roles (from CloudTrail) */}
        {(nodesByType.User.length > 0 || nodesByType.Role.length > 0) && (
          <div className="space-y-2">
            <div className="text-sm text-red-400 font-medium px-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Callers ({nodesByType.User.length + nodesByType.Role.length})
                  </div>
            <div className="flex flex-wrap gap-3">
              {[...nodesByType.User, ...nodesByType.Role].slice(0, 15).map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
                </div>
                  </div>
        )}

        {nodes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
            <Network className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No resources found</p>
            <p className="text-sm">Try adjusting the filters</p>
                </div>
        )}
                </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs z-10 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1 rounded-lg">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-slate-300">IAM Role</span>
              </div>
        <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1 rounded-lg">
          <div className="w-3 h-3 rounded-lg bg-orange-500" />
          <span className="text-slate-300">Security Group</span>
            </div>
        <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1 rounded-lg">
          <div className="w-3 h-3 rounded-lg bg-green-500" />
          <span className="text-slate-300">S3 Bucket</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1 rounded-lg">
          <div className="w-3 h-3 rounded-lg bg-purple-500" />
          <span className="text-slate-300">Service</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1 rounded-lg">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-slate-300">User/Caller</span>
        </div>
      </div>
    </div>
  )
}

// Node Card Component
function NodeCard({ node }: { node: DependencyNode }) {
  const style = getNodeStyle(node.type)
  
  return (
    <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-lg p-3 min-w-[160px] hover:bg-slate-700/60 transition-colors cursor-pointer group">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 ${style.bg} ${node.type === 'IAMRole' || node.type === 'User' || node.type === 'Role' ? 'rounded-full' : 'rounded-lg'} flex items-center justify-center text-white text-sm shadow-lg`}>
          {style.icon}
                  </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate" title={node.name}>
            {node.name.length > 18 ? node.name.slice(0, 18) + '...' : node.name}
                  </div>
          <div className="text-slate-400 text-xs">{node.type}</div>
                </div>
              </div>
      {(node.lpScore !== undefined || node.connections > 0) && (
        <div className="flex items-center gap-3 text-xs">
          {node.lpScore !== undefined && (
            <span className={`px-1.5 py-0.5 rounded ${
              node.lpScore >= 80 ? 'bg-green-500/20 text-green-400' :
              node.lpScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              LP: {node.lpScore}%
            </span>
          )}
          {node.connections > 0 && (
            <span className="text-slate-400">
              {node.connections} conn
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Table View Component
function TableView({ nodes, edges }: { nodes: DependencyNode[], edges: DependencyEdge[] }) {
  const [tableTab, setTableTab] = useState<'resources' | 'connections'>('resources')
  const [sortField, setSortField] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedNodes = [...nodes].sort((a, b) => {
    let aVal: any = (a as any)[sortField]
    let bVal: any = (b as any)[sortField]
    if (typeof aVal === 'string') aVal = aVal.toLowerCase()
    if (typeof bVal === 'string') bVal = bVal.toLowerCase()
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const sortedEdges = [...edges].sort((a, b) => {
    const aVal = a.count
    const bVal = b.count
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  const resourceNodes = sortedNodes.filter(n => ['IAMRole', 'SecurityGroup', 'S3Bucket'].includes(n.type))

                    return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Sub-tabs */}
      <div className="flex items-center gap-4 px-4 border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setTableTab('resources')}
          className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tableTab === 'resources'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Resources ({resourceNodes.length})
        </button>
        <button
          onClick={() => setTableTab('connections')}
          className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tableTab === 'connections'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Connections ({edges.length})
        </button>
                      </div>

      {/* Resources Table */}
      {tableTab === 'resources' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th 
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  Resource {sortField === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('type')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  Type {sortField === 'type' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('lpScore')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  LP Score {sortField === 'lpScore' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('usedCount')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  Used {sortField === 'usedCount' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('unusedCount')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  Unused {sortField === 'unusedCount' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('connections')}
                  className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  Connections {sortField === 'connections' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resourceNodes.map(node => {
                const style = getNodeStyle(node.type)
                return (
                  <tr key={node.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${style.bg} ${node.type === 'IAMRole' ? 'rounded-full' : 'rounded-lg'} flex items-center justify-center text-white text-sm shadow`}>
                          {style.icon}
                        </div>
                        <span className="font-medium text-gray-900">{node.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        node.type === 'IAMRole' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        node.type === 'SecurityGroup' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {node.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {node.lpScore !== undefined ? (
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          node.lpScore >= 80 ? 'bg-green-100 text-green-700' :
                          node.lpScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {node.lpScore}%
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-green-600 font-medium">{node.usedCount ?? 0}</td>
                    <td className="px-4 py-3 text-red-600 font-medium">{node.unusedCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {node.connections}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {resourceNodes.length === 0 && (
            <div className="p-12 text-center">
              <Database className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">No resources found</p>
              <p className="text-sm text-gray-400">Try adjusting the filters</p>
              </div>
          )}
          </div>
        )}

      {/* Connections Table */}
      {tableTab === 'connections' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Source</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Target</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Count</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedEdges.map(edge => (
                <tr key={edge.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow ${
                        edge.source === 'root' 
                          ? 'bg-gradient-to-br from-red-500 to-red-600' 
                          : 'bg-gradient-to-br from-blue-500 to-blue-600'
                      }`}>
                        {edge.source.slice(0, 2).toUpperCase()}
      </div>
                      <div>
                        <span className="font-medium text-gray-900">{edge.source}</span>
                        <span className="block text-xs text-gray-500">{edge.sourceType}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-sm font-mono border border-purple-200">
                      {edge.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow">
                        {edge.target.slice(0, 3).toUpperCase()}
                      </div>
                      <span className="text-gray-900">{edge.target}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                      edge.count > 100 
                        ? 'bg-orange-50 text-orange-700 border border-orange-200'
                        : edge.count > 10
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                      {edge.count.toLocaleString()} events
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(edge.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {edges.length === 0 && (
            <div className="p-12 text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">No connections found</p>
              <p className="text-sm text-gray-400">Try adjusting the filters or time range</p>
        </div>
      )}
    </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
        {tableTab === 'resources' 
          ? `Showing ${resourceNodes.length} resources`
          : `Showing ${edges.length} connections • ${edges.reduce((sum, e) => sum + e.count, 0).toLocaleString()} total events`
        }
      </div>
    </div>
  )
}
