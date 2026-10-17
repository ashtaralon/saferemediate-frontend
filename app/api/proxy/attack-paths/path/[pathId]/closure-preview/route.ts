import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { typedBackendAnswer } from "@/lib/server/proxy-error"
import { isSemanticHoldPayload } from "@/lib/server/proxy-cache-hygiene"

// =============================================================================
// Closure Preview proxy — GET /api/proxy/attack-paths/path/<pathId>/closure-preview
// (static "path" segment avoids [pathId] vs [systemName] slug clash at this level)
// Forwards to the backend read-view over the live AttackPath node. NO MOCK:
// on backend error it returns an honest error envelope; the panel renders an
// empty/loading state, never fabricated data.
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
  { params }: { params: Promise<{ pathId: string }> },
) {
  const { pathId } = await params
  if (!pathId) {
    return NextResponse.json<ProxyError>(
      { error: "missing_path_id", detail: "pathId path segment is required" },
      { status: 400 },
    )
  }

  // AP201 (R11) review S1: the tenant / account claims travel with the read and are part of the cache key.
  const upstream = new URLSearchParams()
  const claimsKey = forwardScopeClaims(req.nextUrl.searchParams, upstream)
  const cacheKey = `closure-preview:${pathId}${claimsKey ? `:${claimsKey}` : ""}`   // no claim: today's key
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  }

  try {
    const t0 = Date.now()
    const res = await fetch(
      `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(pathId)}/closure-preview${claimsKey ? `?${upstream}` : ""}`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(55_000) },
    )
    console.log(
      `[closure-preview proxy] status=${res.status} latency_ms=${Date.now() - t0} path=${pathId.slice(0, 32)}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      // AP201 review S11: a typed answer (the install's 503 SERVING_ROUTE_HELD, a scope refusal) keeps its status and
      // body, never relabelled 502 -- the hook says "not available on this install", not an outage.
      const typed = typedBackendAnswer(text, res.status)
      if (typed) return typed.response
      return NextResponse.json<ProxyError>(
        { error: "closure_preview_unavailable", detail: `backend ${res.status} ${text.slice(0, 200)}` },
        { status: res.status === 404 ? 404 : 502 },
      )
    }
    const data = await res.json()
    if (isSemanticHoldPayload(data)) {
      // A 200 hold is today's answer only: never cached, never edge-cached.
      return NextResponse.json(data, { headers: { "X-Cache": "BYPASS-HOLD", "Cache-Control": "no-store" } })
    }
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError"
    return NextResponse.json<ProxyError>(
      { error: isTimeout ? "closure_preview_timeout" : "closure_preview_proxy_error", detail: e?.message ?? String(err) },
      { status: 502 },
    )
  }
}
