import { NextRequest, NextResponse } from "next/server";
import { backendError, fromCaughtError } from "@/lib/server/proxy-error";

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Simple in-memory cache. Only stores SUCCESSFUL responses. Backend
// failures and stale-cache-on-error fallbacks were removed because they
// turned a backend outage into an empty Topology view, hiding the fact
// that the dyno was down (see B1, 2026-05-04 system-dashboard E2E).
const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Returns an OK response on success. On failure, returns the *last*
 * non-OK Response so the caller can surface its real status. Throws
 * only on network/timeout errors (callers translate those via
 * fromCaughtError).
 */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (res.ok) return res;
      lastResponse = res;
      console.log("[Dependency Map Full] Attempt " + (i + 1) + " failed with status " + res.status);
    } catch (error: any) {
      console.log("[Dependency Map Full] Attempt " + (i + 1) + " failed: " + error.message);
      if (i === retries) throw error;
    }

    if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  if (lastResponse) return lastResponse;
  throw new Error("All retries failed");
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
      headers: { "X-Cache": "HIT", "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000)) }
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
    const res = await fetchWithRetry(backendUrl);

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
      headers: { "X-Cache": "MISS" }
    });
  } catch (error: any) {
    console.error("[Dependency Map Full] Error:", error.message);
    return fromCaughtError(error);
  }
}
