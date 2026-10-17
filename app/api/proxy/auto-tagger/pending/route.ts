import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { allowlistedBackendDetail } from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl();

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
      // Backend reachable but did not serve the queue. Return 200 with a structured payload + diagnostic, so the UI
      // can show the state without the component throwing on `!res.ok`. Nothing was read, so there is no list and no
      // count (null, never [] / 0). A typed refusal or hold (detail.code: SERVING_ROUTE_HELD on an install, a scope
      // refusal) is relayed as `hold` -- the allowlisted typed fields only -- so the page can say which state it is.
      const typed = allowlistedBackendDetail(await response.text().catch(() => ""));
      return NextResponse.json(
        {
          pending: null,
          count: null,
          unavailable: true,
          backend_status: response.status,
          message: `Approvals backend returned HTTP ${response.status}`,
          ...(typed?.code ? { hold: { code: typed.code, reason: typed.reason ?? null, read_model: typed.read_model ?? null } } : {}),
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
        pending: null,
        count: null,
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
