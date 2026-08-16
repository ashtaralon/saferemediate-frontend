import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  try {
    const { recordId } = await params
    const response = await fetch(
      `${BACKEND_URL}/api/quarantine/activity/${encodeURIComponent(recordId)}`,
      { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[quarantine/activity] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
