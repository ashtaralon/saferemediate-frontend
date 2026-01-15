import { NextResponse } from "next/server";

// Allow longer execution time on Vercel (60 seconds for Pro tier)
export const maxDuration = 60;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com";

// In-memory cache for findings (3-minute TTL)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function getCacheKey(systemName: string | null, status: string | null, severity: string | null): string {
  return `findings:${systemName || 'all'}:${status || 'all'}:${severity || 'all'}`;
}

export async function GET(request: Request) {
  // Get query params for filtering
  const { searchParams } = new URL(request.url);
  const systemName = searchParams.get('systemName');
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const forceRefresh = searchParams.get('refresh') === 'true';

  const cacheKey = getCacheKey(systemName, status, severity);
  const now = Date.now();

  // Check cache (unless force refresh)
  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cached.timestamp) / 1000);
      console.log(`[Findings Proxy] Cache HIT (age: ${cacheAge}s)`);
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
        cacheAge
      }, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': String(cacheAge),
        }
      });
    }
  }

  console.log(`[Findings Proxy] Cache MISS - fetching from backend`);

  // Build query string
  const queryParams = new URLSearchParams();
  if (systemName) queryParams.append('systemName', systemName);
  if (status) queryParams.append('status', status);
  if (severity) queryParams.append('severity', severity);

  const queryString = queryParams.toString();
  const url = `${BACKEND_URL}/api/findings${queryString ? `?${queryString}` : ''}`;

  try {
    // Create AbortController for timeout - increased to 55s to allow backend cold starts
    // Vercel maxDuration is 60s, so 55s gives us buffer
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

    console.log(`[Findings Proxy] Backend URL: ${url}`);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: 'no-store', // Always fetch fresh data
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Findings Proxy] Backend returned ${response.status}`);

      // Return stale cache if available
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`[Findings Proxy] Returning stale cache due to backend error`);
        return NextResponse.json({
          ...cached.data,
          fromCache: true,
          stale: true
        }, {
          headers: { 'X-Cache': 'STALE' }
        });
      }

      return NextResponse.json({
        success: false,
        findings: [],
        total: 0,
        count: 0,
        source: "backend",
        error: `Backend returned ${response.status} status`
      });
    }

    const data = await response.json();
    const findings = data.findings || data.recommendations || data || [];
    const total = data.total ?? data.count ?? findings.length;

    const result = {
      success: true,
      findings: Array.isArray(findings) ? findings : [],
      total: Array.isArray(findings) ? (total || findings.length) : 0,
      count: Array.isArray(findings) ? findings.length : 0,
      source: "backend"
    };

    // Store in cache
    cache.set(cacheKey, { data: result, timestamp: now });

    // Cleanup old cache entries (keep max 50)
    if (cache.size > 50) {
      const entriesToDelete: string[] = [];
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          entriesToDelete.push(key);
        }
      }
      entriesToDelete.forEach(key => cache.delete(key));
    }

    // If no findings returned, log it
    if (!Array.isArray(findings) || findings.length === 0) {
      console.log('[Findings Proxy] Backend returned empty findings');
    }

    return NextResponse.json({
      ...result,
      fromCache: false
    }, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=360',
      }
    });
  } catch (error: any) {
    // Handle timeout or network errors - return stale cache if available
    console.error(`[Findings Proxy] Error:`, error.name, error.message);

    // Return stale cache if available
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[Findings Proxy] Returning stale cache due to error`);
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
        stale: true
      }, {
        headers: { 'X-Cache': 'STALE' }
      });
    }

    return NextResponse.json({
      success: false,
      findings: [],
      total: 0,
      count: 0,
      source: "backend",
      error: error.message,
      warning: error.name === 'AbortError'
        ? 'Backend request timed out after 55 seconds'
        : `Backend connection failed: ${error.message}`
    });
  }
}
