'use client'

import React, { useState, useEffect } from 'react'
import { Network, Shield, ChevronDown, ChevronRight, AlertTriangle, Globe, ArrowDown, ArrowUp, Box } from 'lucide-react'

interface NetworkData {
  vpc?: {
    vpc_id: string
    cidr_block: string
    name?: string
  }
  subnets?: {
    subnet_id: string
    cidr_block: string
    availability_zone: string
    is_public: boolean
    name?: string
  }[]
  security_groups?: {
    sg_id: string
    sg_name: string
    inbound_rules: {
      protocol: string
      port_range: string
      source: string
      is_used?: boolean
      traffic_count?: number
    }[]
    outbound_rules: {
      protocol: string
      port_range: string
      destination: string
      is_used?: boolean
    }[]
    eni_count?: number
  }[]
  nacls?: {
    nacl_id: string
    name?: string
    inbound_rules: any[]
    outbound_rules: any[]
  }[]
  route_tables?: {
    rtb_id: string
    name?: string
    routes: {
      destination: string
      target: string
    }[]
  }[]
}

interface Props {
  resourceId: string
  resourceType: string
  resourceName: string
}

export default function NetworkSection({ resourceId, resourceType, resourceName }: Props) {
  const [data, setData] = useState<NetworkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSGs, setExpandedSGs] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchNetworkData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const networkData: NetworkData = {}
        
        // If it's a Security Group, fetch its gap analysis directly
        if (resourceType === 'SecurityGroup') {
          const sgId = resourceId.startsWith('sg-') ? resourceId : resourceName
          const sgRes = await fetch(`/api/proxy/security-groups/${sgId}/gap-analysis?days=365`)
          
          if (sgRes.ok) {
            const sgData = await sgRes.json()
            networkData.security_groups = [{
              sg_id: sgData.sg_id || sgId,
              sg_name: sgData.sg_name || resourceName,
              eni_count: sgData.eni_count || 0,
              inbound_rules: (sgData.rules_analysis || []).filter((r: any) => r.direction === 'inbound').map((r: any) => ({
                protocol: r.protocol || 'tcp',
                port_range: r.port_range,
                source: r.source,
                is_used: r.is_used,
                traffic_count: r.traffic?.connection_count || 0
              })),
              outbound_rules: (sgData.rules_analysis || []).filter((r: any) => r.direction === 'outbound').map((r: any) => ({
                protocol: r.protocol || 'tcp',
                port_range: r.port_range,
                destination: r.destination || r.source,
                is_used: r.is_used
              }))
            }]
            
            if (sgData.vpc_id) {
              networkData.vpc = {
                vpc_id: sgData.vpc_id,
                cidr_block: ''
              }
            }
          }
        } else {
          // For other resource types, try to get VPC components
          const vpcRes = await fetch('/api/proxy/resources/vpc-components?region=eu-west-1')
          if (vpcRes.ok) {
            const vpcData = await vpcRes.json()
            
            // Get NAT/IGW info
            if (vpcData.nat_gateways?.length > 0) {
              const nat = vpcData.nat_gateways[0]
              networkData.vpc = {
                vpc_id: nat.vpc_id,
                cidr_block: ''
              }
            }
          }
        }
        
        setData(networkData)
        
        // Auto-expand the first SG if there's one
        if (networkData.security_groups?.[0]) {
          setExpandedSGs(new Set([networkData.security_groups[0].sg_id]))
        }
        
      } catch (e) {
        console.error('Network fetch error:', e)
        setError('Unable to load network data')
      } finally {
        setLoading(false)
      }
    }
    
    fetchNetworkData()
  }, [resourceId, resourceType, resourceName])

  const toggleSG = (sgId: string) => {
    const newExpanded = new Set(expandedSGs)
    if (newExpanded.has(sgId)) {
      newExpanded.delete(sgId)
    } else {
      newExpanded.add(sgId)
    }
    setExpandedSGs(newExpanded)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Network Configuration</h3>
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

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Network Configuration</h3>
            <p className="text-sm text-slate-500">{error || 'No network data found'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
          <Network className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Network Configuration</h3>
          <p className="text-sm text-slate-500">VPC, Security Groups, NACLs, Routes</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* VPC Info */}
        {data.vpc && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <Box className="w-4 h-4" />
              VPC
            </div>
            <div className="text-sm">
              <span className="font-mono text-blue-600">{data.vpc.vpc_id}</span>
              {data.vpc.cidr_block && (
                <span className="ml-2 text-slate-500">({data.vpc.cidr_block})</span>
              )}
            </div>
          </div>
        )}

        {/* Subnets */}
        {data.subnets && data.subnets.length > 0 && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
              Subnets ({data.subnets.length})
            </div>
            <div className="space-y-2">
              {data.subnets.map((subnet, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                  <div>
                    <span className="font-mono text-xs">{subnet.subnet_id}</span>
                    <span className="ml-2 text-slate-500">{subnet.cidr_block}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{subnet.availability_zone}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      subnet.is_public ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {subnet.is_public ? 'public' : 'private'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Groups */}
        {data.security_groups && data.security_groups.length > 0 && (
          <div className="space-y-2">
            {data.security_groups.map((sg) => (
              <div key={sg.sg_id} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSG(sg.sg_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  {expandedSGs.has(sg.sg_id) ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <Shield className="w-4 h-4 text-orange-500" />
                  <div className="flex-1 text-left">
                    <span className="font-medium">{sg.sg_name}</span>
                    <span className="ml-2 text-xs text-slate-500 font-mono">{sg.sg_id}</span>
                  </div>
                  {sg.eni_count !== undefined && (
                    <span className="text-xs text-slate-500">{sg.eni_count} ENIs attached</span>
                  )}
                </button>
                
                {expandedSGs.has(sg.sg_id) && (
                  <div className="border-t divide-y">
                    {/* Inbound Rules */}
                    <div className="p-4 bg-green-50/50">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-700 mb-3">
                        <ArrowDown className="w-4 h-4" />
                        Inbound Rules ({sg.inbound_rules.length})
                      </div>
                      <div className="space-y-2">
                        {sg.inbound_rules.length === 0 ? (
                          <div className="text-sm text-slate-500">No inbound rules</div>
                        ) : (
                          sg.inbound_rules.map((rule, i) => (
                            <div key={i} className={`flex items-center justify-between text-sm p-2 rounded ${
                              rule.source === '0.0.0.0/0' ? 'bg-red-50 border border-red-200' : 'bg-white border'
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded">
                                  {rule.protocol}:{rule.port_range}
                                </span>
                                <span className="text-slate-500">from</span>
                                <span className={`font-mono text-xs ${rule.source === '0.0.0.0/0' ? 'text-red-600' : ''}`}>
                                  {rule.source}
                                </span>
                                {rule.source === '0.0.0.0/0' && (
                                  <Globe className="w-3 h-3 text-red-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {rule.traffic_count !== undefined && rule.traffic_count > 0 && (
                                  <span className="text-xs text-green-600">{rule.traffic_count.toLocaleString()} hits</span>
                                )}
                                {rule.is_used !== undefined && (
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    rule.is_used ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {rule.is_used ? 'used' : 'unused'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    
                    {/* Outbound Rules */}
                    <div className="p-4 bg-blue-50/50">
                      <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-3">
                        <ArrowUp className="w-4 h-4" />
                        Outbound Rules ({sg.outbound_rules.length})
                      </div>
                      <div className="space-y-2">
                        {sg.outbound_rules.length === 0 ? (
                          <div className="text-sm text-slate-500">No outbound rules</div>
                        ) : (
                          sg.outbound_rules.map((rule, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded">
                                  {rule.protocol}:{rule.port_range}
                                </span>
                                <span className="text-slate-500">to</span>
                                <span className="font-mono text-xs">{rule.destination}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* NACLs */}
        {data.nacls && data.nacls.length > 0 && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
              NACLs ({data.nacls.length})
            </div>
            <div className="space-y-2">
              {data.nacls.map((nacl, i) => (
                <div key={i} className="bg-white p-2 rounded border text-sm">
                  <span className="font-mono text-xs">{nacl.nacl_id}</span>
                  {nacl.name && <span className="ml-2 text-slate-500">{nacl.name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Route Tables */}
        {data.route_tables && data.route_tables.length > 0 && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
              Route Tables ({data.route_tables.length})
            </div>
            <div className="space-y-2">
              {data.route_tables.map((rtb, i) => (
                <div key={i} className="bg-white p-3 rounded border">
                  <div className="font-mono text-xs text-slate-600 mb-2">{rtb.rtb_id}</div>
                  {rtb.routes.map((route, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs mt-1">
                      <span className="font-mono">{route.destination}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-mono text-blue-600">{route.target}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


