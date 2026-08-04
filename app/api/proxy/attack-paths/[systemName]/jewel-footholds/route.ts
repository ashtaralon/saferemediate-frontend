import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()
const EVALUATION_PARAMS = [
  "evaluate",
  "evaluation_limit",
  "evaluation_budget_ms",
  "max_hops",
  "max_cost",
] as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const jewelRef = req.nextUrl.searchParams.get("jewel_ref")
  if (!systemName || !jewelRef) {
    return NextResponse.json(
      { error: "missing_params", detail: "systemName and jewel_ref are required" },
      { status: 400 },
    )
  }

  try {
    const backendParams = new URLSearchParams({ jewel_ref: jewelRef })
    for (const name of EVALUATION_PARAMS) {
      const value = req.nextUrl.searchParams.get(name)
      if (value !== null) backendParams.set(name, value)
    }
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/jewel-footholds?${backendParams}`
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(55_000),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body) {
      return NextResponse.json(
        {
          error: "jewel_footholds_unavailable",
          detail: body?.detail ?? `backend_${response.status}`,
        },
        { status: response.status === 404 ? 404 : 502 },
      )
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error: unknown) {
    const e = error as { name?: string; message?: string }
    return NextResponse.json(
      {
        error:
          e?.name === "TimeoutError" || e?.name === "AbortError"
            ? "jewel_footholds_timeout"
            : "jewel_footholds_proxy_error",
        detail: e?.message ?? String(error),
      },
      { status: 502 },
    )
  }
}
