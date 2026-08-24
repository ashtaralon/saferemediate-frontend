import { NextRequest, NextResponse } from "next/server"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { getNeptuneRefreshBackendBaseUrl } from "@/lib/server/neptune-refresh-backend-url"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid sync job id" }, { status: 400 })
  }

  try {
    const response = await fetch(
      `${getNeptuneRefreshBackendBaseUrl()}/api/v2/sync/status/${encodeURIComponent(jobId)}`,
      { signal: AbortSignal.timeout(10_000), cache: "no-store" },
    )
    const raw = await response.text()
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = null
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: coerceProxyErrorMessage(body, raw || `Backend returned ${response.status}`) },
        { status: response.status },
      )
    }
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync status is unavailable"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
