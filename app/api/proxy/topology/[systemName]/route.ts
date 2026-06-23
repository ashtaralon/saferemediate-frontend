import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  try {
    const { systemName } = await params
    const shape = request.nextUrl.searchParams.get("shape") ?? "full"

    const url = `${BACKEND_URL}/api/topology/${encodeURIComponent(systemName)}?shape=${encodeURIComponent(shape)}`
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
    console.error("[topology proxy]", error)
    return NextResponse.json(
      { error: "proxy_failed", detail: "Failed to fetch topology data" },
      { status: 500 },
    )
  }
}
