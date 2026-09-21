import { NextRequest, NextResponse } from "next/server"
import { PROOF_REFUSAL_MESSAGES, selectBackendProof } from "@/lib/server/backend-proof"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { MAX_TEXT_CHARS, extractTypedRefusal } from "@/lib/server/typed-refusal"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** A parsed backend body that carries a typed refusal code of its own
 *  (FastAPI's `{detail: {code}}`, which is what this backend raises). */
function hasTypedCode(detail: string | Record<string, unknown>): boolean {
  // `detail` is the SHAPED refusal by this point -- flat, allowlisted -- so a
  // typed body is one that carries a `code`.
  return typeof detail === "object" && detail !== null &&
    typeof (detail as Record<string, unknown>).code === "string"
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params

  // Choose the request's proof BEFORE anything is sent. Choosing grants
  // nothing -- the backend verifies it and decides. A refusal here is named
  // and makes no backend call at all, so "this deployment installed no
  // credential" never reaches the operator as an authentication failure.
  const proof = selectBackendProof(req)
  if (!proof.ok) {
    return NextResponse.json(
      {
        error: "Review request refused",
        detail: {
          code: proof.code,
          message: PROOF_REFUSAL_MESSAGES[proof.code] ?? "The request carried no usable proof.",
        },
        backendStatus: proof.status,
        origin: "proxy",
      },
      { status: proof.status, headers: { "Cache-Control": "no-store" } },
    )
  }

  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  // Scope claims travel to the backend, which resolves the role inside the
  // deployment's own tenant/account and refuses a mismatch (403). Forwarded
  // only in well-formed form, and nothing is invented when absent: a guessed
  // account is a cross-tenant read.
  const forwarded = new URLSearchParams({ days })
  if (envelope) forwarded.set("envelope", "true")
  const customerId = url.searchParams.get("customer_id")?.trim()
  if (customerId) forwarded.set("customer_id", customerId)
  const accountId = url.searchParams.get("account_id")?.trim()
  if (accountId && /^\d{12}$/.test(accountId)) forwarded.set("account_id", accountId)
  const region = url.searchParams.get("region")?.trim()
  if (region && /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/.test(region)) forwarded.set("region", region)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout

  try {
    const backendUrl = `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?${forwarded.toString()}`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...proof.headers,
    }
    const requestId = req.headers.get("x-cyntro-request-id")?.trim()
    if (requestId && /^[A-Za-z0-9_-]{8,64}$/.test(requestId)) {
      headers["X-Cyntro-Request-Id"] = requestId
    }

    const res = await fetch(backendUrl, { signal: controller.signal, headers })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText.slice(0, 200)}`)
      // Fail closed: propagate a typed non-2xx (never 200-with-zeros). Returning
      // 200 {used:0, unused:0} on a backend fault is the forbidden anti-pattern
      // documented in lib/server/proxy-error.ts -- the LP UI cannot tell "backend
      // down" from "role is genuinely clean" and renders the removal/clean state
      // for both.
      //
      // Slicing the JSON to 500 characters cut the refusal's own `code` out of
      // it, so a deliberately disabled seam (REVIEW_RUNTIME_UNAVAILABLE /
      // DECISION_RUNTIME_DISABLED) reached the operator as a bare 502 with the
      // reason gone.
      //
      // The fix is not to relay the upstream object whole: that preserves the
      // code and everything else the backend attached, at whatever size it
      // came in, which makes this proxy an amplification surface. Instead an
      // ALLOWLIST -- code, upstream_code, message, request_id and scalar
      // diagnostics, each clipped. Unknown keys are dropped, not truncated,
      // because a truncated unknown key is still unbounded in shape.
      //
      // What arrives here is therefore one of three shapes, never a partial
      // one: the clipped allowlist when it fits MAX_REFUSAL_BYTES; the
      // identity (code plus upstream_code) when it does not, with the
      // commentary dropped rather than shortened; or the code alone. The UI
      // routes on `code`, which survives all three. A non-JSON body keeps the
      // text clip instead, only to keep an HTML error page out of the payload.
      let detail: string | Record<string, unknown> = errorText.slice(0, MAX_TEXT_CHARS)
      try {
        const refusal = extractTypedRefusal(JSON.parse(errorText))
        if (refusal) detail = refusal as unknown as Record<string, unknown>
      } catch {
        // Not JSON: keep the truncated text.
      }
      // An untyped 401 when the only proof sent was the service token is the
      // enforced auth boundary refusing THAT, not the operator: name it as the
      // backend names the state. A typed body is always forwarded untouched.
      if (res.status === 401 && proof.untypedUnauthorizedCode && !hasTypedCode(detail)) {
        detail = {
          code: proof.untypedUnauthorizedCode,
          message: "The backend refused this deployment's server-to-server credential.",
        }
      }
      // preserveStatus: this backend answers typed refusals (503 disabled, 403
      // scope mismatch, 404 role-not-found). Collapsing them to 502 tells the
      // operator the gateway is broken about a deployment behaving exactly as
      // configured.
      return backendError({
        status: res.status,
        message: `IAM gap-analysis backend returned ${res.status}`,
        detail,
        preserveStatus: true,
      })
    }

    const data = await res.json()
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const e = error as Error
    console.error(`[IAM Proxy] Error for ${roleName}:`, e?.name, e?.message)
    // Fail closed on timeout/unreachable too: AbortError -> 504, else -> 503.
    return fromCaughtError(error)
  }
}
