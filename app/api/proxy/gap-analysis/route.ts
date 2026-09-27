import { NextRequest, NextResponse } from "next/server"
import { fromCaughtError } from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Use Node.js runtime for longer timeout (60s on Pro, 10s on Hobby)
// Edge Runtime has 30s limit which is too short for slow backend queries
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 60 // Maximum execution time in seconds (Vercel Pro tier)

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"

function serverToken(): string | null {
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  return token || null
}

function countOrUnmeasured(value: unknown): number | null {
  if (typeof value === "boolean" || typeof value !== "number" || Number.isNaN(value)) return null
  return value
}

// In-memory cache for gap analysis (5-minute TTL)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// 2026-07-04 — removed SYSTEM_TO_ROLE_MAP. It silently substituted the
// AlonIAMTest role's gap numbers for the "alon-prod" SYSTEM card (and two
// dead legacy names) — wrong data presented as the system's. Pass-through:
// an unknown name gets the backend's honest 404/error and the UI's honest
// error state, never someone else's numbers.
function getRoleName(systemName: string): string {
  return systemName
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 })
  }
  const token = serverToken()
  if (!token) {
    return NextResponse.json(
      {
        error_code: NOT_CONFIGURED,
        code: NOT_CONFIGURED,
        error: "This request carries no verified identity and this deployment has no service token configured (CYNTRO_SERVICE_TOKEN), so the read cannot be authorized. Installing the token is a release prerequisite.",
        origin: "proxy",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
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
      `${getBackendBaseUrl()}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90`,
      {
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          [SERVICE_TOKEN_HEADER]: token,
        },
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error(`[proxy] gap-analysis backend returned ${res.status}: ${errorText.slice(0, 200)}`)
      let parsed: unknown = null
      try {
        parsed = errorText ? JSON.parse(errorText) : null
      } catch {
        parsed = null
      }
      if (parsed !== null && typeof parsed === "object") {
        return NextResponse.json(parsed, {
          status: res.status,
          headers: { "Cache-Control": "no-store" },
        })
      }
      return NextResponse.json(
        {
          error: `gap-analysis backend returned ${res.status}`,
          detail: errorText.slice(0, 500),
          backendStatus: res.status,
          origin: "proxy",
        },
        { status: res.status, headers: { "Cache-Control": "no-store" } },
      )
    }

    const data = await res.json()
    const summary = data?.summary && typeof data.summary === "object" ? data.summary : {}
    const allowed = countOrUnmeasured(data?.allowed_count ?? summary.allowed_count ?? data?.allowedCount)
    const used = countOrUnmeasured(data?.used_count ?? summary.used_count ?? data?.usedCount)
    const unused = countOrUnmeasured(data?.unused_count ?? summary.unused_count ?? data?.unusedCount)
    const transformed = {
      ...data,
      allowed_actions: allowed,
      used_actions: used,
      unused_actions: unused,
      allowed_count: allowed,
      used_count: used,
      unused_count: unused,
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
