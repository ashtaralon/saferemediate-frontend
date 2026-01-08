import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 10 // Reduced to match Vercel free tier limits (5s) with buffer

const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(limit: number, days: number, roleName: string | null): string {
  return `cloudtrail:${limit}:${days}:${roleName || ''}`
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:21',message:'Request started',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const { searchParams } = new URL(req.url)
  // Aggressively cap limits to prevent timeouts - Vercel free tier has 5s timeout
  let limit = parseInt(searchParams.get('limit') || '100')
  let days = parseInt(searchParams.get('days') || searchParams.get('lookbackDays') || '7')
  const roleName = searchParams.get('roleName')
  
  // Reduce query size aggressively for Vercel timeout limits
  if (limit > 100) limit = 100  // Max 100 events
  if (days > 7) days = 7        // Max 7 days
  
  console.log(`[proxy] CloudTrail events: limit=${limit}, days=${days}, roleName=${roleName || 'none'}`)
  
  // Check cache
  const cacheKey = getCacheKey(limit, days, roleName)
  const cached = cache.get(cacheKey)
  const now = Date.now()
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:37',message:'Cache HIT',data:{cacheAge,elapsed:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log(`[proxy] CloudTrail cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:47',message:'Cache MISS - fetching backend',data:{elapsed:Date.now()-startTime,backendUrl:BACKEND_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  console.log(`[proxy] CloudTrail cache MISS - fetching from backend`)
  
  const controller = new AbortController()
  // Use 4 second timeout to stay well under Vercel's 5s free tier limit
  const timeoutId = setTimeout(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:50',message:'Timeout triggered',data:{elapsed:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    controller.abort()
  }, 4000) // 4 second timeout - well under Vercel's 5s free tier limit
  
  try {
    // Backend endpoint is /api/traffic/cloudtrail (not /api/cloudtrail/events)
    let backendUrl = `${BACKEND_URL}/api/traffic/cloudtrail?days=${days}&limit=${limit}`
    if (roleName) {
      backendUrl += `&roleName=${encodeURIComponent(roleName)}`
    }
    const fetchStartTime = Date.now()
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:60',message:'Starting backend fetch',data:{backendUrl,elapsed:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.log(`[proxy] Calling: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    
    const fetchElapsed = Date.now() - fetchStartTime
    clearTimeout(timeoutId)
    const elapsed = Date.now() - startTime
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:72',message:'Backend fetch completed',data:{status:response.status,fetchElapsed,elapsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3e225f22-2009-4adc-becd-46492cc46094',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cloudtrail-events-route.ts:113',message:'Error caught',data:{errorName:error.name,errorMessage:error.message,elapsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    if (error.name === 'AbortError') {
      console.error(`[proxy] CloudTrail events timeout (${elapsed}ms) - returning empty with cache hint`)
      // Return empty result instead of error - frontend can handle empty arrays
      // This prevents 504 errors and allows cache to work on retry
      return NextResponse.json(
        { 
          events: [], 
          total: 0,
          error: 'Request timeout - try again or reduce query size',
          cached: false
        },
        { 
          status: 200, // Return 200 with empty data instead of 504
          headers: {
            'Cache-Control': 'no-store', // Don't cache timeout responses
            'X-Timeout': 'true',
            'X-Elapsed-Ms': String(elapsed),
          }
        }
      )
    }
    
    console.error(`[proxy] CloudTrail events error (${elapsed}ms):`, error.message)
    return NextResponse.json(
      { events: [], error: error.message },
      { status: 500 }
    )
  }
}
