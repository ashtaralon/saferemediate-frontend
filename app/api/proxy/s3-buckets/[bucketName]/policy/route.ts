import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucketName: string }> }
) {
  const { bucketName } = await params
  
  console.log('[Proxy] GET /api/proxy/s3-buckets/' + bucketName + '/policy')
  
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/s3-buckets/${encodeURIComponent(bucketName)}/policy`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      }
    )
    
    if (!response.ok) {
      // For 404, return null instead of error to prevent UI crashes
      if (response.status === 404) {
        console.log('[Proxy] Backend returned 404 for policy, returning null')
        return NextResponse.json(null, { status: 200 })
      }
      
      const errorText = await response.text()
      console.error('[Proxy] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend returned ${response.status}`, details: errorText },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Proxy] Fetch error:', error.message)
    return NextResponse.json(
      { error: 'Failed to connect to backend', details: error.message },
      { status: 500 }
    )
  }
}



