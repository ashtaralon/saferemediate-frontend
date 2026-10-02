import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

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
      return backendError({ status: r.status, message: "Family scores backend unavailable" })
    }
    const data: AllSystemsResponse = await r.json()
    const errors = Array.isArray(data.errors) ? data.errors.filter((e) => typeof e === "string") : []

    // The backend answers 200 with `total: 0, aggregate_layers: {}` and an
    // `errors` entry when its graph driver or system discovery failed. That is a
    // failed read, not "no systems contribute scores": answer it as one, and
    // never cache it.
    if (errors.length > 0 && Object.keys(data.aggregate_layers ?? {}).length === 0) {
      return backendError({ status: 502, message: "Family scores could not be computed", detail: errors.join(" · ").slice(0, 500) })
    }

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

    // The backend's own system count, or null -- never a defaulted 0.
    const total = typeof data.total === "number" && Number.isFinite(data.total) ? data.total : null
    const payload = {
      families,
      contributing_systems: total,
      total_systems: total,
      errors,
    }
    // A reading with per-system errors is partial: served (the card names the
    // errors), but not cached as the next reading.
    if (errors.length === 0) setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return fromCaughtError(e)
  }
}
