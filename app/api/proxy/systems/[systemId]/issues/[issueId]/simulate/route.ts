import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: { systemId: string; issueId: string } }
) {
  const systemId = params.systemId
  const issueId = params.issueId

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/issues/${encodeURIComponent(issueId)}/simulate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: "Backend error", status: res.status },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] simulate error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to simulate" },
      { status: 500 }
    )
  }
}

