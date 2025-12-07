import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const backendUrl = `${BACKEND_URL}/api/least-privilege/apply`

    console.log("[proxy] Calling least-privilege/apply:", backendUrl, body)

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.log("[proxy] Apply failed:", response.status)
      const errorText = await response.text()
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}: ${errorText}`,
        checkpoint: "",
        applied: 0,
      })
    }

    const data = await response.json()
    console.log("[proxy] Apply response received")

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[proxy] Apply error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      checkpoint: "",
      applied: 0,
    })
  }
}
