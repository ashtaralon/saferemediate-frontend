import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

/**
 * Security Posture API - Returns data for PlanePulse and CommandQueues
 *
 * GET /api/proxy/security-posture/{systemName}?window=30d&min_conf=medium
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await context.params
  const { searchParams } = new URL(req.url)
  const window = searchParams.get("window") || "365d"
  const minConf = searchParams.get("min_conf") || "low"

  try {
    // Fetch data from multiple endpoints in parallel
    // Use least-privilege/issues endpoint which has actual gap analysis data
    const windowDays = parseInt(window.replace('d', '')) || 365
    const [lpIssuesRes, sgListRes] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/api/least-privilege/issues?systemName=${encodeURIComponent(systemName)}&observationDays=${windowDays}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${BACKEND_URL}/api/infrastructure/security-groups?system_name=${encodeURIComponent(systemName)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
    ])

    // Process least-privilege issues (IAM gaps with real data)
    let iamGaps: any[] = []
    let lpSummary: any = null
    if (lpIssuesRes.status === "fulfilled" && lpIssuesRes.value.ok) {
      const data = await lpIssuesRes.value.json()
      lpSummary = data.summary
      // Transform LP resources to IAM gaps format, deduplicating by id
      const iamResources = (data.resources || []).filter((r: any) => r.resourceType === 'IAMRole')
      const seenIds = new Set<string>()
      iamGaps = iamResources
        .filter((r: any) => {
          const id = r.resourceArn || r.id
          if (!id || seenIds.has(id)) return false
          seenIds.add(id)
          return true
        })
        .map((r: any) => ({
          role_id: r.resourceArn || r.id,
          role_name: r.resourceName,
          allowed_permissions: r.allowedCount || 0,
          used_permissions: r.usedCount || 0,
          unused_permissions: r.gapCount || 0,
          usage_percent: r.lpScore || 0,
          has_admin_access: r.severity === 'CRITICAL' || r.severity === 'critical',
          has_wildcards: (r.unusedList || []).some((p: string) => p?.includes('*')),
        }))
    }

    // Process Security Groups - the infrastructure endpoint returns an array directly
    let securityGroups: any[] = []
    if (sgListRes.status === "fulfilled" && sgListRes.value.ok) {
      const sgList = await sgListRes.value.json()

      // Fetch gap analysis for each SG (limit to 10 for performance)
      const sgDetailsPromises = (Array.isArray(sgList) ? sgList : []).slice(0, 10).map(async (sg: any) => {
        try {
          const res = await fetch(
            `${BACKEND_URL}/api/security-groups/${sg.id}/inspector?days=${window.replace('d', '')}`,
            { headers: { Accept: "application/json" }, cache: "no-store" }
          )
          if (res.ok) {
            const data = await res.json()
            // Map configured_rules to rules_analysis format expected by downstream code
            const rulesAnalysis = (data.configured_rules || []).map((r: any) => ({
              source: r.source_cidr || r.source_sg || 'unknown',
              port_range: r.port_display || `${r.from_port}-${r.to_port}`,
              protocol: r.protocol?.toUpperCase() || 'TCP',
              status: r.status?.toUpperCase() || 'UNKNOWN',
              hits: r.flow_count || 0,
              is_public: r.is_public || false,
            }))
            return {
              sg_id: sg.id,
              sg_name: sg.name,
              rules_analysis: rulesAnalysis,
              eni_count: data.summary?.total_rules || 0,
            }
          }
          return { sg_id: sg.id, sg_name: sg.name, rules_analysis: [], eni_count: sg.ingress_rules || 0 }
        } catch {
          return { sg_id: sg.id, sg_name: sg.name, rules_analysis: [], eni_count: sg.ingress_rules || 0 }
        }
      })
      securityGroups = await Promise.all(sgDetailsPromises)
    }

    // Build Plane Pulse data
    const hasFlowLogs = securityGroups.some((sg: any) => sg.eni_count > 0)
    const hasCloudTrail = iamGaps.length > 0

    const planePulse = {
      window_days: parseInt(window.replace('d', '')),
      planes: {
        configured: {
          available: true,
          coverage_pct: 100,
          last_updated: new Date().toISOString(),
        },
        observed: {
          available: hasFlowLogs || hasCloudTrail,
          coverage_pct: calculateObservedCoverage(iamGaps, securityGroups),
          last_updated: new Date().toISOString(),
          confidence: calculateConfidence(iamGaps, securityGroups),
          breakdown: {
            flow_logs: hasFlowLogs ? 70 : 0,
            cloudtrail_usage: hasCloudTrail ? 80 : 0,
            xray: 0,
          },
        },
        authorized: {
          available: true,
          coverage_pct: 100,
          last_updated: new Date().toISOString(),
        },
        changed: {
          available: hasCloudTrail,
          coverage_pct: hasCloudTrail ? 100 : 0,
          last_updated: new Date().toISOString(),
        },
      },
    }

    // Build Command Queues data
    const queues = buildCommandQueues(iamGaps, securityGroups, minConf)

    // Build component list
    const components = buildComponents(iamGaps, securityGroups)

    // Use LP summary if available, otherwise compute from components
    const totalRemovalCandidates = lpSummary?.totalExcessPermissions ||
      components.reduce((sum: number, c: any) => sum + (c.G_gap?.value || 0), 0)
    const highRiskCount = lpSummary?.criticalCount ||
      queues.blast_radius_warnings.length

    return NextResponse.json({
      system_name: systemName,
      window,
      min_confidence: minConf,
      plane_pulse: planePulse,
      queues,
      components,
      summary: {
        total_components: lpSummary?.totalResources || components.length,
        total_removal_candidates: totalRemovalCandidates,
        high_risk_count: highRiskCount,
      },
    })
  } catch (error) {
    console.error("[security-posture] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch security posture", details: String(error) },
      { status: 500 }
    )
  }
}

// Helper functions
function calculateObservedCoverage(iamGaps: any[], sgs: any[]): number {
  let total = 0
  let covered = 0

  iamGaps.forEach((gap) => {
    total++
    if (gap.usage_percent > 0) covered++
  })

  sgs.forEach((sg) => {
    total++
    if (sg.eni_count > 0) covered++
  })

  return total > 0 ? Math.round((covered / total) * 100) : 0
}

function calculateConfidence(iamGaps: any[], sgs: any[]): "high" | "medium" | "low" | "unknown" {
  const coverage = calculateObservedCoverage(iamGaps, sgs)
  if (coverage >= 70) return "high"
  if (coverage >= 40) return "medium"
  if (coverage > 0) return "low"
  return "unknown"
}

function buildCommandQueues(iamGaps: any[], sgs: any[], minConf: string) {
  const highConfidenceGaps: any[] = []
  const architecturalRisks: any[] = []
  const blastRadiusWarnings: any[] = []

  // Process IAM gaps
  iamGaps.forEach((gap) => {
    if (gap.unused_permissions === 0) return

    const confidence = gap.usage_percent >= 70 ? "high" : gap.usage_percent >= 40 ? "medium" : "low"
    const hasAdmin = gap.has_admin_access
    const hasWildcard = gap.has_wildcards

    const item = {
      id: gap.role_id || gap.role_name,
      resource_type: "iam_role",
      resource_name: gap.role_name,
      severity: hasAdmin || hasWildcard ? "critical" : gap.unused_permissions > 20 ? "high" : "medium",
      confidence,
      A_authorized_breadth: { value: gap.allowed_permissions || 0, state: "value" },
      U_observed_usage: { value: gap.used_permissions || 0, state: confidence === "low" ? "unknown" : "value" },
      G_gap: { value: gap.unused_permissions || 0, state: confidence === "low" ? "unknown" : "value" },
      risk_flags: [
        ...(hasAdmin ? ["admin_policy"] : []),
        ...(hasWildcard ? ["wildcard_action"] : []),
      ],
      blast_radius: { neighbors: 10, critical_paths: 2, risk: hasAdmin ? "risky" : "safe" },
      recommended_action: {
        cta: confidence === "high" ? "view_impact_report" : "enable_telemetry",
        cta_label: confidence === "high" ? "View Impact Report" : "Enable Telemetry",
        reason: `${gap.unused_permissions} unused permissions detected`,
      },
    }

    if (confidence === "high" || confidence === "medium") {
      highConfidenceGaps.push(item)
    } else {
      architecturalRisks.push({
        ...item,
        risk_description: "Limited CloudTrail data - cannot fully verify usage",
      })
    }

    if (hasAdmin || hasWildcard) {
      blastRadiusWarnings.push(item)
    }
  })

  // Process Security Groups
  sgs.forEach((sg) => {
    const rules = sg.rules_analysis || []
    const unused = rules.filter((r: any) => r.status === "UNUSED").length
    const hasPublic = rules.some((r: any) => r.source === "0.0.0.0/0")
    const hasUnusedPublic = rules.some((r: any) => r.source === "0.0.0.0/0" && r.status === "UNUSED")

    if (unused === 0 && !hasPublic) return

    const confidence: "high" | "medium" | "low" = sg.eni_count > 0 ? "high" : "low"

    const item = {
      id: sg.sg_id,
      resource_type: "security_group",
      resource_name: sg.sg_name,
      severity: hasUnusedPublic ? "critical" : hasPublic ? "high" : "medium",
      confidence,
      A_authorized_breadth: { value: rules.length, state: "value" },
      U_observed_usage: { value: rules.length - unused, state: confidence === "low" ? "unknown" : "value" },
      G_gap: { value: unused, state: confidence === "low" ? "unknown" : "value" },
      risk_flags: [
        ...(hasPublic ? ["world_open"] : []),
        ...(hasUnusedPublic ? ["sensitive_ports"] : []),
      ],
      blast_radius: { neighbors: sg.eni_count || 5, critical_paths: 1, risk: hasPublic ? "risky" : "safe" },
      recommended_action: {
        cta: hasUnusedPublic ? "investigate_activity" : confidence === "high" ? "view_impact_report" : "enable_telemetry",
        cta_label: hasUnusedPublic ? "Investigate Activity" : confidence === "high" ? "View Impact Report" : "Enable Telemetry",
        reason: hasUnusedPublic ? "Unused public rule detected" : `${unused} unused rules detected`,
      },
    }

    if (hasUnusedPublic) {
      blastRadiusWarnings.push(item)
    } else if (confidence === "high") {
      highConfidenceGaps.push(item)
    } else {
      architecturalRisks.push({
        ...item,
        risk_description: "No Flow Logs available - cannot verify traffic",
      })
    }
  })

  return {
    high_confidence_gaps: highConfidenceGaps,
    architectural_risks: architecturalRisks,
    blast_radius_warnings: blastRadiusWarnings,
  }
}

function buildComponents(iamGaps: any[], sgs: any[]) {
  const components: any[] = []

  iamGaps.forEach((gap) => {
    components.push({
      id: gap.role_id || gap.role_name,
      name: gap.role_name,
      type: "iam_role",
      A_authorized_breadth: { value: gap.allowed_permissions || 0, state: "value" },
      U_observed_usage: { value: gap.used_permissions || 0, state: "value" },
      G_gap: { value: gap.unused_permissions || 0, state: "value" },
      confidence: gap.usage_percent >= 70 ? "high" : gap.usage_percent >= 40 ? "medium" : "low",
      risk_flags: [
        ...(gap.has_admin_access ? ["admin_policy"] : []),
        ...(gap.has_wildcards ? ["wildcard_action"] : []),
      ],
    })
  })

  sgs.forEach((sg) => {
    const rules = sg.rules_analysis || []
    const unused = rules.filter((r: any) => r.status === "UNUSED").length
    const hasPublic = rules.some((r: any) => r.source === "0.0.0.0/0")

    components.push({
      id: sg.sg_id,
      name: sg.sg_name,
      type: "security_group",
      A_authorized_breadth: { value: rules.length, state: "value" },
      U_observed_usage: { value: rules.length - unused, state: "value" },
      G_gap: { value: unused, state: "value" },
      confidence: sg.eni_count > 0 ? "high" : "low",
      risk_flags: hasPublic ? ["world_open"] : [],
    })
  })

  return components
}
