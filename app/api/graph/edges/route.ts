import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    // Try /api/graph/relationships first, then /api/graph/edges
    let res = await fetch(`${BACKEND_URL}/api/graph/relationships`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(28000),
    })

    // If relationships doesn't exist, try edges
    if (!res.ok) {
      res = await fetch(`${BACKEND_URL}/api/graph/edges`, {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(28000),
      })
    }

    if (!res.ok) {
      console.error(`[graph-edges] Backend error: ${res.status} ${res.statusText}`)
      return NextResponse.json(
        {
          error: "Backend error",
          backendStatus: res.status,
          edges: [],
          relationships: [],
          success: false,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    const edges = data.edges || data.relationships || []
    console.log(`[graph-edges] Edges fetched - count: ${edges.length}`)
    
    return NextResponse.json({
      success: true,
      edges: edges,
      relationships: edges, // Alias for compatibility
      count: edges.length,
      source: data.source || "unknown",
    })
  } catch (error) {
    console.error("[graph-edges] Fetch error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        edges: [],
        relationships: [],
        count: 0,
        success: false,
      },
      { status: 500 }
    )
  }
}
