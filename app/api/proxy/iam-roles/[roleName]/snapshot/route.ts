import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params

  console.log(`[IAM-SNAPSHOT] Creating snapshot for role: ${roleName}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/snapshot`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[IAM-SNAPSHOT] Error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Failed to create snapshot: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[IAM-SNAPSHOT] Snapshot created: ${data.snapshot_id}`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[IAM-SNAPSHOT] Error:', error.message)
    return NextResponse.json(
      { error: 'Failed to create snapshot', details: error.message },
      { status: 500 }
    )
  }
}
