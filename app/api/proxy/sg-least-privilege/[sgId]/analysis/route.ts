import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '90'

  console.log(`[SG-LP] GET analysis for ${sgId}, days=${days}`)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/sg-least-privilege/${sgId}/analysis?days=${days}`,
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG-LP] Analysis error: ${response.status}`, errorText)
      return NextResponse.json(
        { error: `Analysis failed: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[SG-LP] Analysis error:', error.message)
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    )
  }
}
