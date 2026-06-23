import { NextRequest, NextResponse } from "next/server"
import {
  backendError,
  fromCaughtError,
} from "@/lib/server/proxy-error"

// Proxy → real backend /api/security-groups/{sgId}/gap-analysis endpoint
// that returns per-rule recommendation + confidence + traffic.

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const CACHE_TTL_MS = 2 * 60 * 1000
const cache: Record<string, { data: unknown; timestamp: number }> = {}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sgId: string }> | { sgId: string } },
) {
  let sgId = ""
  try {
    if (context.params instanceof Promise) {
      const resolved = await context.params
      sgId = resolved.sgId
    } else {
      sgId = (context.params as { sgId: string }).sgId
    }

    if (!sgId) {
      return NextResponse.json(
        { error: true, message: "Missing sgId parameter" },
        { status: 400 },
      )
    }

    const cached = cache[sgId]
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
      })
    }

    const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/gap-analysis`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error(`[SG Rule Analysis] Backend ${res.status}: ${detail.slice(0, 200)}`)
      return backendError({
        status: res.status,
        message: `Security group gap-analysis returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()
    cache[sgId] = { data, timestamp: Date.now() }
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    console.error(
      "[SG Rule Analysis] Error:",
      error instanceof Error ? error.message : error,
    )
    const cached = sgId ? cache[sgId] : undefined
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      cached
    ) {
      return NextResponse.json(
        { ...cached.data, fromStaleCache: true, staleReason: "timeout" },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    return fromCaughtError(error)
  }
}
