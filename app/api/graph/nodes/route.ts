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
    const { searchParams } = new URL(req.url)
    const systemName = searchParams.get('system')
    
    // Build backend URL with system parameter if provided
    let backendUrl = `${BACKEND_URL}/api/graph/nodes`
    if (systemName) {
      backendUrl += `?systemName=${encodeURIComponent(systemName)}`
    }
    
    const res = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(28000), // 28 seconds
    })

    if (!res.ok) {
      console.error(`[graph-nodes] Backend error: ${res.status} ${res.statusText}`)
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
    console.log(`[graph-nodes] Nodes fetched - count: ${data.nodes?.length || data.count || 0}`)
    
    return NextResponse.json({
      success: true,
      nodes: data.nodes || data || [],
      count: data.nodes?.length || data.count || 0,
      source: data.source || "unknown",
    })
  } catch (error) {
    console.error("[graph-nodes] Fetch error:", error)
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
