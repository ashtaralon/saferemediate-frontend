import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

// Route: /api/proxy/data-access-s3
// Per-object S3 access for the Traffic Flow Map object expander.
// Backend: GET /api/data-access/s3/objects?bucket_arn=...
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bucketArn = searchParams.get("bucket_arn")
  if (!bucketArn) {
    return NextResponse.json(
      { error: "bucket_arn query parameter is required" },
      { status: 400 },
    )
  }
  const forceRefresh = searchParams.get("refresh") === "true"
  const cacheKey = `data-access-s3:${bucketArn}`
  const now = Date.now()

  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        status: 200,
        headers: { "X-Cache": "HIT" },
      })
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)
    const params = new URLSearchParams({ bucket_arn: bucketArn })
    const backendUrl = `${BACKEND_URL}/api/data-access/s3/objects?${params}`

    const res = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      // Stale-cache fallback on backend error.
      const cached = cache.get(cacheKey)
      if (cached) {
        return NextResponse.json(cached.data, {
          status: 200,
          headers: { "X-Cache": "STALE" },
        })
      }
      return backendError({
        status: res.status,
        message: `data-access-s3 backend returned ${res.status}`,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await res.json()
    cache.set(cacheKey, { data, timestamp: now })
    if (cache.size > 50) {
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) cache.delete(key)
      }
    }
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    })
  } catch (error: unknown) {
    console.error("[proxy] data-access-s3 error:", error)
    return fromCaughtError(error)
  }
}
