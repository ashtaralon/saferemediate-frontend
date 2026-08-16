import { requireBackendUrl } from "@/lib/backend-url";
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = requireBackendUrl();

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/status`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Auto-tagger status proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch auto-tagger status' },
      { status: 500 }
    );
  }
}
