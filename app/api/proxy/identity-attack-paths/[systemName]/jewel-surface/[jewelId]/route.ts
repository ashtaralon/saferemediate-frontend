import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { normalizeJewelArn } from "@/lib/server/normalize-jewel-id"

// Jewel-surface aggregation — per-crown-jewel computed surface
// (max_verbs, entry_summary, cross_path_remediation). Originally
// relied on edge Cache-Control headers but those don't apply to
// `runtime = "nodejs"` Functions in Vercel — the headers are advisory
// and the operator-visible behavior was "every jewel click = full
// 30-50s backend wait + occasional 502 from AbortSignal timeout."
//
// Now mirrors the parent identity-attack-paths proxy: per-instance
// in-memory cache with TTL_SLOW (5 min). The page reaches this
// endpoint repeatedly as the operator clicks through jewels — a single
// warm cache pays for every subsequent click in the same session.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> },
) {
  const { systemName, jewelId: rawJewelId } = await params
  const jewelId = normalizeJewelArn(rawJewelId)
  const { searchParams } = new URL(req.url)
  const maxPaths = searchParams.get("max_paths") || "15"

  const cacheKey = `jewel-surface|${systemName}|${jewelId}|${maxPaths}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(
      systemName,
    )}/jewel-surface/${encodeURIComponent(jewelId)}?max_paths=${maxPaths}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status },
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        // Keep the edge SWR header as belt-and-suspenders for any
        // future migration to Edge runtime where these DO apply.
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch crown jewel surface" },
      { status: 502 },
    )
  }
}
