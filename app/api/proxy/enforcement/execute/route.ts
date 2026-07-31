import { NextRequest, NextResponse } from "next/server"

// Abort fires at 295s, 5s under this, so the catch
// block still runs and can degrade honestly instead of the platform
// returning a raw 504. Above the 60s project default in vercel.json,
// which this export overrides.
export const maxDuration = 300

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  const backendUrl = `${BACKEND_URL}/api/enforcement/execute`

  console.log(`[Enforcement Execute Proxy] POST: ${backendUrl}`)

  try {
    const body = await request.json()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 295_000) // 5 min timeout for enforcement

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Enforcement Execute Proxy] Backend error ${response.status}: ${errorText}`)
      return NextResponse.json(
        { success: false, error: `Backend returned ${response.status}`, detail: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ success: false, error: "Enforcement request timed out" }, { status: 504 })
    }
    console.error(`[Enforcement Execute Proxy] Error:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to execute enforcement" },
      { status: 500 }
    )
  }
}
