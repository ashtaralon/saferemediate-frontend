import { NextResponse } from "next/server";

// Allow longer execution time on Vercel (30 seconds max)
export const maxDuration = 30;

export async function GET(request: Request) {
  const backendUrl = 
    process.env.NEXT_PUBLIC_BACKEND_URL || 
    process.env.BACKEND_URL || 
    "https://saferemediate-backend-f.onrender.com";

  try {
    // Create AbortController for timeout - increased to 25s to allow backend time
    // Vercel maxDuration is 30s, so 25s gives us buffer
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout (was 15s)

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const systemName = searchParams.get('systemName');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    
    // Build query string
    const queryParams = new URLSearchParams();
    if (systemName) queryParams.append('systemName', systemName);
    if (status) queryParams.append('status', status);
    if (severity) queryParams.append('severity', severity);
    
    const queryString = queryParams.toString();
    const url = `${backendUrl}/api/findings${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: 'no-store', // Always fetch fresh data
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Findings Proxy] Backend returned ${response.status}`);
      console.warn(`[Findings Proxy] Backend URL: ${url}`);
      return NextResponse.json({ 
        success: false, 
        findings: [], 
        source: "backend",
        count: 0,
        error: `Backend returned ${response.status} status`
      });
    }

    const data = await response.json();
    const findings = data.findings || data.recommendations || data || [];

    // If no findings returned, return empty array (no mock data)
    if (!Array.isArray(findings) || findings.length === 0) {
      console.log('[Findings Proxy] Backend returned empty findings');
      return NextResponse.json({ 
        success: true, 
        findings: [], 
        source: "backend",
        count: 0 
      });
    }

    return NextResponse.json({ 
      success: true, 
      findings, 
      source: "backend",
      count: findings.length 
    });
  } catch (error: any) {
    // Handle timeout or network errors - return empty array (no mock data)
    if (error.name === 'AbortError') {
      console.error('[Findings Proxy] Request timed out after 25s');
      console.error('[Findings Proxy] Backend URL:', url);
    } else {
      console.error('[Findings Proxy] Error:', error);
      console.error('[Findings Proxy] Backend URL:', url);
      console.error('[Findings Proxy] Error details:', error.message);
    }
    
    return NextResponse.json({ 
      success: false, 
      findings: [], 
      source: "backend",
      count: 0,
      error: error.message,
      warning: error.name === 'AbortError' 
        ? 'Backend request timed out after 25 seconds' 
        : `Backend connection failed: ${error.message}`
    });
  }
}
