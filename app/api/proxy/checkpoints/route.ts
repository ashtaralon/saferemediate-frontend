import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(request: NextRequest) {
  console.log('[Proxy] GET /api/proxy/checkpoints')

  try {
    const { searchParams } = new URL(request.url)
    const resourceType = searchParams.get('resource_type') || ''
    const limit = searchParams.get('limit') || '50'

    const queryParams = new URLSearchParams()
    if (resourceType) queryParams.set('resource_type', resourceType)
    queryParams.set('limit', limit)

    const response = await fetch(
      `${BACKEND_URL}/api/checkpoints?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[CHECKPOINTS] Backend error:', response.status, errorText)
      return NextResponse.json(
        { checkpoints: [], count: 0, error: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[CHECKPOINTS] Fetched', data.count, 'checkpoints')
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[CHECKPOINTS] Error:', error.message)
    return NextResponse.json(
      { checkpoints: [], count: 0, error: error.message },
      { status: 500 }
    )
  }
}
