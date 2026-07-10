import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * Proxy: GET /api/business-systems/ranked
 * BSM Sprint 2 — BRSS ranking for rankable BUSINESS_SYSTEM nodes.
 */
export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const base = getBackendBaseUrl()
  try {
    const res = await fetch(`${base}/api/business-systems/ranked`, {
      cache: "no-store",
      signal: AbortSignal.timeout(115000),
    })
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        systems: [],
        count: 0,
        error: e?.message || "ranked proxy failed",
        positioning: "logical_blast_radius",
      },
      { status: 502 },
    )
  }
}
