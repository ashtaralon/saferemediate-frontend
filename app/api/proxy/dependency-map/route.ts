import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dependency-map`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error(`[v0] Dependency map API error: ${response.status}`)
      return NextResponse.json(
        { error: "Backend unavailable", nodes: [], edges: [], statistics: {}, criticalNodes: [], clusters: {} },
        { status: 200 },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Dependency map fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch", nodes: [], edges: [], statistics: {}, criticalNodes: [], clusters: {} },
      { status: 200 },
    )
  }
}
