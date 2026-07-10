import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/** Proxy: GET/PUT /api/system-context/{systemName} */
export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const base = getBackendBaseUrl()
  try {
    const res = await fetch(
      `${base}/api/system-context/${encodeURIComponent(systemName)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) },
    )
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "context GET failed" }, { status: 502 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const base = getBackendBaseUrl()
  try {
    const payload = await req.json()
    const res = await fetch(
      `${base}/api/system-context/${encodeURIComponent(systemName)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      },
    )
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "context PUT failed" }, { status: 502 })
  }
}
