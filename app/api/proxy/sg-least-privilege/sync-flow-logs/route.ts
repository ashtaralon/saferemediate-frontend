import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '30'

  console.log(`[SG-LP] POST sync-flow-logs, days=${days}`)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/sync-flow-logs?days=${days}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Sync error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Sync failed: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SG-LP] Sync success:`, data)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[SG-LP] Sync error:', error.message)
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    )
  }
}
