'use client'

import React, { useState, useEffect } from 'react'
import { Network, Table, Search, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertCircle, Activity } from 'lucide-react'

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
  sourceType: 'User' | 'Role' | 'Service'
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
  type: 'User' | 'Role' | 'SecurityGroup' | 'S3Bucket' | 'Service'
  connections: number
}

interface Props {
  systemName: string
}

export default function DependencyMapTab({ systemName }: Props) {
  const [activeTab, setActiveTab] = useState<'graph' | 'table'>('graph')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<CloudTrailEvent[]>([])
  const [edges, setEdges] = useState<DependencyEdge[]>([])
  const [nodes, setNodes] = useState<DependencyNode[]>([])
  const [filter, setFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d')

  useEffect(() => {
    fetchDependencyData()
  }, [systemName, timeRange])

  const fetchDependencyData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch CloudTrail events
      const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
      const response = await fetch(`/api/proxy/cloudtrail/events?limit=500&days=${days}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.events && data.events.length > 0) {
        setEvents(data.events)
        processEventsToGraph(data.events)
      } else if (data.error) {
        setError(data.error)
      } else {
        // No events - show empty state
        setEvents([])
        setNodes([])
        setEdges([])
      }
    } catch (err: any) {
      console.error('Failed to fetch dependency data:', err)
      setError(err.message || 'Failed to fetch CloudTrail data')
    } finally {
      setLoading(false)
    }
  }

  const processEventsToGraph = (events: CloudTrailEvent[]) => {
    const edgeMap = new Map<string, DependencyEdge>()
    const nodeMap = new Map<string, DependencyNode>()

    events.forEach(event => {
      const source = event.username || 'Unknown'
      const service = event.event_source.replace('.amazonaws.com', '')
      const action = event.event_name

      // Create source node
      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          name: source,
          type: source === 'root' ? 'User' : 'Role',
          connections: 0
        })
      }

      // Create service node
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
      nodeMap.get(source)!.connections++
      nodeMap.get(service)!.connections++

      // Process resources as additional targets
      event.resources?.forEach(resource => {
        if (resource.name && resource.type) {
          const resourceId = resource.name.split('/').pop() || resource.name
          if (!nodeMap.has(resourceId)) {
            nodeMap.set(resourceId, {
              id: resourceId,
              name: resourceId,
              type: resource.type.includes('Role') ? 'Role' : 
                    resource.type.includes('SecurityGroup') ? 'SecurityGroup' :
                    resource.type.includes('Bucket') ? 'S3Bucket' : 'Service',
              connections: 1
            })
          }
        }
      })
    })

    setNodes(Array.from(nodeMap.values()))
    setEdges(Array.from(edgeMap.values()))
  }

  const filteredEdges = edges.filter(edge => {
    const matchesSearch = filter === '' || 
      edge.source.toLowerCase().includes(filter.toLowerCase()) ||
      edge.target.toLowerCase().includes(filter.toLowerCase()) ||
      edge.action.toLowerCase().includes(filter.toLowerCase())
    
    const matchesService = serviceFilter === 'all' || edge.service === serviceFilter
    
    return matchesSearch && matchesService
  })

  const uniqueServices = [...new Set(edges.map(e => e.service))].sort()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Dependency Map</h2>
          <p className="text-gray-500">
            Behavioral dependencies based on actual traffic • {nodes.length} resources • {edges.length} connections
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

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-blue-600">{nodes.filter(n => n.type === 'User' || n.type === 'Role').length}</div>
          <div className="text-gray-500 text-sm">Identities</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-green-600">{nodes.filter(n => n.type === 'Service').length}</div>
          <div className="text-gray-500 text-sm">AWS Services</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-purple-600">{edges.length}</div>
          <div className="text-gray-500 text-sm">Unique Connections</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-3xl font-bold text-orange-600">{edges.reduce((sum, e) => sum + e.count, 0).toLocaleString()}</div>
          <div className="text-gray-500 text-sm">Total Events</div>
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
            placeholder="Search sources, targets, actions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
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
          <p className="text-gray-500">Loading CloudTrail events...</p>
        </div>
      ) : activeTab === 'graph' ? (
        <GraphView nodes={nodes} edges={filteredEdges} />
      ) : (
        <TableView edges={filteredEdges} />
      )}
    </div>
  )
}

// Graph View Component
function GraphView({ nodes, edges }: { nodes: DependencyNode[], edges: DependencyEdge[] }) {
  // Group edges by source for better visualization
  const edgesBySource = edges.reduce((acc, edge) => {
    if (!acc[edge.source]) acc[edge.source] = []
    acc[edge.source].push(edge)
    return acc
  }, {} as Record<string, DependencyEdge[]>)

  const sources = Object.keys(edgesBySource).slice(0, 8) // Limit to 8 sources for readability

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 min-h-[600px] relative overflow-hidden">
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

      {/* Graph Content */}
      <div className="relative z-0 py-8">
        {sources.length > 0 ? (
          <div className="space-y-8">
            {sources.map((source, idx) => {
              const sourceEdges = edgesBySource[source].slice(0, 4) // Limit edges per source
              const sourceNode = nodes.find(n => n.id === source)
              
              return (
                <div key={source} className="flex items-center gap-6">
                  {/* Source Node */}
                  <div className="flex flex-col items-center min-w-[100px]">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold shadow-lg ${
                      source === 'root' 
                        ? 'bg-gradient-to-br from-red-500 to-red-600 ring-2 ring-red-400/50' 
                        : 'bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-blue-400/50'
                    }`}>
                      {source.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-white text-sm mt-2 font-medium text-center max-w-[100px] truncate" title={source}>
                      {source.length > 12 ? source.slice(0, 12) + '...' : source}
                    </span>
                    <span className="text-slate-400 text-xs">
                      {sourceNode?.connections || 0} calls
                    </span>
                  </div>

                  {/* Edges */}
                  <div className="flex-1 flex flex-wrap gap-4">
                    {sourceEdges.map(edge => (
                      <div key={edge.id} className="flex items-center gap-3 bg-slate-800/50 backdrop-blur rounded-lg p-3 border border-slate-700/50">
                        {/* Arrow */}
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-0.5 bg-gradient-to-r from-blue-500 to-green-500 relative">
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-4 border-l-green-500 border-y-4 border-y-transparent" />
                          </div>
                        </div>
                        
                        {/* Action */}
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded">
                            {edge.action}
                          </span>
                          <span className="text-xs text-slate-500 mt-1">
                            {edge.count}x
                          </span>
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-0.5 bg-gradient-to-r from-green-500 to-green-400" />
                        </div>
                        
                        {/* Target Node */}
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {edge.target.slice(0, 3).toUpperCase()}
                          </div>
                          <span className="text-white text-xs mt-1">{edge.target}</span>
                        </div>
                      </div>
                    ))}
                    
                    {edgesBySource[source].length > 4 && (
                      <div className="flex items-center justify-center px-4">
                        <span className="text-slate-400 text-sm">
                          +{edgesBySource[source].length - 4} more
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
            <Network className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No dependencies found</p>
            <p className="text-sm">Try adjusting the time range or filters</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-6 text-sm z-10">
        <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-lg">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-500 to-red-600" />
          <span className="text-slate-300">Root User</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-lg">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600" />
          <span className="text-slate-300">IAM Role</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-lg">
          <div className="w-4 h-4 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600" />
          <span className="text-slate-300">AWS Service</span>
        </div>
      </div>
    </div>
  )
}

// Table View Component
function TableView({ edges }: { edges: DependencyEdge[] }) {
  const [sortField, setSortField] = useState<'source' | 'action' | 'target' | 'count'>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sortedEdges = [...edges].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    const cmp = typeof aVal === 'number' 
      ? aVal - (bVal as number)
      : String(aVal).localeCompare(String(bVal))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th 
                onClick={() => handleSort('source')}
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                Source Identity {sortField === 'source' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('action')}
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                Action {sortField === 'action' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('target')}
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                Target Service {sortField === 'target' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                onClick={() => handleSort('count')}
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                Event Count {sortField === 'count' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedEdges.map(edge => (
              <tr key={edge.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow ${
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
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shadow">
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
      </div>
      
      {edges.length === 0 && (
        <div className="p-12 text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 font-medium">No connections found</p>
          <p className="text-sm text-gray-400">Try adjusting the filters or time range</p>
        </div>
      )}

      {edges.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
          Showing {sortedEdges.length} connections • {edges.reduce((sum, e) => sum + e.count, 0).toLocaleString()} total events
        </div>
      )}
    </div>
  )
}
