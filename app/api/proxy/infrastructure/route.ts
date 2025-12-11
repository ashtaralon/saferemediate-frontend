export const dynamic = "force-dynamic"

export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    const response = await fetch(`${backendUrl}/api/graph/nodes`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return Response.json(
        { success: false, error: `Backend returned ${response.status}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    const nodes = data.nodes || data || []

    // Group nodes by systemName
    const systemsMap = new Map<string, any>()
    for (const node of nodes) {
      const systemName = node.systemName || node.system_name || "default"
      if (!systemsMap.has(systemName)) {
        systemsMap.set(systemName, {
          systemName,
          resourceCount: 0,
          resources: [],
        })
      }
      const system = systemsMap.get(systemName)!
      system.resourceCount++
      system.resources.push(node)
    }

    const systems = Array.from(systemsMap.values())

    return Response.json({
      success: true,
      summary: {
        totalResources: nodes.length,
        totalSystems: systems.length,
      },
      systems,
    })
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }
}
