import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ systemId: string; issueId: string }> }
) {
  // In Next.js 14+, params is a Promise that must be awaited
  const { systemId, issueId } = await params

  if (!systemId || !issueId) {
    return NextResponse.json(
      { error: "Missing systemId or issueId" },
      { status: 400 }
    )
  }

  try {
    // Forward any request body from frontend
    const body = await request.text()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const res = await fetch(
      `${BACKEND_URL}/api/systems/${encodeURIComponent(systemId)}/issues/${encodeURIComponent(issueId)}/simulate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body || JSON.stringify({ systemId, issueId }), // Send systemId and issueId if no body provided
        cache: "no-store",
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] simulate error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout", detail: "Backend did not respond in time" },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
