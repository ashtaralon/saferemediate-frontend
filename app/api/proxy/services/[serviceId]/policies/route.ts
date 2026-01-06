import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await params
  const { searchParams } = new URL(request.url)
  const region = searchParams.get('region') || 'eu-west-1'
  
  console.log('[Proxy] GET /api/proxy/services/' + serviceId + '/policies')
  
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/all-services/${encodeURIComponent(serviceId)}/policies?region=${encodeURIComponent(region)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      }
    )
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Proxy] Backend returned 404 for policies, returning empty')
        return NextResponse.json({ policies: [], policyCount: 0 }, { status: 200 })
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
      { error: 'Failed to connect to backend', details: error.message, policies: [], policyCount: 0 },
      { status: 200 } // Return 200 with empty policies instead of 500
    )
  }
}

