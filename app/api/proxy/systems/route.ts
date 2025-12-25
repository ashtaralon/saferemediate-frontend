export const dynamic = "force-dynamic"

export async function GET() {
  const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    console.log("[API Proxy] Fetching systems from:", `${backendUrl}/api/systems`)

    const response = await fetch(`${backendUrl}/api/systems`, {
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
            error: "Systems endpoint not found",
            hint: "Make sure your backend has the /api/systems endpoint implemented.",
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

    // Use systems directly from backend response
    // Backend returns: { systems: [...], total: number, timestamp: string }
    const systems = data.systems || []

    console.log("[API Proxy] Found", systems.length, "systems from backend")

    return Response.json({
      success: true,
      systems,
      total: data.total || systems.length,
      timestamp: data.timestamp,
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
