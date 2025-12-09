import { NextResponse } from "next/server"

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
    ])

    clearTimeout(timeoutId)

    if (!nodesResponse.ok || !edgesResponse.ok) {
      console.error("[graph-data] Fetch failed - nodes:", nodesResponse.status, "edges:", edgesResponse.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned error: nodes=${nodesResponse.status}, edges=${edgesResponse.status}`,
        nodes: [],
        relationships: [],
      }, { status: 502 })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    // Handle various response formats from Neo4j backend
    const nodes = nodesData.nodes || nodesData || []
    const relationships = edgesData.edges || edgesData.relationships || edgesData || []

    console.log(
      "[graph-data] Fetched - nodes:",
      nodes.length,
      "relationships:",
      relationships.length,
    )

    return NextResponse.json({
      success: true,
      nodes,
      relationships,
    })
  } catch (error: any) {
    const errorMessage = error.name === 'AbortError'
      ? 'Request timed out'
      : error.message || 'Unknown error'

    console.error("[graph-data] Fetch error:", errorMessage)

    return NextResponse.json({
      success: false,
      error: errorMessage,
      nodes: [],
      relationships: [],
    }, { status: 503 })
  }
}
