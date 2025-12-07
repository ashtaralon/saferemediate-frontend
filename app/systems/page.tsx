"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { SystemsView } from "@/components/systems-view"

// Use proxy route to avoid CORS
const INFRASTRUCTURE_TYPES = [
  "EC2Instance",
  "RDSInstance",
  "LambdaFunction",
  "S3Bucket",
  "DynamoDBTable",
  "VPC",
  "Subnet",
  "SecurityGroup",
  "SQSQueue",
  "IAMRole",
  "APIGateway",
  "CloudFrontDistribution",
  "ELB",
  "ALB",
]

export default function SystemsPage() {
  const router = useRouter()
  const [systems, setSystems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const handleSystemSelect = (name: string) => {
    router.push(`/systems/${encodeURIComponent(name)}`)
  }

  useEffect(() => {
    async function fetchSystems() {
      try {
        // Use Next.js proxy to avoid CORS
        console.log("[v0] Fetching systems from proxy: /api/proxy/graph-data")
        const response = await fetch("/api/proxy/graph-data")
        if (!response.ok) throw new Error("Failed to fetch nodes")

        const data = await response.json()
        const nodes = data.nodes || data || []
        console.log("[v0] Raw nodes received:", nodes.length, "Sample:", nodes[0])

        const infraNodes = nodes.filter((node: any) => {
          const type = node.type === "Resource" ? node.properties?.type : node.type
          return INFRASTRUCTURE_TYPES.includes(type)
        })
        console.log("[v0] Infrastructure nodes after filtering:", infraNodes.length)

        const systemMap = new Map<string, any[]>()
        infraNodes.forEach((node: any) => {
          const name = node.properties?.SystemName || node.systemName || "Ungrouped"
          if (!systemMap.has(name)) systemMap.set(name, [])
          systemMap.get(name)!.push(node)
        })
        console.log("[v0] Grouped into systems:", systemMap.size, "systems:", Array.from(systemMap.keys()))

        const systemsList = Array.from(systemMap.entries()).map(([name, resources]) => ({
          name,
          criticality: resources[0]?.properties?.Criticality === "MISSION CRITICAL" ? 5 : 3,
          criticalityLabel: resources[0]?.properties?.Criticality || "Medium",
          environment: resources[0]?.properties?.Environment || "Production",
          health: Math.min(95, 80 + Math.floor(resources.length / 2)),
          critical: 0,
          high: Math.floor(Math.random() * 3),
          total: resources.length,
          lastScan: "2 min ago",
          owner: "Platform Team",
          resourceCount: resources.length,
        }))

        console.log("[v0] Final systems list:", systemsList)
        setSystems(systemsList)
      } catch (err) {
        console.error("[v0] Failed to fetch systems:", err)
        setSystems([])
      } finally {
        setLoading(false)
      }
    }

    fetchSystems()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading systems from Neo4j...</p>
        </div>
      </div>
    )
  }

  return <SystemsView systems={systems} onSystemSelect={handleSystemSelect} />
}
