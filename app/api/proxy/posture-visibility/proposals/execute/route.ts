import { NextRequest, NextResponse } from "next/server"

// Posture proposal execution proxy — POST body is forwarded verbatim to
// the backend's thin wrapper over UnifiedPipeline.execute(). The pipeline
// itself does the SIMULATE -> PREFLIGHT -> SNAPSHOT -> CANARY -> FULL
// staging and auto-rollback; this proxy only forwards.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    const res = await fetch(`${BACKEND_URL}/api/posture-visibility/proposals/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    })
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = { error: "Non-JSON response", raw: text.slice(0, 500) }
    }
    return NextResponse.json(json, { status: res.status })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to execute proposal" },
      { status: 502 },
    )
  }
}
