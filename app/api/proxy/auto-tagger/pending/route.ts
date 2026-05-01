import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com";

// Vercel kills functions at the platform default (10s on Hobby) without
// this. Backend can cold-start at 30s+ on Render's free tier. Without
// maxDuration the proxy is killed mid-flight and the frontend sees an
// AbortError that the component renders as "HTTP 500" — even though
// the backend itself is healthy. See feedback_vercel_abort_cascade.md.
export const maxDuration = 30;

// Per-fetch timeout must be strictly less than maxDuration so we get a
// clean structured response on slow backend instead of Vercel killing
// us mid-stream.
const FETCH_TIMEOUT_MS = 25_000;

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') || 'pending';

  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/pending?status=${status}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Backend reachable but errored. Return 200 with a structured
      // empty payload + diagnostic, so the UI can show "service
      // unavailable" without the component throwing on `!res.ok`.
      // Keeping HTTP 200 is intentional: the proxy itself is fine,
      // it's the upstream that's degraded.
      return NextResponse.json(
        {
          pending: [],
          count: 0,
          unavailable: true,
          backend_status: response.status,
          message: `Approvals backend returned HTTP ${response.status}`,
        },
        { status: 200 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return NextResponse.json(
      {
        pending: [],
        count: 0,
        unavailable: true,
        backend_status: isTimeout ? 504 : 502,
        message: isTimeout
          ? 'Approvals backend timed out — retrying may help'
          : (error?.message || 'Approvals backend unreachable'),
      },
      { status: 200 },
    );
  }
}
