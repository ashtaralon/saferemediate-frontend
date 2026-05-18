import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// Thin pass-through to the Phase 2 backend endpoint.
// Forwards stale_days / include_active / include_excluded query params.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const qs = url.search || ""
  try {
    const resp = await fetch(`${BACKEND_URL}/api/iam-roles/orphan-detection${qs}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    })
    const text = await resp.text()
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "proxy_failed", findings: [] },
      { status: 500 },
    )
  }
}
