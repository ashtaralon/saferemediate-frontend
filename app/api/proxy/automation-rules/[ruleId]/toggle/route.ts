import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL =
  getBackendBaseUrl()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params
    const response = await fetch(
      `${BACKEND_URL}/api/automation-rules/${encodeURIComponent(ruleId)}/toggle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules/toggle] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
