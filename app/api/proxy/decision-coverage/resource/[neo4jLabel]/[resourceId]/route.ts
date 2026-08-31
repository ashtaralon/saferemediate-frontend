import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  backendError,
  backendTimeout,
  backendUnreachable,
} from "@/lib/server/proxy-error"
import {
  backendFailureMessage,
  fetchBackendWithRetry,
} from "@/lib/server/backend-response"

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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)

    const response = await fetchBackendWithRetry(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = backendFailureMessage("Readiness", response.status, errorText)
      return backendError({
        status: response.status,
        message: errorMessage,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return backendTimeout("Readiness backend request timed out")
    }
    return backendUnreachable(
      error instanceof Error
        ? `Readiness backend unavailable: ${error.message}`
        : "Readiness backend unavailable",
    )
  }
}
