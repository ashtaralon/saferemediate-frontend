import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

// Render free-tier cold-starts on /api/global-org-score involve N
// per-system Cypher fan-outs; budget 60s for the function with a 55s
// fetch ceiling. Same pattern as /api/proxy/systems/available.
export const maxDuration = 60
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * GET /api/proxy/global-org-score
 *
 * Org-level Blast Radius Score with convergence multiplier + tail
 * weighting + small visibility penalty. See backend
 * api/global_org_score.py and unified/scoring/global_org_score.py for
 * the formula and invariants.
 *
 * Replaces the previous /api/proxy/posture-score weighted-mean of
 * health_score (legacy metric, no convergence, no tail) for the home
 * dashboard hero card. The hero card transitions over once this
 * proxy is live; the old endpoint stays for backward compat with
 * any other consumer.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const maxSystems = url.searchParams.get("max_systems") ?? "100"

  try {
    const r = await fetch(
      `${BACKEND_URL}/api/global-org-score?max_systems=${encodeURIComponent(maxSystems)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "global_org_score_unavailable",
          backend_status: r.status,
          message: `Backend /api/global-org-score returned ${r.status}`,
          global_score: null,
          system_count: 0,
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (e) {
    const isTimeout =
      (e as any)?.name === "TimeoutError" || (e as any)?.name === "AbortError"
    return NextResponse.json(
      {
        error: isTimeout ? "global_org_score_timeout" : "global_org_score_error",
        message:
          e instanceof Error ? e.message : "Failed to fetch global org score",
        global_score: null,
        system_count: 0,
      },
      { status: 502 },
    )
  }
}
