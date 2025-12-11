export const dynamic = "force-dynamic"

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    console.log("[API Proxy] Fetching systems from:", `${backendUrl}/api/graph/nodes`)

    const response = await fetch(`${backendUrl}/api/graph/nodes`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })

    console.log("[API Proxy] Backend response status:", response.status)

    const responseText = await response.text()

    if (!response.ok) {
      console.error("[API Proxy] Backend error:", response.status, responseText.substring(0, 200))

      if (response.status === 404) {
        return Response.json(
          {
            success: false,
            error: "Nodes endpoint not found",
            hint: "Make sure your backend has the /api/graph/nodes endpoint implemented.",
            offline: false,
            systems: [],
            total: 0,
          },
          { status: 200 },
        )
      }

      return Response.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          systems: [],
          total: 0,
        },
        { status: 200 },
      )
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[API Proxy] Failed to parse JSON:", responseText.substring(0, 200))
      return Response.json(
        {
          success: false,
          error: "Invalid response from backend",
          hint: "Backend returned non-JSON response",
          systems: [],
          total: 0,
        },
        { status: 200 },
      )
    }

    console.log("[API Proxy] Backend response:", JSON.stringify(data).substring(0, 500))

    // Transform nodes response to systems format
    const nodes = data.nodes || data || []

    // Group nodes by systemName to create systems
    const systemsMap = new Map<string, any>()

    for (const node of nodes) {
      const systemName = node.systemName || node.system_name || "default"
      if (!systemsMap.has(systemName)) {
        systemsMap.set(systemName, {
          systemName,
          resourceCount: 0,
          seedCount: 0,
          discoveredCount: 0,
          resources: [],
        })
      }
      const system = systemsMap.get(systemName)!
      system.resourceCount++
      system.resources.push(node)
    }

    const systems = Array.from(systemsMap.values())

    console.log("[API Proxy] Found", systems.length, "systems with", nodes.length, "total nodes")

    return Response.json({
      success: true,
      systems,
      total: systems.length,
    })
  } catch (error: any) {
    console.error("[API Proxy] Fetch failed:", error.name, error.message)

    return Response.json(
      {
        success: false,
        error: error.message || "Failed to connect to backend",
        hint: "Make sure your backend is running at " + backendUrl,
        offline: true,
        systems: [],
        total: 0,
      },
      { status: 200 },
    )
  }
}
