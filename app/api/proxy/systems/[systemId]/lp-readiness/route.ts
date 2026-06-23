import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"
const FETCH_TIMEOUT = 30000

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
    }
    throw error
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemId: string }> },
) {
  const { systemId } = await params
  const { searchParams } = new URL(request.url)
  const queryString = searchParams.toString()
  const url =
    `${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/lp-readiness` +
    (queryString ? `?${queryString}` : "")

  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`Backend error for lp-readiness: ${res.status} - ${errorText}`)
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, details: errorText },
        { status: res.status },
      )
    }

    return NextResponse.json(await res.json())
  } catch (error: unknown) {
    console.error("LP readiness proxy error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch LP readiness" },
      { status: 500 },
    )
  }
}
