import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// In-memory cache: 1 minute TTL for connections
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 1 minute

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[ResourceView Proxy] Retry attempt ${attempt} for: ${url}`)
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
          console.warn(`[ResourceView Proxy] Timeout on attempt ${attempt + 1}, retrying...`)
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
    const encodedResourceId = encodeURIComponent(resourceId)
    const cacheKey = `connections:${resourceId}`
    const now = Date.now()

    // Check in-memory cache
    const cached = cache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cached.timestamp) / 1000)
      console.log(`[ResourceView Proxy] Cache HIT for ${resourceId} (age: ${cacheAge}s)`)
      return NextResponse.json(cached.data, {
        headers: {
          "X-Cache": "HIT",
          "X-Cache-Age": String(cacheAge),
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      })
    }

    console.log(`[ResourceView Proxy] Cache MISS - Fetching connections for: ${resourceId}`)

    // Warm-up request to wake Render if it's sleeping
    try {
      const warmupResponse = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)
      
      if (warmupResponse?.ok) {
        console.log(`[ResourceView Proxy] Backend is awake`)
      }
    } catch (e) {
      console.log(`[ResourceView Proxy] Warmup skipped, proceeding...`)
    }

    // Main request with retry logic
    const response = await fetchWithRetry(
      `${BACKEND_URL}/api/resource-view/${encodedResourceId}/connections`,
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
        `[ResourceView Proxy] Backend error: ${response.status}`,
        errorText
      )
      return backendError({
        status: response.status,
        message: `connections backend returned ${response.status}`,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await response.json()
    console.log(
      `[ResourceView Proxy] Success: ${data.inbound_count || 0} inbound, ${data.outbound_count || 0} outbound`
    )

    // Store in cache
    cache.set(cacheKey, { data, timestamp: now })
    
    // Clean up old cache entries (keep cache size reasonable)
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }

    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    })
  } catch (error: unknown) {
    console.error("[ResourceView Proxy] Error:", error)
    return fromCaughtError(error)
  }
}
