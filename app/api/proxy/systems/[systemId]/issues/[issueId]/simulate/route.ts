import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

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
      // Ignore body parsing errors
    }

    // Validate required parameters
    if (!systemId || systemId === "undefined" || !issueId || issueId === "undefined") {
      console.error("[proxy] Invalid params:", { systemId, issueId })
      return NextResponse.json(
        { error: "Invalid system_id or issue_id", status: 400 },
        { status: 400 }
      )
    }

    // Determine resource type from finding_id
    if (issueId.includes("/ingress/") || issueId.includes("/egress/")) {
      resourceType = "SecurityGroup"
    } else if (issueId.includes("iam-") || issueId.includes("role") || resourceArn.includes(":role/")) {
      resourceType = "IAMRole"
    }

    console.log(`[proxy] Simulating issue: ${issueId} for system: ${systemId}, resource: ${resourceName || 'unknown'}, type: ${resourceType}`)

    // Try to fetch finding details to extract unused permissions
    // But also parse issueId directly as fallback (more resilient)
    let proposed_change: any = null
    let unusedPermissions: string[] = []
    
    // Parse permission from issueId first (fast, no API call needed)
    // Format: "high-2-iam:UpdateUser" or "iam-role-name-unused-permissions"
    if (resourceType === "IAMRole" && issueId) {
      // Try to extract permission name from issueId
      // Pattern: "high-N-iam:Permission" or "iam:Permission"
      const iamMatch = issueId.match(/iam:([A-Za-z0-9]+)/i)
      if (iamMatch && iamMatch[1]) {
        const permission = `iam:${iamMatch[1]}`
        unusedPermissions = [permission]
        console.log(`[proxy] Extracted permission from issueId: ${permission}`)
      } else if (issueId.includes("unused-permissions")) {
        // For bulk unused permissions findings, try to fetch details
        // But don't block on it
        unusedPermissions = []
      }
    }
    
    // Try to fetch finding details for more complete data (non-blocking)
    try {
      // Use longer timeout (12s) since backend is slow, but still shorter than main request
      const findingController = new AbortController()
      const findingTimeout = setTimeout(() => findingController.abort(), 12000)
      
      const findingRes = await fetch(
        `${BACKEND_URL}/api/findings?systemName=${encodeURIComponent(systemId)}`,
        {
          headers: { "Content-Type": "application/json" },
          signal: findingController.signal,
        }
      )
      
      clearTimeout(findingTimeout)
      
      if (findingRes.ok) {
        const findingsData = await findingRes.json()
        const findings = findingsData.findings || findingsData || []
        const finding = findings.find((f: any) => f.id === issueId || f.id?.includes(issueId))
        
        if (finding && finding.details) {
          // Use finding details if available (more complete than issueId parsing)
          const foundPermissions = finding.details.unusedActions || finding.details.unusedPermissions || []
          if (foundPermissions.length > 0) {
            unusedPermissions = foundPermissions
            console.log(`[proxy] Found ${unusedPermissions.length} unused permissions in finding details`)
          }
        }
      }
    } catch (e) {
      // Silently continue - we already have permission from issueId parsing or empty array
      console.log(`[proxy] Could not fetch finding details (non-blocking): ${e instanceof Error ? e.name : 'unknown'}`)
      // Continue with issueId-parsed permissions or empty array - backend will query CloudTrail
    }

    // Build proposed_change based on finding type
    if (resourceType === "SecurityGroup") {
      // Parse SG finding: "sg-xxx/ingress/tcp/22/0.0.0.0/0"
      const parts = issueId.split("/")
      if (parts.length >= 5) {
        proposed_change = {
          action: "remove_port",
          protocol: parts[2],
          port: parts[3],
          cidr: parts[4],
          reason: "Open access detected - security risk"
        }
      }
    } else if (resourceType === "IAMRole") {
      // For IAM, use unused permissions from finding if available
      proposed_change = {
        action: "remove_permissions",
        items: unusedPermissions, // Use extracted permissions or empty (backend will query CloudTrail)
        reason: unusedPermissions.length > 0 
          ? `Remove ${unusedPermissions.length} unused permissions detected via CloudTrail analysis`
          : "Unused permissions detected via CloudTrail analysis (will be determined by simulation)"
      }
    }
    
    if (!proposed_change) {
      // Fallback
      proposed_change = {
        action: "remove_permissions",
        items: unusedPermissions,
        reason: "Remediation required"
      }
    }

    // Use the proper simulation endpoint with SimulationEngine
    // This endpoint uses simulation-scoring, remediation generation, and snapshots
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
        finding_id: issueId, // Include finding_id for context
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
      // The backend returns A4 patent format, we need to adapt it
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
        before_state: data.before_state_summary || `Current state of ${resourceType}`,
        after_state: data.after_state_summary || `Proposed state after remediation`,
        estimated_time: "5-10 minutes",
        temporal_info: {
          start_time: data.timestamp || new Date().toISOString(),
          estimated_completion: new Date(Date.now() + 600000).toISOString(),
        },
        warnings: [],
        resource_changes: [
          {
            resource_id: resourceName || issueId,
            resource_type: resourceType,
            change_type: proposed_change.action,
            before: data.before_state_summary || "Current state",
            after: data.after_state_summary || "Remediated state",
          },
        ],
        impact_summary: `${data.affected_resources_count || 0} resource(s) will be affected. ${data.recommendation || "Review recommended"}`,
        safeToRemediate: decision === "EXECUTE" || decision === "CANARY",
        brokenCalls: 0,
        // Include raw backend response for debugging
        _raw: data,
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
