import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const systemId = searchParams.get("systemId") || "alon-prod"
  const window = searchParams.get("window") || "7d"

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/dependency-map-comprehensive?systemId=${systemId}&window=${window}`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(55000),
      }
    )

    if (!response.ok) {
      console.error(`[Comprehensive Map] API error: ${response.status}`)
      return NextResponse.json(
        {
          error: "Backend unavailable",
          system_id: systemId,
          external_nodes: [],
          compute_nodes: [],
          security_nodes: [],
          identity_nodes: [],
          data_nodes: [],
          storage_nodes: [],
          edges: [],
          total_nodes: 0,
          total_edges: 0,
          data_sources: { flow_logs: false, cloudtrail: false, config: false },
        },
        { status: 200 }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Comprehensive Map] Fetch error:", error.message)
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch",
        system_id: systemId,
        external_nodes: [],
        compute_nodes: [],
        security_nodes: [],
        identity_nodes: [],
        data_nodes: [],
        storage_nodes: [],
        edges: [],
        total_nodes: 0,
        total_edges: 0,
        data_sources: { flow_logs: false, cloudtrail: false, config: false },
      },
      { status: 200 }
    )
  }
}
