import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/graph/nodes`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("[proxy] Graph nodes fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        nodes: [],
        error: `Backend returned ${response.status}`,
      })
    }

    const data = await response.json()
    return NextResponse.json({
      success: true,
      nodes: data.nodes || data || [],
      relationships: data.relationships || [],
    })
  } catch (error) {
    console.error("[proxy] Graph nodes fetch error:", error)
    return NextResponse.json({
      success: false,
      nodes: [],
      error: error instanceof Error ? error.message : "Failed to fetch graph nodes",
    })
  }
}
