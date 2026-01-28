import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

// Handle GET requests - extract role_name from query params
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
    const { role_name, days = 90 } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    // Call the IAM gap analysis endpoint
    const res = await fetch(`${BACKEND_URL}/api/iam-roles/${encodeURIComponent(role_name)}/gap-analysis?days=${days}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ error: `Engine error: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const gapData = await res.json()

    // Transform to expected format for per-resource analysis
    const usedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "USED") || []
    const unusedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "UNUSED") || []

    const response = {
      role: {
        role_name: gapData.role_name,
        role_arn: gapData.role_arn,
        total_permissions: gapData.summary?.total_permissions || 0,
        resources: [],
        all_permissions: gapData.permissions_analysis?.map((p: any) => p.permission) || []
      },
      analyses: [{
        resource_id: gapData.role_arn,
        resource_name: gapData.role_name,
        resource_type: "IAM_ROLE",
        permissions_granted: gapData.summary?.total_permissions || 0,
        permissions_used: usedPermissions.map((p: any) => ({
          action: p.permission,
          call_count: p.usage_count || 0,
          targets: []
        })),
        unused_permissions: unusedPermissions.map((p: any) => p.permission),
        risk_factors: unusedPermissions.filter((p: any) => p.risk_level === "HIGH").map((p: any) => `High-risk unused: ${p.permission}`),
        used_count: usedPermissions.length,
        utilization_rate: gapData.summary?.lp_score || 0,
        over_permission_ratio: 100 - (gapData.summary?.lp_score || 0),
        total_api_calls: gapData.summary?.cloudtrail_events || 0
      }],
      aggregated: {
        total_permissions: gapData.summary?.total_permissions || 0,
        used_permissions: gapData.summary?.used_count || 0
      },
      raw_gap_analysis: gapData
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
