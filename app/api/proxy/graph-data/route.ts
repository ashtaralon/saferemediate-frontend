import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  let backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  // Remove trailing slashes and /backend if present
  backendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }),
    ])

    clearTimeout(timeoutId)

    if (!nodesResponse.ok || !edgesResponse.ok) {
      console.error("[proxy] Graph data fetch failed - nodes:", nodesResponse.status, "edges:", edgesResponse.status)
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
      "[proxy] Graph data fetched - nodes:",
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
    console.error("[proxy] Graph data fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    return NextResponse.json({
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : (error.message || "Failed to fetch graph data"),
      nodes: [],
      relationships: [],
    })
  }
}
