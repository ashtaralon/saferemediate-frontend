import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params

  console.log(`[SG-LP] POST simulate for ${sgId}`)

  try {
    const body = await request.json()

    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/simulate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Simulate error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Simulation failed: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[SG-LP] Simulate error:', error.message)
    return NextResponse.json(
      { error: 'Simulation failed', details: error.message },
      { status: 500 }
    )
  }
}
