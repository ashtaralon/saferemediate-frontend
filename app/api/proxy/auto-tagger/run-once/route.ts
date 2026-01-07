import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend-f.onrender.com';

export async function POST(request: NextRequest) {
  try {
    // Increased timeout to 60s for Render cold starts and slow Neo4j queries
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch(`${BACKEND_URL}/api/auto-tagger/run-once`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

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
    
    // Handle timeout specifically
    if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'The operation was aborted due to timeout. The auto-tagger may still be running - check backend logs or try again in a few moments.',
          timeout: true
        },
        { status: 504 } // Gateway Timeout
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to trigger auto-tagger. Check Neo4j connection and ensure there are tagged seed resources.',
        detail: String(error)
      },
      { status: 500 }
    );
  }
}
