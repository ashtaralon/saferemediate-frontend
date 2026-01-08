'use client'

import React, { useState, useEffect } from 'react'
import { Network, ArrowRight, Globe, Server, Database, AlertTriangle, Clock, Activity, ChevronDown, ChevronRight, Cloud, Key, HardDrive, Lock, Zap } from 'lucide-react'

interface APICallGroup {
  service: string
  resource_name: string
  actions: { action: string; count: number }[]
  total_calls: number
}

interface NetworkConnection {
  source_ip: string
  dest_ip: string
  port: number
  protocol: string
  hits: number
  bytes: number
  resource_type?: string
  resource_name?: string
}

interface InboundInvocation {
  source_type: string
  source_name: string
  invocations: number
}

interface ConnectionsData {
  cloudtrail_outbound: APICallGroup[]
  network_connections: NetworkConnection[]
  inbound_invocations: InboundInvocation[]
}

interface Props {
  resourceId: string
  resourceType: string
  resourceName: string
}

export default function ConnectionsSection({ resourceId, resourceType, resourceName }: Props) {
  const [data, setData] = useState<ConnectionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<'outbound' | 'network' | 'inbound'>('outbound')

  useEffect(() => {
    const fetchConnectionsData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const cloudtrailOutbound: APICallGroup[] = []
        const networkConnections: NetworkConnection[] = []
        const inboundInvocations: InboundInvocation[] = []
        
        // PRIMARY: Use new Resource View API (A7 Patent - Neo4j connections)
        try {
          const resourceViewRes = await fetch(`/api/proxy/resource-view/${encodeURIComponent(resourceId)}/connections`)
          if (resourceViewRes.ok) {
            const viewData = await resourceViewRes.json()
            const connections = viewData.connections || {}
            
            // Process inbound connections
            (connections.inbound || []).forEach((conn: any) => {
              const rel = conn.relationship || {}
              const source = conn.source || {}
              
              // Network connections (ACTUAL_TRAFFIC)
              if (rel.type === 'ACTUAL_TRAFFIC') {
                networkConnections.push({
                  source_ip: source.name || source.id || '',
                  dest_ip: resourceName,
                  port: rel.port || 0,
                  protocol: (rel.protocol || 'tcp').toLowerCase(),
                  hits: rel.hit_count || 0,
                  bytes: 0,
                  resource_type: source.type || 'Unknown',
                  resource_name: source.name || source.id || ''
                })
              }
              
              // API calls (ACTUAL_API_CALL)
              if (rel.type === 'ACTUAL_API_CALL') {
                const service = rel.service || 'Unknown'
                const action = rel.action || 'Unknown'
                
                let existing = cloudtrailOutbound.find(c => c.service === service && c.resource_name === service)
                if (!existing) {
                  existing = {
                    service,
                    resource_name: service,
                    actions: [],
                    total_calls: 0
                  }
                  cloudtrailOutbound.push(existing)
                }
                
                const actionEntry = existing.actions.find(a => a.action === action)
                if (actionEntry) {
                  actionEntry.count += rel.hit_count || 1
                } else {
                  existing.actions.push({
                    action,
                    count: rel.hit_count || 1
                  })
                }
                existing.total_calls += rel.hit_count || 1
              }
              
              // Inbound invocations (CALLS, INVOKES)
              if (rel.type === 'CALLS' || rel.type === 'INVOKES') {
                const existing = inboundInvocations.find(i => i.source_name === source.name)
                if (existing) {
                  existing.invocations += rel.call_count || rel.hit_count || 1
                } else {
                  inboundInvocations.push({
                    source_type: source.type || 'Unknown',
                    source_name: source.name || source.id || '',
                    invocations: rel.call_count || rel.hit_count || 1
                  })
                }
              }
            })
            
            // Process outbound connections
            (connections.outbound || []).forEach((conn: any) => {
              const rel = conn.relationship || {}
              const target = conn.target || {}
              
              // Network connections (ACTUAL_TRAFFIC)
              if (rel.type === 'ACTUAL_TRAFFIC') {
                networkConnections.push({
                  source_ip: resourceName,
                  dest_ip: target.name || target.id || '',
                  port: rel.port || 0,
                  protocol: (rel.protocol || 'tcp').toLowerCase(),
                  hits: rel.hit_count || 0,
                  bytes: 0,
                  resource_type: target.type || 'Unknown',
                  resource_name: target.name || target.id || ''
                })
              }
              
              // API calls (ACTUAL_API_CALL)
              if (rel.type === 'ACTUAL_API_CALL') {
                const service = rel.service || target.type || 'Unknown'
                const action = rel.action || 'Unknown'
                
                let existing = cloudtrailOutbound.find(c => c.service === service && c.resource_name === target.name)
                if (!existing) {
                  existing = {
                    service,
                    resource_name: target.name || service,
                    actions: [],
                    total_calls: 0
                  }
                  cloudtrailOutbound.push(existing)
                }
                
                const actionEntry = existing.actions.find(a => a.action === action)
                if (actionEntry) {
                  actionEntry.count += rel.hit_count || 1
                } else {
                  existing.actions.push({
                    action,
                    count: rel.hit_count || 1
                  })
                }
                existing.total_calls += rel.hit_count || 1
              }
            })
            
            // Sort CloudTrail outbound by total calls
            cloudtrailOutbound.sort((a, b) => b.total_calls - a.total_calls)
            
            console.log('[ConnectionsSection] Resource View API data loaded:', {
              inbound: connections.inbound?.length || 0,
              outbound: connections.outbound?.length || 0
            })
          }
        } catch (e) {
          console.warn('[ConnectionsSection] Resource View API failed, falling back to legacy endpoints:', e)
        }
        
        // FALLBACK: Legacy endpoints (if Resource View API didn't return enough data)
        if (networkConnections.length === 0 && cloudtrailOutbound.length === 0) {
          // Fetch CloudTrail events for this resource
          try {
            const ctRes = await fetch(`/api/proxy/cloudtrail/events?roleName=${encodeURIComponent(resourceName)}&lookbackDays=30&limit=1000`)
            if (ctRes.ok) {
              const ctData = await ctRes.json()
              const events = ctData.events || []
              
              // Group events by service and resource
              const groupedByService: Record<string, Record<string, Record<string, number>>> = {}
              
              events.forEach((e: any) => {
                const eventSource = e.eventSource || ''
                const eventName = e.eventName || ''
                const requestParams = e.requestParameters || {}
                
                // Extract service name
                const service = eventSource.replace('.amazonaws.com', '').toUpperCase()
                
                // Extract resource name
                let resourceTarget = ''
                if (service === 'DYNAMODB') {
                  resourceTarget = requestParams.tableName || 'Unknown Table'
                } else if (service === 'S3') {
                  resourceTarget = requestParams.bucketName || 'Unknown Bucket'
                } else if (service === 'SECRETSMANAGER') {
                  resourceTarget = requestParams.secretId || 'Unknown Secret'
                } else if (service === 'KMS') {
                  resourceTarget = requestParams.keyId || 'Unknown Key'
                } else {
                  resourceTarget = service
                }
                
                if (!groupedByService[service]) {
                  groupedByService[service] = {}
                }
                if (!groupedByService[service][resourceTarget]) {
                  groupedByService[service][resourceTarget] = {}
                }
                if (!groupedByService[service][resourceTarget][eventName]) {
                  groupedByService[service][resourceTarget][eventName] = 0
                }
                groupedByService[service][resourceTarget][eventName]++
              })
              
              // Convert to array format
              Object.entries(groupedByService).forEach(([service, resources]) => {
                Object.entries(resources).forEach(([resourceTarget, actions]) => {
                  const actionsList = Object.entries(actions).map(([action, count]) => ({
                    action,
                    count
                  })).sort((a, b) => b.count - a.count)
                  
                  cloudtrailOutbound.push({
                    service,
                    resource_name: resourceTarget,
                    actions: actionsList,
                    total_calls: actionsList.reduce((sum, a) => sum + a.count, 0)
                  })
                })
              })
              
              // Sort by total calls
              cloudtrailOutbound.sort((a, b) => b.total_calls - a.total_calls)
            }
          } catch (e) {
            console.error('CloudTrail fetch error:', e)
          }
        }
        
        setData({
          cloudtrail_outbound: cloudtrailOutbound,
          network_connections: networkConnections,
          inbound_invocations: inboundInvocations
        })
        
        // Set default tab based on data
        if (cloudtrailOutbound.length === 0 && networkConnections.length > 0) {
          setActiveTab('network')
        } else if (cloudtrailOutbound.length === 0 && networkConnections.length === 0 && inboundInvocations.length > 0) {
          setActiveTab('inbound')
        }
        
      } catch (e) {
        console.error('Connections fetch error:', e)
        setError('Unable to load connections data')
      } finally {
        setLoading(false)
      }
    }
    
    fetchConnectionsData()
  }, [resourceId, resourceType, resourceName])

  const formatBytes = (bytes?: number) => {
    if (!bytes) return ''
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const getServiceIcon = (service: string) => {
    switch (service.toLowerCase()) {
      case 'dynamodb': return <Database className="w-4 h-4 text-amber-500" />
      case 's3': return <HardDrive className="w-4 h-4 text-green-500" />
      case 'secretsmanager': return <Lock className="w-4 h-4 text-purple-500" />
      case 'kms': return <Key className="w-4 h-4 text-emerald-500" />
      case 'lambda': return <Zap className="w-4 h-4 text-orange-500" />
      default: return <Cloud className="w-4 h-4 text-blue-500" />
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">📡 Connections</h3>
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-8 bg-slate-100 rounded animate-pulse" />
          <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">📡 Connections</h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const totalOutbound = data?.cloudtrail_outbound?.length || 0
  const totalNetwork = data?.network_connections?.length || 0
  const totalInbound = data?.inbound_invocations?.length || 0
  const totalConnections = totalOutbound + totalNetwork + totalInbound

  if (totalConnections === 0) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">📡 Connections</h3>
            <p className="text-sm text-slate-500">No connection data found from CloudTrail or VPC Flow Logs</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header - Collapsible */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg">📡 Connections</h3>
            <p className="text-sm text-slate-500">From CloudTrail & VPC Flow Logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-slate-600">{totalConnections} connections</span>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t pt-4">
          {/* Tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setActiveTab('outbound')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'outbound'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Outbound API Calls ({totalOutbound})
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'network'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Network ({totalNetwork})
            </button>
            <button
              onClick={() => setActiveTab('inbound')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'inbound'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Inbound ({totalInbound})
            </button>
          </div>

          {/* Outbound API Calls (CloudTrail) */}
          {activeTab === 'outbound' && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {data?.cloudtrail_outbound.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No outbound API calls found in CloudTrail
                </div>
              ) : (
                data?.cloudtrail_outbound.map((group, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-lg border-l-4 border-indigo-400">
                    <div className="flex items-center gap-3 mb-3">
                      {getServiceIcon(group.service)}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{group.service}: {group.resource_name}</div>
                      </div>
                      <span className="text-xs text-slate-500">{group.total_calls.toLocaleString()} calls</span>
                    </div>
                    <div className="ml-7 flex flex-wrap gap-2">
                      {group.actions.slice(0, 6).map((action, j) => (
                        <span key={j} className="px-2 py-1 bg-white border rounded text-xs font-mono flex items-center gap-1">
                          {action.action}
                          <span className="text-indigo-600 font-semibold">({action.count})</span>
                        </span>
                      ))}
                      {group.actions.length > 6 && (
                        <span className="px-2 py-1 text-slate-500 text-xs">
                          +{group.actions.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Network Connections (VPC Flow Logs) */}
          {activeTab === 'network' && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                <Activity className="w-3 h-3" />
                From VPC Flow Logs
              </div>
              {data?.network_connections.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No network connections found in VPC Flow Logs
                </div>
              ) : (
                data?.network_connections.map((conn, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${
                    conn.source_ip?.includes('0.0.0.0') || conn.dest_ip?.includes('0.0.0.0')
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      {conn.source_ip?.startsWith('0.0.0.0') || conn.dest_ip?.includes('external') ? (
                        <Globe className="w-4 h-4 text-red-500" />
                      ) : conn.resource_type?.toLowerCase().includes('rds') ? (
                        <Database className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Server className="w-4 h-4 text-slate-500" />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs truncate max-w-[120px]">{conn.source_ip}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="font-mono text-xs truncate max-w-[120px]">{conn.dest_ip}</span>
                          {conn.port > 0 && (
                            <span className="text-xs text-slate-500">:{conn.port}</span>
                          )}
                        </div>
                        {conn.resource_name && (
                          <div className="text-xs text-slate-500 mt-1">
                            └── {conn.resource_name}
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right text-xs">
                        {conn.hits > 0 && (
                          <div className="text-green-600 font-semibold">{conn.hits.toLocaleString()} connections</div>
                        )}
                        {conn.bytes > 0 && (
                          <div className="text-slate-400">{formatBytes(conn.bytes)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Inbound Invocations */}
          {activeTab === 'inbound' && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <div className="text-xs text-slate-500 mb-3">
                Who calls this resource
              </div>
              {data?.inbound_invocations.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No inbound invocations found
                </div>
              ) : (
                data?.inbound_invocations.map((inv, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg border flex items-center gap-3">
                    {inv.source_type.toLowerCase().includes('api') ? (
                      <Cloud className="w-4 h-4 text-blue-500" />
                    ) : inv.source_type.toLowerCase().includes('event') ? (
                      <Zap className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Server className="w-4 h-4 text-slate-500" />
                    )}
                    
                    <div className="flex-1">
                      <div className="font-medium text-sm">{inv.source_type}: {inv.source_name}</div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm font-semibold text-indigo-600">
                        {inv.invocations.toLocaleString()} invocations
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
