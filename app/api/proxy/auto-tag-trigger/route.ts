import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-1.onrender.com"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { systemName } = body

    const response = await fetch(`${BACKEND_URL}/api/auto-tag/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ systemName }),
    })

    const text = await response.text()

    // Check for ngrok offline error
    if (text.includes("ngrok") && text.includes("offline")) {
      return NextResponse.json({
        success: false,
        offline: true,
        error: "Backend server is offline",
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
      })
    }

    const data = JSON.parse(text)
    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error: any) {
    console.error("[v0] Auto-tag trigger error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to trigger auto-tag",
    })
  }
}
