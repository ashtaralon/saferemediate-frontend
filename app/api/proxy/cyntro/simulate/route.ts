import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const body = await req.json()
    const { role_name, proposed_permissions, ...rest } = body

    // Build resource_id from role_name if not provided
    let resource_id = rest.resource_id
    if (!resource_id && role_name) {
      // Assume it's an IAM role ARN or construct one
      resource_id = role_name.startsWith('arn:')
        ? role_name
        : `arn:aws:iam::745783559495:role/${role_name}`
    }

    const simulateBody = {
      resource_id,
      finding_id: rest.finding_id || `per-resource-${role_name}`,
      proposed_permissions,
      ...rest
    }

    const res = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simulateBody),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ error: `Engine error: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const simData = await res.json()

    // Transform response for per-resource analysis UI
    const response = {
      results: [{
        resource_id: resource_id,
        resource_name: role_name || simData.current_state?.id || 'Unknown',
        proposed_role: `${role_name}-least-privilege`,
        total_events: simData.current_state?.used_count || 0,
        successful: simData.current_state?.used_actions_count || 0,
        denied: 0,
        confidence: simData.confidence || 0,
        passed: simData.recommendation === 'EXECUTE'
      }],
      all_passed: simData.recommendation === 'EXECUTE',
      simulation_id: simData.simulation_id,
      confidence: simData.confidence,
      recommendation: simData.recommendation,
      current_state: simData.current_state
    }

    return NextResponse.json(response)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
