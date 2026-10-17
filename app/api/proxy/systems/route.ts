import { NextRequest, NextResponse } from "next/server"
import { accountAdminIdentityHeaders } from "@/lib/server/account-admin-proxy"
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

/**
 * On a customer-resident install the backend admits the PERSON behind each Systems read (api/systems.py), so an
 * answer is that person's: this proxy forwards the ALB's identity (accountAdminIdentityHeaders, as the account reads
 * do), never reads or writes the in-memory cache below, and marks every answer -- list, hold, refusal, error -- as
 * private, no-store. Other modes are unchanged.
 */
const PERSONAL = "private, no-store"

function personal(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", PERSONAL)
  if (!response.headers.get("X-Cache")) response.headers.set("X-Cache", "BYPASS-PERSON")
  return response
}

export async function GET(req: NextRequest) {
  const resident = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
  const scope = new URLSearchParams()
  for (const key of ["customer_id", "account_group", "account_id", "region"]) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) scope.set(key, value)
  }
  const scopeQuery = scope.toString()
  const cacheKey = `systems:${scopeQuery || "unscoped"}`
  const now = Date.now()
  const identity = resident ? await accountAdminIdentityHeaders(req) : {}

  // Check cache (never on a resident install: a cached list is another person's answer)
  const cached = resident ? undefined : cache.get(cacheKey)
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
          ...identity,
        },
        ...(resident ? { cache: "no-store" as const } : {}),
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
      // Typed refusals (scope, held, unavailable, and on an install the person's 401 / 403) relayed typed; raw text
      // never echoed.
      const relayed = await relayBackendError(response)
      return resident ? personal(relayed) : relayed
    }

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[API Proxy] Failed to parse JSON:", responseText.substring(0, 200))
      const failed = backendError({
        status: 502,
        message: "Systems backend returned non-JSON response",
      })
      return resident ? personal(failed) : failed
    }

    const coverage = Object.fromEntries(COVERAGE_KEYS.filter((key) => key in data).map((key) => [key, data[key]]))
    // A7 B5: which Systems list contract the backend answered (systems_list_read/v2: one row per system identity). Relayed
    // only when present, so a v1 answer is byte-identical; dropping it would make the page read a v2 list as v1.
    if (data && typeof data === "object" && "contract" in data) coverage.contract = data.contract
    if (isHold(data)) {
      // A hold is a status report, not a list: systems stays null, nothing is cached.
      const held = NextResponse.json(
        { success: false, systems: data.systems ?? null, total: data.count ?? null, timestamp: data.timestamp,
          observation: data.observation ?? null, ...coverage },
        { headers: { "Cache-Control": "no-store", "X-Cache": "BYPASS-HOLD" } },
      )
      return resident ? personal(held) : held
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

    if (resident) {
      console.log("[API Proxy] Found", systems.length, "systems from backend (person-scoped, not cached)")
      return personal(NextResponse.json(responseData))
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
    const failed = fromCaughtError(error)
    return resident ? personal(failed) : failed
  }
}
