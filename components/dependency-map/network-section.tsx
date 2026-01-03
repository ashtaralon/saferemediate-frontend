'use client'

import React, { useState, useEffect } from 'react'
import { Network, Shield, ChevronDown, ChevronRight, AlertTriangle, Globe, ArrowDown, ArrowUp, Box, Layers, Route, CheckCircle, XCircle } from 'lucide-react'

interface SecurityRule {
  protocol: string
  port_range: string
  source: string
  destination?: string
  is_used?: boolean
  traffic_count?: number
}

interface SecurityGroup {
  sg_id: string
  sg_name: string
  vpc_id?: string
  eni_count?: number
  inbound_rules: SecurityRule[]
  outbound_rules: SecurityRule[]
}

interface Subnet {
  subnet_id: string
  cidr_block: string
  availability_zone: string
  is_public: boolean
  name?: string
}

interface NACLRule {
  rule_number: number
  protocol: string
  port_range?: string
  cidr_block: string
  action: 'allow' | 'deny'
}

interface NACL {
  nacl_id: string
  name?: string
  vpc_id?: string
  inbound_rules: NACLRule[]
  outbound_rules: NACLRule[]
}

interface RouteEntry {
  destination: string
  target: string
  state?: string
}

interface RouteTable {
  rtb_id: string
  name?: string
  routes: RouteEntry[]
}

