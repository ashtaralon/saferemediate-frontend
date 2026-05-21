import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Proxy for the Crown Jewel Exposure backend endpoint (Slice 5a). The
// backend route is /api/jewel-exposure/{system_name}/{jewel_id:path};
// we forward the catch-all [...path] segments transparently so the S3
// ARN colons / slashes survive the proxy hop.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  // path = [systemName, ...jewelIdSegments]. We re-encode the jewel id
  // segment because it likely contains the S3 ARN colons. The systemName
  // is plain.
  const segments = (path || []).map((s) => encodeURIComponent(s))
  const upstreamPath = segments.join("/")

  const { searchParams } = new URL(req.url)
  const includeStale = searchParams.get("include_stale") === "true" ? "true" : ""

  const params_str = new URLSearchParams()
  if (includeStale) params_str.set("include_stale", includeStale)
  const qs = params_str.toString()

  const upstream = `${BACKEND_URL}/api/jewel-exposure/${upstreamPath}${qs ? `?${qs}` : ""}`

  // Server-side cache. Exposure query is read-heavy on Neo4j (4 Cypher
  // queries with multi-hop walks); cache for 5 min so repeats are
  // instant. Cache key includes every search param so flipping
  // include_stale forces a fresh fetch.
  const cacheKey = `jewel-exposure:${upstreamPath}:stale=${includeStale}`
  const cached = await getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "X-Proxy-Cache": "hit",
      },
    })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(upstream, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    clearTimeout(timeout)

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text()
      return NextResponse.json(
        { error: `backend ${upstreamRes.status}`, detail: text.slice(0, 500) },
        { status: upstreamRes.status },
      )
    }

    const data = await upstreamRes.json()
    await setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "X-Proxy-Cache": "miss",
      },
    })
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "upstream timeout" : String(err?.message ?? err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}
