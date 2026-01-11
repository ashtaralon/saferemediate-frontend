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
  hit_count?: number
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
        // Defensive: ensure resourceId is a string, not an object
        let safeResourceId = resourceId
        if (typeof resourceId === 'object' && resourceId !== null) {
          // Try to extract id from object if it's passed incorrectly
          safeResourceId = (resourceId as any).id || (resourceId as any).arn || String(resourceId)
          console.warn("[ConnectionsSection] resourceId was an object, extracted:", safeResourceId)
        }

        console.log("[ConnectionsSection] Fetching connections for:", safeResourceId)

        // CORRECT fetch syntax with template literal
        const response = await fetch(
          `/api/proxy/resource-view/${encodeURIComponent(safeResourceId)}/connections`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch connections: ${response.status}`)
        }

        const data = await response.json()
        console.log("[ConnectionsSection] Raw response:", data)

        // Process the nested structure: data.connections.inbound and data.connections.outbound
        const connections = data.connections || {}
        console.log("[ConnectionsSection] Processing connections:", {
          hasConnections: !!data.connections,
          inboundCount: connections.inbound?.length || 0,
          outboundCount: connections.outbound?.length || 0,
          sampleInbound: connections.inbound?.[0] || null,
          sampleOutbound: connections.outbound?.[0] || null
        })

        const processedConnections: Connection[] = []

        // Process inbound connections
        ;(connections.inbound || []).forEach((conn: any) => {
          const rel = conn.relationship || {}
          const source = conn.source || {}
          const relType = rel.type || rel.relationship_type || ""
          
          console.log("[ConnectionsSection] Processing inbound connection:", {
            relType,
            source: source.name || source.id,
            port: rel.port,
            protocol: rel.protocol
          })

          if (relType === "ACTUAL_TRAFFIC") {
            processedConnections.push({
              source_id: source.id || source.arn || "",
              source_name: source.name || source.id || "Unknown",
              target_id: resourceId,
              target_name: resourceName,
              port: parseInt(rel.port) || 0,
              protocol: (rel.protocol || "TCP").toUpperCase(),
              direction: "inbound",
              traffic_bytes: rel.traffic_bytes || rel.bytes_transferred || 0,
              last_seen: rel.last_seen,
              edge_type: "ACTUAL_TRAFFIC",
              hit_count: rel.hit_count || 0
            })
          }
        })

        // Process outbound connections
        ;(connections.outbound || []).forEach((conn: any) => {
          const rel = conn.relationship || {}
          const target = conn.target || {}
          const relType = rel.type || rel.relationship_type || ""
          
          console.log("[ConnectionsSection] Processing outbound connection:", {
            relType,
            target: target.name || target.id,
            port: rel.port,
            protocol: rel.protocol
          })

          if (relType === "ACTUAL_TRAFFIC") {
            processedConnections.push({
              source_id: resourceId,
              source_name: resourceName,
              target_id: target.id || target.arn || "",
              target_name: target.name || target.id || "Unknown",
              port: parseInt(rel.port) || 0,
              protocol: (rel.protocol || "TCP").toUpperCase(),
              direction: "outbound",
              traffic_bytes: rel.traffic_bytes || rel.bytes_transferred || 0,
              last_seen: rel.last_seen,
              edge_type: "ACTUAL_TRAFFIC",
              hit_count: rel.hit_count || 0
            })
          }
        })

        console.log(
          `[ConnectionsSection] Processed ${processedConnections.length} ACTUAL_TRAFFIC connections:`,
          processedConnections
        )
        setConnections(processedConnections)

      } catch (err) {
        console.error("[ConnectionsSection] Error fetching connections:", err)
        setError(err instanceof Error ? err.message : "Failed to load connections")
      } finally {
        setLoading(false)
      }
    }

    if (resourceId) {
      fetchConnections()
    }
  }, [resourceId, resourceName])

  const inboundConnections = connections.filter((c) => c.direction === "inbound")
  const outboundConnections = connections.filter((c) => c.direction === "outbound")

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
            No ACTUAL_TRAFFIC connections found for this resource.
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
                  ? `From: ${conn.source_id.substring(0, 50)}${conn.source_id.length > 50 ? "..." : ""}`
                  : `To: ${conn.target_id.substring(0, 50)}${conn.target_id.length > 50 ? "..." : ""}`}
              </div>
              {conn.last_seen && (
                <div className="text-xs text-muted-foreground">
                  Last seen: {new Date(conn.last_seen).toLocaleString()}
                </div>
              )}
              {conn.hit_count !== undefined && conn.hit_count > 0 && (
                <div className="text-xs text-muted-foreground">
                  {conn.hit_count.toLocaleString()} connections observed
                </div>
              )}
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

export default ConnectionsSection
export { ConnectionsSection }
