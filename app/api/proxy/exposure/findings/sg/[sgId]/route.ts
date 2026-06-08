import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/exposure/findings/sg/{sgId}
 *
 * Passthrough to backend Risk Potential surface
 * (/api/exposure/findings/sg/{sg_id}). Gated server-side by
 * CYNTRO_EXPOSURE_FINDINGS_ENABLED — returns 404 when off.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> },
) {
  const { sgId } = await params
  const { searchParams } = new URL(req.url)
  const includeLow = searchParams.get("include_low") === "true" ? "true" : ""

  const qs = new URLSearchParams()
  if (includeLow) qs.set("include_low", includeLow)
  const query = qs.toString()

  const upstream = `${BACKEND_URL}/api/exposure/findings/sg/${encodeURIComponent(sgId)}${query ? `?${query}` : ""}`
  const cacheKey = `exposure-findings:sg:${sgId}:low=${includeLow}`

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
      cache: "no-store",
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
  } catch (err: unknown) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? "upstream timeout"
        : String(err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}
