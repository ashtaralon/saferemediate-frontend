'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, CheckCircle, Search, ArrowRight, ChevronDown, ChevronUp,
  Activity, Clock, Zap, Network, Eye, Filter
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
  relationshipType: string // ACTUAL_TRAFFIC, ACCESSES_RESOURCE, IN_VPC, etc.
  verified: boolean
  lastSeen?: string
  firstSeen?: string
  hitCount?: number
}

interface DependencyData {
  inbound: Connection[]
  outbound: Connection[]
  iamRoles: { name: string }[]
  securityGroups: string[]
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
  NetworkEndpoint: '#64748b',
  Principal: '#8B5CF6',
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
  NetworkEndpoint: Globe,
  Principal: Key,
  default: Layers,
}

// Relationship type categories
const RELATIONSHIP_CATEGORIES = {
  traffic: ['ACTUAL_TRAFFIC'],
  access: ['ACCESSES_RESOURCE'],
  infrastructure: ['IN_VPC', 'IN_SUBNET', 'HAS_SECURITY_GROUP', 'CONTAINS', 'BELONGS_TO_SYSTEM'],
}

// Format relative time
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Get category color for relationship type
function getRelationshipColor(relType: string): string {
  if (RELATIONSHIP_CATEGORIES.traffic.includes(relType)) return 'emerald'
  if (RELATIONSHIP_CATEGORIES.access.includes(relType)) return 'violet'
  return 'slate'
}

// Connection Card Component with behavioral data
function ConnectionCard({ conn, direction }: { conn: Connection; direction: 'inbound' | 'outbound' }) {
  const Icon = RESOURCE_ICONS[conn.type] || RESOURCE_ICONS.default
  const color = RESOURCE_COLORS[conn.type] || RESOURCE_COLORS.default
  const borderColor = direction === 'inbound' ? 'border-green-200' : 'border-blue-200'
  const hoverBorder = direction === 'inbound' ? 'hover:border-green-400' : 'hover:border-blue-400'
  const relColor = getRelationshipColor(conn.relationshipType)

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

          {/* Port & Protocol */}
          <div className="flex items-center gap-2 mt-1">
            {conn.port ? (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-600">
                :{conn.port}
              </span>
            ) : null}
            {conn.protocol && conn.protocol !== 'TCP' && (
              <span className="text-xs text-slate-400">{conn.protocol}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded bg-${relColor}-50 text-${relColor}-600`}>
              {conn.relationshipType.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Behavioral data */}
          {(conn.hitCount || conn.lastSeen) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              {conn.hitCount ? (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {conn.hitCount} hits
                </span>
              ) : null}
              {conn.lastSeen ? (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(conn.lastSeen)}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Behavioral Insights Card
function InsightCard({ icon: IconComp, label, value, subtext, color }: {
  icon: any; label: string; value: string | number; subtext?: string; color: string
}) {
  const bgColors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200',
    blue: 'bg-blue-50 border-blue-200',
    violet: 'bg-violet-50 border-violet-200',
    amber: 'bg-amber-50 border-amber-200',
  }
  const textColors: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColors[color]}`}>
      <IconComp className={`w-5 h-5 ${textColors[color]}`} />
      <div>
        <div className="text-lg font-semibold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {subtext && <div className="text-xs text-slate-400">{subtext}</div>}
      </div>
    </div>
  )
}

