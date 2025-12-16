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
    // Try /api/traffic/gap/{roleName} first
    let res = await fetch(
      `${BACKEND_URL}/api/traffic/gap/${encodeURIComponent(roleName)}`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      }
    )

    clearTimeout(timeoutId)

    // If 404, try the /api/gap-analysis endpoint
    if (!res.ok && res.status === 404) {
      const controller2 = new AbortController()
      const timeoutId2 = setTimeout(() => controller2.abort(), 25000) // 25s for fallback endpoint
      try {
        res = await fetch(
          `${BACKEND_URL}/api/gap-analysis?systemName=${encodeURIComponent(systemName)}`,
          {
            signal: controller2.signal,
            headers: { "Content-Type": "application/json" },
          }
        )
        clearTimeout(timeoutId2)

        if (res.ok) {
          const data = await res.json()
          // /api/gap-analysis returns the correct format already
          return NextResponse.json(data)
        }
      } catch (e: any) {
        clearTimeout(timeoutId2)
        console.error("[proxy] gap-analysis fallback error:", e.message)
        return NextResponse.json(
          { error: "Backend unavailable", detail: e.message },
          { status: 503 }
        )
      }
    }

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] gap-analysis backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: "Request timeout", detail: "Backend did not respond in time" },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
