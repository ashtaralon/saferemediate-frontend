import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend.onrender.com"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName")

    if (!systemName) {
      return NextResponse.json(
        { success: false, message: "Missing systemName" },
        { status: 400 }
      )
    }

    // Get backend URL and ensure it doesn't have /backend/api duplication
    let backendUrl = BACKEND_URL
    backendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

    const backendRequestUrl = `${backendUrl}/api/status?systemName=${encodeURIComponent(systemName)}`

    console.log("[proxy] status →", backendRequestUrl)

    const res = await fetch(backendRequestUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      console.error("[proxy] status error:", res.status, res.statusText)
      return NextResponse.json(
        { success: false, error: `Backend returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    console.error("[proxy] status error:", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    )
  }
}

