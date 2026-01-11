'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowDownLeft, ArrowUpRight, Server, Database, Key, Shield, Globe, Cloud, Layers,
  RefreshCw, ExternalLink, Network, CheckCircle, AlertTriangle, Info
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

interface DependencySummary {
  inbound: Connection[]
  outbound: Connection[]
  iamRoles: string[]
  securityGroups: string[]
  storage: string[]
  secrets: string[]
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

const RESOURCE_ICONS: Record<string, any> = {
  Lambda: Cloud,
  EC2: Server,
  RDS: Database,
  DynamoDB: Database,
  S3Bucket: Database,
  SecurityGroup: Shield,
  IAMRole: Key,
  Internet: Globe,
  default: Layers,
}

const RESOURCE_COLORS: Record<string, string> = {
  Lambda: 'bg-orange-500',
  EC2: 'bg-orange-500',
  RDS: 'bg-blue-600',
  DynamoDB: 'bg-blue-600',
  S3Bucket: 'bg-green-600',
  SecurityGroup: 'bg-purple-600',
  IAMRole: 'bg-green-600',
  Internet: 'bg-red-500',
  default: 'bg-slate-500',
}

export default function ResourceView({
  systemName,
  selectedResource,
  resources,
  resourcesLoading,
  onSelectResource,
  onBackToGraph
}: Props) {
  const [dependencies, setDependencies] = useState<DependencySummary>({
    inbound: [],
    outbound: [],
    iamRoles: [],
    securityGroups: [],
    storage: [],
    secrets: [],
    loading: true
  })

  // Fetch all dependency data for the selected resource
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
                id: source.id || source.arn || '',
                name: source.name || source.id || 'Unknown',
                type: source.type || 'Unknown',
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
                id: target.id || target.arn || '',
                name: target.name || target.id || 'Unknown',
                type: target.type || 'Unknown',
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
        let iamRoles: string[] = []
        try {
          const iamRes = await fetch(
            `/api/proxy/resource-view/${encodeURIComponent(selectedResource.id)}/iam`
          )
          if (iamRes.ok) {
            const iamData = await iamRes.json()
            iamRoles = (iamData.roles || []).map((r: any) => r.name || r.role_name || r.id)
          }
        } catch (e) {
          console.warn('Failed to fetch IAM data:', e)
        }

        setDependencies({
          inbound,
          outbound,
          iamRoles,
          securityGroups: [],
          storage: [],
          secrets: [],
          loading: false
        })
      } catch (err) {
        console.error('Failed to fetch dependencies:', err)
        setDependencies(prev => ({ ...prev, loading: false }))
      }
    }

    fetchDependencies()
  }, [selectedResource])

  const IconComponent = selectedResource
    ? RESOURCE_ICONS[selectedResource.type] || RESOURCE_ICONS.default
    : RESOURCE_ICONS.default

  const bgColor = selectedResource
    ? RESOURCE_COLORS[selectedResource.type] || RESOURCE_COLORS.default
    : RESOURCE_COLORS.default

  const totalConnections = dependencies.inbound.length + dependencies.outbound.length

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl border overflow-hidden">
      {/* Compact Header */}
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

        <button
          onClick={() => setDependencies(prev => ({ ...prev, loading: true }))}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedResource ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center mb-3">
              <Layers className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700 mb-1">Select a Resource</h3>
            <p className="text-sm text-slate-500">
              Choose a resource to view its dependencies
            </p>
          </div>
        ) : dependencies.loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-sm text-slate-500">Loading dependencies...</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-4">
            {/* Resource Header with Stats */}
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>
                    <IconComponent className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selectedResource.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600 font-medium">
                        {selectedResource.type}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500">{systemName}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{dependencies.inbound.length}</div>
                    <div className="text-xs text-slate-500">Inbound</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{dependencies.outbound.length}</div>
                    <div className="text-xs text-slate-500">Outbound</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{dependencies.iamRoles.length}</div>
                    <div className="text-xs text-slate-500">IAM Roles</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Dependency Flow */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Network className="w-4 h-4" />
                Dependency Flow
                {totalConnections > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                    {totalConnections} verified connections
                  </span>
                )}
              </h3>

              <div className="flex items-stretch gap-4 min-h-[200px]">
                {/* Inbound Column */}
                <div className="flex-1 bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowDownLeft className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      Inbound ({dependencies.inbound.length})
                    </span>
                  </div>

                  {dependencies.inbound.length === 0 ? (
                    <div className="text-center py-6 text-green-600/60 text-sm">
                      No inbound traffic observed
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {dependencies.inbound.map((conn, i) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-green-200 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="font-medium text-sm text-slate-800 truncate max-w-[150px]">
                                {conn.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">
                                {conn.port}
                              </span>
                              <span className="text-xs text-slate-400">{conn.protocol}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-slate-500">{conn.type}</span>
                            {conn.verified && (
                              <span className="flex items-center gap-0.5 text-xs text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Center - Resource */}
                <div className="flex flex-col items-center justify-center px-4">
                  <ArrowRight className="w-5 h-5 text-slate-300 mb-2" />
                  <div className={`w-20 h-20 rounded-2xl ${bgColor} flex items-center justify-center shadow-lg`}>
                    <IconComponent className="w-10 h-10 text-white" />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="font-semibold text-sm text-slate-800 max-w-[120px] truncate">
                      {selectedResource.name}
                    </div>
                    <div className="text-xs text-slate-500">{selectedResource.type}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300 mt-2" />
                </div>

                {/* Outbound Column */}
                <div className="flex-1 bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUpRight className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      Outbound ({dependencies.outbound.length})
                    </span>
                  </div>

                  {dependencies.outbound.length === 0 ? (
                    <div className="text-center py-6 text-blue-600/60 text-sm">
                      No outbound traffic observed
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {dependencies.outbound.map((conn, i) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              <span className="font-medium text-sm text-slate-800 truncate max-w-[150px]">
                                {conn.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">
                                {conn.port}
                              </span>
                              <span className="text-xs text-slate-400">{conn.protocol}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-slate-500">{conn.type}</span>
                            {conn.verified && (
                              <span className="flex items-center gap-0.5 text-xs text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Dependencies Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* IAM Roles */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-slate-700">IAM Roles</span>
                  <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {dependencies.iamRoles.length}
                  </span>
                </div>
                {dependencies.iamRoles.length === 0 ? (
                  <p className="text-xs text-slate-400">No IAM roles attached</p>
                ) : (
                  <div className="space-y-1.5">
                    {dependencies.iamRoles.slice(0, 5).map((role, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <span className="text-slate-600 truncate">{role}</span>
                      </div>
                    ))}
                    {dependencies.iamRoles.length > 5 && (
                      <div className="text-xs text-slate-400">
                        +{dependencies.iamRoles.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Security Groups */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-slate-700">Security Groups</span>
                  <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {dependencies.securityGroups.length}
                  </span>
                </div>
                {dependencies.securityGroups.length === 0 ? (
                  <p className="text-xs text-slate-400">No security groups</p>
                ) : (
                  <div className="space-y-1.5">
                    {dependencies.securityGroups.map((sg, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        <span className="text-slate-600 truncate">{sg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Storage */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-cyan-600" />
                  <span className="text-sm font-medium text-slate-700">Storage</span>
                  <span className="ml-auto text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                    {dependencies.storage.length}
                  </span>
                </div>
                {dependencies.storage.length === 0 ? (
                  <p className="text-xs text-slate-400">No storage resources</p>
                ) : (
                  <div className="space-y-1.5">
                    {dependencies.storage.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="text-slate-600 truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* All Connections Table */}
            {totalConnections > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Network className="w-4 h-4" />
                    All Connections
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Direction</th>
                        <th className="px-4 py-2 text-left font-medium">Resource</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Port</th>
                        <th className="px-4 py-2 text-left font-medium">Protocol</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...dependencies.inbound, ...dependencies.outbound].map((conn, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            {conn.direction === 'inbound' ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                Inbound
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Outbound
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{conn.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{conn.type}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 bg-slate-100 rounded font-mono text-xs">
                              {conn.port}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">{conn.protocol}</td>
                          <td className="px-4 py-2.5">
                            {conn.verified && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                <CheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {totalConnections === 0 && dependencies.iamRoles.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center">
                <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-medium text-slate-700 mb-1">No Dependencies Found</h3>
                <p className="text-sm text-slate-500">
                  No verified traffic connections or IAM dependencies were found for this resource.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
