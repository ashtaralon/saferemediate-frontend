import { NextRequest, NextResponse } from "next/server"

// Posture recommendations proxy — read-only emission of remediation
// proposals derived from the workload's stored posture evidence.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workloadId: string }> },
) {
  const { workloadId } = await params
  try {
    const url = `${BACKEND_URL}/api/posture-visibility/workloads/${encodeURIComponent(
      workloadId,
    )}/recommendations`
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
      { error: err.message || "Failed to fetch posture recommendations" },
      { status: 502 },
    )
  }
}
