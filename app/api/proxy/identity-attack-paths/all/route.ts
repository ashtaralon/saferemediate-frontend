import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "identity-attack-paths-all"

// Explicit Vercel route config — ensures the function has 30s budget
// regardless of vercel.json glob matching. The backend now does the
// heavy lifting (single Cypher fan-out) so this proxy is a thin
// passthrough; 30s is more than enough.
export const maxDuration = 30

/**
 * GET /api/proxy/identity-attack-paths/all
 *
 * Org-wide attack-paths aggregator. PASSTHROUGH to backend
 * /api/identity-attack-paths/all.
 *
 * BEFORE 2026-05-01: this proxy did the fan-out itself — fetched
 * /api/systems then per-system /api/identity-attack-paths/{name} in
 * parallel. That meant N+1 HTTP roundtrips Vercel→Render. With
 * Render free tier rate-limiting and Vercel function budget, the N
 * per-system calls were timing out (TimeoutError) and the card was
 * stuck rendering 0 jewels even though every system actually had
 * crown jewels.
 *
 * AFTER: backend does the fan-out internally (single HTTP call from
 * Vercel; backend's 5min process-local cache absorbs repeats; the
 * Cypher work happens once per cache window instead of N times per
 * page load).
 *
 * Proxy keeps its own 5-min cache as belt-and-suspenders so warm
 * Lambdas don't even have to talk to Render most of the time.
 */
export async function GET(_req: NextRequest) {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(`${BACKEND_URL}/api/identity-attack-paths/all`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      // 25s — well under the function budget. If the backend takes
      // longer than this, something is wrong upstream and we want
      // to surface that fast rather than burn the function budget.
      signal: AbortSignal.timeout(25000),
    })
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
