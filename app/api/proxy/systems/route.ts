import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Increased for Render cold starts

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.BACKEND_API_URL || 
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET() {
  const cacheKey = 'systems:all'
  const now = Date.now()
  
  // Check cache
  const cached = cache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    console.log(`[API Proxy] Systems cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
      }
    })
  }
  
  console.log(`[API Proxy] Systems cache MISS - fetching from backend`)
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/systems`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(55000), // 55 second timeout (Render cold start can take 50s)
    })

    if (!response.ok) {
      const responseText = await response.text()
      console.error("[API Proxy] Backend error:", response.status, responseText.substring(0, 200))

      // Return cached data if available, even if stale
      if (cached) {
        console.log(`[API Proxy] Returning stale cache due to backend error`)
        return NextResponse.json(cached.data, {
          headers: {
            'X-Cache': 'STALE',
            'X-Cache-Age': String(Math.round((now - cached.timestamp) / 1000)),
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          }
        })
      }

      if (response.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "Systems endpoint not found",
            hint: "Make sure your backend has the /api/systems endpoint implemented.",
            offline: false,
            systems: [],
            total: 0,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          systems: [],
          total: 0,
        },
        { status: 200 }
      )
    }

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[API Proxy] Failed to parse JSON:", responseText.substring(0, 200))
      return NextResponse.json(
        {
          success: false,
          error: "Invalid response from backend",
          hint: "Backend returned non-JSON response",
          systems: [],
          total: 0,
        },
        { status: 200 }
      )
    }

    const systems = data.systems || []
    const responseData = {
      success: true,
      systems,
      total: data.total || systems.length,
      timestamp: data.timestamp,
    }

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

    console.log("[API Proxy] Found", systems.length, "systems from backend")
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'MISS',
      }
    })
  } catch (error: any) {
    console.error("[API Proxy] Fetch failed:", error.name, error.message)

    // Return cached data if available
    if (cached) {
      console.log(`[API Proxy] Returning stale cache due to error`)
      return NextResponse.json(cached.data, {
        headers: {
          'X-Cache': 'STALE',
          'X-Cache-Age': String(Math.round((now - cached.timestamp) / 1000)),
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        }
      })
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to connect to backend",
        hint: "Make sure your backend is running at " + BACKEND_URL,
        offline: true,
        systems: [],
        total: 0,
      },
      { status: 200 }
    )
  }
}
