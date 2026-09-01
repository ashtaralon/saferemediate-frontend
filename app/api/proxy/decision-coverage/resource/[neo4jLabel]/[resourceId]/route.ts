import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  getBackendBaseUrl()

export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ neo4jLabel: string; resourceId: string }> },
) {
  const { neo4jLabel, resourceId } = await params
  const backendUrl = `${BACKEND_URL}/api/decision-coverage/resource/${encodeURIComponent(neo4jLabel)}/${encodeURIComponent(resourceId)}`

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
      let errorBody: unknown = null
      try {
        errorBody = JSON.parse(errorText)
      } catch {}
      const errorMessage = coerceProxyErrorMessage(
        errorBody,
        errorText || `Backend returned ${response.status}`,
      )
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "Request timed out" },
        { status: 504 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch readiness",
      },
      { status: 500 },
    )
  }
}
