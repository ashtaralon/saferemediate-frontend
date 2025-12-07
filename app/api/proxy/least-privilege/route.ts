import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RAW_BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-1.onrender.com"

function getBackendBase() {
  return RAW_BACKEND_URL.replace(/\/+$/, "").replace(/\/backend$/, "")
}

// Map system names to IAM role names
// TODO: In production, this should come from a database or backend API
const SYSTEM_TO_ROLE_MAP: Record<string, string> = {
  "alon-prod": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Test": "SafeRemediate-Lambda-Remediation-Role",
  "SafeRemediate-Lambda": "SafeRemediate-Lambda-Remediation-Role",
}

function getRoleName(systemName: string): string {
  // Check if we have a mapping, otherwise use the systemName as-is
  return SYSTEM_TO_ROLE_MAP[systemName] || systemName
}

export async function GET(request: Request) {
  try {
    // Get systemName from query parameters
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName") || "SafeRemediate-Lambda-Remediation-Role"

    // Map systemName to role name
    const roleName = getRoleName(systemName)

    // Clean backend URL
    const cleanBackendUrl = getBackendBase()

    const response = await fetch(`${cleanBackendUrl}/api/traffic/gap/${encodeURIComponent(roleName)}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[v0] Gap analysis fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        allowed_actions_list: [],
        unused_actions_list: [],
      })
    }

    const data = await response.json()
    console.log("[v0] Gap analysis API response:", JSON.stringify(data).substring(0, 500))

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[v0] Gap analysis API error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      allowed_actions_list: [],
      unused_actions_list: [],
    })
  }
}
