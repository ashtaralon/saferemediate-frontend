import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { refuseHeldLegacyMutation } from "@/lib/server/legacy-mutation-proxy-hold"

const BACKEND_URL = getBackendBaseUrl()

export async function DELETE(request: NextRequest) {
  const held = refuseHeldLegacyMutation("quarantine")
  if (held) return held
  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND_URL}/api/quarantine/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[quarantine/delete] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
