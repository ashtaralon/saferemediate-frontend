import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  // In Next.js 14+, params is a Promise that must be awaited
  const { snapshotId } = await params

  try {
    const res = await fetch(`${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }))
      return NextResponse.json(
        { error: errorData.detail || "Backend error", status: res.status },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] rollback error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to rollback snapshot" },
      { status: 500 }
    )
  }
}

