import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in ms

const EMPTY_RESPONSE = {
  summary: {
    totalResources: 0,
    totalExcessPermissions: 0,
    avgLPScore: 100,
    iamIssuesCount: 0,
    networkIssuesCount: 0,
    s3IssuesCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    confidenceLevel: 0,
    observationDays: 365,
    attackSurfaceReduction: 0
  },
  resources: [],
  timestamp: new Date().toISOString()
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const observationDays = url.searchParams.get("observationDays") ?? "365"
  const forceRefresh = url.searchParams.get("refresh") === "true"
  
  const cacheKey = `${systemName}-${observationDays}`
  const now = Date.now()
  
  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && cachedData && cachedData.cacheKey === cacheKey && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[LP Proxy] Returning cached data')
    const cacheAge = Math.round((now - cacheTimestamp) / 1000)
    return NextResponse.json({
      ...cachedData.data,
      fromCache: true,
      cacheAge
    }, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[LP Proxy] Fetching fresh data from backend... (refresh=${forceRefresh})`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout

    // Build backend URL with parameters
    let backendUrl = `${BACKEND_URL}/api/least-privilege/issues?observationDays=${observationDays}`
    if (systemName) {
      backendUrl += `&systemName=${encodeURIComponent(systemName)}`
    }

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Proxy] Backend returned ${res.status}: ${errorText}`)
      
      // Return stale cache if available
      if (cachedData && cachedData.cacheKey === cacheKey) {
        console.log('[LP Proxy] Returning stale cache due to backend error')
        return NextResponse.json({
          ...cachedData.data,
          fromCache: true,
          stale: true,
          cacheAge: Math.round((now - cacheTimestamp) / 1000)
        }, {
          headers: { 'X-Cache': 'STALE' }
        })
      }
      
      // Return empty structure to avoid breaking UI
      return NextResponse.json({
        ...EMPTY_RESPONSE,
        observationDays: parseInt(observationDays)
      }, { status: 200 })
    }

    const data = await res.json()
    
    // Update cache
    cachedData = { cacheKey, data }
    cacheTimestamp = now
    
    console.log(`[LP Proxy] Cached ${data.resources?.length || 0} resources`)
    
    return NextResponse.json({
      ...data,
      fromCache: false
    }, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    })
  } catch (error: any) {
    console.error("[LP Proxy] Error:", error.message)

    // Return stale cache if available
    if (cachedData && cachedData.cacheKey === cacheKey) {
      console.log('[LP Proxy] Returning stale cache due to error')
      return NextResponse.json({
        ...cachedData.data,
        fromCache: true,
        stale: true,
        cacheAge: Math.round((now - cacheTimestamp) / 1000)
      }, {
        headers: { 'X-Cache': 'STALE' }
      })
    }

    // Return empty structure on any error
    return NextResponse.json({
      ...EMPTY_RESPONSE,
      observationDays: parseInt(observationDays)
    }, { status: 200 })
  }
}
