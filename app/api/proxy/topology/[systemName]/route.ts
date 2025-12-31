import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend-f.onrender.com';

export async function GET(
  request: NextRequest,
  { params }: { params: { systemName: string } }
) {
  try {
    const { systemName } = params;
    
    const response = await fetch(`${BACKEND_URL}/api/topology/${systemName}`, {
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
    console.error('Topology proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topology data' },
      { status: 500 }
    );
  }
}
