import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/diagnostic`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          return NextResponse.json(
            { error: errorJson.error || errorJson.detail || `Backend returned ${response.status}` },
            { status: response.status }
          );
        } catch {
          return NextResponse.json(
            { error: `Backend error: ${errorText.substring(0, 200)}` },
            { status: response.status }
          );
        }
      } catch (e) {
        return NextResponse.json(
          { error: `Backend returned ${response.status}` },
          { status: response.status }
        );
      }
    }

    let data;
    try {
      const text = await response.text();
      if (!text) {
        return NextResponse.json(
          { error: 'Empty response from backend' },
          { status: 500 }
        );
      }
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      return NextResponse.json(
        { error: 'Invalid JSON response from backend' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Auto-tagger diagnostic error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get diagnostic info' },
      { status: 500 }
    );
  }
}

