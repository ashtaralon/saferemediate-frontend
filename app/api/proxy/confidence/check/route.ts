import { type NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      role_name,
      permissions_to_remove,
      resource_type,
      resource_id,
      changes,
      // Pipeline subordination context (Layer 2). MUST be forwarded —
      // dropping it silently fails-open: the backend then runs Agent 5
      // alone, so the modal can show "Safe to apply / 95" while the
      // pipeline decision is BLOCK. This was a real production bug.
      pipeline_decision,
    } = body

    if (!role_name && !resource_id) {
      return NextResponse.json(
        { error: "role_name or (resource_type + resource_id) is required" },
        { status: 400 },
      )
    }

    const forward: Record<string, unknown> = {}
    if (role_name) {
      forward.role_name = role_name
      forward.permissions_to_remove = permissions_to_remove ?? []
    } else {
      forward.resource_type = resource_type
      forward.resource_id = resource_id
      forward.changes = changes ?? []
    }
    if (pipeline_decision && typeof pipeline_decision === "object") {
      forward.pipeline_decision = pipeline_decision
    }

    const response = await fetch(`${BACKEND_URL}/api/confidence/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || `Backend returned ${response.status}` },
        { status: response.status, headers: { "X-Proxy": "confidence-check-error" } },
      )
    }

    return NextResponse.json(data, {
      headers: {
        "X-Proxy": "confidence-check",
        "X-Proxy-Timestamp": new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("Confidence check proxy error:", error)
    return NextResponse.json(
      { error: "Confidence check failed" },
      { status: 500, headers: { "X-Proxy": "confidence-check-error" } },
    )
  }
}
