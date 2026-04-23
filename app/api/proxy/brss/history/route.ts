import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const BACKEND_URL = getBackendBaseUrl()

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  const limit = url.searchParams.get("limit") ?? "30"

  if (!systemName) {
    return NextResponse.json({ error: "systemName required" }, { status: 400 })
  }

  try {
    const backendUrl = `${BACKEND_URL}/api/brss/history?systemName=${encodeURIComponent(systemName)}&limit=${encodeURIComponent(limit)}`
    const res = await fetch(backendUrl, {
      headers: { "Content-Type": "application/json" },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, snapshots: [], count: 0, success: false },
        { status: res.status, headers: { "X-Proxy": "brss-history-error" } },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        "X-Proxy": "brss-history",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "brss history fetch failed", snapshots: [], count: 0, success: false },
      { status: 500, headers: { "X-Proxy": "brss-history-error" } },
    )
  }
}
