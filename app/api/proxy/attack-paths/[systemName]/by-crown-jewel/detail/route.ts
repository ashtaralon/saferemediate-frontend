import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { systemChoiceDetail } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** GET /api/attack-paths/{system}/by-crown-jewel/detail — one path with hops */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const cjArn = searchParams.get("cj_arn")
  const cjName = searchParams.get("cj_name")
  const pathId = searchParams.get("path_id")

  if (!cjArn && !cjName) {
    return NextResponse.json(
      { error: "cj_arn or cj_name required" },
      { status: 422 },
    )
  }
  if (!pathId) {
    return NextResponse.json(
      { error: "path_id required" },
      { status: 422 },
    )
  }

  const qs = new URLSearchParams({ path_id: pathId })
  if (cjArn) qs.set("cj_arn", cjArn)
  if (cjName) qs.set("cj_name", cjName)
  forwardScopeClaims(searchParams, qs)   // AP201 (R11): the tenant / account claims travel with the read

  try {
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel/detail?${qs}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[by-crown-jewel/detail] backend ${res.status}: ${body.slice(0, 200)}`)
      // A7 B5: the 409 system choice is relayed (typed) so the page can offer it; every other refusal answers as before.
      const choice = systemChoiceDetail(body)
      return NextResponse.json(
        { error: "Failed to load crown jewel path detail", status: res.status, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }
    // Edge cache — same rationale as the sister /summary proxy. Each
    // (cj, path_id) tuple is its own cache key, so spotlight users
    // toggling between paths on the same jewel get instant responses
    // after the first hit. 4h graph turnover dwarfs the 60s freshness
    // window; stale-while-revalidate keeps the page warm.
    return NextResponse.json(await res.json(), {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[by-crown-jewel/detail] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch crown jewel path detail", detail: msg },
      { status: 502 },
    )
  }
}
