import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

// Auto-tag status proxy.
//
// HISTORICAL: this endpoint used to return hardcoded fallback numbers
// (status: "stopped", actual_traffic: 15) when the backend endpoint
// was unreachable. That violated feedback_no_mock_numbers_in_ui.md —
// fabricated values look like real data to the UI and operators
// trusted them.
//
// CURRENT: when the backend endpoint genuinely doesn't exist (today's
// state — verified 404), respond with `wired: false` and zero
// counters so the consuming UI can render an honest "Auto-tag not
// configured" indicator instead of fake "0 cycles" success state.
// On true backend errors (5xx, timeout) we surface real error
// statuses via the shared proxy-error helpers.
const NOT_WIRED_RESPONSE = {
  success: false,
  wired: false,
  status: "not_wired" as const,
  total_cycles: 0,
  actual_traffic: 0,
  last_sync: null,
  tagged: 0,
  untagged: 0,
  total: 0,
  message: "Auto-tag scheduler is not configured on this backend.",
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/auto-tag/status?systemName=${encodeURIComponent(systemName)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    )
    clearTimeout(timeoutId)

    if (response.status === 404) {
      // Endpoint not implemented on backend — return honest "not wired"
      // state with zero numbers (no fabrication).
      return NextResponse.json({ ...NOT_WIRED_RESPONSE, systemName })
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return backendError({
        status: response.status,
        message: `auto-tag/status backend returned ${response.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await response.json()
    return NextResponse.json({ ...data, wired: true })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    // AbortError or transport error — surface as real proxy error so
    // the UI can decide between "backend down" and "auto-tag not
    // configured." Don't conflate the two with a fake fallback.
    return fromCaughtError(error)
  }
}
