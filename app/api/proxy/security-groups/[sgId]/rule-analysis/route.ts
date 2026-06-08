import { NextRequest, NextResponse } from "next/server"

// Proxy → real backend /api/security-groups/{sgId}/gap-analysis endpoint
// that returns per-rule recommendation + confidence + traffic. Different
// from the legacy /gap-analysis proxy in this directory, which actually
// hits the /inspector endpoint and is lossy (drops recommendation +
// traffic). The new sg-remediation-card.tsx needs the raw per-rule
// confidence to match the IAM-modal design language.

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sgId: string }> | { sgId: string } },
) {
  try {
    let sgId: string
    if (context.params instanceof Promise) {
      const resolved = await context.params
      sgId = resolved.sgId
    } else {
      sgId = (context.params as { sgId: string }).sgId
    }

    if (!sgId) {
      return NextResponse.json(
        { error: true, message: "Missing sgId parameter" },
        { status: 400 },
      )
    }

    const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/gap-analysis`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[SG Rule Analysis] Backend ${res.status}: ${errorText}`)
      return NextResponse.json(
        {
          sg_id: sgId,
          rules_analysis: [],
          total_rules: 0,
          error: true,
          message: `Backend error: ${res.status}`,
        },
        { status: 200 },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[SG Rule Analysis] Error:", error.message)
    return NextResponse.json(
      {
        rules_analysis: [],
        total_rules: 0,
        error: true,
        timeout: error.name === "AbortError",
        message:
          error.name === "AbortError" ? "Request timed out" : error.message,
      },
      { status: 200 },
    )
  }
}
