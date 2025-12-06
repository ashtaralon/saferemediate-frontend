import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

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
    console.log("[API Proxy] Fetching available systems from:", `${backendUrl}/api/systems/available`)

    const response = await fetch(`${backendUrl}/api/systems/available`, {
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
