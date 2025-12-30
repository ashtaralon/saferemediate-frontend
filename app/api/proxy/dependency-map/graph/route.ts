import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com";

// In-memory cache
let cachedGraph: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const systemName = searchParams.get('systemName') || 'alon-prod';
  const includeInternet = searchParams.get('includeInternet') !== 'false';
  const includeCidrs = searchParams.get('includeCidrs') === 'true';
  const includeIam = searchParams.get('includeIam') !== 'false';
  const forceRefresh = searchParams.get('refresh') === 'true';

  const cacheKey = `${systemName}-${includeInternet}-${includeCidrs}-${includeIam}`;
  const now = Date.now();

  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && cachedGraph && cachedGraph.cacheKey === cacheKey && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[Dependency Map Proxy] Returning cached data');
    return NextResponse.json({
      ...cachedGraph.data,
      fromCache: true,
      cacheAge: Math.round((now - cacheTimestamp) / 1000)
    });
  }

  console.log('[Dependency Map Proxy] Fetching fresh data from backend...');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    const params = new URLSearchParams({
      systemName,
      includeInternet: String(includeInternet),
      includeCidrs: String(includeCidrs),
      includeIam: String(includeIam)
    });

    const response = await fetch(
      `${BACKEND_URL}/api/dependency-map/graph?${params}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // Update cache
    cachedGraph = { cacheKey, data };
    cacheTimestamp = now;

    console.log(`[Dependency Map Proxy] Cached ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges`);

    return NextResponse.json({
      ...data,
      fromCache: false
    });
  } catch (error: any) {
    console.error('[Dependency Map Proxy] Error:', error.message);

    // Return stale cache if available
    if (cachedGraph && cachedGraph.cacheKey === cacheKey) {
      console.log('[Dependency Map Proxy] Returning stale cache due to error');
      return NextResponse.json({
        ...cachedGraph.data,
        fromCache: true,
        stale: true,
        cacheAge: Math.round((now - cacheTimestamp) / 1000)
      });
    }

    return NextResponse.json({
      error: error.message,
      nodes: [],
      edges: [],
      summary: {}
    }, { status: 500 });
  }
}

