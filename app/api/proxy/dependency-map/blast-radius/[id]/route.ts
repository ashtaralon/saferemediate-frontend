import { NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const response = await fetch(`${BACKEND_URL}/api/dependency-map/blast-radius/${encodeURIComponent(id)}`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Not found", downstream: [], upstream: [] }, { status: 200 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Blast radius fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch", downstream: [], upstream: [] }, { status: 200 })
  }
}
