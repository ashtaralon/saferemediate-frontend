import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucketName: string }> }
) {
  const { bucketName } = await params
  const searchParams = request.nextUrl.searchParams
  const days = searchParams.get('days') || '90'
  
  console.log('[Proxy] GET /api/proxy/s3-buckets/' + bucketName + '/gap-analysis')
  
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/s3-buckets/${encodeURIComponent(bucketName)}/gap-analysis?days=${days}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      }
    )
    
    if (!response.ok) {
      // For 404, return empty data instead of error to prevent UI crashes
      if (response.status === 404) {
        console.log('[Proxy] Backend returned 404, returning empty data')
        return NextResponse.json({
          bucket_name: bucketName,
          allowed_actions: 0,
          used_actions: 0,
          unused_actions: 0,
          allowed_count: 0,
          used_count: 0,
          unused_count: 0,
          not_found: true
        }, { status: 200 })
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



