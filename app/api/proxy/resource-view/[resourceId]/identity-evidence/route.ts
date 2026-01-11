import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// In-memory cache: 2 minute TTL for identity evidence
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 120 * 1000 // 2 minutes

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Identity Evidence Proxy] Retry attempt ${attempt} for: ${url}`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 55000)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError" && attempt < retries) {
          console.warn(`[Identity Evidence Proxy] Timeout on attempt ${attempt + 1}, retrying...`)
          continue
        }
        throw fetchError
      }
    } catch (error: any) {
      if (attempt === retries) {
        throw error
      }
    }
  }
  throw new Error("All retry attempts failed")
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  try {
    const { resourceId } = await params
    const searchParams = request.nextUrl.searchParams
    const days = searchParams.get("days") || "7"

    const encodedResourceId = encodeURIComponent(resourceId)
    const cacheKey = `identity-evidence:${resourceId}:${days}`
    const now = Date.now()

    // Check in-memory cache
    const cached = cache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cached.timestamp) / 1000)
      console.log(`[Identity Evidence Proxy] Cache HIT for ${resourceId} (age: ${cacheAge}s)`)
      return NextResponse.json(cached.data, {
        headers: {
          "X-Cache": "HIT",
          "X-Cache-Age": String(cacheAge),
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      })
    }

    console.log(`[Identity Evidence Proxy] Cache MISS - Fetching identity evidence for: ${resourceId}`)

    // Main request with retry logic
    const response = await fetchWithRetry(
      `${BACKEND_URL}/api/resource-view/${encodedResourceId}/identity-evidence?days=${days}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(
        `[Identity Evidence Proxy] Backend error: ${response.status}`,
        errorText
      )

      // Return cached data if available, even if stale
      if (cached) {
        console.log(`[Identity Evidence Proxy] Returning stale cache due to backend error`)
        return NextResponse.json(cached.data, {
          headers: {
            "X-Cache": "STALE",
            "X-Cache-Age": String(Math.round((now - cached.timestamp) / 1000)),
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
          },
        })
      }

      // Return 200 with empty data instead of propagating error
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          detail: errorText,
          connections: [],
          iam_access_events: [],
          summary: {
            total_connections: 0,
            healthy: 0,
            anomaly: 0,
            critical: 0,
            iam_events: 0,
            has_root_access: false
          },
        },
        {
          status: 200,
          headers: {
            "X-Cache": "MISS",
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
          },
        }
      )
    }

    const data = await response.json()
    console.log(
      `[Identity Evidence Proxy] Success: ${data.summary?.total_connections || 0} connections, ${data.summary?.iam_events || 0} IAM events`
    )

    // Store in cache
    cache.set(cacheKey, { data, timestamp: now })

    // Clean up old cache entries (keep cache size reasonable)
    if (cache.size > 50) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }

    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    })
  } catch (error: any) {
    console.error("[Identity Evidence Proxy] Error:", error)

    // Check for stale cache
    const { resourceId } = await params
    const searchParams = request.nextUrl.searchParams
    const days = searchParams.get("days") || "7"
    const cacheKey = `identity-evidence:${resourceId}:${days}`
    const cached = cache.get(cacheKey)

    if (cached) {
      console.log(`[Identity Evidence Proxy] Returning stale cache due to error`)
      return NextResponse.json(cached.data, {
        headers: {
          "X-Cache": "STALE",
          "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000)),
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      })
    }

    // Always return 200 with empty data to prevent UI crashes
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch identity evidence",
        timeout: error.name === "AbortError",
        connections: [],
        iam_access_events: [],
        summary: {
          total_connections: 0,
          healthy: 0,
          anomaly: 0,
          critical: 0,
          iam_events: 0,
          has_root_access: false
        },
      },
      {
        status: 200,
        headers: {
          "X-Cache": "MISS",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      }
    )
  }
}
