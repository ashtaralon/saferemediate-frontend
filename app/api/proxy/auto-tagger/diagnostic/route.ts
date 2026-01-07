import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/diagnostic`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(35000),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[diagnostic] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Backend returned ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[diagnostic] Success:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[diagnostic] Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch diagnostic info', detail: String(error) },
      { status: 500 }
    );
  }
}
