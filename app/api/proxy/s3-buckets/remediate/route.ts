import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  console.log('[Proxy] POST /api/proxy/s3-buckets/remediate')
  
  try {
    const body = await request.json()
    
    const response = await fetch(
      `${BACKEND_URL}/api/s3-buckets/remediate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Proxy] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend returned ${response.status}`, details: errorText, success: false },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Proxy] Fetch error:', error.message)
    return NextResponse.json(
      { error: 'Failed to connect to backend', details: error.message, success: false },
      { status: 500 }
    )
  }
}

