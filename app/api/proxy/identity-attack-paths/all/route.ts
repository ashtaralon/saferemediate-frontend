import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "identity-attack-paths-all"

// Snapshot read. Live /all fan-out is 49-265s and this proxy used to wait
// 55s, 502, and leave the overview on a day-old cache ("as of 1d ago,
// refreshing"). The durable IAP snapshots are the dashboard source.
export const maxDuration = 15

/**
 * GET /api/proxy/identity-attack-paths/all
 *
 * Org-wide attack-paths aggregator. PASSTHROUGH to backend
 * /api/identity-attack-paths/all?snapshot_only=true.
 *
 * BEFORE 2026-05-01: this proxy did the fan-out itself — fetched
 * /api/systems then per-system /api/identity-attack-paths/{name} in
 * parallel. That meant N+1 HTTP roundtrips Vercel→Render. With
 * Render free tier rate-limiting and Vercel function budget, the N
 * per-system calls were timing out (TimeoutError) and the card was
 * stuck rendering 0 jewels even though every system actually had
 * crown jewels.
 *
 * AFTER 2026-08-16: dashboard reads `?snapshot_only=true`. Live fan-out
 * stays on the prewarm path. Proxy cache is belt-and-suspenders.
 */
export async function GET(_req: NextRequest) {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(
      `${BACKEND_URL}/api/identity-attack-paths/all?snapshot_only=true`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        // Snapshot inventory is a DynamoDB read. If this exceeds 8s the
        // workers are wedged on a live fan-out — fail fast, keep last cache.
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "attack_paths_all_unavailable",
          backend_status: r.status,
          crown_jewels: [],
          total_jewels: 0,
          total_paths: 0,
          exposed_jewels: 0,
          systems_scanned: 0,
          errors: [`backend ${r.status}`],
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    setCached(CACHE_KEY, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "attack_paths_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        crown_jewels: [],
        total_jewels: 0,
        total_paths: 0,
        exposed_jewels: 0,
        systems_scanned: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      },
      { status: 502 },
    )
  }
}
