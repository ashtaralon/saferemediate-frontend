import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const backendUrl = `${BACKEND_URL}/api/enforcement/modes`

  console.log(`[Enforcement Modes Proxy] GET: ${backendUrl}`)

  try {
    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Enforcement Modes Proxy] Backend error ${response.status}: ${errorText}`)
      return NextResponse.json(
        { success: false, error: `Backend returned ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[Enforcement Modes Proxy] Error:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch modes" },
      { status: 500 }
    )
  }
}
