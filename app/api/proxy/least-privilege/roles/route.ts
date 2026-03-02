import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Build backend URL with optional systemName parameter
    let backendUrl = `${BACKEND_URL}/api/least-privilege/roles`
    if (systemName) {
      backendUrl += `?systemName=${encodeURIComponent(systemName)}`
    }

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Proxy Roles] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const rawData = await res.json()

    // Transform backend response to match frontend expectations
    // Backend returns: [{ roleArn, roleName, permissionsCount, unusedPermissionsCount, bloatPercentage }]
    // Frontend expects: { roles: [{ id, name, usedCount, allowedCount, unusedCount, highRiskUnused, score }] }
    const roles = (Array.isArray(rawData) ? rawData : []).map((r: any) => ({
      id: r.roleArn || r.roleName,
      name: r.roleName,
      usedCount: (r.permissionsCount || 0) - (r.unusedPermissionsCount || 0),
      allowedCount: r.permissionsCount || 0,
      unusedCount: r.unusedPermissionsCount || 0,
      highRiskUnused: r.highRiskUnused || [],
      score: r.permissionsCount > 0
        ? Math.round(((r.permissionsCount - r.unusedPermissionsCount) / r.permissionsCount) * 100)
        : 100,
      lastUsed: r.lastUsed
    }))

    console.log(`[LP Proxy Roles] Fetched and transformed ${roles.length} roles`)
    return NextResponse.json({ roles })
  } catch (error: any) {
    console.error("[LP Proxy Roles] Error:", error.message)

    if (error.name === "AbortError") {
      // Return empty array instead of error
      return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}

