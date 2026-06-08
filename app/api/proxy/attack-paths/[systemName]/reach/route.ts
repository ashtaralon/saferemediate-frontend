import { NextResponse } from "next/server"

// Sprint 5 — proxy for GET /api/attack-paths/{system_name}/reach
//
// Returns the reach graph: nodes grouped by subnet tier zone, edges
// with the ADR-001 UDE-02 envelope (edge_class, confidence,
// evidence_refs), plus crown-jewel anchors and the SignalSource
// registry. Consumed by the Reach attack-path tab.

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// Per UDE-vercel-abort-cascade memory: keep per-route maxDuration
// short enough that this proxy fails fast on backend hangs, rather
// than the whole frontend page hanging waiting for Render.
export const maxDuration = 30

export async function GET(
  request: Request,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const includeEdges = searchParams.get("include_edges") ?? "true"
  const maxNodes = searchParams.get("max_nodes") ?? "500"

  try {
    const qs = `?include_edges=${includeEdges}&max_nodes=${maxNodes}`
    const response = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/reach${qs}`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        // Slightly shorter than maxDuration so we surface a timeout
        // error in the proxy rather than Vercel killing the function
        // mid-flight.
        signal: AbortSignal.timeout(25_000),
      }
    )

    if (!response.ok) {
      console.log(`[attack-paths/reach] backend ${response.status}`)
      return NextResponse.json(
        {
          error: "Failed to load reach graph",
          status: response.status,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[attack-paths/reach] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch reach graph", detail: msg },
      { status: 500 }
    )
  }
}
