import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// Simple in-memory cache for IAM gap analysis
const iamCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const forceRefresh = url.searchParams.get("refresh") === "true"
  
  const cacheKey = `${roleName}-${days}`
  const now = Date.now()
  
  // If force refresh, delete the cached entry first
  if (forceRefresh) {
    console.log(`[IAM Proxy] Force refresh - clearing cache for ${roleName}`)
    iamCache.delete(cacheKey)
  }
  
  const cached = iamCache.get(cacheKey)
  
  // Return cached if valid and not forcing refresh
  if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
    console.log(`[IAM Proxy] Cache HIT for ${roleName}`)
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    return NextResponse.json({ 
      ...cached.data, 
      fromCache: true,
      cacheAge
    }, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }

  console.log(`[IAM Proxy] Fetching ${roleName} from backend... (refresh=${forceRefresh})`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000)

  try {
    const backendUrl = `${BACKEND_URL}/api/iam/gap-analysis/${encodeURIComponent(roleName)}?days=${days}`
    console.log(`[IAM Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText}`)
      
      // Return stale cache if available
      if (cached) {
        console.log(`[IAM Proxy] Returning stale cache for ${roleName}`)
        return NextResponse.json({ 
          ...cached.data, 
          fromCache: true, 
          stale: true,
          cacheAge: Math.round((now - cached.timestamp) / 1000)
        }, {
          headers: { 'X-Cache': 'STALE' }
        })
      }
      
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[IAM Proxy] Success: LP score ${data.summary?.lp_score}, used=${data.summary?.used_count}, unused=${data.summary?.unused_count}`)

    // Cache the result
    iamCache.set(cacheKey, { data, timestamp: now })
    
    // Cleanup old cache entries (keep max 50)
    if (iamCache.size > 50) {
      const oldestKey = iamCache.keys().next().value
      if (oldestKey) iamCache.delete(oldestKey)
    }

    return NextResponse.json({ 
      ...data, 
      fromCache: false 
    }, {
      headers: {
        'X-Cache': 'MISS',
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)

    console.error(`[IAM Proxy] Error for ${roleName}:`, error.message)
    
    // Return stale cache if available
    if (cached) {
      console.log(`[IAM Proxy] Returning stale cache for ${roleName} due to error`)
      return NextResponse.json({ 
        ...cached.data, 
        fromCache: true, 
        stale: true,
        cacheAge: Math.round((now - cached.timestamp) / 1000)
      }, {
        headers: { 'X-Cache': 'STALE' }
      })
    }

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout", detail: "Backend did not respond in time" },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
