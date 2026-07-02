import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ systemName: string; identityId: string }>
  },
) {
  const { systemName, identityId } = await params
  // identityId arrives URL-decoded from Next.js's router (the client
  // encodeURIComponent's the full ARN, including its internal "/", so it
  // stays a single dynamic segment). Backend's route uses a {identity_id:path}
  // converter, which accepts raw "/" — re-encode isn't needed, just forward
  // the decoded ARN as-is.
  const { searchParams } = new URL(req.url)
  const jewelId = searchParams.get("jewel_id")
  const limit = searchParams.get("limit")

  const cacheKey = `lateral-moves:${systemName}:${identityId}:${jewelId ?? ""}:${limit ?? ""}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  }

  const backendParams = new URLSearchParams()
  if (jewelId) backendParams.set("jewel_id", jewelId)
  if (limit) backendParams.set("limit", limit)
  const qs = backendParams.toString()
  const backendUrl =
    `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}/identity/${encodeURIComponent(identityId)}/lateral-moves` +
    (qs ? `?${qs}` : "")

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

    if (res.ok) {
      setCached(cacheKey, data, TTL_STD)
    }

    return NextResponse.json(data, {
      status: res.status,
      headers: { "X-Cache": "MISS", "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const message = error instanceof Error ? error.message : "Backend unavailable"
    return NextResponse.json({ error: message, moves: [] }, { status: 503 })
  }
}
