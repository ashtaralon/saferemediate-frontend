import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

// GET - get least privilege analysis
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName")

    if (!systemName) {
      return NextResponse.json({
        success: false,
        allowed: [],
        used: [],
        unused: [],
        message: "systemName parameter is required",
      })
    }

    const backendUrl = `${BACKEND_URL}/api/gap-analysis?systemName=${encodeURIComponent(systemName)}`
    console.log("[proxy] Calling least-privilege GET:", backendUrl)

    const response = await fetch(backendUrl, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[proxy] Least privilege fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        allowed: [],
        used: [],
        unused: [],
      })
    }

    const data = await response.json()
    console.log("[proxy] Least privilege data received")

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[proxy] Least privilege GET error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      allowed: [],
      used: [],
      unused: [],
    })
  }
}

// POST - simulate or apply least privilege fix
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") || "simulate"

    const endpoint = action === "apply" ? "/api/least-privilege/apply" : "/api/least-privilege/simulate"
    const backendUrl = `${BACKEND_URL}${endpoint}`

    console.log("[proxy] Calling least-privilege POST:", backendUrl, body)

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.log("[proxy] Least privilege POST failed:", response.status)
      const errorText = await response.text()
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}: ${errorText}`,
      })
    }

    const data = await response.json()
    console.log("[proxy] Least privilege POST response received")

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[proxy] Least privilege POST error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
