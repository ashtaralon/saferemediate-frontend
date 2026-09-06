import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Proxy for the BOUNDED, resource-anchored dependency projection
// (`GET /api/resource-dependencies/{system}?resource_id=`).
//
// Not the same thing as the `dependency-map*` proxies next door. Those draw a
// system-wide graph in which security groups and IAM roles are badges hanging
// off other nodes; this answers a per-resource question in which those two are
// advertised resources in their own right, and it is anchored to one resolved
// resource rather than scanning the system.
//
// Only the query parameters the backend actually declares are forwarded, by
// name. A blanket `url.search` passthrough would let an unknown parameter reach
// the backend and be silently ignored, so a filter that looked applied in the
// URL would not be applied in the answer — the counts would be right for a
// query the operator did not ask for.
const BACKEND_URL = getBackendBaseUrl()

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

const FORWARDED = [
  "resource_id",
  "account_id",
  "perspective",
  "mechanism",
  "basis",
  "include_stale",
  "cursor",
  "page_size",
] as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  try {
    const { systemName } = await params
    const incoming = new URL(request.url).searchParams

    const resourceId = incoming.get("resource_id")
    if (!resourceId) {
      // The backend requires it; answering here keeps the failure legible
      // instead of surfacing a 422 body the tab would have to parse.
      return NextResponse.json(
        { success: false, error: "resource_id is required" },
        { status: 400 },
      )
    }

    const query = new URLSearchParams()
    for (const key of FORWARDED) {
      const value = incoming.get(key)
      if (value !== null && value !== "") query.set(key, value)
    }

    const response = await fetch(
      `${BACKEND_URL}/api/resource-dependencies/${encodeURIComponent(systemName)}?${query}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      },
    )

    const text = await response.text()
    if (!response.ok) {
      console.error(
        `[ResourceDependencies Proxy] Backend error: ${response.status}`,
        text,
      )
      // The status is preserved rather than collapsed to 500: 409 is a stale
      // cursor (the generation moved under the reader) and 404 is an unresolved
      // resource, and the tab renders those differently from a backend fault.
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          detail: text,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(JSON.parse(text))
  } catch (error: any) {
    console.error("[ResourceDependencies Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch resource dependencies",
        timeout: error?.name === "AbortError",
      },
      { status: 500 },
    )
  }
}
