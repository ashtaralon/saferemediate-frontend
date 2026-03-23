import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const role_name = req.nextUrl.searchParams.get("role_name")
  const days = req.nextUrl.searchParams.get("days") || "90"

  if (!role_name) {
    return NextResponse.json({ error: "role_name query parameter is required" }, { status: 400 })
  }

  return handleAnalyze({ role_name, days: parseInt(days) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return handleAnalyze(body)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

async function handleAnalyze(body: { role_name: string; days?: number }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const { role_name } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    // Use the dedicated per-resource analysis endpoint that queries
    // real USES_PERMISSION relationships from Neo4j — no even-split fake data
    const analysisRes = await fetch(
      `${BACKEND_URL}/api/remediation/per-resource-analysis/${encodeURIComponent(role_name)}`,
      { cache: "no-store", signal: controller.signal }
    )
    clearTimeout(timeoutId)

    if (analysisRes.ok) {
      const data = await analysisRes.json()
      return NextResponse.json(data)
    }

    // Fallback: if per-resource endpoint not available, use gap-analysis
    console.log(`[analyze] Per-resource endpoint returned ${analysisRes.status}, falling back to gap-analysis`)

    const gapRes = await fetch(
      `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(role_name)}/gap-analysis?days=${body.days || 90}`,
      { cache: "no-store" }
    )

    if (!gapRes.ok) {
      const errorText = await gapRes.text()
      return NextResponse.json({ error: `Engine error: ${gapRes.status}`, detail: errorText }, { status: gapRes.status })
    }

    const gapData = await gapRes.json()

    // Also try to get resources from scan
    let resources: any[] = []
    try {
      const scanRes = await fetch(`${BACKEND_URL}/api/scan`, { cache: "no-store" })
      if (scanRes.ok) {
        const scanData = await scanRes.json()
        const roleData = scanData.find((r: any) => r.role_name === role_name)
        if (roleData?.resources) resources = roleData.resources
      }
    } catch { /* ignore */ }

    const usedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "USED") || []
    const unusedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "UNUSED") || []
    const totalPermissions = gapData.summary?.total_permissions || 0

    // Build analyses — one per resource, with NO fake even-split
    const uniqueResources = resources.reduce((acc: any[], r: any) => {
      if (!acc.find((x: any) => x.resource_name === r.resource_name)) acc.push(r)
      return acc
    }, [])

    const analyses = uniqueResources.length > 0
      ? uniqueResources.map((resource: any) => ({
          resource_id: resource.resource_id || role_name,
          resource_name: resource.resource_name || resource.resource_id,
          resource_type: resource.resource_type || "Unknown",
          permissions_granted: totalPermissions,
          permissions_used: [],
          unused_permissions: unusedPermissions.map((p: any) => p.permission),
          used_count: 0,
          utilization_rate: 0,
          over_permission_ratio: 100,
          total_api_calls: 0,
          risk_factors: [],
          has_observed_data: false,
          data_source: "no_per_resource_data",
        }))
      : [{
          resource_id: gapData.role_arn || role_name,
          resource_name: role_name,
          resource_type: "IAM_ROLE",
          permissions_granted: totalPermissions,
          permissions_used: usedPermissions.map((p: any) => ({
            action: p.permission, call_count: p.usage_count || 0, targets: [],
          })),
          unused_permissions: unusedPermissions.map((p: any) => p.permission),
          used_count: usedPermissions.length,
          utilization_rate: totalPermissions > 0 ? usedPermissions.length / totalPermissions : 0,
          over_permission_ratio: totalPermissions > 0 ? ((totalPermissions - usedPermissions.length) / totalPermissions) * 100 : 0,
          total_api_calls: gapData.summary?.cloudtrail_events || 0,
          risk_factors: unusedPermissions
            .filter((p: any) => p.risk_level === "HIGH" || p.risk_level === "CRITICAL")
            .slice(0, 3)
            .map((p: any) => `High-risk unused: ${p.permission}`),
          has_observed_data: true,
          data_source: "role_level",
        }]

    return NextResponse.json({
      role: {
        role_name: gapData.role_name,
        role_arn: gapData.role_arn,
        total_permissions: totalPermissions,
        resources,
        all_permissions: gapData.permissions_analysis?.map((p: any) => p.permission) || [],
      },
      analyses,
      aggregated: {
        total_permissions: totalPermissions,
        used_permissions: usedPermissions.length,
      },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
