import { NextRequest, NextResponse } from "next/server"

// Posture Visibility summary proxy — counts by verdict / exposure state.
// Mirrors the egress-visibility proxy pattern (nodejs runtime, 55s timeout
// to stay under the Vercel maxDuration=60 boundary documented in
// feedback_vercel_abort_cascade.md).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/posture-visibility/summary`, {
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
      { error: err.message || "Failed to fetch posture summary" },
      { status: 502 },
    )
  }
}
