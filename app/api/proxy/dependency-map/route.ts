import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

/**
 * Determine if a relationship type represents actual/behavioral traffic
 * vs infrastructure/configuration relationships
 */
function isActualRelationship(type: string): boolean {
  const actualTypes = [
    "USED_ACTION",      // IAM action usage from CloudTrail
    "ACTUAL_INVOKES",   // Lambda/function invocations
    "ACTUAL_QUERIES",   // Database queries
    "ACTUAL_WRITES",    // S3/storage writes
    "ACTUAL_READS",     // S3/storage reads
    "ACTUAL_PUBLISHES", // SNS/SQS publishing
    "ACTUAL_CACHES",    // ElastiCache access
    "RUNTIME",          // Any runtime relationship
    "TRAFFIC",          // Network traffic
    "INVOKES",          // Service invocations
    "CALLS",            // API calls
  ]
  return actualTypes.some(t => type.toUpperCase().includes(t))
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dependency-map`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error(`[v0] Dependency map API error: ${response.status}`)
      return NextResponse.json(
        { error: "Backend unavailable", nodes: [], edges: [], statistics: {}, criticalNodes: [], clusters: {} },
        { status: 200 },
      )
    }

    const data = await response.json()

    // Process edges to derive isActual from relationship type if not set
    if (data.edges && Array.isArray(data.edges)) {
      data.edges = data.edges.map((edge: any) => ({
        ...edge,
        isActual: edge.isActual ?? isActualRelationship(edge.type || ""),
      }))

      // Update statistics
      const actualCount = data.edges.filter((e: any) => e.isActual).length
      const infraCount = data.edges.length - actualCount
      data.statistics = {
        ...data.statistics,
        totalEdges: data.edges.length,
        actualEdges: actualCount,
        infrastructureEdges: infraCount,
      }
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Dependency map fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch", nodes: [], edges: [], statistics: {}, criticalNodes: [], clusters: {} },
      { status: 200 },
    )
  }
}
