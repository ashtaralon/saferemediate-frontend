import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { systemChoiceDetail } from "@/lib/server/proxy-error"
import { upstreamCachePolicy } from "@/lib/server/proxy-cache-hygiene"

// Proxy for the system-wide egress visibility endpoint. Mirrors the
// identity-attack-paths proxy pattern (nodejs runtime, no static
// caching, per-route timeout matched to the slowest backend run).
//
// Adds Vercel-side caching (5 min, TTL_SLOW) on top of the backend's
// own 5 min cache. Reason: the backend's cold-fan-out on alon-prod
// takes 30s+ (44 workloads × Cypher + ipinfo + SG attribution). When
// the user reloads the page after the backend cache TTL but before
// the Vercel function's process memory is recycled, the proxy
// serves from Vercel cache and never even talks to Render. Without
// this layer, every reload after 5min triggered the 30s cold path
// which sometimes exceeded the proxy's 55s abort window.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Allow local dev to point at a localhost backend without touching this
// constant. Render/Vercel never set BACKEND_URL_OVERRIDE so prod stays
// on Render. Set BACKEND_URL_OVERRIDE=http://localhost:8000 in your
// shell or .env.local to test backend changes before deploying.
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  getBackendBaseUrl()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const days = searchParams.get("days") || "30"
  const topN = searchParams.get("top_n") || "20"
  // A7 B5: on a v2 install a page opened by key names ONE system (backend ?system_key=, with the account for a tag / source
  // key). Absent, the request -- and its cache key -- is byte-identical to before.
  const systemKey = searchParams.get("system_key")
  const accountId = searchParams.get("account_id")
  const scope = systemKey ? `&system_key=${encodeURIComponent(systemKey)}${
    accountId ? `&account_id=${encodeURIComponent(accountId)}` : ""}` : ""
  const cacheKey = systemKey
    ? `egress|${systemName}|${days}|${topN}|key=${systemKey}|${accountId ?? ""}`
    : `egress|${systemName}|${days}|${topN}`

  // Vercel-side cache hit — instant response, never touches Render. Only an answer the backend marked cacheable is ever
  // stored (below), and a refresh ("_") always goes to the backend.
  const cached = searchParams.has("_") ? null : getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/egress/system/${encodeURIComponent(
      systemName,
    )}?days=${days}&top_n=${topN}${scope}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      // A7 B5: the 409 system choice is relayed (typed, lib/server/proxy-error systemChoiceDetail) so the page can offer it;
      // every other refusal answers as before. Never cached.
      const choice = systemChoiceDetail(await res.text().catch(() => ""))
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }
    const data = await res.json()
    // B5 review (2026-10-08): an install's egress answer is published (v1 or cohort v2) and sent no-store by the backend
    // (_egress_no_store): its pin and the recovery fence are decided per request, so it is never kept here -- whatever
    // the request named -- and the no-store is passed on. Only an answer the backend EXPLICITLY marks cacheable is cached
    // (on the hosted plane the legacy answer carries no Cache-Control, so it is no longer cached here; the backend keeps
    // its own short cache).
    const policy = upstreamCachePolicy(res.headers.get("cache-control"))
    if (policy === "cacheable") {
      setCached(cacheKey, data, TTL_SLOW)
      return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
    }
    return NextResponse.json(data, {
      headers: { "X-Cache": "BYPASS", ...(policy === "no-store" ? { "Cache-Control": "no-store" } : {}) },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch egress visibility" },
      { status: 502 },
    )
  }
}
