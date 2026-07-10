import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/** Proxy: POST /api/business-system/pending-tag-evidence */
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const base = getBackendBaseUrl()
  try {
    const payload = await req.json()
    const res = await fetch(`${base}/api/business-system/pending-tag-evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "pending-tag-evidence proxy failed", bullets: [] },
      { status: 502 },
    )
  }
}
