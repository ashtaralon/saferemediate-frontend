import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

// A timeout used to be a 200 with roles = []: an empty result presented as a
// successful one. Every failure is now the house error shape
// (lib/server/proxy-error, as the LP issues and metrics proxies answer it):
// a non-2xx status, allowlisted typed detail only, no roles.
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
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[LP Proxy Roles] backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Least-privilege roles backend returned ${res.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: res.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(res.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
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
      lastUsed: r.lastUsed,
      // Visibility / data quality
      dataQuality: r.dataQuality || "unknown",
      dataQualityReason: r.dataQualityReason || "",
      cloudtrailSynced: r.cloudtrailSynced || false,
      hasCrossAccountTrust: r.hasCrossAccountTrust || false,
      accessAdvisorChecked: r.accessAdvisorChecked || false,
    }))

    console.log(`[LP Proxy Roles] Fetched and transformed ${roles.length} roles`)
    return NextResponse.json({ roles })
  } catch (error: unknown) {
    console.error("[LP Proxy Roles] error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no roles either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
