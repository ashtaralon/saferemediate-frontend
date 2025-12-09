import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Expand graph from seed nodes to find all connected resources
 * This is the core of the auto-tagging system - it traverses the Neo4j graph
 * from seed nodes and returns all connected resources
 */
export async function POST(request: Request) {
  const backendUrl =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://saferemediate-backend.onrender.com"

  try {
    const body = await request.json()
    const { seedIds, systemName } = body

    if (!seedIds || seedIds.length === 0) {
      return NextResponse.json(
        { error: "No seed resources provided" },
        { status: 400 }
      )
    }

    console.log(
      "[system-expand] Expanding from",
      seedIds.length,
      "seeds for system:",
      systemName
    )

    // Try to call backend expansion endpoint
    try {
      const response = await fetch(`${backendUrl}/api/graph/expand`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          seed_ids: seedIds,
          system_name: systemName,
          max_depth: 3, // Traverse up to 3 hops
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[system-expand] Backend returned", data.resources?.length || 0, "resources")
        return NextResponse.json({
          success: true,
          resources: data.resources || [],
          seedCount: seedIds.length,
          totalCount: data.resources?.length || 0,
        })
      }
    } catch (backendError) {
      console.log("[system-expand] Backend unavailable, using frontend expansion")
    }

    // Fallback: Do graph expansion on frontend using graph-data
    // Fetch all nodes and relationships
    const [nodesRes, relsRes] = await Promise.all([
      fetch(`${backendUrl}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`${backendUrl}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      }),
    ])

    if (!nodesRes.ok || !relsRes.ok) {
      throw new Error("Failed to fetch graph data")
    }

    const nodesData = await nodesRes.json()
    const relsData = await relsRes.json()

    const allNodes = nodesData.nodes || nodesData || []
    const allRels = relsData.edges || relsData.relationships || relsData || []

    // Build adjacency map for graph traversal
    const adjacency = new Map<string, Set<string>>()

    allRels.forEach((rel: any) => {
      const source = rel.source || rel.start || rel.from
      const target = rel.target || rel.end || rel.to

      if (!adjacency.has(source)) adjacency.set(source, new Set())
      if (!adjacency.has(target)) adjacency.set(target, new Set())

      adjacency.get(source)!.add(target)
      adjacency.get(target)!.add(source) // Bidirectional
    })

    // BFS to find all connected nodes within max_depth hops
    const visited = new Set<string>()
    const queue: { id: string; depth: number; source: "seed" | "derived" }[] = []
    const result: any[] = []
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]))

    // Start with seeds
    seedIds.forEach((id: string) => {
      queue.push({ id, depth: 0, source: "seed" })
      visited.add(id)
    })

    const maxDepth = 3

    while (queue.length > 0) {
      const { id, depth, source } = queue.shift()!

      const node = nodeMap.get(id)
      if (node) {
        result.push({
          ...node,
          type: node.type || node.labels?.[0] || "Resource",
          source,
        })
      }

      // Expand to neighbors if within depth limit
      if (depth < maxDepth) {
        const neighbors = adjacency.get(id) || new Set()
        neighbors.forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId)
            queue.push({ id: neighborId, depth: depth + 1, source: "derived" })
          }
        })
      }
    }

    console.log(
      "[system-expand] Frontend expansion found",
      result.length,
      "resources (",
      seedIds.length,
      "seeds +",
      result.length - seedIds.length,
      "derived)"
    )

    return NextResponse.json({
      success: true,
      resources: result,
      seedCount: seedIds.length,
      derivedCount: result.length - seedIds.length,
      totalCount: result.length,
    })
  } catch (error: any) {
    console.error("[system-expand] Error:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to expand graph",
        success: false,
      },
      { status: 500 }
    )
  }
}
