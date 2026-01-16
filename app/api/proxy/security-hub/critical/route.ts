import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const maxResults = url.searchParams.get("max_results") || "50"

  const backendUrl = `${BACKEND_URL}/api/security-hub/findings/critical?max_results=${maxResults}`
  console.log(`[Security Hub Proxy] Fetching critical findings: ${backendUrl}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, findings: [] },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error(`[Security Hub Proxy] Critical findings error:`, error.message)
    return NextResponse.json(
      { error: error.message, findings: [] },
      { status: 503 }
    )
  }
}
