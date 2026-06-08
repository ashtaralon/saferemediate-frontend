import { NextRequest, NextResponse } from "next/server";
import { backendError, fromCaughtError } from "@/lib/server/proxy-error";

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com";

export const maxDuration = 60;

// Simple in-memory cache. Only stores SUCCESSFUL responses. Backend
// errors and stale-cache-on-error fallbacks were removed because they
// turned a backend outage into an empty System Map view.
const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
      console.log(`[Dependency Map] Attempt ${i + 1} failed with status ${res.status}`);
    } catch (error: any) {
      console.log(`[Dependency Map] Attempt ${i + 1} failed: ${error.message}`);
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
  const cacheKey = `dependency-map-${systemName}`;

  // Check cache first
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Dependency Map] Cache HIT for ${systemName}`);
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000)) }
    });
  }

  try {
    const backendUrl = `${BACKEND_URL}/api/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`;

    console.log(`[Dependency Map] Cache MISS - fetching from backend`);
    const res = await fetchWithRetry(backendUrl);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[Dependency Map] Backend ${res.status}: ${detail.slice(0, 200)}`);
      return backendError({
        status: res.status,
        message: `Dependency-map backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      });
    }

    const data = await res.json();
    cache[cacheKey] = { data, timestamp: Date.now() };

    console.log(`[Dependency Map] Success: ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" }
    });
  } catch (error: any) {
    console.error("[Dependency Map] Error:", error.message);
    return fromCaughtError(error);
  }
}
