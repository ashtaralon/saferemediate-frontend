import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/issues/summary — passthrough.
 *
 * Backend returns real org-wide aggregate: critical/high/medium/low
 * counts, by_severity, by_source (iam/securityGroups/s3),
 * byCategory.{leastPrivilege,networkExposure,permissions}, resources.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/issues/summary`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "issues_summary_unavailable", backend_status: res.status },
        { status: 502 },
      )
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json(
      { error: "issues_summary_proxy_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
