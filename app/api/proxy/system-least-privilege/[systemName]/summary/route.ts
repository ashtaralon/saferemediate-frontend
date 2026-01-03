import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000)

  try {
    const { systemName } = await context.params
    
    const response = await fetch(
      `${BACKEND_URL}/api/system-least-privilege/${systemName}/summary`,
      {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        signal: controller.signal,
        cache: "no-store",
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      // Return empty fallback on backend error
      return NextResponse.json({
        total_roles: 0,
        avg_lp_score: 100,
        total_unused_permissions: 0,
        error: true,
        message: `Backend returned ${response.status}`
      }, { status: 200 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error("LP Summary proxy error:", error)
    
    // Return empty fallback on timeout or error
    return NextResponse.json({
      total_roles: 0,
      avg_lp_score: 100,
      total_unused_permissions: 0,
      timeout: error.name === 'AbortError',
      error: true,
      message: error.name === 'AbortError' ? 'Request timed out' : error.message
    }, { status: 200 })
  }
}
