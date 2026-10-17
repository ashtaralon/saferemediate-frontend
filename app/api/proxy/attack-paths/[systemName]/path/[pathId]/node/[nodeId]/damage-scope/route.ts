import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { forwardScopeClaims } from "@/lib/server/scope-claims"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ systemName: string; pathId: string; nodeId: string }>
  },
) {
  const { systemName, pathId, nodeId } = await params
  // AP201 (R11) review S1: the tenant / account claims travel with the read.
  const upstream = new URLSearchParams()
  const claimsKey = forwardScopeClaims(req.nextUrl.searchParams, upstream)
  const backendUrl = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/path/${encodeURIComponent(pathId)}/node/${encodeURIComponent(nodeId)}/damage-scope${claimsKey ? `?${upstream}` : ""}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  try {
    const res = await fetch(backendUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timeoutId)

    const text = await res.text()
    let data: unknown = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { detail: text }
    }

    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const message = error instanceof Error ? error.message : "Backend unavailable"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
