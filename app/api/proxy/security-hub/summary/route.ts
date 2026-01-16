import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const backendUrl = `${BACKEND_URL}/api/security-hub/summary`
  console.log(`[Security Hub Proxy] Fetching summary: ${backendUrl}`)

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
        { error: `Backend returned ${res.status}`, by_severity: {} },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error(`[Security Hub Proxy] Summary error:`, error.message)
    return NextResponse.json(
      { error: error.message, by_severity: {}, total_active: 0 },
      { status: 503 }
    )
  }
}
