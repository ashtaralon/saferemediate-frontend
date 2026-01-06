import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend-f.onrender.com';

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/run-once`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
        // Try to parse as JSON first
        try {
          const errorJson = JSON.parse(errorText);
          return NextResponse.json(
            { success: false, error: errorJson.error || errorJson.detail || `Backend returned ${response.status}` },
            { status: response.status }
          );
        } catch {
          // Not JSON, use as plain text
          return NextResponse.json(
            { success: false, error: `Backend error: ${errorText.substring(0, 200)}` },
            { status: response.status }
          );
        }
      } catch (e) {
        return NextResponse.json(
          { success: false, error: `Backend returned ${response.status}` },
          { status: response.status }
        );
      }
    }

    let data;
    try {
      const text = await response.text();
      if (!text) {
        return NextResponse.json(
          { success: false, error: 'Empty response from backend' },
          { status: 500 }
        );
      }
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON response from backend' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Auto-tagger proxy error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to trigger auto-tagger' },
      { status: 500 }
    );
  }
}
