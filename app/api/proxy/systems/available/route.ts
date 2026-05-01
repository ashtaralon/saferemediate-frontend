import { NextResponse } from "next/server"

export async function GET() {
  const backendUrl = "https://saferemediate-backend-f.onrender.com"

  if (!backendUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Backend URL not configured",
        systems: [],
      },
      { status: 500 },
    )
  }

  try {
    // Backend exposes the systems list at /api/systems — there is no
    // /available route, and hitting it used to return 405 silently,
    // which made `fetchSystemMeta` fail and forced every System Context
    // card into the literal-string fallback ("Standard / Production /
    // eu-west-1"). Route to the real endpoint.
    console.log("[API Proxy] Fetching available systems from:", `${backendUrl}/api/systems`)

    const response = await fetch(`${backendUrl}/api/systems`, {
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    })

    const text = await response.text()
    console.log("[API Proxy] Available systems raw response:", text.substring(0, 500))

    // Check for ngrok offline error
    if (text.includes("ERR_NGROK") || text.includes("ngrok")) {
      return NextResponse.json({
        success: false,
        error: "Backend server is offline",
        hint: "Please start your Python backend and ngrok tunnel.",
        offline: true,
        systems: [],
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        systems: [],
      })
    }

    const data = JSON.parse(text)
    console.log("[API Proxy] Available systems parsed:", data)

    return NextResponse.json({
      success: true,
      systems: data.systems || [],
      total: data.total || 0,
    })
  } catch (error) {
    console.error("[API Proxy] Error fetching available systems:", error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch available systems",
      systems: [],
    })
  }
}
