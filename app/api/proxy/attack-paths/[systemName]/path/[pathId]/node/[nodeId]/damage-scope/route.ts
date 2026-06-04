import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ systemName: string; pathId: string; nodeId: string }>
  },
) {
  const { systemName, pathId, nodeId } = await params
  const backendUrl = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/path/${encodeURIComponent(pathId)}/node/${encodeURIComponent(nodeId)}/damage-scope`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60_000)

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
