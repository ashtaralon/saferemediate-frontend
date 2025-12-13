import { NextRequest, NextResponse } from "next/server"

// Use Node.js runtime for longer timeout (60s on Pro, 10s on Hobby)
// Edge Runtime has 30s limit which is too short for slow backend queries
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_API_URL ??
  "https://saferemediate-backend-f.onrender.com"

// Map system names to IAM role names
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda-Remediation-Role": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

// Fallback data when backend is unavailable
function getFallbackGapAnalysis(roleName: string) {
  return {
    role_name: roleName,
    allowed_actions: 28,
    used_actions: 0,
    unused_actions: 28,
    unused_actions_list: [
      "cloudtrail:LookupEvents",
      "cloudtrail:DescribeTrails",
      "ec2:DescribeInstances",
      "ec2:DescribeSecurityGroups",
      "iam:GetRole",
      "iam:ListRoles",
      "s3:GetObject",
      "s3:ListBuckets"
    ],
    statistics: {
      total_allowed: 28,
      total_used: 0,
      total_unused: 28,
      confidence: 99,
      remediation_potential: "100%",
    },
    simulated: true,
    message: "Using fallback data - backend unavailable"
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const roleName = getRoleName(systemName)

  // Timeout to prevent Vercel 30s limit - give backend time to respond
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000) // 28 second timeout (safe for Vercel 30s limit)

  try {
    console.log(`[proxy] gap-analysis: Fetching for role ${roleName}`)

    // Try /api/traffic/gap/{roleName} first
    let res = await fetch(
      `${BACKEND_URL}/api/traffic/gap/${encodeURIComponent(roleName)}`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      }
    )

    clearTimeout(timeoutId)

    // If 404, try the least-privilege endpoint
    if (!res.ok && res.status === 404) {
      const controller2 = new AbortController()
      const timeoutId2 = setTimeout(() => controller2.abort(), 25000) // 25s for fallback endpoint
      try {
        res = await fetch(
          `${BACKEND_URL}/api/least-privilege?systemName=${encodeURIComponent(systemName)}`,
          {
            signal: controller2.signal,
            headers: { "Content-Type": "application/json" },
          }
        )
        clearTimeout(timeoutId2)

        if (res.ok) {
          const data = await res.json()
          // Transform least-privilege response to gap-analysis format
          const role = data.roles?.[0] || {}
          console.log(`[proxy] gap-analysis: ✅ Got data from least-privilege endpoint`)
          return NextResponse.json({
            role_name: role.roleName || roleName,
            allowed_actions: role.allowed || 0,
            used_actions: role.used || 0,
            unused_actions: role.unused || 0,
            statistics: {
              total_allowed: role.allowed || 0,
              total_used: role.used || 0,
              total_unused: role.unused || 0,
              confidence: role.gap || 0,
              remediation_potential: `${role.gap || 0}%`,
            },
          })
        }
      } catch (e: any) {
        clearTimeout(timeoutId2)
        console.log("[proxy] gap-analysis: Backend unavailable, using fallback data")
        return NextResponse.json(getFallbackGapAnalysis(roleName))
      }
    }

    if (!res.ok) {
      console.log(`[proxy] gap-analysis: Backend returned ${res.status}, using fallback data`)
      return NextResponse.json(getFallbackGapAnalysis(roleName))
    }

    const data = await res.json()
    console.log(`[proxy] gap-analysis: ✅ Got data from backend`)
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.log(`[proxy] gap-analysis: Error (${error.name}), using fallback data`)
    return NextResponse.json(getFallbackGapAnalysis(roleName))
  }
}
