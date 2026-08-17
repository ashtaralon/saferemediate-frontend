import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

// Thin pass-through to the Phase 1 backend endpoint.
// Forwards days / include_active and any future query params verbatim.
// This was the one orphan-detection proxy missing under /api/proxy —
// the account-wide orphan panel's SG fetch 404'd against Next itself.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const qs = url.search || ""
  try {
    const resp = await fetch(`${BACKEND_URL}/api/security-groups/orphan-detection${qs}`, {
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
