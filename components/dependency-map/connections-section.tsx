'use client'

import React, { useState, useEffect } from 'react'
import { Network, ArrowRight, Globe, Server, Database, AlertTriangle, Clock, Activity } from 'lucide-react'

interface Connection {
  id?: string
  source: string
  target: string
  target_type?: string
  port?: string | number
  protocol?: string
  hits?: number
  bytes_transferred?: number
  last_seen?: string
  is_external?: boolean
  type?: 'internal' | 'external' | 'internet'
}

interface ConnectionsData {
  outbound: Connection[]
  inbound: Connection[]
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
  const [activeTab, setActiveTab] = useState<'outbound' | 'inbound'>('outbound')

  useEffect(() => {
    const fetchConnectionsData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch traffic graph
        const trafficRes = await fetch('/api/proxy/traffic-graph/full')
        
        const outbound: Connection[] = []
        const inbound: Connection[] = []
        
        if (trafficRes.ok) {
          const trafficData = await trafficRes.json()
          const edges = trafficData.edges || []
          
          // Filter edges related to this resource
          edges.forEach((e: any) => {
            const sourceName = e.source_name || e.source
            const targetName = e.target_name || e.target
            
            // Check if this resource is the source (outbound)
            if (sourceName?.toLowerCase().includes(resourceName.toLowerCase()) ||
                e.source === resourceId) {
              outbound.push({
                id: e.id,
                source: sourceName,
                target: targetName,
                target_type: e.target_type,
                port: e.port,
                protocol: e.protocol || 'tcp',
                hits: e.connection_count || e.hits || e.traffic_bytes,
                bytes_transferred: e.bytes_transferred,
                is_external: e.type === 'internet' || targetName?.toLowerCase().includes('internet'),
                type: e.type === 'internet' ? 'external' : 'internal'
              })
            }
            
            // Check if this resource is the target (inbound)
            if (targetName?.toLowerCase().includes(resourceName.toLowerCase()) ||
                e.target === resourceId) {
              inbound.push({
                id: e.id,
                source: sourceName,
                target: targetName,
                target_type: e.source_type,
                port: e.port,
                protocol: e.protocol || 'tcp',
                hits: e.connection_count || e.hits || e.traffic_bytes,
                bytes_transferred: e.bytes_transferred,
                is_external: e.type === 'internet' || sourceName?.toLowerCase().includes('internet'),
                type: e.type === 'internet' ? 'external' : 'internal'
              })
            }
          })
        }
        
        // If it's a Security Group, also try to get observed traffic
        if (resourceType === 'SecurityGroup') {
          const sgId = resourceId.startsWith('sg-') ? resourceId : resourceName
          try {
            const obsRes = await fetch(`/api/proxy/least-privilege/debug/observed-traffic/${sgId}`)
            if (obsRes.ok) {
              const obsData = await obsRes.json()
              const traffic = obsData.traffic || obsData.observed_traffic || []
              
              traffic.forEach((t: any) => {
                // These are typically inbound connections
                const existing = inbound.find(c => c.port === t.port && c.source === t.source_ip)
                if (!existing) {
                  inbound.push({
                    source: t.source_ip,
                    target: resourceName,
                    port: t.port,
                    protocol: t.protocol || 'tcp',
                    hits: t.connection_count || t.packets,
                    bytes_transferred: t.bytes,
                    is_external: t.source_ip?.startsWith('0.0.0.0') || false,
                    type: 'internal'
                  })
                }
              })
            }
          } catch (e) {
            // Ignore - optional data
          }
        }
        
        setData({ outbound, inbound })
        
        // Set default tab based on data
        if (outbound.length === 0 && inbound.length > 0) {
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

  const getTargetIcon = (type?: string, isExternal?: boolean) => {
    if (isExternal) return <Globe className="w-4 h-4 text-red-500" />
    if (type?.toLowerCase().includes('rds') || type?.toLowerCase().includes('database')) {
      return <Database className="w-4 h-4 text-blue-500" />
    }
    return <Server className="w-4 h-4 text-slate-500" />
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Connections</h3>
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Connections</h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const totalConnections = (data?.outbound?.length || 0) + (data?.inbound?.length || 0)

  if (totalConnections === 0) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Connections</h3>
            <p className="text-sm text-slate-500">No connection data found from VPC Flow Logs or CloudTrail</p>
          </div>
        </div>
      </div>
    )
  }

  const currentConnections = activeTab === 'outbound' ? data?.outbound : data?.inbound

  return (
    <div className="bg-white rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Connections</h3>
            <p className="text-sm text-slate-500">From VPC Flow Logs & CloudTrail</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-slate-600">{totalConnections} total</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('outbound')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'outbound'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Outbound ({data?.outbound?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('inbound')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'inbound'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Inbound ({data?.inbound?.length || 0})
        </button>
      </div>

      {/* Connection List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {currentConnections?.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No {activeTab} connections found
          </div>
        ) : (
          currentConnections?.map((conn, i) => (
            <div key={conn.id || i} className={`p-3 rounded-lg border ${
              conn.is_external ? 'bg-red-50 border-red-200' : 'bg-slate-50'
            }`}>
              <div className="flex items-center gap-3">
                {/* Source/Target Icon */}
                {getTargetIcon(conn.target_type, conn.is_external)}
                
                {/* Connection Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    {activeTab === 'outbound' ? (
                      <>
                        <span className="truncate max-w-[120px] font-medium">{resourceName}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className={`truncate max-w-[180px] ${conn.is_external ? 'text-red-600' : ''}`}>
                          {conn.target}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`truncate max-w-[120px] ${conn.is_external ? 'text-red-600' : ''}`}>
                          {conn.source}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="truncate max-w-[180px] font-medium">{resourceName}</span>
                      </>
                    )}
                  </div>
                  
                  {/* Port & Protocol */}
                  <div className="flex items-center gap-3 mt-1">
                    {conn.port && (
                      <span className="text-xs font-mono px-2 py-0.5 bg-white border rounded">
                        {conn.protocol}:{conn.port}
                      </span>
                    )}
                    {conn.is_external && (
                      <span className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        External
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Traffic Stats */}
                <div className="text-right text-xs text-slate-500">
                  {conn.hits !== undefined && conn.hits > 0 && (
                    <div className="font-semibold text-green-600">{conn.hits.toLocaleString()} hits</div>
                  )}
                  {conn.bytes_transferred !== undefined && conn.bytes_transferred > 0 && (
                    <div>{formatBytes(conn.bytes_transferred)}</div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

