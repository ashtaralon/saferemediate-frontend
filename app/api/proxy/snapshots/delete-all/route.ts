import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    console.log(`[SNAPSHOTS-DELETE-ALL] Deleting all snapshots`)

    const response = await fetch(`${BACKEND_URL}/api/snapshots/delete-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `Backend returned ${response.status}` }))
      console.error(`[SNAPSHOTS-DELETE-ALL] Backend returned ${response.status}:`, errorData)
      return NextResponse.json(
        { error: "Failed to delete snapshots", message: errorData.detail || errorData.message || `Backend returned ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SNAPSHOTS-DELETE-ALL] ✅ Success:`, data)
    
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SNAPSHOTS-DELETE-ALL] Error:", error)
    return NextResponse.json(
      { error: "Failed to delete snapshots", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

