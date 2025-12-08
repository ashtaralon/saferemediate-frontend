import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend.onrender.com"

// Map system names to IAM role names
// TODO: In production, this should come from a database or backend API
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda-Remediation-Role": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  // Check if we have a mapping, otherwise use the systemName as-is
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  
  // Map systemName to role name
  const roleName = getRoleName(systemName)

  // Add timeout to prevent Vercel 300s timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  try {
    // Try /api/traffic/gap/{roleName} first, fallback to /api/least-privilege
    let res = await fetch(
      `${BACKEND_URL}/api/traffic/gap/${encodeURIComponent(roleName)}`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      }
    )

    clearTimeout(timeoutId)

    // If 404, try the least-privilege endpoint which returns similar data
    if (!res.ok && res.status === 404) {
      const controller2 = new AbortController()
      const timeoutId2 = setTimeout(() => controller2.abort(), 10000)
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
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "Backend error", status: res.status },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}
