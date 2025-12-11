import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

// Set to true to skip backend and return mock response (use when backend /api/simulate doesn't exist)
const USE_MOCK_SIMULATION = false  // Using real backend data

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30 // Maximum execution time in seconds

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ systemId: string; issueId: string }> }
) {
  const controller = new AbortController()
  let timeoutId: NodeJS.Timeout | null = null

  try {
    // Await params in Next.js 14+ (params is now a Promise)
    const { systemId: paramSystemId, issueId: paramIssueId } = await params

    let systemId = paramSystemId
    let issueId = paramIssueId
    let resourceName = ""
    let resourceArn = ""
    let title = ""
    let resourceType = "IAMRole" // Default

    // Also try to get from request body (more reliable)
    try {
      const body = await request.json().catch(() => ({}))
      if (body.system_name) systemId = body.system_name
      if (body.finding_id) issueId = body.finding_id
      if (body.resource_name) resourceName = body.resource_name
      if (body.resource_arn) resourceArn = body.resource_arn
      if (body.title) title = body.title
      if (body.resource_type) resourceType = body.resource_type
    } catch (e) {
      console.warn("[proxy] Could not parse request body:", e)
    }

    // Determine resource type from finding_id
    if (issueId.includes("/ingress/") || issueId.includes("/egress/")) {
      resourceType = "SecurityGroup"
    } else if (issueId.includes("iam-") || issueId.includes("role") || resourceArn.includes(":role/")) {
      resourceType = "IAMRole"
    }

    // Extract resource name from issue if not provided
    if (!resourceName && issueId) {
      if (resourceType === "IAMRole") {
        if (issueId.includes("iam:")) {
          resourceName = "SafeRemediate-Lambda-Remediation-Role" // Default
        } else if (issueId.includes("-unused-permissions")) {
          resourceName = issueId.replace("iam-", "").replace("-unused-permissions", "")
        }
      }
    }

    // Validate required parameters
    if (!systemId || systemId === "undefined" || !issueId || issueId === "undefined") {
      console.error("[proxy] Invalid params:", { systemId, issueId })
      return NextResponse.json(
        { error: "Invalid system_id or issue_id", status: 400 },
        { status: 400 }
      )
    }

    console.log(`[proxy] Simulating issue: ${issueId} for system: ${systemId}, resource: ${resourceName || 'unknown'}, type: ${resourceType}`)

    // If mock mode is enabled, skip backend and return mock response immediately
    if (USE_MOCK_SIMULATION) {
      console.log(`[proxy] Using MOCK simulation (backend /api/simulate not implemented)`)

      return NextResponse.json({
        success: true,
        status: "success",
        simulated: true,
        _isFallback: true,
        _mockMode: true,
        summary: {
          decision: "EXECUTE",
          confidence: 92,
          blastRadius: {
            affectedResources: 1,
            downstream: [],
            upstream: [],
          },
        },
        recommendation: `Analysis complete for "${title || issueId}". This permission appears unused based on CloudTrail analysis. Safe to remove.`,
        snapshot_id: `snap-mock-${Date.now()}`,
        affectedResources: [
          {
            id: issueId,
            type: resourceType,
            name: resourceName || systemId,
            impact: "low",
            reason: "No API calls detected using this permission in the last 90 days",
          },
        ],
        confidence: 92,
        before_state: `${resourceType} "${resourceName || systemId}" has unused permission: ${issueId.replace(/^(high|medium|low)-\d+-/, '')}`,
        after_state: `Permission will be removed from the ${resourceType.toLowerCase()}'s policy`,
        estimated_time: "2-5 minutes",
        temporal_info: {
          start_time: new Date().toISOString(),
          estimated_completion: new Date(Date.now() + 300000).toISOString(),
          analysis_period: "90 days",
        },
        warnings: [],
        resource_changes: [
          {
            resource_id: resourceName || systemId,
            resource_type: resourceType,
            change_type: "policy_update",
            before: `Has permission: ${issueId.replace(/^(high|medium|low)-\d+-/, '')}`,
            after: "Permission removed",
          },
        ],
        impact_summary: `1 ${resourceType} will be modified. No service disruption expected based on usage analysis.`,
        safeToRemediate: true,
        brokenCalls: 0,
        usage_stats: {
          total_calls_analyzed: 15000,
          calls_using_permission: 0,
          last_used: null,
          confidence_reason: "No usage detected in 90-day CloudTrail analysis",
        },
      })
    }

    // Real backend call (only if USE_MOCK_SIMULATION is false)
    // Parse permission from issueId for IAM roles
    let proposed_change: any = null
    if (resourceType === "IAMRole" && issueId) {
      const iamMatch = issueId.match(/iam:([A-Za-z0-9]+)/i)
      if (iamMatch && iamMatch[1]) {
        const permission = `iam:${iamMatch[1]}`
        proposed_change = {
          action: "remove_permissions",
          items: [permission],
          reason: `Remove unused permission: ${permission}`
        }
      } else {
        proposed_change = {
          action: "remove_permissions",
          items: [],
          reason: "Unused permissions detected via CloudTrail analysis"
        }
      }
    } else if (resourceType === "SecurityGroup") {
      const parts = issueId.split("/")
      if (parts.length >= 5) {
        const port_str = parts[3]
        const from_port = port_str.includes('-') ? parseInt(port_str.split('-')[0]) : parseInt(port_str)
        const to_port = port_str.includes('-') ? parseInt(port_str.split('-')[1]) : parseInt(port_str)
        proposed_change = {
          action: "remove_port",
          protocol: parts[2],
          port: port_str,
          from_port: from_port,
          to_port: to_port,
          cidr: parts[4],
          reason: "Open access detected - security risk"
        }
      }
    }

    if (!proposed_change) {
      proposed_change = {
        action: "remove_permissions",
        items: [],
        reason: "Remediation required"
      }
    }

    // Call backend /api/simulate endpoint
    timeoutId = setTimeout(() => controller.abort(), 28000) // 28s timeout (safe under Vercel 30s limit)

    const res = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resource_type: resourceType,
        resource_id: resourceName || issueId,
        proposed_change: proposed_change,
        system_name: systemId,
        finding_id: issueId,
        resource_arn: resourceArn,
      }),
      cache: "no-store",
      signal: controller.signal,
    })

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (res.ok) {
      const data = await res.json()
      console.log(`[proxy] Simulation successful for ${issueId}`, {
        status: data.status,
        confidence: data.confidence,
        blast_radius: data.blast_radius
      })

      // Transform response to match frontend expectations
      const decision = data.status || "REVIEW"
      const confidence = Math.round((data.confidence || 0) * 100) // Convert 0.94 -> 94

      return NextResponse.json({
        success: true,
        status: "success",
        summary: {
          decision: decision,
          confidence: confidence,
          blastRadius: {
            affectedResources: data.affected_resources_count || 0,
            downstream: data.affected_resources?.slice(0, 5) || [],
            upstream: [],
          },
        },
        recommendation: data.recommendation || `Simulation ${decision}: Confidence ${confidence}%`,
        affectedResources: (data.affected_resources || []).map((r: any) => ({
          id: r.id || r.resource_id || issueId,
          type: r.type || resourceType,
          impact: r.impact || "low",
          reason: r.reason || "Affected by remediation",
        })),
        confidence: confidence,
        snapshot_id: data.snapshot_id,
        before_state: data.before_state_summary || `Current state of ${resourceType}`,
        after_state: data.after_state_summary || `Proposed state after remediation`,
      })
    }

    // If backend returns non-OK status, read error and log
    const errorText = await res.text().catch(() => "Unknown error")
    console.warn(`[proxy] Backend simulate returned ${res.status}: ${errorText.substring(0, 200)}`)

    return NextResponse.json(
      {
        error: `Backend error: ${res.status}`,
        detail: errorText.substring(0, 200),
        status: res.status
      },
      { status: res.status }
    )
  } catch (error: any) {
    // Clear timeout if still active
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError"
    console.error("[proxy] simulate error:", isTimeout ? "Request timed out after 28s" : error.message)

    if (isTimeout) {
      return NextResponse.json(
        {
          error: "Request timeout",
          detail: "Backend did not respond in time (28s limit)",
          status: 504
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        error: "Simulation failed",
        detail: error.message || "Unknown error",
        status: 500
      },
      { status: 500 }
    )
  }
}
