import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const maxDuration = 30
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const FILTER_KEYS = [
  "region",
  "name_contains",
  "created_before",
  "created_after",
  "availability_zone",
  "state",
  "runtime",
  "engine",
]

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const resourceType = url.searchParams.get("resource_type")
  const system = url.searchParams.get("system")
  const limit = url.searchParams.get("limit") ?? "25"
  const cursor = url.searchParams.get("cursor")
  const sort = url.searchParams.get("sort")
  const envelope = url.searchParams.get("envelope") === "true"

  if (!resourceType) {
    return NextResponse.json({ error: "resource_type is required" }, { status: 400 })
  }

  const params = new URLSearchParams({ resource_type: resourceType, limit })
  if (system) params.set("system", system)
  if (cursor) params.set("cursor", cursor)
  if (sort) params.set("sort", sort)
  if (envelope) params.set("envelope", "true")
  for (const key of FILTER_KEYS) {
    const v = url.searchParams.get(key)
    if (v) params.set(key, v)
  }

  const backendBase = getBackendBaseUrl()
  const target = `${backendBase}/api/resource-inventory/list?${params.toString()}`

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
