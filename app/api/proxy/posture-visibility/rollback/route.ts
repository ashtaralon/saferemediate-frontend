import { NextRequest, NextResponse } from "next/server"

// Posture unified-rollback proxy — POST body is forwarded verbatim to
// the backend's unified rollback endpoint. Mirrors the
// /proposals/execute proxy shape: thin POST forwarder, 55s timeout
// (just under Vercel's 60s function limit per stack-and-conventions),
// passthrough of the backend's status code so the UI can distinguish
// 404 (snapshot missing) from 409 (already rolled back) from 500
// (audit-write failure for force=true).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// BACKEND_URL_OVERRIDE matches the convention used by the egress proxy
// (app/api/proxy/egress/system/[systemName]/route.ts) — set it in your
// local shell or .env.local to point dev at a localhost backend. Prod
// Render/Vercel never set this so it falls through to Render.
// BACKEND_URL is kept as a secondary fallback for back-compat with the
// older sibling proxy that uses that name.
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    const res = await fetch(`${BACKEND_URL}/api/posture-visibility/rollback`, {
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
      { error: err.message || "Failed to rollback proposal" },
      { status: 502 },
    )
  }
}
