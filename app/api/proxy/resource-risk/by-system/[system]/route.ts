import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Per-system list of HAS_RISK findings. Nested under a static `by-system`
// segment because a sibling `resource-risk/[resourceId]` route already exists
// (per-resource blast-radius) — Next.js forbids two slug names at one level.

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ system: string }> },
) {
  const { system } = await params
  if (!system) {
    return backendError({ status: 400, message: "system path param required" })
  }

  // Canonical resolver: BACKEND_URL_OVERRIDE (the frontend-local launch config
  // sets it to http://127.0.0.1:8000) → Render prod default.
  const BACKEND_URL = getBackendBaseUrl()

  const controller = new AbortController()
  // Cold Render + Neo4j flap regularly exceed 30s; abort then surfaced as
  // "Couldn't load findings: Backend request timed out" on Resource Risk
  // while the backend was still finishing. Match maxDuration (60s).
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/resource-risk/${encodeURIComponent(system)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    )
    clearTimeout(timeoutId)

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return backendError({
        status: res.status,
        message: `Resource-risk backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    return fromCaughtError(error)
  }
}
