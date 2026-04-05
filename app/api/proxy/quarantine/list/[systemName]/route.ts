import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'https://saferemediate-backend-f.onrender.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const response = await fetch(
      `${BACKEND_URL}/api/quarantine/list/${encodeURIComponent(systemName)}`,
      { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[quarantine/list] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
