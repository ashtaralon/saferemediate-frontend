import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const url = `${getBackendBaseUrl()}/api/resource-dependencies/${encodeURIComponent(systemName)}${request.nextUrl.search}`
  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    const body = await response.text()
    if (!response.ok) {
      return backendError({
        status: response.status,
        message: `Resource dependencies backend returned ${response.status}`,
        detail: body.slice(0, 500),
      })
    }
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return fromCaughtError(error)
  }
}
