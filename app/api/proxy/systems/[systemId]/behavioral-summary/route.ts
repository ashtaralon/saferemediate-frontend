import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

const FETCH_TIMEOUT = 30000 // 30 second timeout (behavioral analysis may take time)

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
    }
    throw error
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemId: string }> }
) {
  const { systemId } = await params
  const { searchParams } = new URL(request.url)

  // Forward query parameters
  const queryString = searchParams.toString()
  const url = `${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/behavioral-summary${queryString ? `?${queryString}` : ''}`

  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`Backend error for behavioral-summary: ${res.status} - ${errorText}`)
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, details: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (error: any) {
    console.error("Behavioral summary proxy error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch behavioral summary" },
      { status: 500 }
    )
  }
}
