import { NextRequest, NextResponse } from "next/server"

// Proxy for the system-wide egress visibility endpoint. Mirrors the
// identity-attack-paths proxy pattern (nodejs runtime, no static
// caching, per-route timeout matched to the slowest backend run).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Allow local dev to point at a localhost backend without touching this
// constant. Render/Vercel never set BACKEND_URL_OVERRIDE so prod stays
// on Render. Set BACKEND_URL_OVERRIDE=http://localhost:8000 in your
// shell or .env.local to test backend changes before deploying.
const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const days = searchParams.get("days") || "30"
  const topN = searchParams.get("top_n") || "20"

  try {
    const url = `${BACKEND_URL}/api/egress/system/${encodeURIComponent(
      systemName,
    )}?days=${days}&top_n=${topN}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status },
      )
    }
    return NextResponse.json(await res.json())
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch egress visibility" },
      { status: 502 },
    )
  }
}
