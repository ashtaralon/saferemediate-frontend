import { NextRequest, NextResponse } from "next/server"
import {
  buildIapIdentityAttackPathsQuery,
  IAP_PROXY_DEFAULT_MAX_JEWELS,
  IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL,
} from "@/lib/server/iap-proxy-query"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { SNAPSHOT_PROXY_TIMEOUT_MS } from "@/lib/server/snapshot-proxy"

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
  // 5 jewels × 5 paths/jewel — reduced from 8×8 (2026-07) because cold
  // alon-prod compute routinely exceeded the 55s AbortSignal → HTTP 502.
  // Cost driver is max_jewels (per-jewel BFS). Smaller budget keeps the
  // operator usable; drill-down still loads per-path detail on demand.
  //
  // Measured cold latency on alon-prod (2026-06): 8×8 ≈ 41s — thin margin
  // vs 55s. Graph has only grown since.
  const maxJewels =
    searchParams.get("max_jewels") || String(IAP_PROXY_DEFAULT_MAX_JEWELS)
  const maxPathsPerJewel =
    searchParams.get("max_paths_per_jewel") ||
    String(IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL)
  const envelope = searchParams.get("envelope") === "true"
  // Stale toggle: when true, the backend includes historical (is_stale=true)
  // observed-behavior edges in the attack-path response. Default false so
  // the live view stays focused on recent activity.
  const includeStale = searchParams.get("include_stale") === "true"
  // Deleted toggle: when true, the backend includes soft-deleted nodes
  // (is_active=false — resources the last successful collector run
  // confirmed absent from AWS during the last successful scan).
  // Default off — live view hides zombies.
  const includeDeleted = searchParams.get("include_deleted") === "true"
  // Enriched toggle: when true, the backend's Tier-1 Part 2 supplements
  // attach extra fields to existing path nodes (egress_destinations,
  // eni_count, mitigation_history, target_groups, s3_prefixes,
  // route_tables, load_balancer_targets, lambda_invocations). Additive
  // — the path graph shape is unchanged. Default off so callers that
  // don't render the extra fields see the lighter payload.
  const enriched = searchParams.get("enriched") === "true"

  // Server-side cache (5 min TTL — match the /all aggregator pattern).
  // Backend call costs 30–50s on alon-prod-scale systems; without a
  // cache layer every Risk → Attack Paths visit pays the full cost, and
  // any visit that crosses the 55s fetch timeout returns 502 — leaving
  // the operator stuck with no path to a working view. Cache hits make
  // repeats instant.
  //
  // Cache key includes every query param that affects the response so
  // toggling include_stale / include_deleted / enriched forces a fresh
  // fetch instead of reading the wrong shape.
  //
  // Schema version bumps when the upstream response shape changes in a
  // way that makes old cached payloads materially wrong for the UI.
  // 2026-06-21:p0gate — backend P0 phantom-path gate
  // (path_eligibility_classifier) now hides AWSServiceRoleFor* paths;
  // pre-gate cached payloads would still surface ~29 paths on alon-prod
  // that the gated backend response no longer includes. Bumping the key
  // invalidates every Vercel edge-cached payload + every in-memory
  // per-instance cache atomically on deploy.
  const SCHEMA_VERSION = "2026-06-21:p0gate"
  const cacheKey = [
    "identity-attack-paths",
    SCHEMA_VERSION,
    systemName,
    maxJewels,
    maxPathsPerJewel,
    envelope,
    includeStale,
    includeDeleted,
    enriched,
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

  const serveStale = (reason: string) => {
    const stale = getStaleCached(cacheKey)
    if (!stale) return null
    console.warn(
      `[identity-attack-paths] ${reason} — serving stale cache systemName=${systemName}`,
    )
    return NextResponse.json(
      { ...(stale as object), fromStaleCache: true, staleReason: reason },
      {
        headers: {
          "X-Cache": "STALE",
          "Cache-Control": "no-store",
        },
      },
    )
  }

  try {
    const query = buildIapIdentityAttackPathsQuery({
      maxJewels,
      maxPathsPerJewel,
      envelope,
      enriched,
      includeStale,
      includeDeleted,
    })
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`
    console.log("[identity-attack-paths] Fetching:", url)
    const t0 = Date.now()
    let res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(SNAPSHOT_PROXY_TIMEOUT_MS),
    })
    // Legacy 503 compute-in-progress — Wave B+ returns 200 envelopes;
    // keep a short retry for backends mid-rollout.
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 500))
      res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(SNAPSHOT_PROXY_TIMEOUT_MS),
      })
    }
    let latencyMs = Date.now() - t0
    console.log(
      `[identity-attack-paths] systemName=${systemName} status=${res.status} latency_ms=${latencyMs}`
    )
    if (!res.ok) {
      // Prefer last-good snapshot over empty 502 — cold IAP routinely
      // exceeds the 55s proxy abort on alon-prod; jewels sub-route and
      // topology-risk already degrade this way.
      if (res.status >= 500) {
        const staleRes = serveStale(`backend_${res.status}`)
        if (staleRes) return staleRes
        // Only attempt lighter budget if we still have wall-clock left
        // under Vercel maxDuration=60 (first hop failed fast).
        if (latencyMs < 20_000) {
          const liteRes = await fetchLighterBudget({
            systemName,
            envelope,
            enriched,
            includeStale,
            includeDeleted,
            cacheKey,
          })
          if (liteRes) return liteRes
        }
      }
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
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    const staleRes = serveStale(isTimeout ? "timeout" : "fetch_failed")
    if (staleRes) return staleRes
    // Wave D: no stale cache on timeout — honest computing envelope (HTTP 200)
    // instead of a 502 that bricks the rail.
    if (isTimeout) {
      const started = new Date()
      const deadline = new Date(started.getTime() + 180_000)
      return NextResponse.json(
        {
          status: "computing",
          system_name: systemName,
          computing_started_at: started.toISOString(),
          compute_deadline_at: deadline.toISOString(),
          staleReason: "peer_computing",
          crown_jewels: [],
          paths: [],
          total_jewels: 0,
          total_paths: 0,
        },
        { status: 200 }
      )
    }
    console.error(
      `[identity-attack-paths] systemName=${systemName} error=${err?.name || "unknown"} message=${err?.message || ""}`
    )
    return NextResponse.json(
      {
        error: "attack_paths_proxy_error",
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

/** Last-resort: smaller jewel budget so cold compute can finish under 55s. */
async function fetchLighterBudget(opts: {
  systemName: string
  envelope: boolean
  enriched: boolean
  includeStale: boolean
  includeDeleted: boolean
  cacheKey: string
}): Promise<NextResponse | null> {
  const liteJewels = "3"
  const litePaths = "4"
  const query = buildIapIdentityAttackPathsQuery({
    maxJewels: liteJewels,
    maxPathsPerJewel: litePaths,
    envelope: opts.envelope,
    enriched: opts.enriched,
    includeStale: opts.includeStale,
    includeDeleted: opts.includeDeleted,
  })
  const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(opts.systemName)}${query}`
  console.warn(
    `[identity-attack-paths] lighter-budget retry systemName=${opts.systemName} max_jewels=${liteJewels}`,
  )
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(SNAPSHOT_PROXY_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Cache under BOTH the lite key shape (via setCached on primary key)
    // so the operator's next visit with default params hits stale/fresh.
    setCached(opts.cacheKey, data, TTL_SLOW)
    return NextResponse.json(
      { ...data, fromLighterBudget: true, max_jewels: Number(liteJewels) },
      {
        headers: {
          "X-Cache": "MISS-LITE",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (err) {
    console.warn(
      `[identity-attack-paths] lighter-budget failed systemName=${opts.systemName}`,
      err,
    )
    return null
  }
}
