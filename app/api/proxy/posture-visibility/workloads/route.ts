import { NextRequest, NextResponse } from "next/server"

// Posture Visibility workloads list proxy. Query params pass through.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const url = `${BACKEND_URL}/api/posture-visibility/workloads${qs ? `?${qs}` : ""}`
  try {
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
      { error: err.message || "Failed to fetch posture workloads" },
      { status: 502 },
    )
  }
}
