import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { previewProofFor, previewProofNotConfigured } from "@/lib/server/lp-preview-proof"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const UPSTREAM_TIMEOUT_MS = 25_000

async function passthrough(response: Response): Promise<NextResponse> {
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const headers = { "Cache-Control": "no-store" }
  if (parsed !== null && typeof parsed === "object") {
    return NextResponse.json(parsed, { status: response.status, headers })
  }
  return NextResponse.json(
    {
      error: `Backend returned ${response.status}`,
      detail: text.trim().slice(0, 500) || `Backend returned ${response.status} with no readable body`,
      backendStatus: response.status,
      origin: "proxy",
    },
    { status: response.status, headers },
  )
}

export async function POST(request: Request) {
  const proof = previewProofFor(request)
  if (proof.kind === "not_configured") return previewProofNotConfigured()

  const body = await request.json().catch(() => ({}))
  const { resource_type, resource_id, system_name } = body as {
    resource_type?: string
    resource_id?: string
    system_name?: string
  }
  if (!resource_type || !resource_id || !system_name) {
    return NextResponse.json(
      { success: false, error: "resource_type, resource_id, and system_name are required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const backendUrl = getBackendBaseUrl().replace(/\/+$/, "").replace(/\/backend$/, "")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(backendUrl + "/api/least-privilege/simulate-fix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...proof.headers,
      },
      cache: "no-store",
      body: JSON.stringify({ resource_type, resource_id, system_name }),
      signal: controller.signal,
    })
    if (!res.ok) return passthrough(res)
    const data = await res.json()
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : ""
    const timedOut = name === "TimeoutError" || name === "AbortError"
    return NextResponse.json(
      {
        error: timedOut
          ? "simulate-fix timed out (backend > 25s). Retry; Render worker may be warming."
          : err instanceof Error ? err.message : "simulate-fix failed",
        origin: "proxy",
      },
      { status: timedOut ? 504 : 503, headers: { "Cache-Control": "no-store" } },
    )
  } finally {
    clearTimeout(timeout)
  }
}
