import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  backendError,
  backendTimeout,
  backendUnreachable,
} from "@/lib/server/proxy-error"

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

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Backend returned ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.detail) errorMessage = errorJson.detail
      } catch {
        if (errorText) errorMessage = errorText
      }
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
