import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: { systemId: string } }
) {
  const systemId = params.systemId

  try {
    const res = await fetch(`${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/snapshots`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: "Backend error", status: res.status },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] snapshots error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch snapshots" },
      { status: 500 }
    )
  }
}

