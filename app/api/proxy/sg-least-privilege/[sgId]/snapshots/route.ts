import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params

  console.log(`[SG-LP] GET snapshots for ${sgId}`)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/snapshots`,
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Snapshots error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Failed to get snapshots: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[SG-LP] Snapshots error:', error.message)
    return NextResponse.json(
      { error: 'Failed to get snapshots', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params

  console.log(`[SG-LP] Creating snapshot for ${sgId}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/snapshot`,
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
      console.error(`[SG-LP] Create snapshot error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Failed to create snapshot: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SG-LP] Snapshot created: ${data.snapshot_id}`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[SG-LP] Create snapshot error:', error.message)
    return NextResponse.json(
      { error: 'Failed to create snapshot', details: error.message },
      { status: 500 }
    )
  }
}
