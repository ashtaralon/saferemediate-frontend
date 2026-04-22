import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const maxJewels = searchParams.get("max_jewels") || "12"
  const maxPathsPerJewel = searchParams.get("max_paths_per_jewel") || "3"
  const envelope = searchParams.get("envelope") === "true" ? "true" : ""

  try {
    const envelopeParam = envelope ? `&envelope=${envelope}` : ""
    const query = `?max_jewels=${maxJewels}&max_paths_per_jewel=${maxPathsPerJewel}${envelopeParam}`
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`
    console.log("[identity-attack-paths] Fetching:", url)
    const res = await fetch(
      `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}${query}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55000),
      }
    )
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
      { error: err.message || "Failed to fetch identity attack paths" },
      { status: 502 }
    )
  }
}
