import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "family-aggregate"

export const maxDuration = 30

/**
 * GET /api/proxy/family-aggregate
 *
 * Org-wide aggregated per-family scores (Permissions / Network / Data).
 * Reads from the backend aggregator at /api/service-risk-scores/all-systems
 * (single HTTP call) instead of fanning out per-system from Vercel.
 *
 * Response shape kept compatible with the previous self-fan-out version
 * so the FamilyStrip card doesn't need to change:
 *   { families: { privilege: {score, weight, contributing_systems}, ... },
 *     contributing_systems: int,
 *     total_systems: int,
 *     errors: string[] }
 *
 * Pre-2026-05-01 this proxy did its own fan-out (1 + N HTTP roundtrips).
 * That triggered timeouts on Render free-tier under concurrent load
 * (the user saw stuck cards / 504s on the home dashboard). The backend
 * now does the fan-out in-process via asyncio.gather, returning
 * per-system layers + aggregate_layers in one call. Vercel proxy is a
 * thin passthrough.
 */

type AggLayer = { score: number; weight: number; contributing_systems: number }

type AllSystemsResponse = {
  systems?: any[]
  total?: number
  aggregate_layers?: Record<string, AggLayer>
  errors?: string[]
  computed_at?: string
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
          families: {},
          contributing_systems: 0,
          total_systems: 0,
          errors: [`backend ${r.status}`],
        },
        { status: 502 },
      )
    }
    const data: AllSystemsResponse = await r.json()

    // Translate backend's `aggregate_layers` shape to the legacy
    // `families` shape the card expects.
    const families: Record<string, AggLayer> = {}
    for (const [name, layer] of Object.entries(data.aggregate_layers ?? {})) {
      families[name] = {
        score: layer.score,
        weight: layer.weight,
        contributing_systems: layer.contributing_systems,
      }
    }

    const payload = {
      families,
      contributing_systems: data.total ?? 0,
      total_systems: data.total ?? 0,
      errors: data.errors ?? [],
    }
    setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "family_aggregate_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        families: {},
        contributing_systems: 0,
        total_systems: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      },
      { status: 502 },
    )
  }
}
