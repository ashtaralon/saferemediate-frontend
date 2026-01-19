import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('[Simulate S3] Starting simulation:', body)

    const response = await fetch(`${BACKEND_URL}/api/simulate/s3-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Simulate S3] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      )
    }

    // Stream the SSE response through
    const stream = response.body

    if (!stream) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 })
    }

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    })
  } catch (error: any) {
    console.error('[Simulate S3] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Simulation failed' },
      { status: 500 }
    )
  }
}
