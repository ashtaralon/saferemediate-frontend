import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"

  const res = await fetch(
    `${BACKEND_URL}/api/traffic/gap/${encodeURIComponent(systemName)}`
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: "Backend error", status: res.status },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}
