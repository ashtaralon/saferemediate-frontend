import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/automation-rules/rollback/history`,
      { signal: AbortSignal.timeout(15000) }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules/rollback/history] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
