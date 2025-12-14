import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id } = body

    if (!finding_id) {
      return NextResponse.json(
        { success: false, error: "finding_id is required" },
        { status: 400 }
      )
    }

    const response = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ finding_id }),
    })

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error("Simulation error:", error)
    return NextResponse.json(
      { success: false, error: "Simulation failed" },
      { status: 500 }
    )
  }
}
