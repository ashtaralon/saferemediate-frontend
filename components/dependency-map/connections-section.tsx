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
        console.log(`[ConnectionsSection] Fetching connections for: ${resourceId}`)
        
        const response = await fetch(`/api/proxy/resource-view/${encodeURIComponent(resourceId)}/connections`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch connections: ${response.status}`)
        }
        
        const data = await response.json()
        console.log(`[ConnectionsSection] Raw response:`, data)
        
        // Process connections from the API response
        const processedConnections: Connection[] = []
        
        // Process inbound connections (ACTUAL_TRAFFIC where this resource is target)
        if (data.inbound && Array.isArray(data.inbound)) {
          data.inbound.forEach((rel: any) => {
            processedConnections.push({
              source_id: rel.source_id || rel.sourceId || '',
              source_name: rel.source_name || rel.sourceName || rel.source_id || 'Unknown',
              target_id: resourceId,
              target_name: resourceName,
              port: typeof rel.port === 'string' ? parseInt(rel.port) || rel.port : (rel.port || 0),
              protocol: rel.protocol || 'TCP',
              direction: "inbound",
              traffic_bytes: rel.traffic_bytes || rel.trafficBytes || 0,
              last_seen: rel.last_seen || rel.lastSeen,
              edge_type: rel.edge_type || rel.edgeType || 'ACTUAL_TRAFFIC'
            })
          })
        }
        
        // Process outbound connections (ACTUAL_TRAFFIC where this resource is source)
        if (data.outbound && Array.isArray(data.outbound)) {
          data.outbound.forEach((rel: any) => {
            processedConnections.push({
              source_id: resourceId,
              source_name: resourceName,
              target_id: rel.target_id || rel.targetId || '',
              target_name: rel.target_name || rel.targetName || rel.target_id || 'Unknown',
              port: typeof rel.port === 'string' ? parseInt(rel.port) || rel.port : (rel.port || 0),
              protocol: rel.protocol || 'TCP',
              direction: "outbound",
              traffic_bytes: rel.traffic_bytes || rel.trafficBytes || 0,
              last_seen: rel.last_seen || rel.lastSeen,
              edge_type: rel.edge_type || rel.edgeType || 'ACTUAL_TRAFFIC'
            })
          })
        }
        
        console.log(`[ConnectionsSection] Processed ${processedConnections.length} connections:`, processedConnections)
        setConnections(processedConnections)
        
      } catch (err) {
        console.error('[ConnectionsSection] Error fetching connections:', err)
        setError(err instanceof Error ? err.message : 'Failed to load connections')
      } finally {
        setLoading(false)
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
