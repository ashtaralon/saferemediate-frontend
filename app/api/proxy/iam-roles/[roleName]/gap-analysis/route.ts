import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  console.log(`[IAM Proxy] Fetching ${roleName} from backend...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout

  try {
    const backendUrl = `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${days}${envelope ? "&envelope=true" : ""}`
    console.log(`[IAM Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText.slice(0, 200)}`)
      // Fail closed: propagate a typed non-2xx (never 200-with-zeros). Returning
      // 200 {used:0, unused:0} on a backend fault is the forbidden anti-pattern
      // documented in lib/server/proxy-error.ts — the LP UI cannot tell "backend
      // down" from "role is genuinely clean" and renders the removal/clean state
      // for both. Every consumer of this route already guards on `res.ok`
      // (or `fetchWithEnvelope`, which throws on non-2xx), so a typed error
      // surfaces an honest error/empty state instead of a fabricated zero.
      return backendError({
        status: res.status,
        message: `IAM gap-analysis backend returned ${res.status}`,
        detail: errorText.slice(0, 500),
      })
    }

    const data = await res.json()
    console.log(`[IAM Proxy] Success: LP score ${data.summary?.lp_score}, used=${data.summary?.used_count}, unused=${data.summary?.unused_count}`)

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const e = error as Error
    console.error(`[IAM Proxy] Error for ${roleName}:`, e?.name, e?.message)
    // Fail closed on timeout/unreachable too: AbortError -> 504, else -> 503.
    // Never a 200-with-zeros (see the !res.ok branch above).
    return fromCaughtError(error)
  }
}
