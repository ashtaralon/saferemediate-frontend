import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Per-system list of HAS_RISK findings. Nested under a static `by-system`
// segment because a sibling `resource-risk/[resourceId]` route already exists
// (per-resource blast-radius) — Next.js forbids two slug names at one level.

export const runtime = "nodejs"
export const maxDuration = 60

/** Success-only in-memory cache — stale serve on cold timeout only. */
const successCache = new Map<
  string,
  { data: unknown; cachedAt: number }
>()
const CACHE_TTL_MS = 2 * 60 * 1000
const STALE_MAX_MS = 30 * 60 * 1000

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ system: string }> },
) {
  const { system } = await params
  if (!system) {
    return backendError({ status: 400, message: "system path param required" })
  }

  // Canonical resolver: BACKEND_URL_OVERRIDE (the frontend-local launch config
  // sets it to http://127.0.0.1:8000) → Render prod default.
  const BACKEND_URL = getBackendBaseUrl()
  const cacheKey = system
  const now = Date.now()
  const hit = successCache.get(cacheKey)
  if (hit && now - hit.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    })
  }

  const controller = new AbortController()
  // Indexed HAS_RISK read is <1s warm / a few seconds cold. A 55s abort made
  // Trust Exposure feel hung while Render was already 502ing (~40s). Fail
  // fast so the UI can retry or paint stale cache.
  const timeoutId = setTimeout(() => controller.abort(), 12_000)

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/resource-risk/${encodeURIComponent(system)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    )
    clearTimeout(timeoutId)

    if (!res.ok) {
      // Prefer recent success over a hard error card when Aura/Render flaps.
      if (hit && now - hit.cachedAt < STALE_MAX_MS) {
        return NextResponse.json(
          {
            ...(hit.data as object),
            fromStaleCache: true,
            staleReason: `backend_${res.status}`,
          },
          {
            headers: {
              "X-Cache": "STALE",
              "Cache-Control": "no-store",
            },
          },
        )
      }
      const detail = await res.text().catch(() => "")
      return backendError({
        status: res.status,
        message: `Resource-risk backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()
    successCache.set(cacheKey, { data, cachedAt: now })
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      hit &&
      now - hit.cachedAt < STALE_MAX_MS
    ) {
      return NextResponse.json(
        {
          ...(hit.data as object),
          fromStaleCache: true,
          staleReason: "timeout",
        },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    return fromCaughtError(error)
  }
}
