import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"

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
    // A typed refusal (held route, no data accounts, scope) is relayed typed, never a bare 502.
    if (!res.ok) return relayBackendError(res)
    return NextResponse.json(await res.json())
  } catch (e) {
    return fromCaughtError(e)
  }
}
