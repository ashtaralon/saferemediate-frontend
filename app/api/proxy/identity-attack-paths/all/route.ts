import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "identity-attack-paths-all"

/**
 * GET /api/proxy/identity-attack-paths/all
 *
 * Fans out across /api/systems and merges every system's
 * crown_jewels[] into a single org-wide list, sorted by
 * priority_score desc.
 *
 * Per-system error isolation: if one system's attack-paths fetch
 * fails, the others still surface; failures appear in errors[].
 *
 * Honest: no synthesis. If a system returns no crown_jewels (graph
 * empty for that system), we just don't add rows for it.
 */

type CrownJewel = {
  id: string
  name: string
  type: string
  severity: string
  path_count?: number
  highest_risk_score?: number
  is_internet_exposed?: boolean
  data_classification?: string | null
  priority_score?: number
  system_name?: string
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

    const fetched = await Promise.allSettled(
      systems.map(async (s) => {
        const name = s.SystemName ?? s.name
        if (!name) return { name: null, jewels: [] as CrownJewel[] }
        const r = await fetch(
          `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(name)}?max_jewels=12&max_paths_per_jewel=3`,
          { cache: "no-store", signal: AbortSignal.timeout(45000) },
        )
        if (!r.ok) throw new Error(`backend ${r.status} for ${name}`)
        const data = await r.json()
        const jewels: CrownJewel[] = Array.isArray(data?.crown_jewels)
          ? data.crown_jewels
          : []
        return { name, jewels: jewels.map((j) => ({ ...j, system_name: name })) }
      }),
    )

    const fulfilled: Array<{ name: string | null; jewels: CrownJewel[] }> = []
    const errors: string[] = []
    for (const p of fetched) {
      if (p.status === "fulfilled") {
        fulfilled.push(p.value)
      } else {
        errors.push(String(p.reason))
      }
    }

    const allJewels = fulfilled.flatMap((f) => f.jewels)
    const totalPaths = allJewels.reduce((sum, j) => sum + (j.path_count ?? 0), 0)
    const exposedJewels = allJewels.filter((j) => j.is_internet_exposed === true).length

    // Sort by priority_score desc; fall back to highest_risk_score, then path_count.
    allJewels.sort((a, b) => {
      const pa = a.priority_score ?? a.highest_risk_score ?? a.path_count ?? 0
      const pb = b.priority_score ?? b.highest_risk_score ?? b.path_count ?? 0
      return pb - pa
    })

    const payload = {
      crown_jewels: allJewels,
      total_jewels: allJewels.length,
      total_paths: totalPaths,
      exposed_jewels: exposedJewels,
      systems_scanned: fulfilled.filter((f) => f.name).length,
      errors,
    }
    // 5-min TTL — N+1 fan-out, one /api/identity-attack-paths/<system>
    // call per system. Heavy Cypher per call. Bumped from TTL_STD (60s)
    // to TTL_SLOW (5min) because the data only meaningfully changes on
    // re-ingest, and the cold-start hit on this fan-out was reported
    // as a major source of "stuck" page loads.
    setCached(CACHE_KEY, payload, TTL_SLOW)
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "attack_paths_fanout_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }
}
