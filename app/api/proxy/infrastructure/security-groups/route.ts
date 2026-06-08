import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get("source") || "aws"

  const backendUrl = `${BACKEND_URL}/api/infrastructure/security-groups?source=${source}`

  console.log(`[Infrastructure SGs Proxy] Fetching: ${backendUrl}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Infrastructure SGs Proxy] Backend error ${response.status}: ${errorText}`)
      return NextResponse.json(
        { success: false, error: `Backend returned ${response.status}`, detail: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ success: false, error: "Request timed out" }, { status: 504 })
    }
    console.error(`[Infrastructure SGs Proxy] Error:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch security groups" },
      { status: 500 }
    )
  }
}
