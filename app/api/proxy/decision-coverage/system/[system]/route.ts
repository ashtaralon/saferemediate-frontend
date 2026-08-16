import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// System-level rollup of the readiness layers already shown per-resource by
// components/inventory/readiness-badges.tsx. Sibling of the /resource/ proxy
// next door; same shape, same failure envelope.
//
// 30s abort, comfortably under the 60s project default in vercel.json, so the
// catch block below still runs (see __tests__/proxy-timeout-invariant.test.ts).
// This backs an advisory banner, so a slow backend must degrade to silence
// rather than hold the tab.

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  getBackendBaseUrl()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ system: string }> },
) {
  const { system } = await params
  const backendUrl = `${BACKEND_URL}/api/decision-coverage/system/${encodeURIComponent(system)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return NextResponse.json(
        { success: false, error: `Backend returned ${response.status}`, detail: detail.slice(0, 200) },
        { status: response.status },
      )
    }

    return NextResponse.json(await response.json())
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ success: false, error: "Request timed out" }, { status: 504 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch coverage" },
      { status: 500 },
    )
  }
}
