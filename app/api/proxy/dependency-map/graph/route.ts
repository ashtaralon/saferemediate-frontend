import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

export const maxDuration = 60;

// Simple in-memory cache
const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
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
      
      console.log(`[Dependency Map] Attempt ${i + 1} failed with status ${res.status}`);
    } catch (error: any) {
      console.log(`[Dependency Map] Attempt ${i + 1} failed: ${error.message}`);
      if (i === retries) throw error;
    }
    
    if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error("All retries failed");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";
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
    const data = await res.json();
    
    // Store in cache
    cache[cacheKey] = { data, timestamp: Date.now() };
    
    console.log(`[Dependency Map] Success: ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);
    
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" }
    });
  } catch (error: any) {
    console.error("[Dependency Map] Error:", error.message);
    
    // Return stale cache if available
    if (cached) {
      console.log(`[Dependency Map] Returning stale cache due to error`);
      return NextResponse.json(cached.data, {
        headers: { "X-Cache": "STALE" }
      });
    }
    
    // Return empty fallback with status 200 to prevent UI crash
    return NextResponse.json(
      { nodes: [], edges: [], error: true, message: error.message, timeout: error.name === 'AbortError' },
      { status: 200 }
    );
  }
}
