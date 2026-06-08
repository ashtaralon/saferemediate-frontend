import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

// Use Node.js runtime for longer timeout (60s on Pro, 10s on Hobby)
// Edge Runtime has 30s limit which is too short for slow backend queries
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 60 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache for gap analysis (5-minute TTL)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Map system names to IAM role names
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "AlonIAMTest",
  "SafeRemediate-Test": "AlonIAMTest",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda-Remediation-Role": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 })
  }
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
      const errorText = await res.text().catch(() => "")
      console.error(`[proxy] gap-analysis backend returned ${res.status}: ${errorText.slice(0, 200)}`)
      return backendError({
        status: res.status,
        message: `gap-analysis backend returned ${res.status}`,
        detail: errorText.slice(0, 500),
      })
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
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const e = error as Error
    console.error(`[proxy] gap-analysis error:`, e?.name, e?.message)
    return fromCaughtError(error)
  }
}
