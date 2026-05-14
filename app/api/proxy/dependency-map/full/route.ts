import { NextRequest, NextResponse } from "next/server";
import { backendError, fromCaughtError } from "@/lib/server/proxy-error";

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com";

export const maxDuration = 60;
// Intentionally NOT `dynamic = "force-dynamic"` or `fetchCache =
// "force-no-store"` — those flags opt the route out of all response
// caching, which defeats the Vercel edge CDN Cache-Control we set on
// the response below. Without edge caching, every Vercel function
// instance pays the full ~30-40s cold-cache backend cost on first hit
// to that instance — multi-instance deployments routinely hit cold
// instances on retries, surfacing as 504 to the operator (see the
// "Failed to fetch dependency map: 504" popup in the alon-prod Attack
// Paths view).

// Simple in-memory cache. Only stores SUCCESSFUL responses. Backend
// failures and stale-cache-on-error fallbacks were removed because they
// turned a backend outage into an empty Topology view, hiding the fact
// that the dyno was down (see B1, 2026-05-04 system-dashboard E2E).
const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Single-attempt fetch with a 55s upstream timeout.
 *
 * Previous version retried up to 3× with exponential backoff between
 * attempts. With a 60s Vercel function budget and a 55s per-attempt
 * timeout, even ONE retry would exceed the budget — the function got
 * killed mid-second-attempt and the operator saw 504 with no clear
 * cause. On a cold-cache page load (most common 504 scenario), the
 * second attempt has only ~4s of headroom before Vercel terminates.
 *
 * Backend usually responds in <1s warm-cache, ~30-40s cold-cache.
 * Single attempt with 55s upstream timeout fits cleanly in the 60s
 * function budget and surfaces the real backend status / error on
 * the rare cold-AND-slow path.
 *
 * Returns the response (OK or not) so the caller can decide what to
 * do. Throws only on network/timeout errors.
 */
async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName");
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 });
  }
  const includeUnused = url.searchParams.get("includeUnused") ?? "true";
  const maxNodes = url.searchParams.get("maxNodes") ?? url.searchParams.get("max_nodes") ?? "500";
  const cacheKey = `dependency-map-full-${systemName}-${includeUnused}-${maxNodes}`;

  // Check cache first
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("[Dependency Map Full] Cache HIT for " + systemName);
    return NextResponse.json(cached.data, {
      headers: {
        "X-Cache": "HIT",
        "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000)),
        // Vercel edge CDN — serves cross-instance requests directly so
        // cold Lambdas don't re-pay the backend cost. Matches the 2-min
        // in-memory TTL with extra stale-while-revalidate for tail
        // tolerance during refresh hops.
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      }
    });
  }

  try {
    const params = new URLSearchParams({
      systemName: systemName,
      includeUnused: includeUnused,
      max_nodes: maxNodes
    });
    const backendUrl = BACKEND_URL + "/api/dependency-map/full?" + params.toString();

    console.log("[Dependency Map Full] Cache MISS - fetching from backend");
    const res = await fetchOnce(backendUrl);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[Dependency Map Full] Backend " + res.status + ": " + detail.slice(0, 200));
      return backendError({
        status: res.status,
        message: "Dependency-map backend returned " + res.status,
        detail: detail.slice(0, 500),
      });
    }

    const data = await res.json();
    cache[cacheKey] = { data, timestamp: Date.now() };

    console.log("[Dependency Map Full] Success: " + (data.nodes?.length || 0) + " nodes, " + (data.edges?.length || 0) + " edges");

    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        // 2-min Vercel edge cache + 4-min stale-while-revalidate. After
        // the first successful response, the next 2 min of requests are
        // served from the edge CDN regardless of which function
        // instance they'd otherwise route to.
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      }
    });
  } catch (error: any) {
    console.error("[Dependency Map Full] Error:", error.message);
    return fromCaughtError(error);
  }
}
