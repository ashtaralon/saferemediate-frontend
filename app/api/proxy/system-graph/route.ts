export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(request: Request) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

  try {
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName")

    if (!systemName) {
      return Response.json({ error: "systemName query parameter required" }, { status: 400 })
    }

    console.log("[API Proxy] Fetching system graph for:", systemName)

    const response = await fetch(`${backendUrl}/api/system/${encodeURIComponent(systemName)}/expand`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      signal: AbortSignal.timeout(30000),
    })

    console.log("[API Proxy] System graph response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[API Proxy] System graph error:", response.status, errorText.substring(0, 200))
      return Response.json(
        { error: `Backend returned ${response.status}` },
        { status: response.status },
      )
    }

    const data = await response.json()

    console.log("[API Proxy] Raw backend response:", JSON.stringify(data).substring(0, 300))

    // Backend returns: { systemName, totalCount, seedCount, discoveredCount, resources: [...] }
    const resources = (data.resources || []).map((r: any) => ({
      id: r.id,
      name: r.name || r.id,
      type: r.type,
      region: r.region,
      source: r.source, // Backend already provides "seed" or "derived"
    }))

    console.log(
      "[API Proxy] System graph loaded:",
      resources.filter((r: any) => r.source === "seed").length,
      "seed +",
      resources.filter((r: any) => r.source === "derived").length,
      "derived =",
      resources.length,
      "total",
    )

    return Response.json({
      success: true,
      systemName: data.systemName || systemName,
      totalResources: data.totalCount || resources.length,
      seedCount: data.seedCount || resources.filter((r: any) => r.source === "seed").length,
      derivedCount: data.discoveredCount || resources.filter((r: any) => r.source === "derived").length,
      resources: resources,
    })
  } catch (error: any) {
    console.error("[API Proxy] System graph failed:", error.name, error.message)

    return Response.json(
      {
        error: error.message || "Failed to fetch system graph",
        hint: "Verify backend is running",
      },
      { status: 500 },
    )
  }
}
