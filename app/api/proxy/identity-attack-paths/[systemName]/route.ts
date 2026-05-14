import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const maxJewels = searchParams.get("max_jewels") || "12"
  // Default bumped 3 → 8 to match backend default; surfaces more paths
  // per crown jewel (was 12 jewels × 3 paths = 36 max; now up to 96).
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

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
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
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
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
