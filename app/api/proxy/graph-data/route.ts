import { NextResponse } from "next/server"

// Allow longer execution time on Vercel (30 seconds max)
export const maxDuration = 30

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // Add timeout to prevent hanging - increased to 15 seconds for slow backend
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

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
  } catch (error: any) {
    console.error("[v0] Graph data fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    // Return empty data instead of error to prevent frontend hanging
    return NextResponse.json({
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : (error.message || "Failed to fetch graph data"),
      nodes: [],
      relationships: [],
    })
  }
}
