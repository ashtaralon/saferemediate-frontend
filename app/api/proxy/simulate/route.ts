import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] Simulate failed:", response.status, errorText)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        detail: errorText,
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[proxy] Simulate error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Simulation failed",
    }, { status: 500 })
  }
}
