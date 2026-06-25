import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** GET /api/attack-paths/{system}/by-crown-jewel/summary — path list only */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const cjArn = searchParams.get("cj_arn")
  const cjName = searchParams.get("cj_name")

  if (!cjArn && !cjName) {
    return NextResponse.json(
      { error: "cj_arn or cj_name required" },
      { status: 422 },
    )
  }

  const qs = new URLSearchParams()
  if (cjArn) qs.set("cj_arn", cjArn)
  if (cjName) qs.set("cj_name", cjName)

  try {
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/summary?${qs}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[by-crown-jewel/summary] backend ${res.status}: ${body.slice(0, 200)}`)
      return NextResponse.json(
        { error: "Failed to load crown jewel summary", status: res.status },
        { status: res.status },
      )
    }
    // Edge cache (2026-06-25): the operator clicks back+forth between
    // crown jewels on the Topology Spotlight all day. Without edge
    // cache, every click is a fresh Render round-trip — 5-15s warm,
    // 40-100s cold. s-maxage=60 keeps the same CJ instant for a minute;
    // stale-while-revalidate=300 lets the next 4 minutes serve the
    // cached body while a background revalidation refreshes. Safe
    // because the underlying AttackPath nodes turn over on a 4h
    // classifier sweep (project_render_tier), not per-second.
    return NextResponse.json(await res.json(), {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[by-crown-jewel/summary] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch crown jewel summary", detail: msg },
      { status: 502 },
    )
  }
}
