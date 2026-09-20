import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = getBackendBaseUrl()

/**
 * Saved checkpoint states (Permissions P8). Status and body are forwarded
 * unchanged: a typed refusal (404/409/503 with detail.code) must reach the
 * History modal as the backend wrote it, never as a generic "not found".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  const { snapshotId } = await params
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/states`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000) },
    )
    const body = await response.json().catch(() => ({ detail: `Backend returned HTTP ${response.status} without JSON` }))
    return NextResponse.json(body, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      { detail: { code: "SNAPSHOT_STATE_PROXY_FAILED", message: error?.message || "The saved state could not be requested." } },
      { status: 502 },
    )
  }
}
