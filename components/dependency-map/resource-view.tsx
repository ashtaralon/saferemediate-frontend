'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, CheckCircle, AlertTriangle, Search, ArrowRight, ChevronDown, ChevronUp
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

// Connection Card Component
function ConnectionCard({ conn, direction }: { conn: Connection; direction: 'inbound' | 'outbound' }) {
  const Icon = RESOURCE_ICONS[conn.type] || RESOURCE_ICONS.default
  const color = RESOURCE_COLORS[conn.type] || RESOURCE_COLORS.default
  const borderColor = direction === 'inbound' ? 'border-green-200' : 'border-blue-200'
  const hoverBorder = direction === 'inbound' ? 'hover:border-green-400' : 'hover:border-blue-400'

  return (
    <div className={`bg-white rounded-lg border ${borderColor} ${hoverBorder} p-3 transition-all hover:shadow-sm`}>
      <div className="flex items-start gap-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-slate-800 truncate" title={conn.name}>
              {conn.name}
            </span>
            {conn.verified && (
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-600">
              :{conn.port || '-'}
            </span>
            <span className="text-xs text-slate-400">{conn.protocol}</span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-50 rounded text-slate-500">
              {conn.type}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Stats Badge Component
function StatBadge({ count, label, color }: { count: number; label: string; color: 'green' | 'blue' | 'purple' }) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  }
  const dotColors = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${colors[color]}`}>
      <div className={`w-2 h-2 rounded-full ${dotColors[color]}`} />
      <span className="font-semibold">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  )
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

  const [searchQuery, setSearchQuery] = useState('')
  const [showIamDetails, setShowIamDetails] = useState(false)

  // Fetch dependency data - show ALL connections, not just ACTUAL_TRAFFIC
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

          // Process inbound - show ALL connections
          ;(connections.inbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const source = conn.source || {}
            const relType = rel.type || rel.relationship_type || ''

            inbound.push({
              id: source.id || source.arn || `inbound-${Math.random()}`,
              name: source.name || source.id || 'Unknown',
              type: source.type || 'IP',
              port: rel.port || 0,
              protocol: (rel.protocol || 'TCP').toUpperCase(),
              direction: 'inbound',
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              hitCount: rel.hit_count || 0
            })
          })

          // Process outbound - show ALL connections
          ;(connections.outbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const target = conn.target || {}
            const relType = rel.type || rel.relationship_type || ''

            outbound.push({
              id: target.id || target.arn || `outbound-${Math.random()}`,
              name: target.name || target.id || 'Unknown',
              type: target.type || 'IP',
              port: rel.port || 0,
              protocol: (rel.protocol || 'TCP').toUpperCase(),
              direction: 'outbound',
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              hitCount: rel.hit_count || 0
            })
          })
        }

        // IAM data - currently not available from backend
        // TODO: Add IAM endpoint to backend when needed
        const iamRoles: { name: string; score?: number }[] = []
        const permissionScore = 0

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

  // Filtered connections for table
  const allConnections = useMemo(() => {
    const all = [
      ...dependencies.inbound.map(c => ({ ...c, direction: 'inbound' as const })),
      ...dependencies.outbound.map(c => ({ ...c, direction: 'outbound' as const }))
    ]

    if (!searchQuery) return all

    const query = searchQuery.toLowerCase()
    return all.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.type.toLowerCase().includes(query) ||
      String(c.port).includes(query) ||
      c.protocol.toLowerCase().includes(query)
    )
  }, [dependencies.inbound, dependencies.outbound, searchQuery])

  const handleRefresh = () => {
    if (selectedResource) {
      setDependencies(prev => ({ ...prev, loading: true }))
      // Re-trigger fetch by updating a key or forcing re-render
      const currentResource = selectedResource
      onSelectResource({ ...currentResource })
    }
  }

  const Icon = selectedResource ? (RESOURCE_ICONS[selectedResource.type] || RESOURCE_ICONS.default) : Layers
  const resourceColor = selectedResource ? (RESOURCE_COLORS[selectedResource.type] || RESOURCE_COLORS.default) : '#64748b'

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
            Back
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

        <button
          onClick={handleRefresh}
          disabled={dependencies.loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${dependencies.loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {!selectedResource ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
            <Layers className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">Select a Resource</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Choose a resource from the dropdown above to view its inbound and outbound connections
          </p>
        </div>
      ) : dependencies.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading connections...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Resource Info Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-100 to-white border-b">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                style={{ backgroundColor: resourceColor }}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-lg">{selectedResource.name}</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-200 rounded text-xs font-medium">
                    {selectedResource.type}
                  </span>
                  <span>{systemName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatBadge count={dependencies.inbound.length} label="Inbound" color="green" />
              <StatBadge count={dependencies.outbound.length} label="Outbound" color="blue" />
              <StatBadge count={dependencies.iamRoles.length} label="IAM" color="purple" />
            </div>
          </div>

          {/* Three-Column Flow View */}
          <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
            {/* Inbound Column */}
            <div className="flex-1 flex flex-col border-2 border-green-400 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-green-50 px-4 py-2.5 border-b border-green-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-green-600 rotate-180" />
                  <span className="font-semibold text-green-700">INBOUND</span>
                </div>
                <span className="text-sm text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  {dependencies.inbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {dependencies.inbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No inbound connections</p>
                  </div>
                ) : (
                  dependencies.inbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="inbound" />
                  ))
                )}
              </div>
            </div>

            {/* Central Resource */}
            <div className="flex flex-col items-center justify-center px-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-8 border-t-2 border-dashed border-green-400" />
                <ArrowRight className="w-5 h-5 text-green-500" />
              </div>

              <div
                className="w-28 h-28 rounded-2xl flex flex-col items-center justify-center shadow-lg border-4 border-white"
                style={{ backgroundColor: resourceColor }}
              >
                <Icon className="w-10 h-10 text-white mb-1" />
                <span className="text-xs text-white/90 font-medium">{selectedResource.type}</span>
              </div>

              <div className="mt-3 text-center max-w-[140px]">
                <div className="font-medium text-slate-800 text-sm truncate" title={selectedResource.name}>
                  {selectedResource.name}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4">
                <ArrowRight className="w-5 h-5 text-blue-500" />
                <div className="w-8 border-t-2 border-dashed border-blue-400" />
              </div>
            </div>

            {/* Outbound Column */}
            <div className="flex-1 flex flex-col border-2 border-blue-400 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-blue-700">OUTBOUND</span>
                </div>
                <span className="text-sm text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {dependencies.outbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {dependencies.outbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No outbound connections</p>
                  </div>
                ) : (
                  dependencies.outbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="outbound" />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Tabs */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-t border-b">
            <button
              onClick={() => setShowIamDetails(!showIamDetails)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showIamDetails ? 'bg-purple-100 text-purple-700' : 'bg-white text-slate-600 hover:bg-slate-50'
              } border`}
            >
              <Key className="w-4 h-4" />
              IAM Roles: {dependencies.iamRoles.length}
              {showIamDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white text-slate-600 border hover:bg-slate-50">
              <Shield className="w-4 h-4" />
              Security Groups: {dependencies.securityGroups.length}
            </button>
          </div>

          {/* IAM Details Panel (collapsible) */}
          {showIamDetails && dependencies.iamRoles.length > 0 && (
            <div className="px-4 py-3 bg-purple-50 border-b">
              <div className="flex flex-wrap gap-2">
                {dependencies.iamRoles.map((role, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-purple-200">
                    <Key className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-slate-700">{role.name}</span>
                    {role.score !== undefined && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        role.score < 20 ? 'bg-red-100 text-red-600' :
                        role.score < 50 ? 'bg-yellow-100 text-yellow-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {role.score}% LP
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connections Table */}
          <div className="border-t bg-white">
            <div className="px-4 py-2 flex items-center justify-between bg-slate-50 border-b">
              <span className="font-medium text-slate-700">All Connections ({allConnections.length})</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Direction</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Resource</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Port</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Protocol</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allConnections.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        {searchQuery ? 'No connections match your search' : 'No connections found'}
                      </td>
                    </tr>
                  ) : (
                    allConnections.map((conn, idx) => (
                      <tr key={conn.id + '-table-' + idx} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            conn.direction === 'inbound'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            <ArrowRight className={`w-3 h-3 ${conn.direction === 'inbound' ? 'rotate-180' : ''}`} />
                            {conn.direction}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-800 max-w-[200px] truncate" title={conn.name}>
                          {conn.name}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                            {conn.type}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-slate-600">{conn.port || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{conn.protocol}</td>
                        <td className="px-4 py-2">
                          {conn.verified ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              Verified
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
