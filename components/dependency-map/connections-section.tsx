"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowDownLeft, ArrowUpRight, Network, Shield, Loader2 } from "lucide-react"

interface Connection {
  source_id: string
  source_name: string
  target_id: string
  target_name: string
  port: number | string
  protocol: string
  direction: "inbound" | "outbound"
  traffic_bytes?: number
  last_seen?: string
  edge_type?: string
}

interface ConnectionsSectionProps {
  resourceId: string
  resourceName: string
}

function ConnectionsSection({ resourceId, resourceName }: ConnectionsSectionProps) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchConnections() {
      setLoading(true)
      setError(null)
      
      try {
        const cloudtrailOutbound: APICallGroup[] = []
        const networkConnections: NetworkConnection[] = []
        const inboundInvocations: InboundInvocation[] = []
        
        // PRIMARY: Use new Resource View API (A7 Patent - Neo4j connections)
        try {
          console.log('[ConnectionsSection] Fetching Resource View API for:', resourceId, resourceName)
          const resourceViewRes = await fetch(`/api/proxy/resource-view/${encodeURIComponent(resourceId)}/connections`)
          
          if (!resourceViewRes.ok) {
            const errorText = await resourceViewRes.text()
            console.warn('[ConnectionsSection] Resource View API returned error:', resourceViewRes.status, errorText)
            throw new Error(`Resource View API returned ${resourceViewRes.status}: ${errorText}`)
          }
          
          const viewData = await resourceViewRes.json()
          console.log('[ConnectionsSection] Resource View API response:', {
            success: viewData.success,
            inbound_count: viewData.inbound_count,
            outbound_count: viewData.outbound_count,
            connections: viewData.connections ? {
              inbound: viewData.connections.inbound?.length || 0,
              outbound: viewData.connections.outbound?.length || 0
            } : null
          })
          
          // Ensure we're accessing the nested connections structure correctly
          const connections = viewData.connections || {}
          console.log('[ConnectionsSection] Processing connections:', {
            hasConnections: !!viewData.connections,
            inboundCount: connections.inbound?.length || 0,
            outboundCount: connections.outbound?.length || 0,
            sampleInbound: connections.inbound?.[0] || null,
            sampleOutbound: connections.outbound?.[0] || null
          })
            
          // Process inbound connections
          (connections.inbound || []).forEach((conn: any) => {
            const rel = conn.relationship || {}
            const source = conn.source || {}
            
            // Network connections (ACTUAL_TRAFFIC)
            // Check both possible field names for relationship type
            const relType = rel.type || rel.relationship_type || ''
            console.log('[ConnectionsSection] Processing inbound connection:', {
              relType,
              source: source.name || source.id,
              port: rel.port,
              protocol: rel.protocol
            })
            if (relType === 'ACTUAL_TRAFFIC') {
              networkConnections.push({
                source_ip: source.name || source.id || '',
                dest_ip: resourceName,
                port: parseInt(rel.port) || 0,
                protocol: (rel.protocol || 'tcp').toLowerCase(),
                hits: rel.hit_count || 0,
                bytes: 0,
                resource_type: source.type || 'Unknown',
                resource_name: source.name || source.id || ''
              })
            }
            
            // API calls (ACTUAL_API_CALL)
            if (relType === 'ACTUAL_API_CALL') {
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
            if (relType === 'CALLS' || relType === 'INVOKES') {
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
            // Check both possible field names for relationship type
            const relType = rel.type || rel.relationship_type || ''
            console.log('[ConnectionsSection] Processing outbound connection:', {
              relType,
              target: target.name || target.id,
              port: rel.port,
              protocol: rel.protocol
            })
            if (relType === 'ACTUAL_TRAFFIC') {
              networkConnections.push({
                source_ip: resourceName,
                dest_ip: target.name || target.id || '',
                port: parseInt(rel.port) || 0,
                protocol: (rel.protocol || 'tcp').toLowerCase(),
                hits: rel.hit_count || 0,
                bytes: 0,
                resource_type: target.type || 'Unknown',
                resource_name: target.name || target.id || ''
              })
            }
            
            // API calls (ACTUAL_API_CALL)
            if (relType === 'ACTUAL_API_CALL') {
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
            outbound: connections.outbound?.length || 0,
            networkConnections: networkConnections.length,
            cloudtrailOutbound: cloudtrailOutbound.length,
            inboundInvocations: inboundInvocations.length
          })
        } catch (e) {
          console.error('[ConnectionsSection] Resource View API failed, falling back to legacy endpoints:', e)
          console.error('[ConnectionsSection] Error details:', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined
          })
        }
    }

    if (resourceId) {
      fetchConnections()
    }
  }, [resourceId, resourceName])

  const inboundConnections = connections.filter(c => c.direction === "inbound")
  const outboundConnections = connections.filter(c => c.direction === "outbound")

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading connections...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            Error: {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Network Connections
          <Badge variant="outline" className="ml-2">
            {connections.length} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No connection data found for this resource.
            <p className="text-sm mt-2">
              Traffic data is collected from VPC Flow Logs and CloudTrail.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">
                All ({connections.length})
              </TabsTrigger>
              <TabsTrigger value="inbound">
                <ArrowDownLeft className="h-4 w-4 mr-1" />
                Inbound ({inboundConnections.length})
              </TabsTrigger>
              <TabsTrigger value="outbound">
                <ArrowUpRight className="h-4 w-4 mr-1" />
                Outbound ({outboundConnections.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <ConnectionList connections={connections} />
            </TabsContent>

            <TabsContent value="inbound" className="mt-4">
              <ConnectionList connections={inboundConnections} />
            </TabsContent>

            <TabsContent value="outbound" className="mt-4">
              <ConnectionList connections={outboundConnections} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function ConnectionList({ connections }: { connections: Connection[] }) {
  if (connections.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No connections in this category.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {connections.map((conn, index) => (
        <div
          key={`${conn.source_id}-${conn.target_id}-${conn.port}-${index}`}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {conn.direction === "inbound" ? (
              <ArrowDownLeft className="h-4 w-4 text-green-500" />
            ) : (
              <ArrowUpRight className="h-4 w-4 text-blue-500" />
            )}
            <div>
              <div className="font-medium">
                {conn.direction === "inbound" ? conn.source_name : conn.target_name}
              </div>
              <div className="text-sm text-muted-foreground">
                {conn.direction === "inbound" 
                  ? `From: ${conn.source_id.substring(0, 40)}...`
                  : `To: ${conn.target_id.substring(0, 40)}...`
                }
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              Port {conn.port}
            </Badge>
            <Badge variant="outline">
              {conn.protocol}
            </Badge>
            {conn.edge_type === "ACTUAL_TRAFFIC" && (
              <Badge variant="default" className="bg-green-600">
                <Shield className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Default export for compatibility with resource-view.tsx
export default ConnectionsSection

// Also export as named export for flexibility
export { ConnectionsSection }
