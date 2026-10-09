import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { systemChoiceDetail } from "@/lib/server/proxy-error"

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
    // A7 B5: a page opened by key names ONE system (backend ?system_key=, with the account for a tag / source key).
    // Absent, the request is byte-identical to before.
    const systemKey = req.nextUrl.searchParams.get("system_key")
    const accountId = req.nextUrl.searchParams.get("account_id")
    if (systemKey) {
      backendParams.set("system_key", systemKey)
      if (accountId) backendParams.set("account_id", accountId)
    }
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/jewel-footholds?${backendParams}`
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(55_000),
    })
    const body = await response.json().catch(() => null)
    // A7 B5: the 409 system choice is relayed (typed, lib/server/proxy-error systemChoiceDetail) so the page can offer
    // it; every other refusal answers as before.
    const choice = response.status === 409 && body ? systemChoiceDetail(JSON.stringify(body)) : undefined
    if (choice) {
      return NextResponse.json({ error: "jewel_footholds_unavailable", detail: choice }, { status: 409 })
    }
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
