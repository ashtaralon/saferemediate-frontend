import { NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 15-minute TTL for SWR (Stale-While-Revalidate)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const STALE_THRESHOLD = 30 * 60 * 1000 // 30 minutes - data older than this is considered too stale

export async function GET() {
  const cacheKey = 'graph-data:all'
  const now = Date.now()
  
  // Check cache - SWR: return stale data immediately if available
  const cached = cache.get(cacheKey)
  const cacheAge = cached ? Math.round((now - cached.timestamp) / 1000) : 0
  const isStale = cached && (now - cached.timestamp) >= CACHE_TTL
  const isTooStale = cached && (now - cached.timestamp) >= STALE_THRESHOLD
  
  // Return fresh cache immediately
  if (cached && !isStale) {
    console.log(`[v0] Graph data cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=900',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  // SWR: Return stale cache immediately, update in background
  if (cached && isStale && !isTooStale) {
    console.log(`[v0] Graph data cache STALE (age: ${cacheAge}s) - returning stale data, updating in background`)
    
    // Update cache in background (don't await)
    updateCacheInBackground(cacheKey).catch(err => {
      console.error('[v0] Background cache update failed:', err)
    })
    
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=900',
        'X-Cache': 'STALE',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[v0] Graph data cache MISS - fetching from backend`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 seconds

    // Fetch nodes and edges in parallel
    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
      fetch(`${BACKEND_URL}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
    ])

    clearTimeout(timeoutId)

    if (!nodesResponse.ok || !edgesResponse.ok) {
      const failingStatus = !nodesResponse.ok ? nodesResponse.status : edgesResponse.status
      console.error("[v0] Graph data fetch failed - nodes:", nodesResponse.status, "edges:", edgesResponse.status)
      return backendError({
        status: failingStatus,
        message: `Graph backend returned nodes:${nodesResponse.status} edges:${edgesResponse.status}`,
      })
    }

    const nodesData = await nodesResponse.json()
    const edgesData = await edgesResponse.json()

    const responseData = {
      success: true,
      nodes: nodesData.nodes || nodesData || [],
      relationships: edgesData.edges || edgesData.relationships || edgesData || [],
    }

    console.log(
      "[v0] Graph data fetched - nodes:",
      responseData.nodes?.length || 0,
      "edges:",
      responseData.relationships?.length || 0,
    )

    // Store in cache
    cache.set(cacheKey, { data: responseData, timestamp: now })
    
    // Clean old cache entries
    if (cache.size > 50) {
      const entriesToDelete: string[] = []
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          entriesToDelete.push(key)
        }
      }
      entriesToDelete.forEach(key => cache.delete(key))
    }

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=900',
        'X-Cache': 'MISS',
      }
    })
  } catch (error: unknown) {
    const e = error as Error
    console.error("[v0] Graph data fetch error:", e?.name === 'AbortError' ? 'Request timed out' : e)
    return fromCaughtError(error)
  }
}

// Background cache update function for SWR
async function updateCacheInBackground(cacheKey: string) {
  const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const [nodesResponse, edgesResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/graph/nodes`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
      fetch(`${BACKEND_URL}/api/graph/relationships`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }),
    ])

    clearTimeout(timeoutId)

    if (nodesResponse.ok && edgesResponse.ok) {
      const nodesData = await nodesResponse.json()
      const edgesData = await edgesResponse.json()

      const responseData = {
        success: true,
        nodes: nodesData.nodes || nodesData || [],
        relationships: edgesData.edges || edgesData.relationships || edgesData || [],
      }

      cache.set(cacheKey, { data: responseData, timestamp: Date.now() })
      console.log('[v0] Background cache update successful')
    }
  } catch (error: any) {
    console.error('[v0] Background cache update failed:', error.name === 'AbortError' ? 'Request timed out' : error)
  }
}
