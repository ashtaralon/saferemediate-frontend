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
    const res = await fetch(`${BACKEND_URL}/api/graph/nodes`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(28000), // 28 seconds
    })

    if (!res.ok) {
      console.error(`[proxy] Nodes endpoint error: ${res.status} ${res.statusText}`)
      return NextResponse.json(
        {
          error: "Backend error",
          backendStatus: res.status,
          nodes: [],
          success: false,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[proxy] Nodes fetched - count: ${data.nodes?.length || data.count || 0}`)
    
    return NextResponse.json({
      success: true,
      nodes: data.nodes || data || [],
      count: data.nodes?.length || data.count || 0,
    })
  } catch (error) {
    console.error("[proxy] Nodes fetch error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        nodes: [],
        count: 0,
        success: false,
      },
      { status: 500 }
    )
  }
}
