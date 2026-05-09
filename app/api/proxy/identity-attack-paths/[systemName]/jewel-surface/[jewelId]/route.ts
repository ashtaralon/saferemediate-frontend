import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string; jewelId: string }> }
) {
  const { systemName, jewelId } = await params
  const { searchParams } = new URL(req.url)
  const maxPaths = searchParams.get("max_paths") || "15"

  try {
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}/jewel-surface/${encodeURIComponent(jewelId)}?max_paths=${maxPaths}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch crown jewel surface" },
      { status: 502 }
    )
  }
}
