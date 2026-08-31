import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  backendError,
  backendTimeout,
  backendUnreachable,
} from "@/lib/server/proxy-error"

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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55_000) // 60 second timeout

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Resource Inspector Proxy] Backend error ${response.status}: ${errorText}`)

      let errorMessage = `Inspector backend returned ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.detail) {
          errorMessage = errorJson.detail
        }
      } catch {
        if (response.status === 503 && /service suspended/i.test(errorText)) {
          errorMessage = "Inspector service suspended or unavailable"
        } else if (errorText) {
          errorMessage = errorText
        }
      }

      return backendError({
        status: response.status,
        message: errorMessage,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await response.json()
    console.log(`[Resource Inspector Proxy] Success for ${resourceId} (type: ${data.resource_type})`)
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Resource Inspector Proxy] Request timed out for ${resourceId}`)
      return backendTimeout("Inspector backend request timed out")
    }

    console.error(`[Resource Inspector Proxy] Error for ${resourceId}:`, error)
    return backendUnreachable(
      error instanceof Error
        ? `Inspector backend unavailable: ${error.message}`
        : "Inspector backend unavailable",
    )
  }
}
