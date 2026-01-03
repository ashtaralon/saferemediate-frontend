import { NextRequest, NextResponse } from "next/server"

// Use Node.js runtime for longer timeout (60s on Pro, 10s on Hobby)
// Edge Runtime has 30s limit which is too short for slow backend queries
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const roleName = getRoleName(systemName)

  // Timeout to prevent Vercel 30s limit - give backend time to respond
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000) // 28 second timeout (safe for Vercel 30s limit)

  try {
    console.log(`[proxy] IAM gap analysis for role: ${roleName}`)
    
    // Use the correct endpoint: /api/iam/gap-analysis/{role_name}
    const res = await fetch(
      `${BACKEND_URL}/api/iam/gap-analysis/${encodeURIComponent(roleName)}?days=90`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] gap-analysis backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    
    // Transform field names: backend uses snake_case, frontend expects different names
    // Backend: allowed_count, used_count, unused_count
    // Frontend: allowed_actions, used_actions, unused_actions
    const transformed = {
      ...data,
      // Map the field names
      allowed_actions: data.allowed_count ?? data.summary?.allowed_count ?? data.allowedCount ?? 0,
      used_actions: data.used_count ?? data.summary?.used_count ?? data.usedCount ?? 0,
      unused_actions: data.unused_count ?? data.summary?.unused_count ?? data.unusedCount ?? 
        ((data.allowed_count ?? data.summary?.allowed_count ?? 0) - (data.used_count ?? data.summary?.used_count ?? 0)),
      // Also keep original fields for backwards compatibility
      allowed_count: data.allowed_count ?? data.summary?.allowed_count ?? 0,
      used_count: data.used_count ?? data.summary?.used_count ?? 0,
      unused_count: data.unused_count ?? data.summary?.unused_count ?? 0,
    }
    
    return NextResponse.json(transformed)
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      // Return empty data instead of error - frontend will show 0s gracefully
      return NextResponse.json({
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        allowed_count: 0,
        used_count: 0,
        unused_count: 0,
        timeout: true,
        message: "Analysis is taking longer than expected - data will refresh shortly"
      }, { status: 200 })
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
