import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "systems-with-families"

/**
 * GET /api/proxy/systems/with-families
 *
 * Returns the list of systems WITH their per-family layer scores
 * (privilege / network / data). Required to render the mix-bar in
 * the Top 5 systems table.
 *
 * Fans out: /api/systems → /api/service-risk-scores/{system_name}
 * for each. Per-system error isolation; failures end up in errors[],
 * the system row still appears (just without family data).
 *
 * Honest: no synthesis. If service-risk-scores returns empty layers,
 * we surface that — never invent a mix.
 */

type Layer = { name: string; score: number; resource_count: number }
type LayerMap = Record<string, Layer>

type ServiceRiskResp = {
  system_name?: string
  layers?: LayerMap
  error?: string
}

export async function GET(_req: NextRequest) {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const sysRes = await fetch(`${BACKEND_URL}/api/systems`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!sysRes.ok) {
      return NextResponse.json(
        { error: "systems_endpoint_unavailable", backend_status: sysRes.status },
        { status: 502 },
      )
    }
    const sysData = await sysRes.json()
    const systems: any[] = Array.isArray(sysData?.systems) ? sysData.systems : []

    const enriched = await Promise.allSettled(
      systems.map(async (s) => {
        const name = s.SystemName ?? s.name
        if (!name) return { ...s, layers: null }
        const r = await fetch(
          `${BACKEND_URL}/api/service-risk-scores/${encodeURIComponent(name)}`,
          { cache: "no-store" },
        )
        if (!r.ok) {
          throw new Error(`backend ${r.status} for ${name}`)
        }
        const data: ServiceRiskResp = await r.json()
        return { ...s, layers: data.layers ?? null }
      }),
    )

    const fulfilled = enriched
      .filter((p): p is PromiseFulfilledResult<any> => p.status === "fulfilled")
      .map((p) => p.value)
    const errors = enriched
      .filter((p): p is PromiseRejectedResult => p.status === "rejected")
      .map((p) => String(p.reason))

    const payload = {
      systems: fulfilled,
      total: fulfilled.length,
      errors,
    }
    // 5-min TTL — N+1 fan-out (one /api/service-risk-scores/<system>
    // per system). Bumped from TTL_STD (60s) → TTL_SLOW (5min) because
    // the data changes only on re-ingest and the cold-start hit was a
    // major contributor to "stuck" home dashboard loads.
    setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "systems_with_families_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }
}
