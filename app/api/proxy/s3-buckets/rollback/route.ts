import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  console.log('[Proxy] POST /api/proxy/s3-buckets/rollback')

  try {
    const body = await request.json()
    console.log('[S3-ROLLBACK] Rolling back checkpoint:', body.checkpoint_id)

    // Use unified remediation endpoint
    const response = await fetch(
      `${BACKEND_URL}/api/remediate/rollback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkpoint_id: body.checkpoint_id
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[S3-ROLLBACK] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: `Rollback failed: ${response.status}`, details: errorText, success: false },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[S3-ROLLBACK] Success:', data)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[S3-ROLLBACK] Error:', error.message)
    return NextResponse.json(
      { error: 'Rollback failed', details: error.message, success: false },
      { status: 500 }
    )
  }
}
