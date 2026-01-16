import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// In-memory cache: 2 minutes TTL for dependency map (balance freshness/speed)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const includeUnused = url.searchParams.get("includeUnused") ?? "true"
  const maxNodes = url.searchParams.get("maxNodes") ?? "200"
  const search = url.searchParams.get("search") ?? ""

  const cacheKey = `dependency-map:${systemName}:${includeUnused}:${maxNodes}:${search}`
  const now = Date.now()
  
  // Check in-memory cache
  const cached = cache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    console.log(`[Dependency Map Full Proxy] Cache HIT for ${systemName} (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        "X-Cache": "HIT",
        "X-Cache-Age": String(cacheAge),
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    })
  }
  
  console.log(`[Dependency Map Full Proxy] Cache MISS - Fetching for ${systemName}...`)

  try {
    const controller = new AbortController()
    // Reduced timeout to 25 seconds to prevent long waits
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    let backendUrl = `${BACKEND_URL}/api/dependency-map/full?` +
      `system_name=${encodeURIComponent(systemName)}` +
      `&include_unused=${includeUnused}` +
      `&max_nodes=${maxNodes}`

    // Add search parameter if provided
    if (search) {
      backendUrl += `&search=${encodeURIComponent(search)}`
    }

    console.log(`[Dependency Map Full Proxy] Fetching from: ${backendUrl}`)
    
    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Dependency Map Full Proxy] Backend error ${res.status}: ${errorText}`)
      
      // Return cached data if available, even if stale
      if (cached) {
        console.log(`[Dependency Map Full Proxy] Returning stale cache due to backend error`)
        return NextResponse.json(cached.data, {
          headers: {
            "X-Cache": "STALE",
            "X-Cache-Age": String(Math.round((now - cached.timestamp) / 1000)),
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
          },
        })
      }
      
      return NextResponse.json(
        { nodes: [], edges: [], error: errorText },
        { 
          status: 200, // Return 200 instead of error status to prevent UI crashes
          headers: {
            "X-Cache": "MISS",
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
          },
        }
      )
    }

    const data = await res.json()
    console.log(`[Dependency Map Full Proxy] Success: ${data.total_nodes || 0} nodes, ${data.total_edges || 0} edges`)

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
    const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout')
    console.error(`[Dependency Map Full Proxy] Error${isTimeout ? ' (timeout)' : ''}:`, error.message)
    
    // Check for stale cache first
    if (cached) {
      console.log(`[Dependency Map Full Proxy] Returning stale cache due to ${isTimeout ? 'timeout' : 'error'}`)
      return NextResponse.json(cached.data, {
        headers: {
          "X-Cache": "STALE",
          "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000)),
          "X-Timeout": isTimeout ? "true" : "false",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      })
    }
    
    // Return empty data with 200 status to prevent UI crash
    return NextResponse.json(
      { 
        nodes: [], 
        edges: [], 
        error: isTimeout ? "Request timed out" : error.message,
        timeout: isTimeout,
      },
      { 
        status: 200, // Return 200 instead of 500 to prevent UI crashes
        headers: {
          "X-Cache": "MISS",
          "X-Timeout": isTimeout ? "true" : "false",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      }
    )
  }
}
