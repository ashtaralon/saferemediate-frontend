import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { relayLegacySimulate } from "@/lib/server/legacy-simulate-proxy"

const BACKEND_URL = getBackendBaseUrl()

// No mock data - only return real data from backend

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, resource_id, resource_type } = body

    if (!finding_id) {
      return NextResponse.json(
        { success: false, error: "finding_id is required" },
        { status: 400 }
      )
    }

    // Backend POST /api/simulate runs no simulation: only its typed refusal is relayed, and a 2xx from a backend that
    // still serves the old hard-coded handler is refused here (lib/server/legacy-simulate-proxy.ts).
    let response: Response
    try {
      response = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ finding_id, resource_id, resource_type }),
      })
    } catch (backendError) {
      console.error("Backend unreachable:", backendError)
      return NextResponse.json(
        { success: false, error: "Backend unreachable" },
        { status: 503, headers: { "X-Proxy": "simulate-error" } }
      )
    }
    return await relayLegacySimulate(response)

  } catch (error) {
    console.error("Simulation error:", error)
    return NextResponse.json(
      { success: false, error: "Simulation failed" },
      { status: 500, headers: { "X-Proxy": "simulate-error" } }
    )
  }
}
