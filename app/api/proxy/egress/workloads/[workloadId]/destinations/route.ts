import { NextRequest, NextResponse } from "next/server"

// Proxy for the per-kind destinations drill-down. Operator clicks
// External / AWS / Internal / Unknown on a workload card → the frontend
// hits this route, which forwards to the FastAPI backend. Mirrors the
// system-egress proxy pattern (nodejs runtime, no caching, generous
// per-route timeout matched to the slowest live workload query).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workloadId: string }> },
) {
  const { workloadId } = await params
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get("kind") || "all"
  const limit = searchParams.get("limit") || "20"
  const offset = searchParams.get("offset") || "0"
  const days = searchParams.get("days") || "30"

  try {
    const url = `${BACKEND_URL}/api/egress/workloads/${encodeURIComponent(
      workloadId,
    )}/destinations?kind=${encodeURIComponent(kind)}&limit=${limit}&offset=${offset}&days=${days}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status },
      )
    }
    return NextResponse.json(await res.json())
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch destinations" },
      { status: 502 },
    )
  }
}
