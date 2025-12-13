import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: { system: string; issue: string } }
) {
  try {
    const { system, issue } = params
    const body = await request.json()

    if (!system || !issue) {
      return NextResponse.json(
        {
          success: false,
          error: "system and issue are required",
        },
        { status: 400 }
      )
    }

    // Decode the issue ID (it might be URL encoded)
    const decodedIssue = decodeURIComponent(issue)

    // Call backend simulation endpoint
    const backendUrl = `${BACKEND_URL}/api/systems/${system}/issues/${encodeURIComponent(decodedIssue)}/simulate`
    
    console.log(`[proxy] Calling backend simulation: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Increase timeout for simulation (30s)
      signal: AbortSignal.timeout(30000),
    })

    if (response.ok) {
      const data = await response.json()
      
      // Handle new format response (status: READY/COMPUTING/ERROR)
      if (data.status) {
        return NextResponse.json(data)
      }
      
      // Handle legacy format
      return NextResponse.json({
        success: true,
        ...data,
      })
    } else {
      // Handle timeout or errors
      const status = response.status
      const errorText = await response.text().catch(() => 'Unknown error')
      
      console.error(`[proxy] Backend simulation failed: ${status} - ${errorText}`)
      
      // If timeout, return structured BLOCKED response
      if (status === 504 || status === 408) {
        console.log(`[proxy] Backend simulation timed out for ${decodedIssue}`)
        return NextResponse.json({
          success: false,
          status: 'BLOCKED',
          timeout: true,
          confidence: {
            level: 'BLOCKED',
            numeric: 0.0,
            criteria_met: [],
            criteria_failed: ['simulation_timeout'],
            disqualifiers_triggered: ['simulation_incomplete'],
            summary: 'Simulation incomplete - backend timeout'
          },
          blast_radius: {
            level: 'UNKNOWN',
            numeric: 0.5,
            affected_resources_count: 0,
            affected_resources: []
          },
          recommendation: '⚠️ REVIEW REQUIRED: Simulation timed out. Cannot determine full impact. Manual review required.',
          timeout_status: {
            timed_out: true,
            reason: 'Backend simulation exceeded timeout limit',
            message: '⚠️ REVIEW REQUIRED: Simulation incomplete due to timeout. Cannot determine full impact.',
            partial_data: true,
            action_policy: 'REVIEW_ONLY'
          },
          human_readable_evidence: [
            '⚠️ Simulation timed out after 30 seconds',
            '⚠️ Cannot determine full impact without complete simulation',
            '⚠️ Manual review required before applying changes'
          ],
          why_safe: {
            summary: '⚠️ Cannot determine safety - simulation incomplete',
            reasons: [
              'Simulation timed out',
              'Incomplete evidence gathering',
              'Cannot verify impact without full simulation',
              'Manual review required'
            ],
            confidence_level: 'BLOCKED',
            risk_level: 'UNKNOWN'
          },
          action_policy: {
            auto_apply: false,
            allowed_actions: ['REVIEW_ONLY', 'EXPORT_CHANGESET'],
            reason: 'Simulation incomplete - cannot auto-apply without full analysis'
          }
        }, { status: 200 }) // Return 200 so frontend can display the BLOCKED status
      }
      
      // Other errors
      return NextResponse.json(
        {
          success: false,
          error: errorText || `Backend returned ${status}`,
          status: status,
        },
        { status: status }
      )
    }
  } catch (error) {
    console.error("[proxy] Simulation error:", error)
    
    // Handle timeout errors
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
      return NextResponse.json({
        success: false,
        status: 'BLOCKED',
        timeout: true,
        confidence: {
          level: 'BLOCKED',
          numeric: 0.0,
          criteria_failed: ['simulation_timeout'],
          summary: 'Simulation incomplete - proxy timeout'
        },
        recommendation: '⚠️ REVIEW REQUIRED: Simulation timed out. Manual review required.',
      }, { status: 200 })
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

