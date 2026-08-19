import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  getStaleCached,
  setCached,
  TTL_FAST,
  TTL_SLOW,
} from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

function crownJewelCount(data: unknown): number {
  if (!data || typeof data !== "object") return -1
  const d = data as Record<string, unknown>
  const nested =
    (d.result as Record<string, unknown> | undefined)?.crown_jewels ??
    (d.data as Record<string, unknown> | undefined)?.crown_jewels ??
    d.crown_jewels
  return Array.isArray(nested) ? nested.length : -1
}

function hasUsableJewels(data: unknown): boolean {
  return crownJewelCount(data) > 0
}

/** Lightweight Crown Jewel list — pairs with BE /identity-attack-paths/{system}/jewels */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const cacheKey = `iap-jewels:${systemName}`
  // This endpoint is the authoritative, lightweight rail summary. Always
  // revalidate it: risk/path counts can change after a collector run and an
  // in-process/CDN HIT made the operator's Refresh action keep rendering the
  // old 0/LOW state for five minutes. The retained cache is now recovery-only
  // and is served solely when the backend is unavailable.

  try {
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}/jewels?max_jewels=12`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[iap-jewels] backend ${res.status}: ${body.slice(0, 200)}`)
      if (res.status >= 500) {
        const stale = getStaleCached(cacheKey)
        // Only degrade to stale when it actually has jewels — never
        // re-poison the rail with a cached empty.
        if (stale && hasUsableJewels(stale)) {
          console.warn(
            `[iap-jewels] backend ${res.status} — serving stale cache systemName=${systemName}`,
          )
          return NextResponse.json(
            { ...stale, fromStaleCache: true, staleReason: `backend_${res.status}` },
            {
              headers: {
                "X-Cache": "STALE",
                "Cache-Control": "no-store",
              },
            },
          )
        }
      }
      return NextResponse.json(
        { error: `backend_${res.status}`, crown_jewels: [] },
        { status: res.status },
      )
    }
    const data = await res.json()
    // Authoritative non-empty → long TTL. Empty → short TTL so a post-rebuild
    // populate is visible within ~30s, not stuck for 5 minutes.
    setCached(cacheKey, data, hasUsableJewels(data) ? TTL_SLOW : TTL_FAST)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "no-store",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(cacheKey)
    if (stale && hasUsableJewels(stale)) {
      console.warn(`[iap-jewels] ${isTimeout ? "timeout" : "fetch failed"} — serving stale cache systemName=${systemName}`)
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: isTimeout ? "timeout" : "fetch_failed" },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    console.error(`[iap-jewels] systemName=${systemName} error=${msg}`)
    return NextResponse.json(
      { error: "iap_jewels_proxy_error", message: msg, crown_jewels: [] },
      { status: 502 },
    )
  }
}
