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
    const rawNodes = nodesData.nodes || nodesData || []
    const rawRelationships = edgesData.edges || edgesData.relationships || edgesData || []

    // Normalize nodes to ensure 'type' field is present
    // Neo4j returns labels as array, we need to extract the primary type
    const nodes = rawNodes.map((node: any) => {
      let nodeType = node.type || node.resourceType || ""

      // If type is empty, try to get from labels (Neo4j format)
      if (!nodeType && node.labels && Array.isArray(node.labels)) {
        // Use first non-generic label, or first label
        nodeType = node.labels.find((l: string) => l !== "Resource" && l !== "Node") || node.labels[0] || "Resource"
      }

      return {
        ...node,
        type: nodeType,
      }
    })

    // Log node types for debugging
    const nodeTypeCounts: Record<string, number> = {}
    nodes.forEach((n: any) => {
      const t = n.type || "Unknown"
      nodeTypeCounts[t] = (nodeTypeCounts[t] || 0) + 1
    })
    console.log("[graph-data] Node types:", nodeTypeCounts)

    // Normalize relationships to ensure source/target and type are present
    const relationships = rawRelationships.map((rel: any) => ({
      source: rel.source || rel.start || rel.from,
      target: rel.target || rel.end || rel.to,
      type: rel.type || rel.relationship_type || rel.relType || "CONNECTED",
    }))

    // Log relationship types for debugging
    const relTypeCounts: Record<string, number> = {}
    relationships.forEach((r: any) => {
      relTypeCounts[r.type] = (relTypeCounts[r.type] || 0) + 1
    })
    console.log("[graph-data] Relationship types:", relTypeCounts)

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
