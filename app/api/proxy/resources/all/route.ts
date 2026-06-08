import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// In-memory cache: 5 minutes TTL for resources (changes rarely). Only
// stores SUCCESSFUL responses. Backend-error and stale-cache-on-error
// fallbacks were removed because they hid the 5-minute Render outage
// on 2026-05-04 — the Inventory tab rendered an empty resource list
// instead of an honest error state.
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const regions = searchParams.get('regions') || 'eu-west-1'
  const includeGlobal = searchParams.get('includeGlobal') !== 'false'
  const cacheKey = `resources:all:${regions}:${includeGlobal}`
  const now = Date.now()
  
  // Check in-memory cache
  const cached = cache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    console.log(`[Resources All Proxy] Cache HIT (age: ${cacheAge}s)`)
    return NextResponse.json(cached.data, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(cacheAge),
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  }
  
  console.log(`[Resources All Proxy] Cache MISS - Fetching resources...`)
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout
    
    const response = await fetch(
      `${BACKEND_URL}/api/resources/all?regions=${encodeURIComponent(regions)}&include_global=${includeGlobal}`,
      { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    )
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(`[Resources All Proxy] Backend error ${response.status}: ${errorText}`)
      return backendError({
        status: response.status,
        message: `Resources backend returned ${response.status}`,
        detail: errorText.slice(0, 500),
      })
    }
    
    const data = await response.json()
    
    // Store in cache
    cache.set(cacheKey, { data, timestamp: now })
    
    // Clean up old cache entries (keep cache size reasonable)
    if (cache.size > 50) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }
    
    console.log(`[Resources All Proxy] Success: ${data.s3_buckets?.length || 0} S3, ${data.ec2_instances?.length || 0} EC2`)
    
    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
    
  } catch (error: any) {
    console.error('[Resources All Proxy] Error:', error.message)
    return fromCaughtError(error)
  }
}
