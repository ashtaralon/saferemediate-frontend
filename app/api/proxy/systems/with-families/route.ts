import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "systems-with-families"

export const maxDuration = 30

/**
 * GET /api/proxy/systems/with-families
 *
 * Per-system data with per-family layer scores (privilege/network/data).
 * Used by the home dashboard's "Top systems by blast radius" card and
 * by the dense-table operator home.
 *
 * Pre-2026-05-01 this proxy did the fan-out itself: /api/systems +
 * one /api/service-risk-scores/{name} per system. That meant N+1 HTTP
 * roundtrips Vercel↔Render and triggered timeouts under load.
 *
 * Now passthrough to backend /api/service-risk-scores/all-systems —
 * server-side fan-out via asyncio.gather. Single HTTP call from
 * Vercel; backend's 5-min cache absorbs repeats.
 */

type Layer = { name: string; score: number; resource_count: number }

type System = {
  name?: string
  SystemName?: string
  layers?: Record<string, Layer>
  system_score?: number
  criticality?: string
  resource_count?: number
}

type AllSystemsResponse = {
  systems?: System[]
  total?: number
  aggregate_layers?: Record<string, any>
  errors?: string[]
}

export async function GET(_req: NextRequest) {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(`${BACKEND_URL}/api/service-risk-scores/all-systems`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "all_systems_endpoint_unavailable",
          backend_status: r.status,
          systems: [],
          total: 0,
          errors: [`backend ${r.status}`],
        },
        { status: 502 },
      )
    }
    const data: AllSystemsResponse = await r.json()
    // The backend already returns the shape this proxy used to produce
    // (systems[] each with `layers`). Just pass it through verbatim.
    const payload = {
      systems: data.systems ?? [],
      total: data.total ?? 0,
      errors: data.errors ?? [],
    }
    setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "systems_with_families_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        systems: [],
        total: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      },
      { status: 502 },
    )
  }
}
