import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await params
    
    // Get query parameters
    const { searchParams } = new URL(req.url)
    const days = searchParams.get("days") || "365"

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    // NOTE: /api/security-groups/{sg_id}/gap-analysis doesn't exist in backend
    // Try to use /api/remediation/simulate to get SG analysis data
    // Or fall back to /api/least-privilege/issues
    
    console.log("[proxy] security-groups/" + sgId + "/gap-analysis - fetching SG data from least-privilege/issues")

    // First try to get from least-privilege issues which contains SG data
    const lpUrl = `${BACKEND_URL}/api/least-privilege/issues`
    const res = await fetch(lpUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error("[proxy] least-privilege/issues failed: " + res.status)
      
      // Return minimal fallback data instead of erroring
      return NextResponse.json({
        security_group_id: sgId,
        summary: {
          total_rules: 0,
          unused_rules: 0,
          used_rules: 0,
          overly_broad_rules: 0,
          observation_days: parseInt(days)
        },
        rules_analysis: [],
        data_sources: ["fallback"],
        error: "Backend endpoint not available - showing minimal data"
      }, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }

    const lpData = await res.json()
    
    // Find the specific SG in the response
    const resources = lpData.resources || []
    const sgResource = resources.find((r: any) => 
      r.id === sgId || 
      r.resourceName === sgId || 
      r.resourceArn?.includes(sgId)
    )

    if (sgResource) {
      // Transform LP issues data to gap-analysis format
      const gapAnalysis = {
        security_group_id: sgId,
        security_group_name: sgResource.resourceName,
        vpc_id: sgResource.evidence?.vpc_id,
        summary: {
          total_rules: sgResource.networkExposure?.totalRules || 0,
          unused_rules: 0, // LP issues doesn't track unused rules
          used_rules: sgResource.networkExposure?.totalRules || 0,
          overly_broad_rules: sgResource.networkExposure?.internetExposedRules || 0,
          observation_days: parseInt(days),
          exposure_score: sgResource.networkExposure?.score || 0,
          severity: sgResource.networkExposure?.severity || "UNKNOWN"
        },
        rules_analysis: sgResource.evidence?.rule_states?.map((rule: any) => ({
          rule_id: `rule-${rule.port}`,
          direction: "INBOUND",
          protocol: rule.protocol || "tcp",
          port_range: String(rule.port),
          source: rule.cidr || "0.0.0.0/0",
          status: rule.exposed ? "OVERLY_BROAD" : (rule.observed_usage ? "USED" : "UNUSED"),
          is_public: rule.exposed,
          traffic_observed: rule.connections || 0,
          recommendation: {
            action: rule.recommendation?.includes("DELETE") ? "DELETE" : 
                   rule.recommendation?.includes("TIGHTEN") ? "TIGHTEN" : "KEEP",
            reason: rule.note || rule.recommendation
          }
        })) || [],
        data_sources: sgResource.evidence?.dataSources || ["least-privilege"],
        analyzed_at: new Date().toISOString()
      }

      return NextResponse.json(gapAnalysis, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      })
    }

    // SG not found in LP issues - return minimal data
    return NextResponse.json({
      security_group_id: sgId,
      summary: {
        total_rules: 0,
        unused_rules: 0,
        used_rules: 0,
        overly_broad_rules: 0,
        observation_days: parseInt(days)
      },
      rules_analysis: [],
      data_sources: ["fallback"],
      warning: `Security Group ${sgId} not found in least-privilege analysis`
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })

  } catch (error: any) {
    console.error("[proxy] security-groups/[sgId]/gap-analysis error:", error)
    
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. Analysis is taking longer than expected." },
        { status: 504 }
      )
    }

    // Return fallback data instead of error
    return NextResponse.json({
      security_group_id: (await params).sgId,
      summary: {
        total_rules: 0,
        unused_rules: 0,
        used_rules: 0,
        overly_broad_rules: 0,
        observation_days: 365
      },
      rules_analysis: [],
      data_sources: ["fallback"],
      error: error.message || "Internal server error"
    }, {
      status: 200,
    })
  }
}
