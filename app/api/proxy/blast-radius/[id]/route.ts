import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const resourceType = searchParams.get('resource_type') || ''

  try {
    const queryParams = resourceType ? `?resource_type=${encodeURIComponent(resourceType)}` : ''
    const response = await fetch(`${BACKEND_URL}/api/blast-radius/${encodeURIComponent(id)}${queryParams}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json({
        error: "Not found",
        affected_resources: [],
        total_affected: 0,
        risk_level: "low"
      }, { status: 200 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[blast-radius] Fetch error:", error)
    return NextResponse.json({
      error: "Failed to fetch",
      affected_resources: [],
      total_affected: 0,
      risk_level: "low"
    }, { status: 200 })
  }
}
