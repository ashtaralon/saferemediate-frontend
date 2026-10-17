import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { forwardScopeClaims } from "@/lib/server/scope-claims"
import { systemChoiceDetail } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** Proxy for GET /api/attack-paths/{system_name}/by-crown-jewel */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const cjArn = searchParams.get("cj_arn")
  const cjName = searchParams.get("cj_name")

  if (!cjArn && !cjName) {
    return NextResponse.json(
      { error: "cj_arn or cj_name required" },
      { status: 422 },
    )
  }

  const qs = new URLSearchParams()
  if (cjArn) qs.set("cj_arn", cjArn)
  if (cjName) qs.set("cj_name", cjName)
  forwardScopeClaims(searchParams, qs)   // AP201 (R11): the tenant / account claims travel with the read

  try {
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel?${qs}`
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[by-crown-jewel] backend ${res.status}: ${body.slice(0, 200)}`)
      // A7 B5: the 409 system choice is relayed (typed, lib/server/proxy-error systemChoiceDetail) so the page can offer
      // it; every other refusal answers as before.
      const choice = systemChoiceDetail(body)
      return NextResponse.json(
        { error: "Failed to load crown jewel convergence", status: res.status, ...(choice ? { detail: choice } : {}) },
        { status: res.status },
      )
    }

    return NextResponse.json(await res.json())
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[by-crown-jewel] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch crown jewel convergence", detail: msg },
      { status: 502 },
    )
  }
}
