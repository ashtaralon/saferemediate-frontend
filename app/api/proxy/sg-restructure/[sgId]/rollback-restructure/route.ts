import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await params
    const body = await req.json()

    const backendUrl = `${BACKEND_URL}/api/sg-restructure/${sgId}/rollback-restructure`
    console.log(`[proxy] sg-restructure/${sgId}/rollback-restructure -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
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
    console.error("[proxy] sg-restructure rollback error:", e.message)
    return NextResponse.json(
      { error: "Failed to rollback restructure", detail: e.message },
      { status: 500 }
    )
  }
}
