import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  // Frontend sends 'system_name' (snake_case) in query params
  const systemName = url.searchParams.get("system_name") || url.searchParams.get("systemName")

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
    //
    // A null (or absent) unusedPermissionsCount is WITHHELD usage, not zero
    // unused: used, unused and score stay null — never a derived 100 — and the
    // backend's *_withheld_reason fields pass through.
    const roles = (Array.isArray(rawData) ? rawData : []).map((r: any) => {
      const allowedCount = r.permissionsCount || 0
      const unusedCount: number | null =
        typeof r.unusedPermissionsCount === "number" && Number.isFinite(r.unusedPermissionsCount)
          ? r.unusedPermissionsCount
          : null
      return {
      id: r.roleArn || r.roleName,
      name: r.roleName,
      usedCount: unusedCount === null ? null : allowedCount - unusedCount,
      allowedCount,
      unusedCount,
      highRiskUnused: r.highRiskUnused || [],
      score: unusedCount === null
        ? null
        : r.permissionsCount > 0
          ? Math.round(((r.permissionsCount - unusedCount) / r.permissionsCount) * 100)
          : 100,
      ...(r.unusedPermissionsCount_withheld_reason
        ? { unusedPermissionsCount_withheld_reason: r.unusedPermissionsCount_withheld_reason }
        : {}),
      ...(r.bloatPercentage_withheld_reason
        ? { bloatPercentage_withheld_reason: r.bloatPercentage_withheld_reason }
        : {}),
      lastUsed: r.lastUsed,
      // Visibility / data quality
      dataQuality: r.dataQuality || "unknown",
      dataQualityReason: r.dataQualityReason || "",
      cloudtrailSynced: r.cloudtrailSynced || false,
      hasCrossAccountTrust: r.hasCrossAccountTrust || false,
      accessAdvisorChecked: r.accessAdvisorChecked || false,
      }
    })

    console.log(`[LP Proxy Roles] Fetched and transformed ${roles.length} roles`)
    return NextResponse.json({ roles })
  } catch (error: any) {
    console.error("[LP Proxy Roles] Error:", error.message)

    if (error.name === "AbortError") {
      // Return matching shape on timeout
      return NextResponse.json({ roles: [] }, { status: 200 })
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}

