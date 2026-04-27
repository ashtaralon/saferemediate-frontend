import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/automation-rules`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/api/automation-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
