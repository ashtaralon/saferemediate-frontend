import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com";

// Simple in-memory cache
let cachedData: any = null;
let cacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute

export const maxDuration = 60; // Vercel Pro: up to 60s

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const systemName = url.searchParams.get("systemName") ?? "alon-prod";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

    const backendUrl = `${BACKEND_URL}/api/dependency-map/graph?systemName=${encodeURIComponent(systemName)}`;

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Dependency Map Proxy] Backend error ${res.status}: ${errorText}`);
      
      // Return cached data if available
      if (cachedData && Date.now() - cacheTime < CACHE_TTL * 5) {
        console.log("[Dependency Map Proxy] Returning cached data due to error");
        return NextResponse.json({ ...cachedData, cached: true });
      }
      
      return NextResponse.json(
        { nodes: [], edges: [], error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    // Cache successful response
    if (data.nodes?.length > 0) {
      cachedData = data;
      cacheTime = Date.now();
    }
    
    console.log(`[Dependency Map Proxy] Fetched ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Dependency Map Proxy] Error:", error.message);
    
    // Return cached data on timeout
    if (cachedData && Date.now() - cacheTime < CACHE_TTL * 5) {
      console.log("[Dependency Map Proxy] Returning cached data due to timeout");
      return NextResponse.json({ ...cachedData, cached: true });
    }
    
    return NextResponse.json(
      { nodes: [], edges: [], error: error.message },
      { status: 500 }
    );
  }
}
