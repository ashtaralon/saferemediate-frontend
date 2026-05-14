import { NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const dynamic = "force-dynamic"
export const maxDuration = 120 // 2 minutes for Render cold starts + Neo4j query

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Retry configuration
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

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

  // Helper function to fetch with retry
  async function fetchWithRetry(attempt = 1): Promise<Response> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/systems`, {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(90000), // 90 second timeout for cold starts
      })

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.log(`[API Proxy] Got ${response.status}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        return fetchWithRetry(attempt + 1)
      }

      return response
    } catch (error: any) {
      // Retry on timeout/network errors
      if (attempt < MAX_RETRIES && (error.name === 'TimeoutError' || error.name === 'AbortError' || error.message.includes('fetch'))) {
        console.log(`[API Proxy] Fetch error: ${error.message}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        return fetchWithRetry(attempt + 1)
      }
      throw error
    }
  }

  try {
    const response = await fetchWithRetry()

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      console.error("[API Proxy] Backend error:", response.status, responseText.substring(0, 200))
      return backendError({
        status: response.status,
        message: `Systems backend returned ${response.status}`,
        detail: responseText.slice(0, 500),
      })
    }

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[API Proxy] Failed to parse JSON:", responseText.substring(0, 200))
      return backendError({
        status: 502,
        message: "Systems backend returned non-JSON response",
        detail: responseText.slice(0, 500),
      })
    }

    const systems = data.systems || []

    // Disambiguate case-insensitive name collisions for the picker UI.
    // Backend currently emits separate entries for e.g. "Payment-Production"
    // and "payment-production" — different account_ids, different finding
    // counts, but visually identical in a dropdown. Until backend dedupes
    // at source, append an account-id tag to displayName so the operator
    // can tell them apart. Original `name` (used as lookup key everywhere)
    // is untouched.
    const nameCounts = new Map<string, number>()
    for (const s of systems) {
      const key = String(s.name || "").toLowerCase()
      if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
    }
    const disambiguated = systems.map((s: any) => {
      const key = String(s.name || "").toLowerCase()
      if ((nameCounts.get(key) || 0) <= 1) return s
      const acct = s.account_id ? `acct ${String(s.account_id).slice(-4)}` : "no account"
      return {
        ...s,
        displayName: `${s.displayName || s.name} [${acct}]`,
        nameAmbiguous: true,
      }
    })

    const responseData = {
      success: true,
      systems: disambiguated,
      total: data.total || disambiguated.length,
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
  } catch (error: unknown) {
    const e = error as Error
    console.error("[API Proxy] Fetch failed:", e?.name, e?.message)
    return fromCaughtError(error)
  }
}
