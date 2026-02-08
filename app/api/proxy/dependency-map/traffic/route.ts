import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

// Shared cache with the full dependency map route
const trafficCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30 * 1000 // 30 seconds

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const live = url.searchParams.get("live") === "true"

  const cacheKey = `traffic:${systemName}`
  const now = Date.now()

  // Check cache first
  const cached = trafficCache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    console.log(`[Traffic API] Cache HIT`)
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT" },
    })
  }

  console.log(`[Traffic API] Fetching traffic data for ${systemName}...`)

  try {
    // Fetch from the dependency map endpoint (which has its own cache)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    const depMapUrl = `${BACKEND_URL}/api/dependency-map/full?system_name=${encodeURIComponent(systemName)}&max_nodes=500`

    const depRes = await fetch(depMapUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    clearTimeout(timeoutId)

    if (!depRes.ok) {
      throw new Error(`Backend returned ${depRes.status}`)
    }

    const depData = await depRes.json()
    const edges = depData.edges || depData.relationships || []

    // Filter for traffic-related edges
    const trafficTypes = ['ACTUAL_TRAFFIC', 'OBSERVED_TRAFFIC', 'ACTUAL_API_CALL', 'API_CALL', 'RUNTIME_CALLS', 'ACTUAL_S3_ACCESS', 'ACCESSES_RESOURCE']

    const trafficEdges = edges.filter((e: any) => {
      const edgeType = e.edge_type || e.type || ''
      return trafficTypes.includes(edgeType)
    })

    // Aggregate by source-target
    const trafficMap = new Map<string, any>()

    trafficEdges.forEach((e: any) => {
      const key = `${e.source}-${e.target}`
      const existing = trafficMap.get(key)
      const bytes = e.traffic_bytes || 0

      if (existing) {
        existing.request_count += 1
        existing.bytes_transferred += bytes
      } else {
        trafficMap.set(key, {
          source: e.source,
          target: e.target,
          edge_type: e.edge_type || e.type,
          request_count: 1,
          bytes_transferred: bytes,
          protocol: e.protocol || 'unknown',
          port: e.port || null,
          is_used: e.is_used !== false,
          confidence: e.confidence || 1,
          last_seen: new Date().toISOString(),
        })
      }
    })

    // Convert to sorted array
    const trafficData = Array.from(trafficMap.values())
      .sort((a, b) => b.bytes_transferred - a.bytes_transferred)
      .slice(0, 500)

    // Calculate summary
    const totalBytes = trafficData.reduce((sum, t) => sum + t.bytes_transferred, 0)
    const totalRequests = trafficData.reduce((sum, t) => sum + t.request_count, 0)

    const responseData = {
      system_name: systemName,
      live,
      timestamp: new Date().toISOString(),
      summary: {
        total_flows: trafficData.length,
        active_flows: trafficData.filter(t => t.is_used).length,
        total_bytes: totalBytes,
        total_requests: totalRequests,
        bytes_formatted: formatBytes(totalBytes),
      },
      traffic: trafficData,
    }

    // Cache result
    trafficCache.set(cacheKey, { data: responseData, timestamp: now })

    console.log(`[Traffic API] Success: ${trafficData.length} flows, ${formatBytes(totalBytes)}`)

    return NextResponse.json(responseData, {
      headers: { "X-Cache": "MISS" },
    })

  } catch (error: any) {
    const isTimeout = error.name === 'AbortError'
    console.error(`[Traffic API] ${isTimeout ? 'Timeout' : 'Error'}:`, error.message)

    // Return cached if available
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache": "STALE" },
      })
    }

    // Return empty result
    return NextResponse.json({
      system_name: systemName,
      live,
      timestamp: new Date().toISOString(),
      summary: {
        total_flows: 0,
        active_flows: 0,
        total_bytes: 0,
        total_requests: 0,
        bytes_formatted: "0 B",
      },
      traffic: [],
      error: isTimeout ? "Backend timeout" : error.message,
    })
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
