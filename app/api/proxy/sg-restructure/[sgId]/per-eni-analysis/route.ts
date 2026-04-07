import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await params
    const days = req.nextUrl.searchParams.get("days") || "90"

    const backendUrl = `${BACKEND_URL}/api/sg-restructure/${sgId}/per-eni-analysis?days=${days}`
    console.log(`[proxy] sg-restructure/${sgId}/per-eni-analysis -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[proxy] sg-restructure per-eni-analysis error:", e.message)
    return NextResponse.json(
      { error: "Failed to fetch per-ENI analysis", detail: e.message },
      { status: 500 }
    )
  }
}
