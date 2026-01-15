import { NextRequest, NextResponse } from "next/server"

// Use Node.js runtime for longer timeout (60s on Pro, 10s on Hobby)
// Edge Runtime has 30s limit which is too short for slow backend queries
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 60 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache for gap analysis (5-minute TTL)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Map system names to IAM role names
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda-Remediation-Role": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const roleName = getRoleName(systemName)
  const forceRefresh = url.searchParams.get("refresh") === "true"

  const cacheKey = `gap:${roleName}`
  const now = Date.now()

  // Check cache (unless force refresh)
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cached.timestamp) / 1000)
      console.log(`[proxy] gap-analysis cache HIT for ${roleName} (age: ${cacheAge}s)`)
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
  }

  console.log(`[proxy] gap-analysis cache MISS - fetching ${roleName} from backend`)

  // Timeout to prevent Vercel limit - increased to 55s for slow backend cold starts
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout

  try {
    console.log(`[proxy] IAM gap analysis for role: ${roleName}`)

    // Use the correct endpoint: /api/iam-roles/{role_name}/gap-analysis
    const res = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] gap-analysis backend returned ${res.status}: ${errorText}`)

      // Return stale cache if available
      const cached = cache.get(cacheKey)
      if (cached) {
        console.log(`[proxy] gap-analysis returning stale cache due to backend error`)
        return NextResponse.json({
          ...cached.data,
          fromCache: true,
          stale: true
        }, {
          headers: { 'X-Cache': 'STALE' }
        })
      }

      // Return 200 with empty data to prevent UI crashes
      return NextResponse.json({
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        allowed_count: 0,
        used_count: 0,
        unused_count: 0,
        backend_error: true,
        backend_status: res.status,
        message: `Backend returned ${res.status} - using cached data`
      }, { status: 200 }) // Always 200 to prevent UI errors
    }

    const data = await res.json()

    // Transform field names: backend uses snake_case, frontend expects different names
    // Backend: allowed_count, used_count, unused_count
    // Frontend: allowed_actions, used_actions, unused_actions
    const transformed = {
      ...data,
      // Map the field names
      allowed_actions: data.allowed_count ?? data.summary?.allowed_count ?? data.allowedCount ?? 0,
      used_actions: data.used_count ?? data.summary?.used_count ?? data.usedCount ?? 0,
      unused_actions: data.unused_count ?? data.summary?.unused_count ?? data.unusedCount ??
        ((data.allowed_count ?? data.summary?.allowed_count ?? 0) - (data.used_count ?? data.summary?.used_count ?? 0)),
      // Also keep original fields for backwards compatibility
      allowed_count: data.allowed_count ?? data.summary?.allowed_count ?? 0,
      used_count: data.used_count ?? data.summary?.used_count ?? 0,
      unused_count: data.unused_count ?? data.summary?.unused_count ?? 0,
    }

    // Store in cache
    cache.set(cacheKey, { data: transformed, timestamp: now })

    // Cleanup old cache entries (keep max 50)
    if (cache.size > 50) {
      const entriesToDelete: string[] = []
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          entriesToDelete.push(key)
        }
      }
      entriesToDelete.forEach(key => cache.delete(key))
    }

    return NextResponse.json({
      ...transformed,
      fromCache: false
    }, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error(`[proxy] gap-analysis error:`, error.name, error.message)

    // Return stale cache if available
    const cached = cache.get(cacheKey)
    if (cached) {
      console.log(`[proxy] gap-analysis returning stale cache due to error`)
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
        stale: true
      }, {
        headers: { 'X-Cache': 'STALE' }
      })
    }

    // ALWAYS return 200 with empty data to prevent UI crashes
    // This handles: AbortError (timeout), network errors, etc.
    return NextResponse.json({
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      allowed_count: 0,
      used_count: 0,
      unused_count: 0,
      timeout: error.name === 'AbortError',
      error: true,
      message: error.name === 'AbortError'
        ? "Analysis is taking longer than expected - data will refresh shortly"
        : "Backend temporarily unavailable - please refresh"
    }, { status: 200 }) // Always 200 to prevent UI errors
  }
}
