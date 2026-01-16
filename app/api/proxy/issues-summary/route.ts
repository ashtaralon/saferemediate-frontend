import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60
  
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(systemName: string | null): string {
  return `issues-summary:${systemName || 'all'}`
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  const cacheKey = getCacheKey(systemName)
  const now = Date.now()
  
  // Check cache
  const cached = cache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    console.log(`[proxy] Issues summary cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[proxy] Issues summary cache MISS - fetching from backend`)

  try {
    const backendUrl = systemName
      ? `${BACKEND_URL}/api/issues/summary?systemName=${encodeURIComponent(systemName)}`
      : `${BACKEND_URL}/api/issues/summary`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 seconds
    
    const res = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error(`[proxy] Issues summary error: ${res.status} ${res.statusText}`)
      
      // Return cached data if available
      if (cached) {
        console.log(`[proxy] Returning stale cache due to backend error`)
        return NextResponse.json(cached.data, {
          headers: {
            'X-Cache': 'STALE',
            'X-Cache-Age': String(Math.round((now - cached.timestamp) / 1000)),
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          }
        })
      }
      
      // Return 200 with fallback data to prevent client crash
      return NextResponse.json({
        error: "Backend error",
        backendStatus: res.status,
        total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
        by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
        issues: [],
        cached: false,
        fallback: true,
      })
    }

    const data = await res.json()
    console.log(`[proxy] Issues summary fetched - total: ${data.total}`)
    
    // Store in cache
    cache.set(cacheKey, { data, timestamp: now })
    
    // Clean old cache entries
    if (cache.size > 100) {
      const entriesToDelete: string[] = []
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          entriesToDelete.push(key)
        }
      }
      entriesToDelete.forEach(key => cache.delete(key))
    }
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'MISS',
      }
    })
  } catch (error: any) {
    console.error("[proxy] Issues summary fetch error:", error)
    
    // Return cached data if available
    if (cached) {
      console.log(`[proxy] Returning stale cache due to error`)
      return NextResponse.json(cached.data, {
        headers: {
          'X-Cache': 'STALE',
          'X-Cache-Age': String(Math.round((now - cached.timestamp) / 1000)),
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        }
      })
    }
    
    // Return 200 with fallback data to prevent client crash
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      total: 0,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
      by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
      issues: [],
      cached: false,
      fallback: true,
    })
  }
}
