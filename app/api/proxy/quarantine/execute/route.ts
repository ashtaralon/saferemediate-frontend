import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { refuseHeldLegacyMutation } from "@/lib/server/legacy-mutation-proxy-hold"
import { relayBackendError } from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

export async function POST(request: NextRequest) {
  const held = refuseHeldLegacyMutation("quarantine")
  if (held) return held
  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND_URL}/api/quarantine/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    // Status and typed body unchanged (the backend holds this transition with a 409 off_boundary_mutation_refused).
    if (!response.ok) return relayBackendError(response)

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[quarantine/execute] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
