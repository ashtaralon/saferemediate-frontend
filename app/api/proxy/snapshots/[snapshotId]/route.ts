import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: { snapshotId: string } }
) {
  const snapshotId = params.snapshotId

  try {
    const res = await fetch(`${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}`, {
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
    console.error("[proxy] snapshot error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch snapshot" },
      { status: 500 }
    )
  }
}

