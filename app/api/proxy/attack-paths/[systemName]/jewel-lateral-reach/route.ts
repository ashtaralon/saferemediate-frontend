import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

// =============================================================================
// Lateral reach proxy —
//   GET /api/proxy/attack-paths/<system>/jewel-lateral-reach?jewel_ref=&jewel_type=
//
// Forwards to the backend's reachable-but-never-used bands (computed from
// :PermissionStatement grants minus observed ACCESSES_RESOURCE). NO MOCK: on
// backend error this returns an honest error envelope and the panel renders an
// empty/error state rather than a reassuring-looking empty cut list — a fake
// "nothing reaches this jewel" is worse here than a visible failure.
// =============================================================================

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

interface ProxyError {
  error: string
  detail?: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const jewelRef = req.nextUrl.searchParams.get("jewel_ref")
  const jewelType = req.nextUrl.searchParams.get("jewel_type") ?? "S3Bucket"

  if (!systemName || !jewelRef) {
    return NextResponse.json<ProxyError>(
      { error: "missing_params", detail: "systemName and jewel_ref are required" },
      { status: 400 },
    )
  }

  const cacheKey = `lateral-reach:${systemName}:${jewelType}:${jewelRef}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

  try {
    const t0 = Date.now()
    const url =
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/jewel-lateral-reach` +
      `?jewel_ref=${encodeURIComponent(jewelRef)}&jewel_type=${encodeURIComponent(jewelType)}`
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    console.log(
      `[lateral-reach proxy] status=${res.status} latency_ms=${Date.now() - t0} ` +
        `system=${systemName} jewel=${jewelRef.slice(0, 40)}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return NextResponse.json<ProxyError>(
        {
          error: "lateral_reach_unavailable",
          detail: `backend ${res.status} ${text.slice(0, 200)}`,
        },
        { status: res.status === 404 ? 404 : 502 },
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<ProxyError>(
      {
        error: isTimeout ? "lateral_reach_timeout" : "lateral_reach_proxy_error",
        detail: e?.message ?? String(err),
      },
      { status: 502 },
    )
  }
}
