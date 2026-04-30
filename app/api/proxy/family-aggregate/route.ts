import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "family-aggregate"

/**
 * GET /api/proxy/family-aggregate
 *
 * Fans out across /api/systems → /api/service-risk-scores/{system} per
 * system → aggregates per-family scores into a single org-wide row.
 *
 * Honesty contract:
 *   - Aggregates only systems that returned a non-null layers payload.
 *     Systems where service-risk-scores fails are tracked in errors[],
 *     never silently averaged in.
 *   - Per-family score is the resource-weighted average across systems
 *     where that layer applies. Systems with resource_count == 0 are
 *     excluded from that family (they shouldn't pull the average).
 *   - Returns counts of contributing systems so the operator can see
 *     "this family is averaged across N systems."
 */

type Layer = {
  name: string
  score: number
  resource_count: number
  enforced_count?: number
  exposed_count?: number
}

type ServiceRiskResp = {
  system_name?: string
  layers?: Record<string, Layer>
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
    const systems: Array<{ name?: string; SystemName?: string }> = Array.isArray(
      sysData?.systems,
    )
      ? sysData.systems
      : []

    if (systems.length === 0) {
      return NextResponse.json({
        families: {},
        contributing_systems: 0,
        total_systems: 0,
        errors: [],
      })
    }

    const perSystem = await Promise.allSettled(
      systems.map(async (s) => {
        const name = s.SystemName ?? s.name
        if (!name) throw new Error("system missing name")
        const r = await fetch(
          `${BACKEND_URL}/api/service-risk-scores/${encodeURIComponent(name)}`,
          { cache: "no-store" },
        )
        if (!r.ok) throw new Error(`backend ${r.status} for ${name}`)
        const data: ServiceRiskResp = await r.json()
        return { name, layers: data.layers ?? {} }
      }),
    )

    const fulfilled = perSystem
      .filter((p): p is PromiseFulfilledResult<{ name: string; layers: Record<string, Layer> }> =>
        p.status === "fulfilled",
      )
      .map((p) => p.value)
    const errors = perSystem
      .filter((p): p is PromiseRejectedResult => p.status === "rejected")
      .map((p) => String(p.reason))

    // Resource-weighted average per layer name.
    type FamilyAccum = { weighted: number; weight: number; systems: number }
    const families: Record<string, FamilyAccum> = {}

    for (const s of fulfilled) {
      for (const [layerName, layer] of Object.entries(s.layers)) {
        if (!layer || typeof layer.score !== "number") continue
        if (layer.resource_count <= 0) continue
        const acc = families[layerName] ?? { weighted: 0, weight: 0, systems: 0 }
        acc.weighted += layer.score * layer.resource_count
        acc.weight += layer.resource_count
        acc.systems += 1
        families[layerName] = acc
      }
    }

    const out: Record<string, { score: number; weight: number; contributing_systems: number }> = {}
    for (const [name, acc] of Object.entries(families)) {
      out[name] = {
        score: acc.weight > 0 ? Math.round((acc.weighted / acc.weight) * 100) / 100 : 0,
        weight: acc.weight,
        contributing_systems: acc.systems,
      }
    }

    const payload = {
      families: out,
      contributing_systems: fulfilled.length,
      total_systems: systems.length,
      errors,
    }
    // 5-min TTL because this org-wide aggregate fans out N+1 Cypher
    // queries (one per system) and the data only meaningfully changes
    // when a system gets re-ingested. Used to be 60s — bumped because
    // user reported the FamilyStrip card "loaded very very slow and
    // stuck" on the home dashboard. The N+1 fan-out + Render cold-start
    // means a fresh miss can take 30s+; serving 5-min-old data instead
    // is the right trade.
    setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      { error: "family_aggregate_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
