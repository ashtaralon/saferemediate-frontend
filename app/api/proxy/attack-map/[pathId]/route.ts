import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pathId: string }> },
) {
  try {
    const { pathId } = await params
    const system = request.nextUrl.searchParams.get("system")
    if (!system) {
      return NextResponse.json(
        { error: "missing_system", detail: "system query param is required" },
        { status: 400 },
      )
    }

    const url = `${BACKEND_URL}/api/attack-path/${encodeURIComponent(pathId)}?system=${encodeURIComponent(system)}`
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[attack-map proxy]", error)
    return NextResponse.json(
      { error: "proxy_failed", detail: "Failed to fetch attack map payload" },
      { status: 500 },
    )
  }
}
