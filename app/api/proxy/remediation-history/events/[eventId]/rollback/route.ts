import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const body = await req.json()

    const url = `${BACKEND_URL}/api/remediation-history/events/${eventId}/rollback`
    console.log("[Remediation Rollback Proxy] POST:", url)

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Remediation Rollback Proxy] Error:", response.status, errorText)
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    console.log("[Remediation Rollback Proxy] Success")
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Remediation Rollback Proxy] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
