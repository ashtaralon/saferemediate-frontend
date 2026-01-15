import { NextRequest, NextResponse } from "next/server"

// Route: /api/proxy/traffic-data
// Returns actual traffic data from VPC Flow Logs (ACTUAL_TRAFFIC relationships)
// Use this to populate Flow Strip "What Happened" section with real data
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache for traffic data (2-minute TTL)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

function getCacheKey(systemName: string, resourceId: string | null): string {
  return `traffic:${systemName}:${resourceId || 'all'}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("system_name") || "alon-prod"
  const resourceId = searchParams.get("resource_id")
  const forceRefresh = searchParams.get("refresh") === "true"

  const cacheKey = getCacheKey(systemName, resourceId)
  const now = Date.now()

  // Check cache (unless force refresh)
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cached.timestamp) / 1000)
      console.log(`[proxy] traffic-data cache HIT (age: ${cacheAge}s)`)
      return NextResponse.json(cached.data, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
          "X-Cache-Age": String(cacheAge),
        },
      })
    }
  }

  console.log(`[proxy] traffic-data cache MISS - fetching from backend`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout (under 60s Vercel limit)

    const params = new URLSearchParams({ system_name: systemName })
    if (resourceId) {
      params.append("resource_id", resourceId)
    }

    const backendUrl = `${BACKEND_URL}/api/dependency-map/traffic-data?${params}`

    console.log(`[proxy] traffic-data -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] traffic-data backend returned ${res.status}: ${errorText}`)

      // Return stale cache if available
      const cached = cache.get(cacheKey)
      if (cached) {
        console.log(`[proxy] traffic-data returning stale cache due to backend error`)
        return NextResponse.json(cached.data, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "STALE",
          },
        })
      }

      // Return empty fallback data to prevent UI crashes
      return NextResponse.json({
        system_name: systemName,
        resource_id: resourceId,
        observed_ports: { ports: [], totalPorts: 0, utilizationPercent: 0, summary: "No data available" },
        traffic_timeline: { period: "7d", data: [], totalRequests: 0, avgDailyRequests: 0 },
        flows: [],
        unique_sources: [],
        has_traffic_data: false,
        error: `Backend returned ${res.status}`,
      }, { status: 200 })
    }

    const data = await res.json()

    // Store in cache
    cache.set(cacheKey, { data, timestamp: now })

    // Cleanup old cache entries (keep max 50)
    if (cache.size > 50) {
      const entriesToDelete: string[] = []
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          entriesToDelete.push(key)
        }
      }
      entriesToDelete.forEach(key => cache.delete(key))
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    })
  } catch (error: any) {
    console.error("[proxy] traffic-data error:", error)

    // Return stale cache if available
    const cached = cache.get(cacheKey)
    if (cached) {
      console.log(`[proxy] traffic-data returning stale cache due to error`)
      return NextResponse.json(cached.data, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "STALE",
        },
      })
    }

    // Return empty fallback data on error
    return NextResponse.json({
      observed_ports: { ports: [], totalPorts: 0, utilizationPercent: 0, summary: "Error loading data" },
      traffic_timeline: { period: "7d", data: [], totalRequests: 0, avgDailyRequests: 0 },
      flows: [],
      unique_sources: [],
      has_traffic_data: false,
      error: error.name === "AbortError" ? "Request timed out" : error.message,
    }, { status: 200 })
  }
}