// Stats Badge Component
function StatBadge({ count, label, color }: { count: number; label: string; color: 'green' | 'blue' | 'purple' | 'amber' }) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  const dotColors = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${colors[color]}`}>
      <div className={`w-2 h-2 rounded-full ${dotColors[color]}`} />
      <span className="font-semibold">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  )
}

type FilterType = 'all' | 'traffic' | 'access' | 'infrastructure'

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
    loading: true
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  // Fetch dependency data - show ALL connections with full behavioral data
  useEffect(() => {
    if (!selectedResource) return

    const fetchDependencies = async () => {
      setDependencies(prev => ({ ...prev, loading: true }))

      try {
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
            const relType = rel.type || rel.relationship_type || 'UNKNOWN'

            inbound.push({
              id: source.id || source.arn || `inbound-${Math.random()}`,
              name: source.name || source.arn?.split(':').pop() || source.id || 'Unknown',
              type: source.type || 'NetworkEndpoint',
              port: rel.port || 0,
              protocol: (rel.protocol || '').toUpperCase(),
              direction: 'inbound',
              relationshipType: relType,
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              firstSeen: rel.first_seen,
              hitCount: rel.hit_count || 0
            })
          })

          // Process outbound
          ;(connections.outbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const target = conn.target || {}
            const relType = rel.type || rel.relationship_type || 'UNKNOWN'

            outbound.push({
              id: target.id || target.arn || `outbound-${Math.random()}`,
              name: target.name || target.arn?.split(':').pop() || target.id || 'Unknown',
              type: target.type || 'NetworkEndpoint',
              port: rel.port || 0,
              protocol: (rel.protocol || '').toUpperCase(),
              direction: 'outbound',
              relationshipType: relType,
              verified: relType === 'ACTUAL_TRAFFIC',
              lastSeen: rel.last_seen,
              firstSeen: rel.first_seen,
              hitCount: rel.hit_count || 0
            })
          })
        }

        setDependencies({
          inbound,
          outbound,
          iamRoles: [],
          securityGroups: [],
          loading: false
        })
      } catch (err) {
        console.error('Failed to fetch dependencies:', err)
        setDependencies(prev => ({ ...prev, loading: false }))
      }
    }

    fetchDependencies()
  }, [selectedResource])

  // Compute behavioral insights
  const insights = useMemo(() => {
    const all = [...dependencies.inbound, ...dependencies.outbound]
    const trafficConns = all.filter(c => c.relationshipType === 'ACTUAL_TRAFFIC')
    const accessConns = all.filter(c => c.relationshipType === 'ACCESSES_RESOURCE')

    const totalHits = all.reduce((sum, c) => sum + (c.hitCount || 0), 0)
    const uniquePorts = new Set(all.filter(c => c.port).map(c => c.port)).size
    const uniqueEndpoints = new Set(all.map(c => c.name)).size

    // Find most recent activity
    const recentActivity = all
      .filter(c => c.lastSeen)
      .sort((a, b) => new Date(b.lastSeen!).getTime() - new Date(a.lastSeen!).getTime())[0]

    return {
      totalConnections: all.length,
      trafficConnections: trafficConns.length,
      accessConnections: accessConns.length,
      totalHits,
      uniquePorts,
      uniqueEndpoints,
      recentActivity: recentActivity?.lastSeen,
    }
  }, [dependencies])

  // Filter connections by type
  const filterConnections = (conns: Connection[]): Connection[] => {
    if (activeFilter === 'all') return conns
    const types = RELATIONSHIP_CATEGORIES[activeFilter] || []
    return conns.filter(c => types.includes(c.relationshipType))
  }

  const filteredInbound = useMemo(() => filterConnections(dependencies.inbound), [dependencies.inbound, activeFilter])
  const filteredOutbound = useMemo(() => filterConnections(dependencies.outbound), [dependencies.outbound, activeFilter])

  // All connections for table
  const allConnections = useMemo(() => {
    const all = [
      ...filteredInbound.map(c => ({ ...c, direction: 'inbound' as const })),
      ...filteredOutbound.map(c => ({ ...c, direction: 'outbound' as const }))
    ]

    if (!searchQuery) return all

    const query = searchQuery.toLowerCase()
    return all.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.type.toLowerCase().includes(query) ||
      String(c.port).includes(query) ||
      c.protocol.toLowerCase().includes(query) ||
      c.relationshipType.toLowerCase().includes(query)
    )
  }, [filteredInbound, filteredOutbound, searchQuery])

  const handleRefresh = () => {
    if (selectedResource) {
      setDependencies(prev => ({ ...prev, loading: true }))
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
            Choose a resource to view its connections, dependencies, and behavioral insights
          </p>
        </div>
      ) : dependencies.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading connections...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Resource Info Bar with Stats */}
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
              <StatBadge count={insights.trafficConnections} label="Traffic" color="amber" />
            </div>
          </div>

          {/* Behavioral Insights Section */}
          <div className="px-4 py-3 bg-white border-b">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Behavioral Insights</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <InsightCard
                icon={Zap}
                label="Total Hits"
                value={insights.totalHits.toLocaleString()}
                subtext="Observed connections"
                color="emerald"
              />
              <InsightCard
                icon={Network}
                label="Unique Endpoints"
                value={insights.uniqueEndpoints}
                subtext="IPs & resources"
                color="blue"
              />
              <InsightCard
                icon={Shield}
                label="Unique Ports"
                value={insights.uniquePorts}
                subtext="Network ports used"
                color="violet"
              />
              <InsightCard
                icon={Clock}
                label="Last Activity"
                value={formatRelativeTime(insights.recentActivity)}
                subtext="Most recent traffic"
                color="amber"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex gap-1">
              {[
                { key: 'all', label: 'All', count: dependencies.inbound.length + dependencies.outbound.length },
                { key: 'traffic', label: 'Traffic', count: insights.trafficConnections },
                { key: 'access', label: 'IAM Access', count: insights.accessConnections },
                { key: 'infrastructure', label: 'Infrastructure', count: dependencies.inbound.length + dependencies.outbound.length - insights.trafficConnections - insights.accessConnections },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key as FilterType)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activeFilter === key
                      ? 'bg-white text-slate-900 shadow-sm font-medium'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
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
                  {filteredInbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredInbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No inbound connections</p>
                  </div>
                ) : (
                  filteredInbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="inbound" />
                  ))
                )}
              </div>
            </div>

            {/* Central Resource */}
            <div className="flex flex-col items-center justify-center px-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 border-t-2 border-dashed border-green-400" />
                <ArrowRight className="w-5 h-5 text-green-500" />
              </div>

              <div
                className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center shadow-lg border-4 border-white"
                style={{ backgroundColor: resourceColor }}
              >
                <Icon className="w-8 h-8 text-white mb-1" />
                <span className="text-[10px] text-white/90 font-medium">{selectedResource.type}</span>
              </div>

              <div className="mt-2 text-center max-w-[120px]">
                <div className="font-medium text-slate-800 text-xs truncate" title={selectedResource.name}>
                  {selectedResource.name}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <ArrowRight className="w-5 h-5 text-blue-500" />
                <div className="w-6 border-t-2 border-dashed border-blue-400" />
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
                  {filteredOutbound.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredOutbound.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No outbound connections</p>
                  </div>
                ) : (
                  filteredOutbound.map((conn, idx) => (
                    <ConnectionCard key={conn.id + '-' + idx} conn={conn} direction="outbound" />
                  ))
                )}
              </div>
            </div>
          </div>

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
            <div className="max-h-[180px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Direction</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Resource</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Port</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Relationship</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Hits</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allConnections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        {searchQuery ? 'No connections match your search' : 'No connections found'}
                      </td>
                    </tr>
                  ) : (
                    allConnections.map((conn, idx) => (
                      <tr key={conn.id + '-table-' + idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            conn.direction === 'inbound'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            <ArrowRight className={`w-3 h-3 ${conn.direction === 'inbound' ? 'rotate-180' : ''}`} />
                            {conn.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[150px] truncate" title={conn.name}>
                          {conn.name}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                            {conn.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{conn.port || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            conn.relationshipType === 'ACTUAL_TRAFFIC'
                              ? 'bg-emerald-100 text-emerald-700'
                              : conn.relationshipType === 'ACCESSES_RESOURCE'
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {conn.relationshipType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {conn.hitCount ? (
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-amber-500" />
                              {conn.hitCount}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {formatRelativeTime(conn.lastSeen)}
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
