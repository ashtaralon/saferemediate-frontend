// Neo4j Graph Data API - Fetches real architecture from Neo4j database
// Returns nodes and relationships for Cloud Graph visualization

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Neo4j connection configuration
const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687"
const NEO4J_USER = process.env.NEO4J_USER || "neo4j"
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || ""

interface Neo4jNode {
  id: string
  name: string
  type: string
  labels: string[]
  arn?: string
  SystemName?: string
  properties?: Record<string, any>
}

interface Neo4jRelationship {
  source: string
  target: string
  type: string
  properties?: Record<string, any>
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName")

  try {
    // Try backend Neo4j endpoint first
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

    try {
      // Fetch graph data from backend which has Neo4j connection
      const graphResponse = await fetch(
        `${backendUrl}/api/neo4j/graph${systemName ? `?systemName=${encodeURIComponent(systemName)}` : ""}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
        }
      )

      if (graphResponse.ok) {
        const data = await graphResponse.json()
        return NextResponse.json({
          success: true,
          nodes: data.nodes || [],
          relationships: data.relationships || data.edges || [],
          source: "neo4j",
          stats: {
            nodeCount: data.nodes?.length || 0,
            relationshipCount: data.relationships?.length || data.edges?.length || 0,
          },
        })
      }
    } catch (backendErr) {
      console.log("[Neo4j] Backend unavailable, trying alternative endpoints...")
    }

    // Try alternative backend endpoints for graph data
    const alternativeEndpoints = [
      `${backendUrl}/api/graph`,
      `${backendUrl}/api/infrastructure`,
      `${backendUrl}/api/systems/${systemName || "Payment-Prod"}/graph`,
    ]

    for (const endpoint of alternativeEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          const data = await response.json()

          // Normalize the response format
          let nodes: Neo4jNode[] = []
          let relationships: Neo4jRelationship[] = []

          if (data.nodes) {
            nodes = data.nodes
          } else if (data.infrastructure?.nodes) {
            nodes = data.infrastructure.nodes
          }

          if (data.relationships) {
            relationships = data.relationships
          } else if (data.edges) {
            relationships = data.edges
          } else if (data.infrastructure?.relationships) {
            relationships = data.infrastructure.relationships
          }

          if (nodes.length > 0) {
            return NextResponse.json({
              success: true,
              nodes,
              relationships,
              source: "backend",
              stats: {
                nodeCount: nodes.length,
                relationshipCount: relationships.length,
              },
            })
          }
        }
      } catch (e) {
        continue
      }
    }

    // If backend is unavailable, return info message
    return NextResponse.json({
      success: false,
      error: "Neo4j not available",
      message: "Connect to Neo4j backend to see real architecture data",
      source: "none",
    })
  } catch (error: any) {
    console.error("[Neo4j Graph] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch graph data",
    })
  }
}

// POST - Run custom Cypher query (for advanced visualization)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { query, systemName } = body

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

    // Use default query if not provided
    const cypherQuery = query || `
      MATCH (n)
      WHERE n.SystemName = $systemName OR $systemName IS NULL
      OPTIONAL MATCH (n)-[r]->(m)
      RETURN n, r, m
      LIMIT 500
    `

    const response = await fetch(`${backendUrl}/api/neo4j/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: cypherQuery,
        params: { systemName: systemName || null },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        result: data,
        source: "neo4j",
      })
    }

    return NextResponse.json({
      success: false,
      error: "Failed to execute query",
    })
  } catch (error: any) {
    console.error("[Neo4j Query] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to execute query",
    })
  }
}
