import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache for the v2 response (1 minute TTL)
let cache: { data: any; timestamp: number; key: string } | null = null
const CACHE_TTL_MS = 60 * 1000 // 1 minute

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const systemId = url.searchParams.get("systemId") || "alon-prod"
    const window = url.searchParams.get("window") || "7d"
    const mode = url.searchParams.get("mode") || "observed"

    // Create cache key
    const cacheKey = `${systemId}-${window}-${mode}`

    // Check cache
    const now = Date.now()
    if (cache && cache.key === cacheKey && now - cache.timestamp < CACHE_TTL_MS) {
      console.log(`[proxy] dependency-map/v2 cache hit for ${cacheKey}`)
      return NextResponse.json(cache.data, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      })
    }

    const backendUrl = `${BACKEND_URL}/api/dependency-map-v2?systemId=${encodeURIComponent(systemId)}&window=${window}&mode=${mode}`

    console.log(`[proxy] dependency-map/v2 -> ${backendUrl}`)

    // Create abort controller with longer timeout for cold starts
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    const res = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] dependency-map/v2 backend returned ${res.status}: ${errorText}`)

      // Return empty structure on error
      return NextResponse.json(
        {
          system_id: systemId,
          window: window,
          mode: mode,
          containers: [],
          nodes: [],
          edges: [],
          coverage: {
            flow_logs_enabled_enis_pct: 0,
            analysis_window: window,
            observed_edges: 0,
            total_flows: 0,
            notes: ["Backend error: " + res.status],
          },
          total_containers: 0,
          total_nodes: 0,
          total_edges: 0,
          categories: {},
          last_updated: new Date().toISOString(),
          error: `Backend returned ${res.status}`,
        },
        { status: 200 }
      )
    }

    const data = await res.json()

    // Update cache
    cache = { data, timestamp: now, key: cacheKey }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    })
  } catch (error: any) {
    console.error("[proxy] dependency-map/v2 error:", error)

    return NextResponse.json(
      {
        system_id: "unknown",
        window: "7d",
        mode: "observed",
        containers: [],
        nodes: [],
        edges: [],
        coverage: {
          flow_logs_enabled_enis_pct: 0,
          analysis_window: "7d",
          observed_edges: 0,
          total_flows: 0,
          notes: ["Error: " + (error.message || "Unknown error")],
        },
        total_containers: 0,
        total_nodes: 0,
        total_edges: 0,
        categories: {},
        last_updated: new Date().toISOString(),
        error: error.message || "Internal server error",
      },
      { status: 200 }
    )
  }
}
