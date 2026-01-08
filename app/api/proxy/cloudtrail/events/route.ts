import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Increased for Vercel

const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(searchParams: URLSearchParams): string {
  const limit = searchParams.get('limit') || '100'
  const days = searchParams.get('days') || searchParams.get('lookbackDays') || '7'
  const roleName = searchParams.get('roleName') || ''
  return `cloudtrail:${limit}:${days}:${roleName}`
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '100'
  const days = searchParams.get('days') || searchParams.get('lookbackDays') || '7'
  const roleName = searchParams.get('roleName')
  
  console.log(`[proxy] CloudTrail events: limit=${limit}, days=${days}, roleName=${roleName || 'none'}`)
  
  // Check cache
  const cacheKey = getCacheKey(searchParams)
  const cached = cache.get(cacheKey)
  const now = Date.now()
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    console.log(`[proxy] CloudTrail cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[proxy] CloudTrail cache MISS - fetching from backend`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout
  
  try {
    // Backend endpoint is /api/traffic/cloudtrail (not /api/cloudtrail/events)
    let backendUrl = `${BACKEND_URL}/api/traffic/cloudtrail?days=${days}`
    if (roleName) {
      backendUrl += `&roleName=${encodeURIComponent(roleName)}`
    }
    console.log(`[proxy] Calling: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    
    clearTimeout(timeoutId)
    const elapsed = Date.now() - startTime
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[proxy] Backend error ${response.status} (${elapsed}ms): ${errorText}`)
      return NextResponse.json(
        { events: [], error: `Backend error: ${response.status}` },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log(`[proxy] Got ${data.events?.length || 0} CloudTrail events (${elapsed}ms)`)
    
    // Backend returns { status: "success", events: [...], total: ... }
    // Transform to match frontend expectations
    const responseData = {
      events: data.events || [],
      total: data.total || 0,
      ...data
    }
    
    // Store in cache
    cache.set(cacheKey, { data: responseData, timestamp: now })
    
    // Clean old cache entries (keep only recent ones)
    if (cache.size > 100) {
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
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'MISS',
        'X-Elapsed-Ms': String(elapsed),
      }
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    const elapsed = Date.now() - startTime
    
    if (error.name === 'AbortError') {
      console.error(`[proxy] CloudTrail events timeout (${elapsed}ms)`)
      return NextResponse.json(
        { events: [], error: 'Request timeout' },
        { status: 504 }
      )
    }
    
    console.error(`[proxy] CloudTrail events error (${elapsed}ms):`, error.message)
    return NextResponse.json(
      { events: [], error: error.message },
      { status: 500 }
    )
  }
}
