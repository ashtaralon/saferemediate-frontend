import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl();

export async function POST(request: NextRequest) {
  try {
    let body = {};
    try { body = await request.json(); } catch { /* empty body ok */ }
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/pending/approve-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to approve all' },
      { status: 500 }
    );
  }
}
