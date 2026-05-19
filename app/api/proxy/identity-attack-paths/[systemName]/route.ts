import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
// Intentionally NOT `dynamic = "force-dynamic"` — that flag opts the
// route out of all caching, which defeats the Vercel edge CDN
// Cache-Control we set on the response below. The route is dynamic by
// virtue of reading req.url params; explicit force-dynamic isn't needed.
export const maxDuration = 60

// BACKEND_URL_OVERRIDE env hook lets dev point at localhost:8000
// without editing this file. Render/Vercel never set it, so prod stays
// on the Render URL.
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  // 8 jewels × 8 paths/jewel = up to 64 paths surfaced. Previous 12 × 8
  // = 96 paths routinely produced ~49s responses against the 55s
  // AbortSignal limit — surfacing as 502 in the UI under any cold-cache
  // spike. Measured: 12×8 = 49s cold, 8×8 = ~20s, 8×3 = ~28s. The cost
  // driver is `max_jewels` (graph traversal per jewel), not
  // `max_paths_per_jewel` (output size). Cutting jewels from 12 → 8
  // gives a comfortable margin; keeping 8 paths/jewel preserves the
  // operator drill-down depth (Path 1/8, 2/8, ... per jewel).
  const maxJewels = searchParams.get("max_jewels") || "8"
  const maxPathsPerJewel = searchParams.get("max_paths_per_jewel") || "8"
  const envelope = searchParams.get("envelope") === "true" ? "true" : ""
  // Stale toggle: when true, the backend includes historical (is_stale=true)
  // observed-behavior edges in the attack-path response. Default false so
  // the live view stays focused on recent activity.
  const includeStale = searchParams.get("include_stale") === "true" ? "true" : ""
  // Deleted toggle: when true, the backend includes soft-deleted nodes
  // (is_active=false — resources the last successful collector run
  // confirmed absent from AWS during the last successful scan).
  // Default off — live view hides zombies.
  const includeDeleted = searchParams.get("include_deleted") === "true" ? "true" : ""

  // Server-side cache (5 min TTL — match the /all aggregator pattern).
  // Backend call costs 30–50s on alon-prod-scale systems; without a
  // cache layer every Risk → Attack Paths visit pays the full cost, and
  // any visit that crosses the 55s fetch timeout returns 502 — leaving
  // the operator stuck with no path to a working view. Cache hits make
  // repeats instant.
  //
  // Cache key includes every query param that affects the response so
  // toggling include_stale / include_deleted forces a fresh fetch
  // instead of reading the wrong shape.
  const cacheKey = [
    "identity-attack-paths",
    systemName,
    maxJewels,
    maxPathsPerJewel,
    envelope,
    includeStale,
    includeDeleted,
  ].join(":")

  // Per-instance in-memory cache (warm-instance path — instant on repeat).
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        // Let the Vercel edge CDN serve subsequent requests directly even
        // when they land on a cold function instance. Without this header,
        // multi-instance Vercel deployments repeatedly pay the 30–50s
        // backend cost — each cold instance has its own empty in-memory
        // cache, and the user keeps hitting different instances.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  }

  try {
    const envelopeParam = envelope ? `&envelope=${envelope}` : ""
    const staleParam = includeStale ? `&include_stale=${includeStale}` : ""
    const deletedParam = includeDeleted ? `&include_deleted=${includeDeleted}` : ""
    const query = `?max_jewels=${maxJewels}&max_paths_per_jewel=${maxPathsPerJewel}${envelopeParam}${staleParam}${deletedParam}`
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`
    console.log("[identity-attack-paths] Fetching:", url)
    const t0 = Date.now()
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    })
    const latencyMs = Date.now() - t0
    console.log(
      `[identity-attack-paths] systemName=${systemName} status=${res.status} latency_ms=${latencyMs}`
    )
    if (!res.ok) {
      // Mirror the /all aggregator's structured 502 shape so the UI can
      // degrade gracefully (empty-state render) instead of dead-ending.
      return NextResponse.json(
        {
          error: "attack_paths_unavailable",
          backend_status: res.status,
          system_name: systemName,
          crown_jewels: [],
          paths: [],
          total_jewels: 0,
          total_paths: 0,
          errors: [`backend ${res.status}`],
        },
        { status: res.status }
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        // 5-min Vercel edge cache + 10-min stale-while-revalidate. After
        // the first successful response, the next ~5 min of requests are
        // served from the edge CDN regardless of which function instance
        // they would have routed to. Matches the in-memory TTL_SLOW.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    console.error(
      `[identity-attack-paths] systemName=${systemName} error=${err?.name || "unknown"} message=${err?.message || ""}`
    )
    return NextResponse.json(
      {
        error: isTimeout ? "attack_paths_timeout" : "attack_paths_proxy_error",
        message:
          err?.message ||
          "Failed to fetch identity attack paths — backend slow or unreachable",
        system_name: systemName,
        crown_jewels: [],
        paths: [],
        total_jewels: 0,
        total_paths: 0,
        errors: [err?.message || String(err)],
      },
      { status: 502 }
    )
  }
}
