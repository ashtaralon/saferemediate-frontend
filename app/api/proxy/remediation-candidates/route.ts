import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const maxDuration = 60
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const system = url.searchParams.get("system")
  const resourceType = url.searchParams.get("resource_type")
  const minUnused = url.searchParams.get("min_unused") ?? "1"
  const limit = url.searchParams.get("limit") ?? "50"
  const envelope = url.searchParams.get("envelope") === "true"

  const params = new URLSearchParams({ min_unused: minUnused, limit })
  if (system) params.set("system", system)
  if (resourceType) params.set("resource_type", resourceType)
  if (envelope) params.set("envelope", "true")

  const backendBase = getBackendBaseUrl()
  const target = `${backendBase}/api/remediation-candidates?${params.toString()}`

  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    const text = await response.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          candidates: [],
          summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
          error: data?.detail || data?.error || `Backend returned ${response.status}`,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      {
        candidates: [],
        summary: { total_candidates: 0, by_type: {}, auto_applicable: 0, blocked: 0 },
        error: error?.message || "Failed to load remediation candidates",
      },
      { status: 200 }
    )
  }
}
