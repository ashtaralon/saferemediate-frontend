import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { systemChoiceDetail } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** AP201 (R11): the tenant / account claims are part of the key — one account's summary is never another's. */
function cacheKey(systemName: string, cjArn: string | null, cjName: string | null, claims: string): string {
  return `cj-summary:${systemName}:${cjArn ?? ""}:${cjName ?? ""}${claims ? `:${claims}` : ""}`   // no claim: today's key
}

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
  const claims = forwardScopeClaims(searchParams, qs)

  const key = cacheKey(systemName, cjArn, cjName, claims)
  const cached = getCached(key)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

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
      if (res.status >= 500) {
        const stale = getStaleCached(key)
        if (stale) {
          console.warn(
            `[by-crown-jewel/summary] backend ${res.status} — serving stale cache system=${systemName}`,
          )
          return NextResponse.json(
            { ...stale, fromStaleCache: true, staleReason: `backend_${res.status}` },
            { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
          )
        }
      }
      // A7 B5: the 409 system choice is relayed (typed) so the page can offer it; every other refusal answers as before.
      const choice = systemChoiceDetail(body)
      return NextResponse.json(
        { error: "Failed to load crown jewel summary", status: res.status, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }
    const data = await res.json()
    setCached(key, data, TTL_STD)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(key)
    if (stale) {
      console.warn(
        `[by-crown-jewel/summary] ${isTimeout ? "timeout" : "fetch failed"} — serving stale cache system=${systemName}`,
      )
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: isTimeout ? "timeout" : "fetch_failed" },
        { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
      )
    }
    console.error(`[by-crown-jewel/summary] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch crown jewel summary", detail: msg },
      { status: 502 },
    )
  }
}
