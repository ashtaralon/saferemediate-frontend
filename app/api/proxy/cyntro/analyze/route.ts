import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = getBackendBaseUrl()

export async function GET(req: NextRequest) {
  const role_name = req.nextUrl.searchParams.get("role_name")
  const days = req.nextUrl.searchParams.get("days") || "90"

  if (!role_name) {
    return NextResponse.json({ error: "role_name query parameter is required" }, { status: 400 })
  }

  return handleAnalyze({ role_name, days: parseInt(days) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return handleAnalyze(body)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

async function handleAnalyze(body: { role_name: string; days?: number }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 295_000)

  try {
    const { role_name } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    // Use the dedicated per-resource analysis endpoint that queries
    // real USES_PERMISSION relationships from Neo4j — no even-split fake data
    const analysisRes = await fetch(
      `${BACKEND_URL}/api/remediation/per-resource-analysis/${encodeURIComponent(role_name)}`,
      { cache: "no-store", signal: controller.signal }
    )
    clearTimeout(timeoutId)

    if (analysisRes.ok) {
      const data = await analysisRes.json()
      return NextResponse.json(data)
    }

    // No fallback synthesis. The previous fallback rebuilt per-resource rows from the role-level Review and
    // painted every resource "0 used / 100% over-permissioned" with the role's whole unused list -- fabricated
    // numbers exactly when the per-resource read was unavailable (e.g. held on an install). The backend's own
    // refusal is the answer: its status and typed body pass through unchanged.
    const errorText = await analysisRes.text().catch(() => "")
    let parsed: unknown = null
    try {
      parsed = errorText ? JSON.parse(errorText) : null
    } catch {
      parsed = null
    }
    const refusal = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { error: `Per-resource analysis returned ${analysisRes.status}`, detail: errorText.slice(0, 500) }
    return NextResponse.json(refusal, { status: analysisRes.status, headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
