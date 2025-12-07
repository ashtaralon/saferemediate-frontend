import { NextResponse } from "next/server"

export async function GET() {
  // Get backend URL and ensure it doesn't have /backend/api duplication
  let backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
  
  // Remove trailing slashes and /backend if present
  backendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

  try {
    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
      }),
    ])

    if (!nodesResponse.ok || !edgesResponse.ok) {
      console.error("[v0] Graph data fetch failed - nodes:", nodesResponse.status, "edges:", edgesResponse.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned nodes:${nodesResponse.status} edges:${edgesResponse.status}`,
        nodes: [],
        relationships: [],
      })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    console.log(
      "[v0] Graph data fetched - nodes:",
      nodesData?.nodes?.length || nodesData?.length || 0,
      "edges:",
      edgesData?.edges?.length || edgesData?.length || 0,
    )

    return NextResponse.json({
      success: true,
      nodes: nodesData.nodes || nodesData || [],
      relationships: edgesData.edges || edgesData.relationships || edgesData || [],
    })
  } catch (error) {
    console.error("[v0] Graph data fetch error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch graph data",
      nodes: [],
      relationships: [],
    })
  }
}
