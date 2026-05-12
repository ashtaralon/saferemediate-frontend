import { NextRequest, NextResponse } from "next/server"

// Proxy for the External Egress Inventory endpoint — chunk #1 of the
// alert-only egress inventory MVP. Forwards filter/pagination params
// through verbatim; the backend does the classification + sort + slice.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const days = searchParams.get("days") || "30"
  const limit = searchParams.get("limit") || "50"
  const offset = searchParams.get("offset") || "0"
  const destinationClass = searchParams.get("destination_class")
  const recommendation = searchParams.get("recommendation")
  const strength = searchParams.get("strength")

  const qs = new URLSearchParams({ days, limit, offset })
  if (destinationClass) qs.set("destination_class", destinationClass)
  if (recommendation) qs.set("recommendation", recommendation)
  if (strength) qs.set("strength", strength)

  try {
    const url = `${BACKEND_URL}/api/egress/system/${encodeURIComponent(
      systemName,
    )}/external-inventory?${qs.toString()}`
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
      { error: err.message || "Failed to fetch external egress inventory" },
      { status: 502 },
    )
  }
}
