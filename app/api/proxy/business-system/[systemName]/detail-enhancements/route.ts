import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/** Proxy: GET /api/business-system/{systemName}/detail-enhancements */
export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  if (!systemName) {
    return NextResponse.json({ error: "systemName required" }, { status: 400 })
  }
  const base = getBackendBaseUrl()
  try {
    const res = await fetch(
      `${base}/api/business-system/${encodeURIComponent(systemName)}/detail-enhancements`,
      { cache: "no-store", signal: AbortSignal.timeout(115000) },
    )
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "detail-enhancements proxy failed" },
      { status: 502 },
    )
  }
}
