import { NextRequest, NextResponse } from 'next/server';

const SAFE_REMEDIATE_API_BASE = process.env.SAFE_REMEDIATE_API_BASE || 'https://api.saferemediate.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Make the actual API call to Safe Remediate - no demo mode
    const response = await fetch(`${SAFE_REMEDIATE_API_BASE}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || '',
      },
      body: JSON.stringify(body),
    });

    // Check if the response is not ok (including 403 errors)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: 'Failed to parse error response',
      }));

      return NextResponse.json(
        {
          success: false,
          message: `API error: ${response.statusText}`,
          error: errorData,
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
  } catch (error) {
    // Only fall back to demo mode on network errors or other unexpected issues
    console.error('Error executing remediation:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to execute remediation',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
