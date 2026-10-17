import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { systemChoiceDetail, typedBackendAnswer } from "@/lib/server/proxy-error"
import { isSemanticHoldPayload } from "@/lib/server/proxy-cache-hygiene"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

// AP3-104 target catalog. Per-attempt budget is 15s (plan §11 as amended):
// the backend reads are three labeled Cypher statements pinned to the active
// generation, and a cold Render never needs the full 55s that the older
// attack-path proxies tolerate. Stale fallback is honest — it carries
// fromStaleCache + staleReason and never re-labels a NOT_READY as READY.
const ATTEMPT_TIMEOUT_MS = 15_000

/** AP201 (R11): the tenant / account claims are part of the key — one account's catalog is never another's. */
function cacheKey(systemName: string, claims: string): string {
  return claims ? `ap-targets:${systemName}:${claims}` : `ap-targets:${systemName}`   // no claim: today's key
}

/** GET /api/attack-paths/{system}/targets — inventory-first crown-jewel catalog */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const qs = new URLSearchParams()
  const claims = forwardScopeClaims(request.nextUrl.searchParams, qs)
  const key = cacheKey(systemName, claims)
  const cached = getCached(key)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=0, must-revalidate" },
    })
  }

  try {
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/targets${qs.toString() ? `?${qs}` : ""}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[attack-paths/targets] backend ${res.status}: ${body.slice(0, 200)}`)
      // A7 B5: the 409 system choice is relayed (typed) so the page can offer it; every other refusal answers as before.
      const choice = systemChoiceDetail(body)
      // AP201 review B3: any other typed answer passes through as the server gave it, no-store; a refusal is never
      // masked by a stale serve, a reader failure (SEMANTIC_READ_UNAVAILABLE) may still be answered by last-good.
      const typed = choice ? null : typedBackendAnswer(body, res.status)
      if (typed && !typed.readerFailure) return typed.response
      if (res.status >= 500) {
        const stale = getStaleCached(key)
        if (stale) {
          return NextResponse.json(
            { ...stale, fromStaleCache: true, staleReason: `backend_${res.status}` },
            { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
          )
        }
      }
      if (typed) return typed.response
      return NextResponse.json(
        { error: "Failed to load target catalog", status: res.status, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }
    const data = await res.json()
    // A 200 hold is a status answer about right now: passed through no-store, never cached.
    if (isSemanticHoldPayload(data)) {
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store", "X-Cache": "BYPASS-HOLD" } })
    }
    // A NOT_READY catalog is real state, but it must not be the cached
    // "last good" that outlives a recovered projection.
    if (data && data.serve_state === "READY") setCached(key, data, TTL_STD)
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=0, must-revalidate" },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(key)
    if (stale) {
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: isTimeout ? "timeout" : "fetch_failed" },
        { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
      )
    }
    console.error(`[attack-paths/targets] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch target catalog", detail: msg, unavailable: true },
      { status: 502 },
    )
  }
}
