import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  try {
    console.log(`[SNAPSHOTS] Fetching all snapshots`)

    // Call backend snapshots endpoint
    const response = await fetch(`${BACKEND_URL}/api/snapshots`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error(`[SNAPSHOTS] Backend returned ${response.status}`)
      return NextResponse.json(
        { error: "Failed to fetch snapshots", message: `Backend returned ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SNAPSHOTS] ✅ Success: ${Array.isArray(data) ? data.length : data.snapshots?.length || 0} snapshots`)
    
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SNAPSHOTS] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch snapshots", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

