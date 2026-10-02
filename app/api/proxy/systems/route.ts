import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const maxDuration = 120 // 2 minutes for Render cold starts + Neo4j query

const BACKEND_URL =
  getBackendBaseUrl()

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Retry configuration
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

/**
 * What the backend says about the answer's coverage, relayed verbatim (backend api/systems.py,
 * api/system_resources.py member_account_fields / collection_not_served_answer). Dropping them
 * turned a hold ("not recorded: NO_DATA_ACCOUNTS / REGION_NOT_SERVED") into an empty list and a
 * partial multi-account answer into a complete one.
 */
const COVERAGE_KEYS = [
  "semantic_status", "collection_status", "hold_reason", "accounts_held", "accounts_not_recorded",
  "regions_not_served", "withheld", "scope", "generations",
] as const

function isHold(data: any): boolean {
  return data?.semantic_status === "not_recorded" || data?.semantic_status === "unavailable"
}

async function isTypedRefusal(response: Response): Promise<boolean> {
  if (response.status !== 503) return false
  try {
    const body = await response.clone().json()
    return typeof body?.detail?.code === "string"
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const scope = new URLSearchParams()
  for (const key of ["customer_id", "account_group", "account_id", "region"]) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) scope.set(key, value)
  }
  const scopeQuery = scope.toString()
  const cacheKey = `systems:${scopeQuery || "unscoped"}`
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
      const backendUrl = `${BACKEND_URL}/api/systems${scopeQuery ? `?${scopeQuery}` : ""}`
      const response = await fetch(backendUrl, {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(90000), // 90 second timeout for cold starts
      })

      // Retry on 5xx errors -- but a typed 503 is the server's answer, not a blip.
      if (response.status >= 500 && attempt < MAX_RETRIES && !(await isTypedRefusal(response))) {
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
      console.error("[API Proxy] Backend error:", response.status)
      // Typed refusals (scope, held, unavailable) relayed typed; raw text never echoed.
      return relayBackendError(response)
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
      })
    }

    const coverage = Object.fromEntries(COVERAGE_KEYS.filter((key) => key in data).map((key) => [key, data[key]]))
    if (isHold(data)) {
      // A hold is a status report, not a list: systems stays null, nothing is cached.
      return NextResponse.json(
        { success: false, systems: data.systems ?? null, total: data.count ?? null, timestamp: data.timestamp,
          observation: data.observation ?? null, ...coverage },
        { headers: { "Cache-Control": "no-store", "X-Cache": "BYPASS-HOLD" } },
      )
    }

    const systems = Array.isArray(data.systems) ? data.systems : []

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
      total: data.total ?? data.count ?? disambiguated.length,
      timestamp: data.timestamp,
      // The range the systems list covers (lib/observation-coverage.ts).
      // Relayed verbatim; null when the backend recorded none.
      observation: data.observation ?? null,
      ...coverage,
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
