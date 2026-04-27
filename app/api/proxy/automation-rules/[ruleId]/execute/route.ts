import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get("dry_run") !== "false" // default true

    const response = await fetch(
      `${BACKEND_URL}/api/automation-rules/${encodeURIComponent(ruleId)}/execute?dry_run=${dryRun}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000), // 2 min timeout for execution
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[automation-rules/execute] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
