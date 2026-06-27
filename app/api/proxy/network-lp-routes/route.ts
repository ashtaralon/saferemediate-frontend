import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

// Route: /api/proxy/network-lp-routes
// Network-LP route verdicts for a subnet (candidate-grade, observed).
// Backend: GET /api/network-lp/routes?subnet_id=...
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subnetId = searchParams.get("subnet_id")
  if (!subnetId) {
    return NextResponse.json({ error: "subnet_id query parameter is required" }, { status: 400 })
  }
  const forceRefresh = searchParams.get("refresh") === "true"
  const cacheKey = `network-lp:${subnetId}`
  const now = Date.now()

  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, { status: 200, headers: { "X-Cache": "HIT" } })
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)
    const params = new URLSearchParams({ subnet_id: subnetId })
    const res = await fetch(`${BACKEND_URL}/api/network-lp/routes?${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      const cached = cache.get(cacheKey)
      if (cached) {
        return NextResponse.json(cached.data, { status: 200, headers: { "X-Cache": "STALE" } })
      }
      return backendError({
        status: res.status,
        message: `network-lp-routes backend returned ${res.status}`,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await res.json()
    cache.set(cacheKey, { data, timestamp: now })
    if (cache.size > 50) {
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) cache.delete(key)
      }
    }
    return NextResponse.json(data, {
      status: 200,
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
    })
  } catch (error: unknown) {
    console.error("[proxy] network-lp-routes error:", error)
    return fromCaughtError(error)
  }
}
