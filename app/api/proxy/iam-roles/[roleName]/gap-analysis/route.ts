import { NextRequest, NextResponse } from "next/server"
import { selectBackendProof } from "@/lib/server/backend-proof"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** The proxy's own refusals, named as the backend and the shared proof selection name them. */
const PROOF_REFUSAL_MESSAGES: Record<string, string> = {
  SITE_SESSION_INVALID: "The site session is missing or invalid.",
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: "This deployment's server-to-server credential is not installed.",
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE: "The load balancer attached no verified operator identity.",
}

/** True when a parsed backend body carries a typed refusal code of its own (FastAPI ``{detail: {code}}``). */
function hasTypedCode(detail: string | Record<string, unknown>): boolean {
  if (typeof detail !== "object") return false
  const inner = detail.detail
  return Boolean(inner && typeof inner === "object" && typeof (inner as Record<string, unknown>).code === "string")
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params

  // Select the request's proof BEFORE anything is sent. Choosing grants nothing: the backend verifies it and decides.
  // A refusal here is named and makes no backend call at all.
  const proof = await selectBackendProof(req)
  if (!proof.ok) {
    return NextResponse.json(
      {
        error: "Review request refused",
        detail: { code: proof.code, message: PROOF_REFUSAL_MESSAGES[proof.code] ?? "The request carried no usable proof." },
        origin: "proxy",
      },
      { status: proof.status, headers: { "Cache-Control": "no-store" } },
    )
  }
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  // Scope claims travel to the backend, which resolves the role inside the
  // deployment's own tenant/account and refuses a mismatch (403). They are
  // forwarded only in well-formed form; nothing is added when absent.
  const forwarded = new URLSearchParams({ days })
  if (envelope) forwarded.set("envelope", "true")
  const customerId = url.searchParams.get("customer_id")?.trim()
  if (customerId) forwarded.set("customer_id", customerId)
  const accountId = url.searchParams.get("account_id")?.trim()
  if (accountId && /^\d{12}$/.test(accountId)) forwarded.set("account_id", accountId)
  const region = url.searchParams.get("region")?.trim()
  if (region && /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/.test(region)) forwarded.set("region", region)
  const requestId = req.headers.get("x-cyntro-request-id")?.trim()

  const controller = new AbortController()
  // Unchanged 55s ceiling. The backend's own review budget (below this) is
  // what should answer first; this abort only bounds a server that does not.
  const timeoutId = setTimeout(() => controller.abort(), 55000)

  try {
    const backendUrl = `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?${forwarded.toString()}`

    // Only the selected proof headers are forwarded (hosted: none; the process-wide writer attaches the service token).
    const headers: Record<string, string> = { "Content-Type": "application/json", ...proof.headers }
    if (requestId && /^[A-Za-z0-9_-]{8,64}$/.test(requestId)) headers["X-Cyntro-Request-Id"] = requestId
    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers,
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
      // Forward the backend's TYPED detail whole. Truncating it to 500
      // characters cut the refusal's own code out of the JSON -- the
      // diagnostics block sits ahead of nothing, but the object no longer
      // parsed -- so GAP_ANALYSIS_BUDGET_EXHAUSTED reached the UI as a
      // generic 502 and the operator lost the reason. Only a non-JSON body
      // is truncated, and only to keep an HTML error page out of the payload.
      let detail: string | Record<string, unknown> = errorText.slice(0, 500)
      try {
        const parsed = JSON.parse(errorText)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          detail = parsed as Record<string, unknown>
        }
      } catch {
        // Not JSON: keep the truncated text.
      }
      // An untyped 401 when the only proof sent was the service token is the enforced boundary refusing it: name it
      // as the backend names that state. A typed body is always forwarded whole.
      if (res.status === 401 && proof.untypedUnauthorizedCode && !hasTypedCode(detail)) {
        detail = {
          code: proof.untypedUnauthorizedCode,
          message: "The backend refused this deployment's server-to-server credential.",
        }
      }
      return backendError({
        status: res.status,
        message: `IAM gap-analysis backend returned ${res.status}`,
        detail,
      })
    }

    const data = await res.json()

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
