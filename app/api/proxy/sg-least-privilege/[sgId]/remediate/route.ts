import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params

  console.log(`[SG-LP] POST remediate for ${sgId}`)

  try {
    const body = await request.json()
    console.log(`[SG-LP] Rules to remediate:`, body.rules?.length || 0)

    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/remediate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Remediate error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Remediation failed: ${response.status}`, details: errorText, success: false },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[SG-LP] Remediation success:`, data.summary)
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[SG-LP] Remediate error:', error.message)
    return NextResponse.json(
      { error: 'Remediation failed', details: error.message, success: false },
      { status: 500 }
    )
  }
}
