import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"

  // Map systemName to role name (if needed for gap analysis)
  // For least-privilege endpoint, we pass systemName directly
  const res = await fetch(
    `${BACKEND_URL}/api/least-privilege?systemName=${encodeURIComponent(
      systemName
    )}`
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: "Backend error", status: res.status },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}
