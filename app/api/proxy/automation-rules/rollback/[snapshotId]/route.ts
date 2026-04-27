import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    const { snapshotId } = await params

    const response = await fetch(
      `${BACKEND_URL}/api/automation-rules/rollback/${encodeURIComponent(snapshotId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules/rollback] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
