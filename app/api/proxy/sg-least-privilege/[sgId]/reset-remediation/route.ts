import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params

  console.log(`[SG-LP] POST reset-remediation for ${sgId}`)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/reset-remediation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Reset error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Reset failed: ${response.status}`, details: errorText, success: false },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SG-LP] Reset success`)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[SG-LP] Reset error:', error.message)
    return NextResponse.json(
      { error: 'Reset failed', details: error.message, success: false },
      { status: 500 }
    )
  }
}
