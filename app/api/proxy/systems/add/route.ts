import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(request: NextRequest) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

  if (!backendUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Backend URL not configured",
      },
      { status: 500 },
    )
  }

  try {
    const body = await request.json()
    const { system_name } = body

    if (!system_name) {
      return NextResponse.json(
        {
          success: false,
          error: "system_name is required",
        },
        { status: 400 },
      )
    }

    console.log("[API Proxy] Adding system to table:", system_name)

    const response = await fetch(`${backendUrl}/api/systems/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ system_name }),
    })

    const text = await response.text()
    console.log("[API Proxy] Add system raw response:", text.substring(0, 500))

    // Check for ngrok offline error
    if (text.includes("ERR_NGROK") || text.includes("ngrok")) {
      return NextResponse.json({
        success: false,
        error: "Backend server is offline",
        hint: "Please start your Python backend and ngrok tunnel.",
        offline: true,
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
      })
    }

    const data = JSON.parse(text)
    console.log("[API Proxy] System added successfully:", data)

    return NextResponse.json({
      success: true,
      system: data.system || data,
      message: data.message || `System ${system_name} added successfully`,
    })
  } catch (error) {
    console.error("[API Proxy] Error adding system:", error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to add system",
    })
  }
}
