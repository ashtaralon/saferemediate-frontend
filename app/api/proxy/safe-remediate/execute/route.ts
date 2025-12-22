import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.SAFE_REMEDIATE_API_BASE ||
  'https://saferemediate-backend-f.onrender.com';

// Timeout for backend requests (25 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 25000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.finding_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'finding_id is required',
        },
        { status: 400 }
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT);

    try {
      // Make the actual API call to backend
      const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || '',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if the response is not ok (including 403 errors)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Failed to parse error response',
        }));

        return NextResponse.json(
          {
            success: false,
            error: `Backend error: ${response.status}`,
            detail: errorData,
          },
          { status: response.status }
        );
      }

      // Success response
      const data = await response.json();
      return NextResponse.json(
        {
          success: true,
          data,
        },
        { status: 200 }
      );

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          {
            success: false,
            error: 'Request timed out',
            detail: 'Backend did not respond within 25 seconds',
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Backend unavailable',
          detail: fetchError.message,
        },
        { status: 503 }
      );
    }

  } catch (error) {
    console.error('Error executing remediation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute remediation',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
