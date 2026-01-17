import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  console.log('[Proxy] POST /api/proxy/s3-buckets/remediate')

  try {
    const body = await request.json()
    console.log('[S3-REMEDIATE] Executing remediation for bucket:', body.bucket_name)

    // Call the backend safe-remediate endpoint with S3Bucket resource type
    const response = await fetch(
      `${BACKEND_URL}/api/safe-remediate/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          finding_id: `${body.bucket_name}/${body.policies_to_remove?.[0] || ''}`,
          resource_type: 'S3Bucket',
          skip_snapshot: !body.create_checkpoint
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[S3-REMEDIATE] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: `Remediation failed: ${response.status}`, details: errorText, success: false },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[S3-REMEDIATE] Success:', data)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[S3-REMEDIATE] Error:', error.message)
    return NextResponse.json(
      { error: 'Remediation failed', details: error.message, success: false },
      { status: 500 }
    )
  }
}
