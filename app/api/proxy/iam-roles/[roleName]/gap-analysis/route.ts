import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { ERROR_ORIGIN_HEADER, fromCaughtError, reviewProxyStatus } from "@/lib/server/proxy-error"
import { previewProofFor, previewProofNotConfigured } from "@/lib/server/lp-preview-proof"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const proof = previewProofFor(req)
  if (proof.kind === "not_configured") return previewProofNotConfigured()

  const { roleName } = await params
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  console.log(`[IAM Proxy] Fetching ${roleName} from backend...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout

  try {
    // The operator's scope claims ride along so the BACKEND can refuse a mismatch
    // (403 REVIEW_SCOPE_MISMATCH) against its server-owned binding. They only
    // narrow; without them the backend serves its pinned scope. Dropping them
    // here meant a second registered tenant's selection was silently served the
    // pinned tenant's Review.
    const claims = new URLSearchParams({ days })
    if (envelope) claims.set("envelope", "true")
    for (const name of ["customer_id", "account_id", "region"]) {
      const value = url.searchParams.get(name)?.trim()
      if (value) claims.set(name, value)
    }
    const backendUrl = `${getBackendBaseUrl()}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?${claims.toString()}`
    console.log(`[IAM Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...proof.headers },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText.slice(0, 200)}`)
      let parsed: unknown = null
      try {
        parsed = errorText ? JSON.parse(errorText) : null
      } catch {
        parsed = null
      }
      // The backend's typed body (its refusal code) is kept whatever the status;
      // only the status is mapped, so a backend 504 never reads as this proxy's
      // own timeout (see reviewProxyStatus).
      const status = reviewProxyStatus(res.status)
      const headers = { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" }
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const body = status === res.status ? parsed : { ...(parsed as Record<string, unknown>), backendStatus: res.status }
        return NextResponse.json(body, { status, headers })
      }
      return NextResponse.json(
        {
          error: `IAM gap-analysis backend returned ${res.status}`,
          detail: errorText.slice(0, 500),
          backendStatus: res.status,
          origin: "backend",
        },
        { status, headers },
      )
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
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
