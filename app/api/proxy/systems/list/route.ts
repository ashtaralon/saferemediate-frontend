import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Get list of all systems from Neo4j
 * Systems are identified by unique systemName tags on resources
 */
export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://saferemediate-backend.onrender.com"

  try {
    // Try backend systems endpoint first
    try {
      const response = await fetch(`${backendUrl}/api/systems`, {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[systems/list] Backend returned", data.systems?.length || 0, "systems")
        return NextResponse.json({
          success: true,
          systems: data.systems || [],
        })
      }
    } catch (backendError) {
      console.log("[systems/list] Backend unavailable, deriving from graph data")
    }

    // Fallback: Derive systems from graph nodes
    const nodesRes = await fetch(`${backendUrl}/api/graph/nodes`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (!nodesRes.ok) {
      throw new Error("Failed to fetch nodes")
    }

    const nodesData = await nodesRes.json()
    const nodes = nodesData.nodes || nodesData || []

    // Group nodes by systemName
    const systemsMap = new Map<
      string,
      {
        name: string
        resourceCount: number
        resources: any[]
        types: Set<string>
        environment?: string
        criticality?: string
      }
    >()

    nodes.forEach((node: any) => {
      const systemName =
        node.systemName ||
        node.SystemName ||
        node.tags?.SystemName ||
        node.tags?.systemName ||
        node.tags?.System

      if (systemName) {
        if (!systemsMap.has(systemName)) {
          systemsMap.set(systemName, {
            name: systemName,
            resourceCount: 0,
            resources: [],
            types: new Set(),
            environment: node.environment || node.tags?.Environment || "Production",
            criticality: node.criticality || node.tags?.Criticality || "STANDARD",
          })
        }

        const system = systemsMap.get(systemName)!
        system.resourceCount++
        system.resources.push(node)
        if (node.type) system.types.add(node.type)
      }
    })

    // Convert to array
    const systems = Array.from(systemsMap.values()).map((sys) => ({
      name: sys.name,
      systemName: sys.name,
      resourceCount: sys.resourceCount,
      environment: sys.environment,
      criticality: sys.criticality,
      resourceTypes: Array.from(sys.types),
      healthScore: 85, // Placeholder - would come from backend
      criticalIssues: 0,
      highIssues: 0,
      totalFindings: 0,
      lastScan: new Date().toISOString(),
    }))

    console.log("[systems/list] Derived", systems.length, "systems from graph data")

    return NextResponse.json({
      success: true,
      systems,
    })
  } catch (error: any) {
    console.error("[systems/list] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        systems: [],
      },
      { status: 500 }
    )
  }
}
