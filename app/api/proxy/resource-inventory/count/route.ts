import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const maxDuration = 30
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const resourceType = url.searchParams.get("resource_type")
  const system = url.searchParams.get("system")
  const envelope = url.searchParams.get("envelope") === "true"

  if (!resourceType) {
    return NextResponse.json({ error: "resource_type is required" }, { status: 400 })
  }

  const params = new URLSearchParams({ resource_type: resourceType })
  if (system) params.set("system", system)
  if (envelope) params.set("envelope", "true")

  const backendBase = getBackendBaseUrl()
  const target = `${backendBase}/api/resource-inventory/count?${params.toString()}`

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
        { error: data?.detail || data?.error || `Backend returned ${response.status}`, detail: data?.detail },
        { status: response.status }
      )
    }
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to reach inventory endpoint" },
      { status: 502 }
    )
  }
}
