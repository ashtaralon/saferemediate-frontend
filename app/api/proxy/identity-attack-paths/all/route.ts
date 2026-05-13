import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
const CACHE_KEY = "identity-attack-paths-all"

// Match the per-system route's 60s budget. The backend /all aggregator
// does an in-process fan-out across every distinct SystemName and the
// per-system handler is CPU-bound on the graph traversal / normalization
// segments, so /all can run >30s on accounts with multiple systems even
// when each individual system fits in the proxy budget. Surfacing 502
// after 25s was leaving the operator with a broken page instead of a
// slow one — 60s lets the slow path complete, while still capping at
// the vercel.json global.
export const maxDuration = 60

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
      // 55s — well under the 60s function budget but generous enough
      // to accommodate the backend /all aggregator's per-system
      // fan-out on accounts with multiple SystemNames. If the backend
      // takes longer than this, the function still returns a 502
      // with the structured empty-state body rather than letting
      // Vercel kill the function mid-flight.
      signal: AbortSignal.timeout(55000),
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
