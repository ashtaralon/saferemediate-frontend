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
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ neo4jLabel: string; resourceId: string }> },
) {
  const { neo4jLabel, resourceId } = await params
  const backendUrl = `${getBackendBaseUrl()}/api/decision-coverage/resource/${encodeURIComponent(neo4jLabel)}/${encodeURIComponent(resourceId)}`

  try {
    const result = await resilientBackendJsonRead<Record<string, unknown>>({
      key: `readiness:${backendUrl}`,
      url: backendUrl,
      attemptTimeoutMs: 6_000,
      attempts: 2,
      freshTtlMs: 60_000,
      staleTtlMs: 24 * 60 * 60 * 1000,
      init: {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    })

    if (!result.ok) {
      if (result.timedOut) return backendTimeout("Readiness backend request timed out")
      if (result.status) {
        const errorMessage = backendFailureMessage("Readiness", result.status, result.body ?? "")
        return backendError({
          status: result.status,
          message: errorMessage,
          detail: (result.body ?? "").slice(0, 500),
        })
      }
      return backendUnreachable(`Readiness backend unavailable: ${result.error}`)
    }

    const data = result.source === "stale-cache"
      ? { ...result.data, fromStaleCache: true, staleReason: result.staleReason, staleAgeMs: result.staleAgeMs }
      : result.data
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "X-Cyntro-Read-Source": result.source,
        "X-Cyntro-Backend-Latency-Ms": String(result.latencyMs),
      },
    })
  } catch (error) {
    return backendUnreachable(
      error instanceof Error
        ? `Readiness backend unavailable: ${error.message}`
        : "Readiness backend unavailable",
    )
  }
}
