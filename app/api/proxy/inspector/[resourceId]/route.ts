import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  backendError,
  backendTimeout,
  backendUnreachable,
} from "@/lib/server/proxy-error"
import {
  backendFailureMessage,
} from "@/lib/server/backend-response"
import { resilientBackendJsonRead } from "@/lib/server/resilient-backend-read"

export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params
  const { searchParams } = new URL(request.url)

  // Get query parameters
  const window = searchParams.get("window") || "30d"
  const systemName = searchParams.get("system_name") || ""
  const resourceType = searchParams.get("resource_type") || ""

  const query = new URLSearchParams({ window })
  if (systemName) query.set("system_name", systemName)
  if (resourceType) query.set("resource_type", resourceType)
  const backendUrl = `${getBackendBaseUrl()}/api/inspector/${encodeURIComponent(resourceId)}?${query.toString()}`

  console.log(`[Resource Inspector Proxy] Fetching: ${backendUrl}`)

  try {
    const result = await resilientBackendJsonRead<Record<string, unknown>>({
      key: `inspector:${backendUrl}`,
      url: backendUrl,
      attemptTimeoutMs: 8_000,
      attempts: 2,
      freshTtlMs: 60_000,
      staleTtlMs: 24 * 60 * 60 * 1000,
      init: {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    })

    if (!result.ok) {
      console.error(`[Resource Inspector Proxy] Backend failure: ${result.error}`)
      if (result.timedOut) return backendTimeout("Inspector backend request timed out")
      if (result.status) {
        const errorMessage = backendFailureMessage("Inspector", result.status, result.body ?? "")
        return backendError({
          status: result.status,
          message: errorMessage,
          detail: (result.body ?? "").slice(0, 500),
        })
      }

      return backendUnreachable(`Inspector backend unavailable: ${result.error}`)
    }

    const data = result.source === "stale-cache"
      ? { ...result.data, fromStaleCache: true, staleReason: result.staleReason, staleAgeMs: result.staleAgeMs }
      : result.data
    console.log(`[Resource Inspector Proxy] Success for ${resourceId} (source: ${result.source})`)
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "X-Cyntro-Read-Source": result.source,
        "X-Cyntro-Backend-Latency-Ms": String(result.latencyMs),
      },
    })
  } catch (error) {
    console.error(`[Resource Inspector Proxy] Error for ${resourceId}:`, error)
    return backendUnreachable(
      error instanceof Error
        ? `Inspector backend unavailable: ${error.message}`
        : "Inspector backend unavailable",
    )
  }
}