interface NetworkData {
  vpc?: {
    vpc_id: string
    cidr_block: string
    name?: string
  }
  subnets?: Subnet[]
  security_groups?: SecurityGroup[]
  nacls?: NACL[]
  route_tables?: RouteTable[]
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
  const [expanded, setExpanded] = useState(true)
  const [expandedSGs, setExpandedSGs] = useState<Set<string>>(new Set())
  const [expandedNACLs, setExpandedNACLs] = useState<Set<string>>(new Set())

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
              vpc_id: sgData.vpc_id,
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
                cidr_block: sgData.vpc_cidr || ''
              }
            }
            
            // Auto-expand this SG
            setExpandedSGs(new Set([sgData.sg_id || sgId]))
          }
        } else {
          // For other resource types, try to get VPC components
          const vpcRes = await fetch('/api/proxy/resources/vpc-components?region=eu-west-1')
          if (vpcRes.ok) {
            const vpcData = await vpcRes.json()
            
            // Get VPC info
            if (vpcData.vpcs?.length > 0) {
              const vpc = vpcData.vpcs[0]
              networkData.vpc = {
                vpc_id: vpc.vpc_id || vpc.VpcId,
                cidr_block: vpc.cidr_block || vpc.CidrBlock || '',
                name: vpc.name || vpc.Name
              }
            } else if (vpcData.nat_gateways?.length > 0) {
              const nat = vpcData.nat_gateways[0]
              networkData.vpc = {
                vpc_id: nat.vpc_id,
                cidr_block: ''
              }
            }
            
            // Get subnets
            if (vpcData.subnets?.length > 0) {
              networkData.subnets = vpcData.subnets.map((s: any) => ({
                subnet_id: s.subnet_id || s.SubnetId,
                cidr_block: s.cidr_block || s.CidrBlock,
                availability_zone: s.availability_zone || s.AvailabilityZone,
                is_public: s.is_public || s.MapPublicIpOnLaunch || false,
                name: s.name
              }))
            }
            
            // Get NACLs
            if (vpcData.nacls?.length > 0) {
              networkData.nacls = vpcData.nacls.map((n: any) => ({
                nacl_id: n.nacl_id || n.NetworkAclId,
                name: n.name,
                vpc_id: n.vpc_id || n.VpcId,
                inbound_rules: (n.entries || []).filter((e: any) => !e.Egress).map((e: any) => ({
                  rule_number: e.RuleNumber || e.rule_number,
                  protocol: e.Protocol || e.protocol || '-1',
                  cidr_block: e.CidrBlock || e.cidr_block || '0.0.0.0/0',
                  action: (e.RuleAction || e.action || 'allow').toLowerCase()
                })),
                outbound_rules: (n.entries || []).filter((e: any) => e.Egress).map((e: any) => ({
                  rule_number: e.RuleNumber || e.rule_number,
                  protocol: e.Protocol || e.protocol || '-1',
                  cidr_block: e.CidrBlock || e.cidr_block || '0.0.0.0/0',
                  action: (e.RuleAction || e.action || 'allow').toLowerCase()
                }))
              }))
            }
            
            // Get Route Tables
            if (vpcData.route_tables?.length > 0) {
              networkData.route_tables = vpcData.route_tables.map((r: any) => ({
                rtb_id: r.rtb_id || r.RouteTableId,
                name: r.name,
                routes: (r.routes || r.Routes || []).map((route: any) => ({
                  destination: route.destination || route.DestinationCidrBlock,
                  target: route.target || route.GatewayId || route.NatGatewayId || 'local',
                  state: route.state || route.State
                }))
              }))
            }
          }
        }
        
        setData(networkData)
        
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

  const toggleNACL = (naclId: string) => {
    const newExpanded = new Set(expandedNACLs)
    if (newExpanded.has(naclId)) {
      newExpanded.delete(naclId)
    } else {
      newExpanded.add(naclId)
    }
    setExpandedNACLs(newExpanded)
  }

  const getRiskIndicator = (source: string, isUsed?: boolean) => {
    if (source === '0.0.0.0/0') {
      return <span className="text-xs text-red-600 flex items-center gap-1"><Globe className="w-3 h-3" />RISK</span>
    }
    if (isUsed === false) {
      return <span className="text-xs text-amber-600">unused</span>
    }
    if (isUsed === true) {
      return <CheckCircle className="w-3 h-3 text-green-500" />
    }
    return null
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🌐 Network Configuration</h3>
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
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🌐 Network Configuration</h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const hasData = data?.vpc || data?.subnets?.length || data?.security_groups?.length || data?.nacls?.length || data?.route_tables?.length

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">🌐 Network Configuration</h3>
            <p className="text-sm text-slate-500">No network data found for this resource</p>
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
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg">🌐 Network Configuration</h3>
            <p className="text-sm text-slate-500">VPC, Security Groups, NACLs, Routes</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t pt-4 space-y-4">
          {/* VPC Info */}
          {data?.vpc && (
            <div className="p-4 bg-slate-50 rounded-lg border-l-4 border-blue-400">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Box className="w-4 h-4 text-blue-500" />
                VPC
              </div>
              <div className="ml-6">
                <div className="font-mono text-blue-600 text-sm">{data.vpc.vpc_id}</div>
                {data.vpc.cidr_block && (
                  <div className="text-slate-500 text-sm mt-1">
                    └── CIDR: <span className="font-mono">{data.vpc.cidr_block}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subnets */}
          {data?.subnets && data.subnets.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
                <Layers className="w-4 h-4" />
                Subnets ({data.subnets.length})
              </div>
              <div className="space-y-2 ml-4">
                {data.subnets.map((subnet, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border">
                    <div>
                      <span className="font-mono text-xs text-slate-600">{subnet.subnet_id}</span>
                      <div className="flex items-center gap-2 mt-1 text-slate-500 text-xs">
                        <span>├── CIDR: {subnet.cidr_block}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <span>├── Type: {subnet.is_public ? 'Public' : 'Private'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <span>└── AZ: {subnet.availability_zone}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      subnet.is_public ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {subnet.is_public ? 'public' : 'private'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Groups */}
          {data?.security_groups && data.security_groups.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Shield className="w-4 h-4 text-orange-500" />
                Security Groups ({data.security_groups.length})
              </div>
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
                      <span className="ml-2 text-xs text-slate-500 font-mono">({sg.sg_id})</span>
                    </div>
                    {sg.eni_count !== undefined && (
                      <span className="text-xs text-slate-500">{sg.eni_count} ENIs</span>
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
                        <div className="space-y-2 ml-4">
                          {sg.inbound_rules.length === 0 ? (
                            <div className="text-sm text-slate-500">No inbound rules</div>
                          ) : (
                            sg.inbound_rules.map((rule, i) => (
                              <div key={i} className={`flex items-center justify-between text-sm p-2.5 rounded-lg ${
                                rule.source === '0.0.0.0/0' ? 'bg-red-50 border border-red-200' : 'bg-white border'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">├──</span>
                                  <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded">
                                    {rule.protocol}:{rule.port_range}
                                  </span>
                                  <span className="text-slate-500">from</span>
                                  <span className={`font-mono text-xs ${rule.source === '0.0.0.0/0' ? 'text-red-600' : ''}`}>
                                    {rule.source}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {rule.traffic_count !== undefined && rule.traffic_count > 0 && (
                                    <span className="text-xs text-green-600">{rule.traffic_count.toLocaleString()} hits</span>
                                  )}
                                  {getRiskIndicator(rule.source, rule.is_used)}
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
                        <div className="space-y-2 ml-4">
                          {sg.outbound_rules.length === 0 ? (
                            <div className="text-sm text-slate-500">No outbound rules</div>
                          ) : (
                            sg.outbound_rules.map((rule, i) => (
                              <div key={i} className={`flex items-center justify-between text-sm p-2.5 rounded-lg ${
                                rule.destination === '0.0.0.0/0' ? 'bg-amber-50 border border-amber-200' : 'bg-white border'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">└──</span>
                                  <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded">
                                    {rule.protocol}:{rule.port_range}
                                  </span>
                                  <span className="text-slate-500">to</span>
                                  <span className="font-mono text-xs">{rule.destination}</span>
                                </div>
                                {rule.destination === '0.0.0.0/0' && (
                                  <span className="text-xs text-amber-600 flex items-center gap-1">⚠️</span>
                                )}
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
          {data?.nacls && data.nacls.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Layers className="w-4 h-4" />
                NACLs ({data.nacls.length})
              </div>
              {data.nacls.map((nacl) => (
                <div key={nacl.nacl_id} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleNACL(nacl.nacl_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    {expandedNACLs.has(nacl.nacl_id) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="font-mono text-sm">{nacl.nacl_id}</span>
                    {nacl.name && <span className="text-slate-500 text-sm">{nacl.name}</span>}
                  </button>
                  
                  {expandedNACLs.has(nacl.nacl_id) && (
                    <div className="border-t p-4 bg-slate-50">
                      {/* Inbound */}
                      <div className="mb-3">
                        <div className="text-xs font-medium text-slate-500 mb-2">Inbound Rules</div>
                        {nacl.inbound_rules.map((rule, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs mb-1">
                            <span className="text-slate-500">├──</span>
                            <span>Rule {rule.rule_number}:</span>
                            <span className={rule.action === 'allow' ? 'text-green-600' : 'text-red-600'}>
                              {rule.action.toUpperCase()}
                            </span>
                            <span className="font-mono">{rule.protocol === '-1' ? 'ALL' : rule.protocol}</span>
                            <span>from {rule.cidr_block}</span>
                          </div>
                        ))}
                      </div>
                      {/* Outbound */}
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-2">Outbound Rules</div>
                        {nacl.outbound_rules.map((rule, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs mb-1">
                            <span className="text-slate-500">└──</span>
                            <span>Rule {rule.rule_number}:</span>
                            <span className={rule.action === 'allow' ? 'text-green-600' : 'text-red-600'}>
                              {rule.action.toUpperCase()}
                            </span>
                            <span className="font-mono">{rule.protocol === '-1' ? 'ALL' : rule.protocol}</span>
                            <span>to {rule.cidr_block}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Route Tables */}
          {data?.route_tables && data.route_tables.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
                <Route className="w-4 h-4" />
                Route Tables ({data.route_tables.length})
              </div>
              <div className="space-y-3">
                {data.route_tables.map((rtb, i) => (
                  <div key={i} className="bg-white p-3 rounded-lg border">
                    <div className="font-mono text-xs text-slate-600 mb-2">{rtb.rtb_id}</div>
                    {rtb.routes.map((route, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs mt-1 text-slate-600">
                        <span className="text-slate-400">{j === rtb.routes.length - 1 ? '└──' : '├──'}</span>
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
      )}
    </div>
  )
}
