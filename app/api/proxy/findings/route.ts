import { NextResponse } from "next/server";

// Allow longer execution time on Vercel (30 seconds max)
export const maxDuration = 30;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com";

// Timeout for backend requests (25 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 25000;

export async function GET(request: Request) {
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT);

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
    const url = `${BACKEND_URL}/api/findings${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[findings] Backend returned ${response.status}: ${errorText}`);
      return NextResponse.json(
        {
          success: false,
          error: `Backend error: ${response.status}`,
          detail: errorText,
          findings: []
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const findings = data.findings || data.recommendations || data || [];

    // Return empty array if no findings - no fallback data
    if (!Array.isArray(findings)) {
      console.warn('[findings] Backend returned non-array findings');
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
    if (error.name === 'AbortError') {
      console.error('[findings] Request timed out after 25s');
      return NextResponse.json(
        {
          success: false,
          error: "Request timed out",
          detail: "Backend did not respond within 25 seconds",
          findings: []
        },
        { status: 504 }
      );
    }

    console.error('[findings] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: "Backend unavailable",
        detail: error.message,
        findings: []
      },
      { status: 503 }
    );
  }
}
